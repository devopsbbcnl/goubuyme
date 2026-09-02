import crypto from 'crypto';
import Redis from 'ioredis';
import Anthropic from '@anthropic-ai/sdk';
import { ErrorCategory, ErrorSeverity, Prisma } from '@prisma/client';
import prisma from '../config/db';
import logger from '../utils/logger';
import { sendTelegramAlert, escapeTelegramHtml } from './telegram.service';
import { blockIpAddress } from './cloudflare-waf.service';

// ─────────────────────────────────────────────────────────────────────────────
// Error-analysis agent
//
// Runs fire-and-forget the moment an ErrorLog row is persisted (from the ingest
// controller, the Express error handler, recordError(), and the rate limiter).
// It decides:
//   • category  — USER_ERROR | SERVER_ERROR | ATTACK | SYSTEM_RISK | UNKNOWN
//   • severity  — LOW | MEDIUM | HIGH | CRITICAL
//   • a one-line summary + recommended action
// then, if the error is an attack or HIGH/CRITICAL, escalates it to the shared
// super-admin Telegram alerts chat (deduped + rate-limited so an incident can't
// flood the channel).
//
// Classification is HYBRID: fast deterministic rules run first; only errors the
// rules can't confidently place are sent to the Claude API. If no ANTHROPIC_API_KEY
// is set the LLM step is skipped and the row is left UNKNOWN/LOW.
//
// This module must NEVER throw and must NEVER call recordError() — analysing an
// error that then records another error would loop. It logs its own failures with
// `logger` directly.
// ─────────────────────────────────────────────────────────────────────────────

const LLM_ENABLED = () =>
  process.env.ERROR_ANALYSIS_LLM_ENABLED !== 'false' && Boolean(process.env.ANTHROPIC_API_KEY);
const LLM_MODEL = () => process.env.ERROR_ANALYSIS_LLM_MODEL || 'claude-haiku-4-5';

// Sources produced by this pipeline itself — never analyse or escalate them.
const SELF_SOURCES = ['telegram', 'error-analysis'];

type ErrorLogRow = Prisma.ErrorLogGetPayload<Record<string, never>>;

export interface Classification {
  category: ErrorCategory;
  severity: ErrorSeverity;
  summary?: string;
  recommendation?: string;
  analyzedBy: 'rules' | 'llm' | 'llm-unavailable';
}

// ─── Fingerprint ─────────────────────────────────────────────────────────────

// Collapse the volatile parts of a message so the "same" error recurring with
// different ids/counts/timestamps produces one stable dedupe key.
const normalizeMessage = (message: string): string =>
  message
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<uuid>')
    .replace(/[0-9a-f]{16,}/g, '<hex>')
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, '<email>')
    .replace(/\d{4}-\d{2}-\d{2}t[\d:.]+z?/g, '<ts>')
    .replace(/"[^"]*"/g, '"<v>"')
    .replace(/'[^']*'/g, "'<v>'")
    .replace(/\d+/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);

export const fingerprintError = (source: string, message: string): string =>
  crypto.createHash('sha1').update(`${source}|${normalizeMessage(message)}`).digest('hex');

// ─── Rule-based classifier ───────────────────────────────────────────────────

const has = (haystack: string, needles: (string | RegExp)[]): boolean =>
  needles.some((n) => (typeof n === 'string' ? haystack.includes(n) : n.test(haystack)));

const CLIENT_PLATFORMS = ['MOBILE', 'WEB', 'ADMIN'];
const SENSITIVE_ROUTE = /\/(auth|login|admin|payments?|paystack|webhook)/i;

// The only URL prefixes this API actually route-serves (see server.ts). Any other
// path that reaches the app can only ever 404 or trip the rate limiter — it never
// hits a real handler. Traffic to those paths (/.env, /wp-login.php, /.git/config,
// /vendor/phpunit/..., a `../` traversal probe) is a vulnerability scanner walking
// a wordlist, which every public host receives continuously. Worth a row for the
// record, never worth paging someone at 3am.
const SERVED_PATH = /^\/(api\/|health|socket\.io|\.well-known\/|$)/i;

