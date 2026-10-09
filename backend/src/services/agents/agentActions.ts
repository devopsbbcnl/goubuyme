import Joi from 'joi';
import { OrderActorType, OrderStatus, Prisma, TicketCategory, TicketPriority, TicketStatus } from '@prisma/client';
import prisma from '../../config/db';
import { notifyUser } from '../notification.service';
import { OrderActor, adminCancelOrder, assignRider, getCandidateRiders } from '../orderLifecycle.service';
import { MAX_TICKET_CREDIT, issueTicketCredit, sendStaffReply } from '../crm/ticket.service';
import { slaDueAt } from '../crm/ticketSla.service';
import { escapeTelegramHtml, sendTelegramAlert } from '../telegram.service';

// Every action an agent can take. Agents never touch the database directly: each action runs
// through the same service functions the admin buttons use, so caps, guards and notifications
// are identical whether a person or an agent acts. Adding an agent capability = adding an entry
// here (plus allowing it for that agent in agentRegistry.ts).

export interface ActionContext {
  agentKey: string;
  suggestionId: string;
  /** The admin who approved it, or null when it ran automatically (AUTO mode). */
  approver: { userId: string; role: string } | null;
}

/** Condition an order must still be in for an order action to make sense. */
export interface OrderCondition {
  statuses: OrderStatus[];
  noRider?: boolean;
}

export interface OrderSnapshot {
  status: OrderStatus;
  riderId: string | null;
}

/** Condition a ticket must still be in for a ticket action to make sense. */
export interface TicketCondition {
  ticketStatuses: TicketStatus[];
  /** Stale once any staff member has replied publicly. */
  noStaffReply?: boolean;
  /** Stale if staff already changed these since the agent looked. */
  unchangedCategory?: TicketCategory;
  unchangedPriority?: TicketPriority;
}

export interface TicketSnapshot {
  status: TicketStatus;
  firstResponseAt: Date | null;
  category: TicketCategory;
  priority: TicketPriority;
}

export type ActionSubject = 'order' | 'ticket';

export type ActionPayload =
  | ({ orderId: string; when: OrderCondition } & Record<string, unknown>)
  | ({ ticketId: string; when: TicketCondition } & Record<string, unknown>);

export interface ActionDefinition<P> {
  subject: ActionSubject;
  /** Shown in the admin settings next to the AUTO toggle. */
  label: string;
  /** Low-risk actions may be allowed to run without approval; others never can. */
  autoAllowed: boolean;
  schema: Joi.ObjectSchema<P>;
  /** True when the situation moved on, so the suggestion no longer applies. */
  isStale(payload: P): Promise<boolean>;
  execute(payload: P, ctx: ActionContext): Promise<Prisma.InputJsonValue>;
}

// ─── Staleness ───────────────────────────────────────────────────────────────────

export function isStale(cond: OrderCondition, order: OrderSnapshot | null): boolean {
  if (!order) return true;
  if (!cond.statuses.includes(order.status)) return true;
  if (cond.noRider && order.riderId) return true;
  return false;
}

export function isTicketStale(cond: TicketCondition, ticket: TicketSnapshot | null): boolean {
  if (!ticket) return true;
  if (!cond.ticketStatuses.includes(ticket.status)) return true;
  if (cond.noStaffReply && ticket.firstResponseAt) return true;
  if (cond.unchangedCategory && ticket.category !== cond.unchangedCategory) return true;
  if (cond.unchangedPriority && ticket.priority !== cond.unchangedPriority) return true;
  return false;
}

const orderStale = async (p: { orderId: string; when: OrderCondition }) =>
  isStale(p.when, await prisma.order.findUnique({ where: { id: p.orderId }, select: { status: true, riderId: true } }));

const ticketStale = async (p: { ticketId: string; when: TicketCondition }) =>
  isTicketStale(p.when, await prisma.ticket.findUnique({
    where: { id: p.ticketId }, select: { status: true, firstResponseAt: true, category: true, priority: true },
  }));

// ─── Shared bits ─────────────────────────────────────────────────────────────────

const orderWhen = Joi.object({
  statuses: Joi.array().items(Joi.string().valid(...Object.values(OrderStatus))).min(1).required(),
  noRider: Joi.boolean(),
}).required();

const ticketWhen = Joi.object({
  ticketStatuses: Joi.array().items(Joi.string().valid(...Object.values(TicketStatus))).min(1).required(),
  noStaffReply: Joi.boolean(),
  unchangedCategory: Joi.string().valid(...Object.values(TicketCategory)),
  unchangedPriority: Joi.string().valid(...Object.values(TicketPriority)),
}).required();

