// SMOIS AI assistance (PRD phase 4). Rules this file enforces for every feature:
//  - off until a super admin switches it on, with a per-person daily limit
//  - the model is told to use only the data in the request and never to invent figures
//  - every number in its reply is checked against that data; the ones it cannot find are returned to the reader
//  - results are drafts: nothing here writes to the workspace, a person applies what they want
//  - a request row records who/what/outcome, never the question or the answer
import Anthropic from '@anthropic-ai/sdk';
import prisma from '../../config/db';
import logger from '../../utils/logger';
import { verifyNumbers } from './aiGuard';

export type AiFeature = 'CONTENT' | 'ASK' | 'REPORT' | 'SENTIMENT';
export type AiFailure = 'DISABLED' | 'UNAVAILABLE' | 'LIMIT' | 'ERROR';

export interface AiCallInput { feature: AiFeature; system: string; user: string; schema: Record<string, unknown>; maxTokens?: number }
export interface AiProvider { name: string; available: () => boolean; call: (input: AiCallInput) => Promise<{ json: unknown; model: string }> }

export type AiResult<T> =
  | { ok: true; data: T; model: string; aiGenerated: true; reviewRequired: true; verification: { checked: number; unverified: string[] } }
  | { ok: false; code: AiFailure; message: string };

const MODEL = () => process.env.SMOIS_AI_MODEL || 'claude-sonnet-5-5';
const TIMEOUT_MS = 60_000;

// ── Providers ───────────────────────────────────────────────────────────────

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 1 }));

export class AiRefused extends Error {}

export const claudeProvider: AiProvider = {
  name: 'claude',
  available: () => Boolean(process.env.ANTHROPIC_API_KEY),
  call: async ({ system, user, schema, maxTokens }) => {
    const res = await getClient().beta.messages.create({
      model: MODEL(),
      max_tokens: maxTokens ?? 2000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema } },
      system,
      messages: [{ role: 'user', content: user }],
    });
    if (res.stop_reason === 'refusal') throw new AiRefused('The model declined to answer that.');
    if (res.stop_reason === 'max_tokens') throw new AiRefused('The answer was too long to finish.');
    const text = res.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')?.text;
    if (!text) throw new AiRefused('The model returned nothing.');
    return { json: JSON.parse(text), model: MODEL() };
  },
};

let provider: AiProvider = claudeProvider;
/** Tests and local development can swap the provider. Production always uses Claude. */
export const setAiProvider = (p: AiProvider) => { provider = p; };
export const resetAiProvider = () => { provider = claudeProvider; };
export const activeProvider = (): AiProvider => {
  if (process.env.NODE_ENV !== 'production' && process.env.SMOIS_AI_PROVIDER === 'stub') return stubProvider;
  return provider;
};

// ── Shared prompt rules ─────────────────────────────────────────────────────

export const BASE_RULES = [
  'You assist the social media team at GoBuyMe, a Nigerian food and goods delivery company.',
  'Use ONLY the data given in the user message. Never invent figures, names, dates, prices, quotes or events.',
  'If something is missing, null, or marked "Not recorded", say it is not recorded. Do not guess or fill gaps.',
  'Quote numbers exactly as given. Do not calculate new numbers, percentages or totals.',
  'Figures are entered by staff and are not verified by the social platforms. Never call them verified or confirmed.',
  'Your output is a draft that a person will review. Write plainly and directly, without hype.',
  'Do not include personal data about customers.',
].join(' ');

// ── Running a request ───────────────────────────────────────────────────────

const startOfLagosDay = (now = new Date()) => {
  const l = new Date(now.getTime() + 3_600_000);
  return new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate()) - 3_600_000);
};

const record = (userId: string, feature: AiFeature, status: string, extra: { model?: string; unverifiedCount?: number; durationMs?: number } = {}) =>
  prisma.smoisAiRequest.create({ data: { userId, feature, status, model: extra.model ?? null, unverifiedCount: extra.unverifiedCount ?? 0, durationMs: extra.durationMs ?? 0 } }).catch((e) => logger.warn(`SMOIS AI log failed: ${(e as Error).message}`));

export const aiStatus = async (userId: string) => {
  const s = await prisma.smoisSettings.upsert({ where: { id: 'default' }, create: { id: 'default' }, update: {} });
  const used = await prisma.smoisAiRequest.count({ where: { userId, status: { in: ['OK', 'ERROR'] }, createdAt: { gte: startOfLagosDay() } } });
  const p = activeProvider();
  return { enabled: s.aiEnabled, available: p.available(), provider: p.name, dailyLimit: s.aiDailyLimit, usedToday: used, remainingToday: Math.max(0, s.aiDailyLimit - used), model: MODEL() };
};