export function classifyByRules(log: ErrorLogRow): Classification | null {
  const msg = (log.message || '').toLowerCase();
  const url = (log.url || '').toLowerCase();
  const stack = (log.stack || '').toLowerCase();
  const source = (log.source || '').toLowerCase();
  const ctx = log.context ? JSON.stringify(log.context).toLowerCase() : '';
  const blob = `${msg} ${url} ${stack} ${ctx}`;
  const onSensitiveRoute = SENSITIVE_ROUTE.test(url) || SENSITIVE_ROUTE.test(source);

  // 0. SCAN NOISE — an HTTP request to a path this API doesn't serve. This is
  // untargeted internet background scanning: it was auto-rejected (404 / rate
  // limit) and never reached application code, so there's nothing to act on.
  // Still categorised ATTACK so it stays visible and filterable in the admin
  // Error Logs, but pinned to LOW so it does not page the on-call chat. Scoped to
  // backend-origin HTTP records — a client (MOBILE/WEB/ADMIN) may legitimately
  // report an error whose `url` is a screen name or deep link. A scanner probe
  // that DOES reach a real endpoint skips this and is caught by rule 1 below.
  const isBackendHttp =
    log.platform === 'BACKEND' && (source === 'express' || source === 'rate-limit');
  if (isBackendHttp && log.url && !SERVED_PATH.test(url)) {
    return {
      category: ErrorCategory.ATTACK,
      severity: ErrorSeverity.LOW,
      summary: 'Untargeted background scan against a path this API does not serve — auto-rejected, never reached application code.',
      recommendation: 'No action needed. Public hosts receive this traffic continuously. Investigate only if the same source IP also probes a real /api/ endpoint.',
      analyzedBy: 'rules',
    };
  }

  // 1. ATTACK — injection / traversal / scanning signatures anywhere in the record.
  const attackSignatures: (string | RegExp)[] = [
    'union select', "' or 1=1", "' or '1'='1", ' or 1=1--', 'pg_sleep', 'sleep(', 'waitfor delay',
    'information_schema', 'load_file(', 'benchmark(',
    '../', '..%2f', '%2e%2e', '/etc/passwd', 'c:\\windows', 'boot.ini',
    '<script', 'onerror=', 'javascript:', 'onload=', 'document.cookie',
    '__proto__', 'constructor.prototype', '$where', '$gt":', '$ne":',
    ';rm -rf', '$(', '&&curl', '|bash', 'wget http', 'nc -e',
    'sqlmap', 'nikto', 'nmap', 'acunetix', 'nessus', ' zgrab', 'masscan',
    'x-forwarded-for spoof',
  ];
  if (has(blob, attackSignatures)) {
    return {
      category: ErrorCategory.ATTACK,
      severity: onSensitiveRoute ? ErrorSeverity.CRITICAL : ErrorSeverity.HIGH,
      summary: 'Request payload matches a known attack signature (injection / traversal / scanner).',
      recommendation: onSensitiveRoute
        ? 'Confirm the endpoint rejected it, then block the source IP and review auth/payment logs for related activity.'
        : 'Confirm the request was rejected and consider blocking the source IP.',
      analyzedBy: 'rules',
    };
  }
  // Auth abuse: rate-limit trips or repeated token-verification failures on sensitive routes.
  if (
    (source === 'rate-limit' && onSensitiveRoute) ||
    has(blob, ['jsonwebtokenerror', 'invalid signature', 'jwt malformed', 'too many auth attempts'])
  ) {
    return {
      category: ErrorCategory.ATTACK,
      severity: ErrorSeverity.HIGH,
      summary: 'Repeated authentication failures / rate-limit trips — possible credential stuffing or token forgery.',
      recommendation: 'Check the source IP and account(s) targeted; tighten rate limits or block if the pattern continues.',
      analyzedBy: 'rules',
    };
  }

  // 2. SERVER_ERROR — backend-origin faults.
  const isBackend =
    log.platform === 'BACKEND' ||
    source === 'express' ||
    /(-job|job$|socket|webhook|paystack|cron)/.test(source);
  const outageSignatures: (string | RegExp)[] = [
    'prismaclientinitializationerror', "can't reach database", 'connection pool', 'timed out fetching a new connection',
    'econnrefused', 'enotfound', 'etimedout', 'ehostunreach',
    'enomem', 'out of memory', 'javascript heap', 'maximum call stack',
    'econnreset', 'prismaclientrustpanicerror', 'segmentation fault',
  ];
  if (isBackend) {
    if (has(blob, outageSignatures) || (has(blob, ['payout', 'payment', 'paystack', 'auth']) && has(blob, ['cannot read', 'undefined is not', 'is not a function']))) {
      return {
        category: ErrorCategory.SYSTEM_RISK,
        severity: ErrorSeverity.CRITICAL,
        summary: 'Backend fault matching an outage signature (DB unreachable, pool exhausted, OOM, or a crash in a money/auth path).',
        recommendation: 'Check DB connectivity, connection-pool limits and process memory now; this can take the API down.',
        analyzedBy: 'rules',
      };
    }
    if (
      has(blob, ['prismaclientknownrequesterror', 'prismaclientvalidationerror']) ||
      /\b5\d\d\b/.test(msg) ||
      has(blob, ['internal server error', 'unhandledrejection', 'uncaughtexception', 'cannot read properties of undefined', 'is not a function'])
    ) {
      return {
        category: ErrorCategory.SERVER_ERROR,
        severity: ErrorSeverity.HIGH,
        summary: 'Unhandled backend error / 5xx.',
        recommendation: 'Open the stack trace, reproduce the failing request, and patch the code path.',
        analyzedBy: 'rules',
      };
    }
  }

  // 3. USER_ERROR — client-side validation / expected 4xx / connectivity.
  const isClient = CLIENT_PLATFORMS.includes(log.platform) && source !== 'express';
  const userSignatures: (string | RegExp)[] = [
    'is required', 'must be', 'must not be', 'is not allowed', 'validationerror', 'invalid input',
    'not a valid', 'fails to match', 'length must', '"email"', '"password"', '"phone"',
    'a record with that value already exists', 'p2002', 'unique constraint',
    'record not found', 'p2025', '404', '400', '409', '422',
    'network request failed', 'aborterror', 'network error', 'failed to fetch',
    'timeout of', 'offline', 'no internet',
  ];
  if (isClient && has(blob, userSignatures)) {
    return {
      category: ErrorCategory.USER_ERROR,
      severity: ErrorSeverity.LOW,
      summary: 'Client-side validation, expected 4xx, or a transient connectivity error — not a server fault.',
      recommendation: 'No action needed unless the volume is unusually high (may indicate a broken client build).',
      analyzedBy: 'rules',
    };
  }

  // Ambiguous — let the LLM decide.
  return null;
}

