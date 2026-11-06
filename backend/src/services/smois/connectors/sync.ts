// Shared connection engine: registry, token storage, one sync run (job row, retries, rate limits, audit, alerts).
// Providers only talk to the platform. Nothing here invents a reading: if a provider returns nothing, nothing is stored.
import prisma from '../../../config/db';
import logger from '../../../utils/logger';
import { decryptSecret, encryptSecret } from '../../../utils/crypto';
import { managementUserIds, notifyMany } from '../../../controllers/smois/common';
import { smoisAudit } from '../audit';
import { claimJobRun } from '../../../utils/jobLock';
import { AuthRejected, Connector, ConnectorNotReady, RateLimited } from './types';
import { MAX_ATTEMPTS, isDue, rateLimitUntil, retryDelayMs, tokenState } from './rules';
import { meta } from './meta';

const CONNECTORS: Connector[] = [meta];
export const connectorFor = (platform: string): Connector | undefined => CONNECTORS.find((c) => (c.platforms as string[]).includes(platform));
export const connectorById = (id: string): Connector | undefined => CONNECTORS.find((c) => c.id === id);
export const listConnectors = () => CONNECTORS.map((c) => ({ id: c.id, label: c.label, platforms: c.platforms, configured: c.configured(), capabilities: c.capabilities }));

const SYNC_EVERY_MS = 6 * 3_600_000;
const BACKFILL_DAYS = 30;
const day = (d: Date) => d.toISOString().slice(0, 10);

/** Store a fresh grant. Tokens are encrypted at rest and never returned by any endpoint. */
export const saveConnection = async (opts: { accountId: string; provider: string; userId: string; accessToken: string; refreshToken?: string | null; expiresAt?: Date | null; scopes?: string[]; remote: { externalId: string; name: string } }) => {
  const data = {
    provider: opts.provider, status: 'CONNECTED', externalId: opts.remote.externalId || null, externalName: opts.remote.name || null, scopes: opts.scopes ?? [],
    accessTokenEnc: encryptSecret(opts.accessToken), refreshTokenEnc: opts.refreshToken ? encryptSecret(opts.refreshToken) : null,
    tokenExpiresAt: opts.expiresAt ?? null, connectedById: opts.userId, connectedAt: new Date(), lastError: null, lastErrorAt: null, revokedAt: null, expiryNotifiedAt: null, nextSyncAt: new Date(),
  };
  const row = await prisma.smoisIntegration.upsert({ where: { accountId: opts.accountId }, create: { accountId: opts.accountId, ...data }, update: data });
  await prisma.smoisAccount.update({ where: { id: opts.accountId }, data: { connectionStatus: 'CONNECTED', apiAuthStatus: 'CONNECTED', connectedAt: new Date() } });
  await smoisAudit(null, { action: 'INTEGRATION_CONNECTED', entity: 'SmoisIntegration', entityId: row.id, userId: opts.userId, meta: { provider: opts.provider, accountId: opts.accountId } });
  return row;
};

export const disconnect = async (accountId: string, userId: string) => {
  const row = await prisma.smoisIntegration.findUnique({ where: { accountId } });
  if (!row) return null;
  await prisma.smoisIntegration.update({ where: { id: row.id }, data: { status: 'REVOKED', accessTokenEnc: null, refreshTokenEnc: null, revokedAt: new Date(), nextSyncAt: null } });
  await prisma.smoisAccount.update({ where: { id: accountId }, data: { connectionStatus: 'MANUAL', apiAuthStatus: 'NOT_CONNECTED' } });
  await smoisAudit(null, { action: 'INTEGRATION_DISCONNECTED', entity: 'SmoisIntegration', entityId: row.id, userId, meta: { accountId } });
  return row;
};

const alertManagement = async (accountName: string, title: string, body: string) =>
  notifyMany(await managementUserIds(), { title, body: `${accountName}: ${body}`, data: { link: '/smois/integrations' }, email: false });