export interface RunOptions<T> {
  userId: string;
  feature: AiFeature;
  system: string;
  user: string;
  schema: Record<string, unknown>;
  /** Data the reply may talk about. Numbers in the reply are checked against it. */
  facts?: unknown;
  /** The text of the reply to check for invented numbers. */
  textOf?: (data: T) => string;
  maxTokens?: number;
}

export const runAi = async <T>(o: RunOptions<T>): Promise<AiResult<T>> => {
  const t0 = Date.now();
  try {
    const st = await aiStatus(o.userId);
    if (!st.enabled) { await record(o.userId, o.feature, 'DISABLED'); return { ok: false, code: 'DISABLED', message: 'AI assistance is switched off. A super admin can turn it on in Social Settings.' }; }
    if (!st.available) { await record(o.userId, o.feature, 'UNAVAILABLE'); return { ok: false, code: 'UNAVAILABLE', message: 'AI assistance is not available right now (no connection to the AI service is configured).' }; }
    if (st.usedToday >= st.dailyLimit) { await record(o.userId, o.feature, 'LIMIT'); return { ok: false, code: 'LIMIT', message: `You have used your ${st.dailyLimit} AI requests for today. The limit resets at midnight.` }; }

    const { json, model } = await activeProvider().call({ feature: o.feature, system: o.system, user: o.user, schema: o.schema, maxTokens: o.maxTokens });
    const data = json as T;
    const verification = o.facts !== undefined && o.textOf ? verifyNumbers(o.textOf(data), o.facts) : { checked: 0, unverified: [] as string[] };
    await record(o.userId, o.feature, 'OK', { model, unverifiedCount: verification.unverified.length, durationMs: Date.now() - t0 });
    return { ok: true, data, model, aiGenerated: true, reviewRequired: true, verification };
  } catch (err) {
    // Never log the prompt or the reply: they can hold business data.
    logger.warn(`SMOIS AI ${o.feature} failed: ${(err as Error).message}`);
    await record(o.userId, o.feature, 'ERROR', { durationMs: Date.now() - t0 });
    return { ok: false, code: 'ERROR', message: err instanceof AiRefused ? err.message : 'The AI service could not complete that. Nothing was changed. Try again in a moment.' };
  }
};

// ── Local stand-in (development and tests only) ─────────────────────────────

const firstNumberIn = (text: string) => /\d[\d,]*(?:\.\d+)?/.exec(text)?.[0] ?? null;

export const stubProvider: AiProvider = {
  name: 'stub',
  available: () => true,
  call: async ({ feature, user }) => {
    if (feature === 'SENTIMENT') {
      const negative = /terrible|awful|worst|scam|never again/i.test(user);
      const unsure = /unclear|maybe/i.test(user);
      return { model: 'stub', json: { sentiment: negative ? 'NEGATIVE' : unsure ? 'NEUTRAL' : 'POSITIVE', confidence: unsure ? 'LOW' : 'HIGH', reason: negative ? 'Complaint about the service.' : 'General comment.' } };
    }
    if (feature === 'CONTENT') {
      return { model: 'stub', json: { suggestions: [1, 2, 3].map((n) => ({ text: `Stub suggestion ${'ABC'[n - 1]} ${/INVENT/.test(user) ? 'now only ₦9,999' : ''}`.trim(), note: `Option ${'ABC'[n - 1]}` })) } };
    }
    if (feature === 'REPORT') {
      return { model: 'stub', json: { summary: `A steady period.${/INVENT/.test(user) ? ' Followers hit 99,999.' : ''}`, achievements: '', challenges: '', observations: 'See the figures above.', recommendations: 'Keep recording readings.', plans: '' } };
    }
    let followers: number | null = null;
    try { followers = (JSON.parse((user.split('FACTS:')[1] ?? '').trim()) as { audience?: { followers?: number | null } }).audience?.followers ?? null; } catch { /* no facts */ }
    const invent = /INVENT/.test(user.split('FACTS:')[0] ?? '');
    return { model: 'stub', json: { answer: `${followers !== null ? `Followers across the accounts are ${followers.toLocaleString('en-US')}.` : 'Nothing is recorded for that.'}${invent ? ' Growth was 77.7%.' : ''}`, basis: ['audience'], notRecorded: [] } };
  },
};