// ─── LLM classifier ──────────────────────────────────────────────────────────

let anthropic: Anthropic | null = null;
const getAnthropic = (): Anthropic => {
  if (!anthropic) anthropic = new Anthropic({ timeout: 12000, maxRetries: 1 });
  return anthropic;
};

const CATEGORY_VALUES = Object.values(ErrorCategory);
const SEVERITY_VALUES = Object.values(ErrorSeverity);

const LLM_SYSTEM = `You triage error-log entries for GoBuyMe, a Nigerian food & goods delivery app (Express/Prisma/PostgreSQL backend; Expo React Native and Next.js clients).

Classify each entry into exactly one category:
- USER_ERROR: client-side validation, an expected 4xx, or a transient network/connectivity problem on a user's device. Not a server fault.
- SERVER_ERROR: an unhandled backend bug or 5xx that affects some requests but not the whole system.
- ATTACK: the request looks like probing or exploitation — SQL/NoSQL injection, path traversal, XSS, command injection, scanner traffic, credential stuffing, token forgery.
- SYSTEM_RISK: a fault that can take the whole app down or corrupt money/auth flows — DB unreachable, connection pool exhausted, out of memory, crash loop, a broken payout/payment/auth path.
- UNKNOWN: genuinely not enough information to tell.

And a severity: LOW, MEDIUM, HIGH, or CRITICAL. ATTACK on an auth/payment route and any SYSTEM_RISK are CRITICAL. Ordinary USER_ERROR is LOW.

Reply with the summary (one sentence, plain English) and a short concrete recommendation for the on-call admin.`;

async function classifyByLLM(log: ErrorLogRow): Promise<Classification | null> {
  try {
    const payload = {
      message: log.message?.slice(0, 2000),
      source: log.source,
      platform: log.platform,
      method: log.method,
      url: log.url,
      role: log.role,
      stack: log.stack?.slice(0, 1500),
      context: log.context ? JSON.stringify(log.context).slice(0, 1200) : undefined,
    };

    const res = await getAnthropic().messages.create({
      model: LLM_MODEL(),
      max_tokens: 400,
      system: LLM_SYSTEM,
      output_config: {
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['category', 'severity', 'summary', 'recommendation'],
            properties: {
              category: { type: 'string', enum: CATEGORY_VALUES },
              severity: { type: 'string', enum: SEVERITY_VALUES },
              summary: { type: 'string' },
              recommendation: { type: 'string' },
            },
          },
        },
      },
      messages: [
        { role: 'user', content: `Classify this error log entry:\n\n${JSON.stringify(payload, null, 2)}` },
      ],
    });

    const text = res.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ?? '';
    const parsed = JSON.parse(text) as {
      category: string;
      severity: string;
      summary: string;
      recommendation: string;
    };

    const category = (CATEGORY_VALUES as string[]).includes(parsed.category)
      ? (parsed.category as ErrorCategory)
      : ErrorCategory.UNKNOWN;
    const severity = (SEVERITY_VALUES as string[]).includes(parsed.severity)
      ? (parsed.severity as ErrorSeverity)
      : ErrorSeverity.MEDIUM;

    return {
      category,
      severity,
      summary: parsed.summary?.slice(0, 500),
      recommendation: parsed.recommendation?.slice(0, 500),
      analyzedBy: 'llm',
    };
  } catch (err) {
    logger.error('errorAnalysis: LLM classification failed', {
      error: (err as Error).message,
      logId: log.id,
    });
    return null;
  }
}

