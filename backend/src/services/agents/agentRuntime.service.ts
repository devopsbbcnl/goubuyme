import { AgentMode, AgentSuggestion, AgentSuggestionStatus, OrderActorType, Prisma } from '@prisma/client';
import Joi from 'joi';
import prisma from '../../config/db';
import logger from '../../utils/logger';
import { recordError } from '../../utils/recordError';
import { OrderActionError } from '../orderLifecycle.service';
import { TicketError } from '../crm/ticket.service';
import { escapeTelegramHtml, sendTelegramAlert } from '../telegram.service';
import { AGENT_ACTIONS, ActionContext, ActionPayload, ActionRefusedError, AgentActionType, isAgentAction } from './agentActions';
import { AGENTS, AgentDefinition, DISPATCH_WATCHER } from './agentRegistry';

// Agent framework: agents propose actions; this decides whether each runs automatically (AUTO
// mode + allowed action) or waits in the admin inbox, runs approved ones through the action
// registry, and keeps the audit trail. Every write is guarded so two server instances, or two
// admins clicking at once, can't run the same suggestion twice.

/** Action definitions seen through the runtime: payload shape is checked by each schema. */
type GenericAction = {
  subject: 'order' | 'ticket';
  isStale(p: Record<string, unknown>): Promise<boolean>;
  execute(p: Record<string, unknown>, ctx: ActionContext): Promise<Prisma.InputJsonValue>;
};

export class AgentError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = 'AgentError';
  }
}

export interface ResolvedAgentConfig {
  key: string;
  mode: AgentMode;
  autoActions: AgentActionType[];
  settings: Record<string, number>;
  updatedAt: Date | null;
}

const definition = (key: string): AgentDefinition => {
  const def = AGENTS[key];
  if (!def) throw new AgentError(`Unknown agent "${key}".`, 404);
  return def;
};

export async function getAgentConfig(key: string): Promise<ResolvedAgentConfig> {
  const def = definition(key);
  const row = await prisma.agentConfig.findUnique({ where: { key } });
  const stored = (row?.settings ?? {}) as Record<string, unknown>;
  const settings = { ...def.defaults.settings };
  for (const [k, v] of Object.entries(stored)) {
    if (k in settings && typeof v === 'number' && Number.isFinite(v)) settings[k] = v;
  }
  return {
    key,
    mode: row?.mode ?? def.defaults.mode,
    autoActions: (row?.autoActions ?? def.defaults.autoActions).filter(
      (a): a is AgentActionType => isAgentAction(a) && def.actions.includes(a) && AGENT_ACTIONS[a].autoAllowed,
    ),
    settings,
    updatedAt: row?.updatedAt ?? null,
  };
}

export async function updateAgentConfig(
  key: string,
  patch: { mode?: AgentMode; autoActions?: string[]; settings?: Record<string, number> },
  userId: string,
): Promise<ResolvedAgentConfig> {
  const def = definition(key);
  const current = await getAgentConfig(key);

  if (patch.autoActions) {
    for (const a of patch.autoActions) {
      if (!isAgentAction(a) || !def.actions.includes(a)) throw new AgentError(`${def.name} has no action "${a}".`);
      if (!AGENT_ACTIONS[a].autoAllowed) throw new AgentError(`"${AGENT_ACTIONS[a].label}" always needs a person to approve it.`);
    }
  }
  const settings = { ...current.settings };
  for (const [k, v] of Object.entries(patch.settings ?? {})) {
    const spec = def.settingsSpec[k];
    if (!spec) throw new AgentError(`Unknown setting "${k}".`);
    if (typeof v !== 'number' || !Number.isFinite(v) || v < spec.min || v > spec.max) {
      throw new AgentError(`${spec.label} must be between ${spec.min} and ${spec.max}.`);
    }
    settings[k] = v;
  }
  if (key === DISPATCH_WATCHER
    && !(settings.notifyAfterMinutes <= settings.suggestAssignAfterMinutes
      && settings.suggestAssignAfterMinutes < settings.suggestCancelAfterMinutes)) {
    throw new AgentError('Timings must run in order: alert riders ≤ suggest a rider < suggest cancelling.');
  }

  const data = {
    mode: patch.mode ?? current.mode,
    autoActions: patch.autoActions ?? current.autoActions,
    settings,
    updatedById: userId,
  };
  await prisma.agentConfig.upsert({ where: { key }, create: { key, ...data }, update: data });
  await prisma.auditLog.create({
    data: { userId, action: 'AGENT_CONFIG_UPDATED', entity: 'AgentConfig', entityId: key, agentKey: key, meta: data as Prisma.InputJsonValue },
  });
  return getAgentConfig(key);
}

