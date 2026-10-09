import { Response } from 'express';
import { AgentMode, AgentSuggestionStatus, Prisma } from '@prisma/client';
import prisma from '../config/db';
import { apiResponse } from '../utils/apiResponse';
import { catchAsync } from '../utils/catchAsync';
import { AuthRequest } from '../middleware/auth.middleware';
import { AGENT_ACTIONS } from '../services/agents/agentActions';
import { AGENTS } from '../services/agents/agentRegistry';
import {
  AgentError, approveSuggestion, getAgentConfig, rejectSuggestion, updateAgentConfig,
} from '../services/agents/agentRuntime.service';

const handle = (fn: (req: AuthRequest, res: Response) => Promise<unknown>) =>
  catchAsync(async (req: AuthRequest, res: Response) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof AgentError) return apiResponse.error(res, err.message, err.status);
      throw err;
    }
  });

// GET /admin/agents — every agent with its definition, live config and today's activity
export const listAgents = handle(async (_req, res) => {
  const since = new Date(Date.now() - 86_400_000);
  const data = await Promise.all(Object.values(AGENTS).map(async (def) => {
    const [config, grouped] = await Promise.all([
      getAgentConfig(def.key),
      prisma.agentSuggestion.groupBy({ by: ['status'], where: { agentKey: def.key, createdAt: { gte: since } }, _count: { _all: true } }),
    ]);
    const pending = await prisma.agentSuggestion.count({ where: { agentKey: def.key, status: AgentSuggestionStatus.PENDING } });
    return {
      key: def.key,
      name: def.name,
      description: def.description,
      actions: def.actions.map((a) => ({ type: a, label: AGENT_ACTIONS[a].label, autoAllowed: AGENT_ACTIONS[a].autoAllowed })),
      settingsSpec: def.settingsSpec,
      config,
      pending,
      last24h: Object.fromEntries(grouped.map((g) => [g.status, g._count._all])),
    };
  }));
  return apiResponse.success(res, 'Agents fetched.', data);
});

// PATCH /admin/agents/:key — super admin changes mode, auto actions or thresholds
export const updateAgent = handle(async (req, res) => {
  const { mode, autoActions, settings } = req.body as { mode?: AgentMode; autoActions?: string[]; settings?: Record<string, number> };
  const config = await updateAgentConfig(req.params.key, { mode, autoActions, settings }, req.user!.userId);
  return apiResponse.success(res, 'Agent settings saved.', config);
});

// GET /admin/agents/suggestions?view=pending|history&agentKey=&page=&limit=
export const listSuggestions = handle(async (req, res) => {
  const { view = 'pending', agentKey, page = '1', limit = '20' } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));
  const where: Prisma.AgentSuggestionWhereInput = {
    ...(agentKey ? { agentKey } : {}),
    status: view === 'history' ? { not: AgentSuggestionStatus.PENDING } : AgentSuggestionStatus.PENDING,
  };

  const [rows, total] = await Promise.all([
    prisma.agentSuggestion.findMany({
      where,
      orderBy: view === 'history' ? { updatedAt: 'desc' } : { createdAt: 'asc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
    }),
    prisma.agentSuggestion.count({ where }),
  ]);
  const deciderIds = [...new Set(rows.map((r) => r.decidedById).filter((x): x is string => !!x))];
  const deciders = deciderIds.length
    ? await prisma.user.findMany({ where: { id: { in: deciderIds } }, select: { id: true, name: true } })
    : [];
  const nameOf = new Map(deciders.map((d) => [d.id, d.name]));

  const data = rows.map((r) => ({
    ...r,
    agentName: AGENTS[r.agentKey]?.name ?? r.agentKey,
    actionLabel: r.action in AGENT_ACTIONS ? AGENT_ACTIONS[r.action as keyof typeof AGENT_ACTIONS].label : r.action,
    decidedByName: r.decidedById ? nameOf.get(r.decidedById) ?? null : null,
  }));
  return apiResponse.paginated(res, 'Suggestions fetched.', data, {
    page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum),
  });
});

const OUTCOME_MESSAGE: Partial<Record<AgentSuggestionStatus, string>> = {
  EXECUTED: 'Done.',
  FAILED: 'Approved, but the action failed.',
  EXPIRED: 'The order already moved on, so nothing was done.',
};

// POST /admin/agents/suggestions/:id/approve
export const approveAgentSuggestion = handle(async (req, res) => {
  const s = await approveSuggestion(req.params.id, { userId: req.user!.userId, role: req.user!.role });
  const message = OUTCOME_MESSAGE[s.status] ?? 'Approved.';
  return apiResponse.success(res, s.error && s.status !== 'EXECUTED' ? `${message} ${s.error}` : message, s);
});

// POST /admin/agents/suggestions/:id/reject
export const rejectAgentSuggestion = handle(async (req, res) => {
  const s = await rejectSuggestion(req.params.id, req.user!.userId, (req.body as { note?: string }).note ?? null);
  return apiResponse.success(res, 'Suggestion rejected. The agent won\'t suggest this again for the same situation.', s);
});