// ─── Escalation throttle ─────────────────────────────────────────────────────

let redisClient: Redis | null = null;
if (process.env.REDIS_URL) {
  redisClient = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: true });
  redisClient.on('error', (err) => logger.error('errorAnalysis: Redis error', { error: err.message }));
  redisClient.connect().catch((err) =>
    logger.error('errorAnalysis: Redis connect failed', { error: err.message }),
  );
}

// In-process fallback when REDIS_URL is unset (single-instance dev). Mirrors the
// degradation pattern in rateLimiter.middleware.ts.
const memCooldown = new Map<string, number>(); // fingerprint -> first-alert epoch ms
const memPendingCount = new Map<string, number>();
let memHourWindowStart = Date.now();
let memHourCount = 0;
setInterval(() => {
  const now = Date.now();
  for (const [k, ts] of memCooldown) if (now - ts > 3_600_000) memCooldown.delete(k);
}, 600_000).unref();

const COOLDOWN_SEC = () => parseInt(process.env.ERROR_ALERT_COOLDOWN_SECONDS || '900', 10);
const HOURLY_CAP = () => parseInt(process.env.ERROR_ALERT_HOURLY_CAP || '20', 10);

// Returns true if this call claimed the "first occurrence" slot for the fingerprint.
async function claimCooldownSlot(fp: string): Promise<boolean> {
  const sec = COOLDOWN_SEC();
  if (redisClient) {
    const ok = await redisClient
      .set(`erroralert:cd:${fp}`, '1', 'EX', sec, 'NX')
      .catch(() => null);
    return ok === 'OK';
  }
  const now = Date.now();
  const first = memCooldown.get(fp);
  if (first && now - first < sec * 1000) return false;
  memCooldown.set(fp, now);
  return true;
}

async function bumpSuppressedCount(fp: string): Promise<void> {
  const sec = COOLDOWN_SEC();
  if (redisClient) {
    await redisClient
      .multi()
      .incr(`erroralert:cnt:${fp}`)
      .expire(`erroralert:cnt:${fp}`, sec)
      .exec()
      .catch(() => undefined);
    return;
  }
  memPendingCount.set(fp, (memPendingCount.get(fp) || 0) + 1);
}

async function takeSuppressedCount(fp: string): Promise<number> {
  if (redisClient) {
    const v = await redisClient.call('GETDEL', `erroralert:cnt:${fp}`).catch(() => null);
    return v ? parseInt(v as string, 10) || 0 : 0;
  }
  const v = memPendingCount.get(fp) || 0;
  memPendingCount.delete(fp);
  return v;
}

async function underHourlyCap(): Promise<boolean> {
  const cap = HOURLY_CAP();
  if (redisClient) {
    const n = await redisClient.incr('erroralert:hourcap').catch(() => 0);
    if (n === 1) await redisClient.expire('erroralert:hourcap', 3600).catch(() => undefined);
    return n <= cap;
  }
  const now = Date.now();
  if (now - memHourWindowStart > 3_600_000) {
    memHourWindowStart = now;
    memHourCount = 0;
  }
  memHourCount += 1;
  return memHourCount <= cap;
}

// ─── Telegram message ────────────────────────────────────────────────────────