/** One synchronisation run. Records a SmoisSyncJob either way and schedules the retry, if any. */
export const runSync = async (integrationId: string, trigger: 'SCHEDULE' | 'MANUAL' | 'RETRY', requestedById?: string, attempt = 1) => {
  const integ = await prisma.smoisIntegration.findUnique({ where: { id: integrationId }, include: { account: true } });
  if (!integ || integ.status !== 'CONNECTED') return null;
  const job = await prisma.smoisSyncJob.create({ data: { integrationId, accountId: integ.accountId, trigger, requestedById: requestedById ?? null, attempt } });
  const finish = (data: Record<string, unknown>) => prisma.smoisSyncJob.update({ where: { id: job.id }, data: { finishedAt: new Date(), ...data } });
  const connector = connectorById(integ.provider);
  try {
    if (!connector || !connector.configured()) throw new ConnectorNotReady('The developer app credentials are not set on the server.');
    if (!connector.capabilities.metrics) throw new ConnectorNotReady('Reading metrics from this platform is not enabled yet.');
    if (tokenState(!!integ.accessTokenEnc, integ.tokenExpiresAt) === 'EXPIRED') throw new AuthRejected('The access token has expired. Reconnect the account.');
    const since = day(new Date((integ.lastSyncAt ?? new Date(Date.now() - BACKFILL_DAYS * 86_400_000)).getTime() - 2 * 86_400_000));
    const rows = await connector.fetchMetrics(decryptSecret(integ.accessTokenEnc!), { externalId: integ.externalId ?? '', name: integ.externalName ?? '' }, since);
    let processed = 0; let skipped = 0;
    for (const r of rows) {
      const existing = await prisma.smoisMetricSnapshot.findUnique({ where: { accountId_snapshotDate: { accountId: integ.accountId, snapshotDate: new Date(r.date) } } });
      // A hand-entered or corrected reading is never overwritten by a sync.
      if (existing && (existing.dataStatus === 'MANUAL' || existing.correctedAt)) { skipped++; continue; }
      const values = { followers: r.followers ?? null, reach: r.reach ?? null, impressions: r.impressions ?? null, engagement: r.engagement ?? null, profileVisits: r.profileVisits ?? null, videoViews: r.videoViews ?? null, websiteClicks: r.websiteClicks ?? null, dataStatus: 'API', source: connector.label, retrievedAt: new Date() };
      await prisma.smoisMetricSnapshot.upsert({ where: { accountId_snapshotDate: { accountId: integ.accountId, snapshotDate: new Date(r.date) } }, create: { accountId: integ.accountId, snapshotDate: new Date(r.date), enteredById: integ.connectedById ?? '', ...values }, update: values });
      processed++;
    }
    await finish({ status: 'OK', recordsProcessed: processed, recordsSkipped: skipped });
    await prisma.smoisIntegration.update({ where: { id: integ.id }, data: { lastSyncAt: new Date(), nextSyncAt: new Date(Date.now() + SYNC_EVERY_MS), lastError: null } });
    return { status: 'OK', processed, skipped };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const rate = err instanceof RateLimited;
    const rejected = err instanceof AuthRejected;
    const notReady = err instanceof ConnectorNotReady;
    const delay = rate || rejected || notReady ? null : retryDelayMs(attempt);
    await finish({ status: delay ? 'RETRY' : 'FAILED', error: message.slice(0, 500), nextRetryAt: delay ? new Date(Date.now() + delay) : null });
    await prisma.smoisIntegration.update({
      where: { id: integ.id },
      data: {
        lastError: message.slice(0, 500), lastErrorAt: new Date(),
        ...(rejected ? { status: 'EXPIRED', nextSyncAt: null } : { nextSyncAt: new Date(Date.now() + SYNC_EVERY_MS) }),
        ...(rate ? { rateLimitedUntil: rateLimitUntil((err as RateLimited).retryAfterSeconds) } : {}),
      },
    });
    if (rejected) {
      await prisma.smoisAccount.update({ where: { id: integ.accountId }, data: { connectionStatus: 'EXPIRED', apiAuthStatus: 'EXPIRED' } });
      await alertManagement(integ.account.name, 'Connection needs attention', 'the platform rejected the saved access. Reconnect the account on the Integrations page.');
    } else if (!delay && !notReady && !rate && attempt >= MAX_ATTEMPTS) {
      await alertManagement(integ.account.name, 'Sync keeps failing', `${MAX_ATTEMPTS} attempts failed (${message.slice(0, 120)}). Data is not being updated; record readings by hand meanwhile.`);
    }
    logger.warn(`SMOIS sync ${integ.id} attempt ${attempt}: ${message}`);
    return { status: delay ? 'RETRY' : 'FAILED', error: message };
  }
};

/** Cron entry: run what is due, retry what failed, and warn once before a token expires. */
export const sweepConnections = async () => {
  const now = new Date();
  const due = (await prisma.smoisIntegration.findMany({ where: { status: 'CONNECTED' }, include: { account: { select: { name: true } } } }));
  for (const i of due) {
    const st = tokenState(!!i.accessTokenEnc, i.tokenExpiresAt, now);
    if (st === 'EXPIRING' && !i.expiryNotifiedAt) {
      await prisma.smoisIntegration.update({ where: { id: i.id }, data: { expiryNotifiedAt: now } });
      await alertManagement(i.account.name, 'Connection expires soon', `access runs out on ${i.tokenExpiresAt!.toLocaleDateString('en-NG')}. Reconnect before then to avoid a gap.`);
    }
  }
  const retries = await prisma.smoisSyncJob.findMany({ where: { status: 'RETRY', nextRetryAt: { lte: now } }, take: 20 });
  for (const j of retries) {
    if (!(await claimJobRun(`smois-retry:${j.id}`))) continue;
    await prisma.smoisSyncJob.update({ where: { id: j.id }, data: { status: 'FAILED' } }); // superseded by the new attempt row
    await runSync(j.integrationId, 'RETRY', undefined, j.attempt + 1);
  }
  for (const i of due) {
    if (!isDue(i, now) || i.nextSyncAt === null) continue;
    if (!(await claimJobRun(`smois-sync:${i.id}:${Math.floor(now.getTime() / (15 * 60_000))}`))) continue;
    await runSync(i.id, 'SCHEDULE');
  }
};