/** Attribution for the order timeline: the approving admin, or the agent itself. */
const actorFor = (ctx: ActionContext): OrderActor =>
  ctx.approver ? { type: OrderActorType.ADMIN, id: ctx.approver.userId } : { type: OrderActorType.AGENT, id: null };

const suggestedBy = (ctx: ActionContext) => `Suggested by ${ctx.agentKey.replace(/_/g, ' ')}`;

/** A refusal the admin should see as-is (not an unexpected crash). */
export class ActionRefusedError extends Error {}

/** For actions that must be done by a person (they need an author/approver). */
const requireApprover = (ctx: ActionContext) => {
  if (!ctx.approver) throw new ActionRefusedError('This action needs an admin to approve it.');
  return ctx.approver;
};

// ─── Order actions (dispatch watcher) ────────────────────────────────────────────

export interface NotifyRidersPayload { orderId: string; when: OrderCondition; orderNumber: string; vendorName: string; fee: number; radiusKm: number; maxRiders: number }
export interface AssignRiderPayload { orderId: string; when: OrderCondition; riderId: string; riderName: string }
export interface CancelOrderPayload { orderId: string; when: OrderCondition; reason: string }
export interface FollowUpPayload { orderId: string; when: OrderCondition; kind: 'delivery' | 'vendor'; contactName: string; phone: string | null }

const notifyRiders: ActionDefinition<NotifyRidersPayload> = {
  subject: 'order',
  label: 'Alert nearby riders about a waiting order',
  autoAllowed: true,
  schema: Joi.object({
    orderId: Joi.string().required(), when: orderWhen, orderNumber: Joi.string().required(), vendorName: Joi.string().required(),
    fee: Joi.number().min(0).required(), radiusKm: Joi.number().positive().required(), maxRiders: Joi.number().integer().min(1).max(50).required(),
  }),
  isStale: orderStale,
  async execute(p) {
    const riders = (await getCandidateRiders(p.orderId))
      .filter((r) => r.isAvailable && r.distanceKm != null && r.distanceKm <= p.radiusKm)
      .slice(0, p.maxRiders);
    await Promise.all(riders.map((r) =>
      notifyUser(r.userId, {
        title: 'Delivery waiting near you 🏍️',
        body: `${p.vendorName} has order #${p.orderNumber} ready for pickup, ${r.distanceKm} km away. Earn ₦${Math.round(p.fee).toLocaleString()}. Open Available Jobs to accept.`,
        type: 'job',
        data: { orderId: p.orderId },
      }).catch(() => {}),
    ));
    return { notified: riders.length, riderIds: riders.map((r) => r.id) };
  },
};

const assignRiderAction: ActionDefinition<AssignRiderPayload> = {
  subject: 'order',
  label: 'Assign a rider to a waiting order',
  autoAllowed: true,
  schema: Joi.object({ orderId: Joi.string().required(), when: orderWhen, riderId: Joi.string().required(), riderName: Joi.string().required() }),
  isStale: orderStale,
  async execute(p, ctx) {
    const r = await assignRider(p.orderId, p.riderId, actorFor(ctx), suggestedBy(ctx));
    return { riderId: r.riderId, riderName: r.riderName };
  },
};

const cancelOrder: ActionDefinition<CancelOrderPayload> = {
  subject: 'order',
  label: 'Cancel an order (refunded as store credit)',
  autoAllowed: false, // money moves and a customer loses their order — always a human decision
  schema: Joi.object({ orderId: Joi.string().required(), when: orderWhen, reason: Joi.string().min(5).max(500).required() }),
  isStale: orderStale,
  async execute(p, ctx) {
    const c = await adminCancelOrder(p.orderId, actorFor(ctx), `${p.reason} (${suggestedBy(ctx).toLowerCase()})`);
    return { previousStatus: c.previousStatus, refundedAsCredit: c.wasPaid ? c.totalAmount : 0 };
  },
};

const followUp: ActionDefinition<FollowUpPayload> = {
  subject: 'order',
  label: 'Ask a person to follow up (call a rider or vendor)',
  autoAllowed: false, // there's nothing to automate — approving means "done"
  schema: Joi.object({
    orderId: Joi.string().required(), when: orderWhen, kind: Joi.string().valid('delivery', 'vendor').required(),
    contactName: Joi.string().required(), phone: Joi.string().allow(null).required(),
  }),
  isStale: orderStale,
  async execute() {
    return { acknowledged: true };
  },
};