function buildAlertHtml(log: ErrorLogRow, cls: Classification, recurred: number): string {
  const dash = (process.env.ADMIN_DASHBOARD_URL || 'http://localhost:3000').replace(/\/$/, '');
  const e = escapeTelegramHtml;
  const lines: string[] = [];
  lines.push(`🚨 <b>${e(cls.severity)} · ${e(cls.category)}</b>`);
  const meta = [`<b>source</b> ${e(log.source)}`, `<b>platform</b> ${e(log.platform)}`];
  if (log.role) meta.push(`<b>role</b> ${e(log.role)}`);
  lines.push(meta.join(' · '));
  if (log.method || log.url) lines.push(e([log.method, log.url].filter(Boolean).join(' ')));
  lines.push(`<code>${e((log.message || '').slice(0, 500))}</code>`);
  if (cls.summary) {
    lines.push(`🤖 ${e(cls.summary)}${cls.recommendation ? ` — ${e(cls.recommendation)}` : ''}`);
  }
  if (recurred > 0) lines.push(`🔁 recurred ×${recurred} in the last ${Math.round(COOLDOWN_SEC() / 60)} min`);
  lines.push(`🔗 ${dash}/error-logs?focus=${log.id}`);
  return lines.join('\n');
}

// A finding pages the on-call Telegram chat when it's an *actionable* ATTACK or
// any HIGH/CRITICAL of any category. A LOW-severity ATTACK is untargeted scan
// noise (see rule 0 in classifyByRules) — recorded, filterable, but not paged.
export const isEscalatable = (cls: Pick<Classification, 'category' | 'severity'>): boolean =>
  (cls.category === ErrorCategory.ATTACK && cls.severity !== ErrorSeverity.LOW) ||
  cls.severity === ErrorSeverity.HIGH ||
  cls.severity === ErrorSeverity.CRITICAL;

async function maybeEscalate(log: ErrorLogRow, cls: Classification): Promise<boolean> {
  if (!isEscalatable(cls)) return false;

  const fp = log.fingerprint || fingerprintError(log.source, log.message);

  if (!(await claimCooldownSlot(fp))) {
    await bumpSuppressedCount(fp);
    return false;
  }
  if (!(await underHourlyCap())) {
    logger.warn('errorAnalysis: hourly Telegram alert cap reached — suppressing', { logId: log.id });
    return false;
  }

  // Auto-block IP for CRITICAL attacks from backend
  if (
    cls.severity === ErrorSeverity.CRITICAL &&
    cls.category === ErrorCategory.ATTACK &&
    log.platform === 'BACKEND'
  ) {
    const ip = (log.context as any)?.ip;
    if (ip && /^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
      const reason = cls.summary || 'CRITICAL attack detected';
      await blockIpAddress(ip, reason);
    }
  }

  const recurred = await takeSuppressedCount(fp);
  const sent = await sendTelegramAlert(buildAlertHtml(log, cls, recurred));
  if (sent) {
    await prisma.errorLog
      .update({ where: { id: log.id }, data: { escalatedAt: new Date() } })
      .catch((err) => logger.error('errorAnalysis: failed to mark escalatedAt', { error: (err as Error).message }));
  }
  return sent;
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export const analyzeErrorLog = async (
  id: string,
  opts: { force?: boolean } = {},
): Promise<void> => {
  try {
    const log = await prisma.errorLog.findUnique({ where: { id } });
    if (!log) return;
    if (log.analyzedAt && !opts.force) return;

    // Never analyse or escalate this pipeline's own failures.
    if (SELF_SOURCES.some((s) => (log.source || '').toLowerCase().startsWith(s))) {
      await prisma.errorLog.update({
        where: { id },
        data: {
          category: ErrorCategory.SERVER_ERROR,
          severity: ErrorSeverity.LOW,
          analyzedBy: 'rules',
          analyzedAt: new Date(),
          fingerprint: fingerprintError(log.source, log.message),
        },
      });
      return;
    }

    let cls = classifyByRules(log);
    if (!cls && LLM_ENABLED()) cls = await classifyByLLM(log);
    if (!cls) {
      cls = {
        category: ErrorCategory.UNKNOWN,
        severity: ErrorSeverity.LOW,
        analyzedBy: 'llm-unavailable',
      };
    }

    const fingerprint = fingerprintError(log.source, log.message);

    const updated = await prisma.errorLog.update({
      where: { id },
      data: {
        category: cls.category,
        severity: cls.severity,
        aiSummary: cls.summary ?? null,
        aiRecommendation: cls.recommendation ?? null,
        analyzedBy: cls.analyzedBy,
        analyzedAt: new Date(),
        fingerprint,
      },
    });

    await maybeEscalate(updated, cls);
  } catch (err) {
    // Must not surface — and must not go through recordError (would loop).
    logger.error('errorAnalysis: analyzeErrorLog failed', {
      error: (err as Error).message,
      stack: (err as Error).stack,
      logId: id,
    });
  }
};