export interface ProposeInput {
  agentKey: string;
  action: AgentActionType;
  title: string;
  reason: string;
  payload: ActionPayload;
  /** Same key = same situation; it's only ever suggested once. */
  dedupeKey: string;
  ttlMinutes: number;
}

/**
 * Records a proposed action. Returns null if the agent is off or this situation was already
 * proposed. In AUTO mode with the action allowed, it runs immediately.
 */
export async function proposeAction(input: ProposeInput, config?: ResolvedAgentConfig): Promise<AgentSuggestion | null> {
  const cfg = config ?? await getAgentConfig(input.agentKey);
  if (cfg.mode === AgentMode.OFF) return null;

  const { error, value } = (AGENT_ACTIONS[input.action].schema as Joi.ObjectSchema).validate(input.payload);
  if (error) throw new AgentError(`Invalid ${input.action} payload: ${error.message}`);

  const dedupeKey = `${input.agentKey}:${input.dedupeKey}`;
  // Cheap check first: watchers re-evaluate the same situations every tick. The unique index
  // below still settles races between server instances.
  if (await prisma.agentSuggestion.findUnique({ where: { dedupeKey }, select: { id: true } })) return null;

  const auto = cfg.mode === AgentMode.AUTO && cfg.autoActions.includes(input.action);
  let suggestion: AgentSuggestion;
  try {
    suggestion = await prisma.agentSuggestion.create({
      data: {
        agentKey: input.agentKey,
        action: input.action,
        title: input.title.slice(0, 300),
        reason: input.reason.slice(0, 1000),
        payload: value as unknown as Prisma.InputJsonValue,
        orderId: typeof input.payload.orderId === 'string' ? input.payload.orderId : null,
        ticketId: typeof input.payload.ticketId === 'string' ? input.payload.ticketId : null,
        dedupeKey,
        status: auto ? AgentSuggestionStatus.APPROVED : AgentSuggestionStatus.PENDING,
        autoExecuted: auto,
        expiresAt: new Date(Date.now() + input.ttlMinutes * 60_000),
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return null; // already proposed
    throw err;
  }

  return auto ? executeSuggestion(suggestion, null) : suggestion;
}

async function executeSuggestion(s: AgentSuggestion, approver: ActionContext['approver']): Promise<AgentSuggestion> {
  if (!isAgentAction(s.action)) {
    return prisma.agentSuggestion.update({ where: { id: s.id }, data: { status: AgentSuggestionStatus.FAILED, error: `Unknown action ${s.action}` } });
  }
  const def = AGENT_ACTIONS[s.action] as unknown as GenericAction;
  const payload = s.payload as Record<string, unknown>;

  // Re-check right before acting: the world may have moved on since the agent proposed this.
  if (await def.isStale(payload)) {
    return prisma.agentSuggestion.update({
      where: { id: s.id },
      data: { status: AgentSuggestionStatus.EXPIRED, error: `The ${def.subject} changed before this could run, so it no longer applies.` },
    });
  }

  const ctx: ActionContext = { agentKey: s.agentKey, suggestionId: s.id, approver };
  try {
    const result = await def.execute(payload, ctx);
    const done = await prisma.agentSuggestion.update({
      where: { id: s.id },
      data: { status: AgentSuggestionStatus.EXECUTED, executedAt: new Date(), result },
    });
    await prisma.auditLog.create({
      data: {
        userId: approver?.userId ?? null,
        actorType: approver ? OrderActorType.ADMIN : OrderActorType.AGENT,
        agentKey: s.agentKey,
        action: `AGENT_${s.action}`,
        entity: def.subject === 'order' ? 'Order' : 'Ticket',
        entityId: (s.orderId ?? s.ticketId)!,
        meta: { suggestionId: s.id, title: s.title, auto: !approver, result },
      },
    });
    return done;
  } catch (err) {
    const expected = err instanceof OrderActionError || err instanceof TicketError
      || err instanceof AgentError || err instanceof ActionRefusedError;
    const message = expected ? (err as Error).message : 'Unexpected error while running this action — see error logs.';
    if (!expected) recordError('agent-runtime', `Agent action ${s.action} failed`, err, { suggestionId: s.id });
    return prisma.agentSuggestion.update({ where: { id: s.id }, data: { status: AgentSuggestionStatus.FAILED, error: message } });
  }
}

/** Admin approves a pending suggestion; it runs as that admin. */
export async function approveSuggestion(id: string, approver: { userId: string; role: string }): Promise<AgentSuggestion> {
  const claimed = await prisma.agentSuggestion.updateMany({
    where: { id, status: AgentSuggestionStatus.PENDING, expiresAt: { gt: new Date() } },
    data: { status: AgentSuggestionStatus.APPROVED, decidedById: approver.userId, decidedAt: new Date() },
  });
  if (claimed.count === 0) throw new AgentError('This suggestion was already handled or has expired.', 409);
  const s = await prisma.agentSuggestion.findUniqueOrThrow({ where: { id } });
  return executeSuggestion(s, approver);
}

export async function rejectSuggestion(id: string, userId: string, note?: string | null): Promise<AgentSuggestion> {
  const claimed = await prisma.agentSuggestion.updateMany({
    where: { id, status: AgentSuggestionStatus.PENDING },
    data: { status: AgentSuggestionStatus.REJECTED, decidedById: userId, decidedAt: new Date(), error: note?.slice(0, 500) || null },
  });
  if (claimed.count === 0) throw new AgentError('This suggestion was already handled.', 409);
  const s = await prisma.agentSuggestion.findUniqueOrThrow({ where: { id } });
  await prisma.auditLog.create({
    data: { userId, agentKey: s.agentKey, action: 'AGENT_SUGGESTION_REJECTED', entity: s.ticketId ? 'Ticket' : 'Order', entityId: s.orderId ?? s.ticketId ?? s.id, meta: { suggestionId: s.id, title: s.title, note: note ?? null } },
  });
  return s;
}

/** Pending suggestions that timed out or whose order moved on → EXPIRED. Returns how many. */
export async function expireStaleSuggestions(): Promise<number> {
  const now = new Date();
  const timedOut = await prisma.agentSuggestion.updateMany({
    where: { status: AgentSuggestionStatus.PENDING, expiresAt: { lte: now } },
    data: { status: AgentSuggestionStatus.EXPIRED, error: 'Nobody acted before it expired.' },
  });

  const pending = await prisma.agentSuggestion.findMany({
    where: { status: AgentSuggestionStatus.PENDING },
    select: { id: true, action: true, payload: true },
    take: 500,
  });
  const stale: string[] = [];
  for (const p of pending) {
    if (!isAgentAction(p.action)) continue;
    const def = AGENT_ACTIONS[p.action] as unknown as GenericAction;
    if (await def.isStale(p.payload as Record<string, unknown>)) stale.push(p.id);
  }
  if (stale.length) {
    await prisma.agentSuggestion.updateMany({
      where: { id: { in: stale }, status: AgentSuggestionStatus.PENDING },
      data: { status: AgentSuggestionStatus.EXPIRED, error: 'Resolved before anyone acted (the situation moved on).' },
    });
  }
  return timedOut.count + stale.length;
}

/** One Telegram message for the suggestions a tick created that need a person. */
export async function announceSuggestions(agentName: string, suggestions: AgentSuggestion[]): Promise<void> {
  const pending = suggestions.filter((s) => s.status === AgentSuggestionStatus.PENDING);
  if (!pending.length) return;
  const lines = pending.slice(0, 8).map((s) => `• ${escapeTelegramHtml(s.title)}`);
  if (pending.length > 8) lines.push(`• …and ${pending.length - 8} more`);
  const ok = await sendTelegramAlert(
    [`🤖 <b>${escapeTelegramHtml(agentName)}</b> needs a decision`, ...lines, '', 'Approve or reject in Admin → Agents.'].join('\n'),
    { chatId: process.env.TELEGRAM_AGENT_CHAT_ID || undefined },
  );
  if (!ok) logger.warn(`${agentName}: could not post ${pending.length} suggestion(s) to Telegram`);
}