// ─── Ticket actions (ticket triager) ─────────────────────────────────────────────

export interface TriageTicketPayload { ticketId: string; when: TicketCondition; category: TicketCategory; priority: TicketPriority }
export interface SendTicketReplyPayload { ticketId: string; when: TicketCondition; body: string }
export interface TicketCreditPayload { ticketId: string; when: TicketCondition; amount: number; reason: string }

const triageTicket: ActionDefinition<TriageTicketPayload> = {
  subject: 'ticket',
  label: 'Set a new ticket\'s category and priority',
  autoAllowed: true,
  schema: Joi.object({
    ticketId: Joi.string().required(), when: ticketWhen,
    category: Joi.string().valid(...Object.values(TicketCategory)).required(),
    priority: Joi.string().valid(...Object.values(TicketPriority)).required(),
  }),
  isStale: ticketStale,
  async execute(p, ctx) {
    const ticket = await prisma.ticket.findUniqueOrThrow({
      where: { id: p.ticketId },
      select: { number: true, subject: true, priority: true, category: true, createdAt: true, firstResponseAt: true },
    });
    await prisma.ticket.update({
      where: { id: p.ticketId },
      data: {
        category: p.category,
        priority: p.priority,
        ...(p.priority !== ticket.priority
          ? { slaDueAt: slaDueAt(p.priority, ticket.createdAt, ticket.firstResponseAt), slaBreachedAt: null }
          : {}),
      },
    });
    if (p.priority === 'URGENT' && ticket.priority !== 'URGENT') {
      void sendTelegramAlert(
        `🚨 <b>Ticket #${ticket.number} raised to urgent</b> by the ticket triager\n${escapeTelegramHtml(ticket.subject)}`,
      );
    }
    await prisma.auditLog.create({
      data: {
        userId: ctx.approver?.userId ?? null,
        actorType: ctx.approver ? OrderActorType.ADMIN : OrderActorType.AGENT,
        agentKey: ctx.agentKey,
        action: 'CRM_TICKET_UPDATED',
        entity: 'Ticket',
        entityId: p.ticketId,
        meta: { category: p.category, priority: p.priority, from: { category: ticket.category, priority: ticket.priority } },
      },
    });
    return { category: p.category, priority: p.priority, from: { category: ticket.category, priority: ticket.priority } };
  },
};

const sendTicketReply: ActionDefinition<SendTicketReplyPayload> = {
  subject: 'ticket',
  label: 'Send the drafted reply to the customer',
  autoAllowed: false, // customer-facing words go out under a person's name, after they've read them
  schema: Joi.object({ ticketId: Joi.string().required(), when: ticketWhen, body: Joi.string().min(1).max(4000).required() }),
  isStale: ticketStale,
  async execute(p, ctx) {
    const approver = requireApprover(ctx);
    const message = await sendStaffReply({ ticketId: p.ticketId, staffId: approver.userId, body: p.body });
    return { messageId: message.id };
  },
};

const ticketCredit: ActionDefinition<TicketCreditPayload> = {
  subject: 'ticket',
  label: 'Issue goodwill store credit from a ticket',
  autoAllowed: false, // money — always a human decision
  schema: Joi.object({
    ticketId: Joi.string().required(), when: ticketWhen,
    amount: Joi.number().integer().positive().max(MAX_TICKET_CREDIT).required(),
    reason: Joi.string().min(3).max(300).required(),
  }),
  isStale: ticketStale,
  async execute(p, ctx) {
    const approver = requireApprover(ctx);
    return issueTicketCredit({ ticketId: p.ticketId, staffId: approver.userId, amount: p.amount, reason: p.reason });
  },
};

export const AGENT_ACTIONS = {
  NOTIFY_RIDERS: notifyRiders,
  ASSIGN_RIDER: assignRiderAction,
  CANCEL_ORDER: cancelOrder,
  FOLLOW_UP: followUp,
  TRIAGE_TICKET: triageTicket,
  SEND_TICKET_REPLY: sendTicketReply,
  ISSUE_TICKET_CREDIT: ticketCredit,
} as const;

export type AgentActionType = keyof typeof AGENT_ACTIONS;

export const isAgentAction = (a: string): a is AgentActionType => a in AGENT_ACTIONS;
