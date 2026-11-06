// Platform connections: start OAuth, receive the callback, sync now, disconnect, and receive webhooks.
import * as crypto from 'crypto';
import { Request, RequestHandler } from 'express';
import prisma from '../../config/db';
import { apiResponse } from '../../utils/apiResponse';
import logger from '../../utils/logger';
import { fail, handle, access } from './common';
import { connectorById, connectorFor, disconnect, listConnectors, runSync, saveConnection } from '../../services/smois/connectors/sync';
import { signState, verifyState } from '../../services/smois/connectors/rules';
import { metaHandshake } from '../../services/smois/connectors/meta';
import { smoisAudit } from '../../services/smois/audit';

const stateSecret = () => process.env.JWT_ACCESS_SECRET ?? '';
const apiBase = () => (process.env.API_PUBLIC_URL ?? '').replace(/\/$/, '');
const redirectUriFor = (provider: string) => `${apiBase()}/api/v1/webhooks/smois/oauth/${provider}`;
const adminBase = () => (process.env.ADMIN_URL ?? '').split(',')[0].replace(/\/$/, '');

/** GET /connections: what can be connected on this server, and each account's connection and latest runs. */
export const getConnections = handle(async (_req, res) => {
  // Token columns are never selected: they cannot leave the server.
  const integrations = await prisma.smoisIntegration.findMany({
    select: { id: true, accountId: true, provider: true, status: true, externalName: true, scopes: true, tokenExpiresAt: true, connectedAt: true, lastSyncAt: true, nextSyncAt: true, lastError: true, rateLimitedUntil: true },
  });
  const jobs = await prisma.smoisSyncJob.findMany({ orderBy: { startedAt: 'desc' }, take: 30, select: { id: true, accountId: true, status: true, trigger: true, startedAt: true, finishedAt: true, recordsProcessed: true, recordsSkipped: true, attempt: true, error: true } });
  return apiResponse.success(res, 'Connections.', { connectors: listConnectors(), integrations, jobs });
});

/** POST /connections/:accountId/connect: returns the platform's consent URL for this account. */
export const startConnect = handle(async (req, res) => {
  const account = await prisma.smoisAccount.findUnique({ where: { id: req.params.accountId } });
  if (!account || account.archivedAt) fail(404, 'Account not found.');
  const connector = connectorFor(account!.platform);
  if (!connector) fail(400, `There is no connector for ${account!.platform} yet. Keep recording its results by hand.`);
  if (!connector!.configured()) fail(409, 'This server has no developer app credentials for that platform yet (see the setup notes).');
  if (!apiBase()) fail(409, 'API_PUBLIC_URL is not set, so the platform cannot send people back here.');
  const state = signState({ accountId: account!.id, userId: access(req).userId }, stateSecret());
  return apiResponse.success(res, 'Open this address to give consent.', { url: connector!.authUrl(state, redirectUriFor(connector!.id)) });
});

/** GET /webhooks/smois/oauth/:provider (public: the platform sends the person's browser here). */
export const oauthCallback: RequestHandler = async (req, res) => {
  const back = (q: string) => res.redirect(`${adminBase()}/smois/integrations?${q}`);
  try {
    const connector = connectorById(req.params.provider);
    const st = verifyState(String(req.query.state ?? ''), stateSecret());
    if (!connector || !st) return back('connect=invalid');
    if (req.query.error || !req.query.code) return back('connect=declined');
    const account = await prisma.smoisAccount.findUnique({ where: { id: st.accountId } });
    if (!account) return back('connect=invalid');
    const { tokens, remote } = await connector.connect(String(req.query.code), redirectUriFor(connector.id), account.platform);
    await saveConnection({ accountId: account.id, provider: connector.id, userId: st.userId, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, expiresAt: tokens.expiresAt, scopes: tokens.scopes, remote });
    return back('connect=ok');
  } catch (err) {
    logger.warn(`SMOIS oauth callback failed: ${err instanceof Error ? err.message : err}`);
    return back('connect=failed');
  }
};

export const syncNow = handle(async (req, res) => {
  const integ = await prisma.smoisIntegration.findUnique({ where: { accountId: req.params.accountId } });
  if (!integ || integ.status !== 'CONNECTED') fail(404, 'That account is not connected.');
  const result = await runSync(integ!.id, 'MANUAL', access(req).userId);
  return apiResponse.success(res, 'Sync finished.', result);
});

export const disconnectAccount = handle(async (req, res) => {
  const row = await disconnect(req.params.accountId, access(req).userId);
  if (!row) fail(404, 'That account is not connected.');
  return apiResponse.success(res, 'Disconnected. Existing readings are kept, labelled as they were.');
});

/** Public webhook entry. Signature first; duplicates are ignored; unprocessable events are recorded, not guessed at. */
export const webhook: RequestHandler = async (req: Request, res) => {
  const connector = connectorById(req.params.provider);
  if (!connector) return res.sendStatus(404);
  if (req.method === 'GET') {
    const challenge = connector.id === 'meta' ? metaHandshake(req.query as Record<string, unknown>) : null;
    return challenge === null ? res.sendStatus(403) : res.status(200).send(challenge);
  }
  const raw = (req as unknown as { rawBody?: Buffer }).rawBody;
  if (!connector.verifyWebhook || !connector.verifyWebhook(raw, req.headers)) return res.sendStatus(401);
  res.sendStatus(200); // acknowledge fast; the platform retries on slow answers
  try {
    const events = connector.parseWebhook
      ? connector.parseWebhook(req.body)
      : [{ eventKey: crypto.createHash('sha256').update(raw ?? '').digest('hex'), remoteId: '', messages: [] }];
    for (const e of events) {
      try { await prisma.smoisWebhookEvent.create({ data: { provider: connector.id, eventKey: e.eventKey, outcome: connector.capabilities.inbound ? 'RECEIVED' : 'IGNORED_NOT_ENABLED', processedAt: new Date() } }); }
      catch { continue; } // unique violation: already handled
      await smoisAudit(null, { action: 'WEBHOOK_RECEIVED', entity: 'SmoisIntegration', entityId: e.remoteId || connector.id, userId: null, meta: { provider: connector.id, processed: connector.capabilities.inbound } });
    }
  } catch (err) { logger.warn(`SMOIS webhook handling failed: ${err instanceof Error ? err.message : err}`); }
};
