const mockCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error { status = 400; }
  const Anthropic = jest.fn().mockImplementation(() => ({ beta: { messages: { create: mockCreate } } }));
  Object.assign(Anthropic, { APIError });
  return { __esModule: true, default: Anthropic };
});
jest.mock('../../config/db', () => ({ __esModule: true, default: {} }));
jest.mock('../telegram.service', () => ({ sendTelegramAlert: jest.fn(), escapeTelegramHtml: (s: string) => s }));
jest.mock('../notification.service', () => ({ notifyUser: jest.fn() }));
jest.mock('../email.service', () => ({ sendEmail: jest.fn(), emailLayout: (s: string) => s }));

import { TicketForTriage, TriageResult, buildTriageContext, planTriage, triageWithLLM } from '../agents/ticketTriager';
import { AGENT_ACTIONS, isTicketStale } from '../agents/agentActions';

const now = new Date('2026-10-09T12:00:00Z');
const minsAgo = (m: number) => new Date(now.getTime() - m * 60_000);

const ticket = {
  id: 't1', number: 42, requesterId: 'u1', subject: 'Missing item · Order #GBM-1', category: 'ORDER_ISSUE', priority: 'NORMAL',
  channel: 'APP', createdAt: minsAgo(3), firstResponseAt: null,
  messages: [
    { body: 'My suya never came. Call me on 08031234567 or ada@example.com', createdAt: minsAgo(3), authorId: 'u1' },
  ],
  requester: { id: 'u1', name: 'Adaeze Okafor', role: 'CUSTOMER', createdAt: minsAgo(60 * 24 * 40) },
  order: {
    id: 'o1', orderNumber: 'GBM-1', status: 'DELIVERED', paymentStatus: 'PAID', paymentMethod: 'CARD', subtotal: 5000,
    deliveryFee: 800, totalAmount: 5800, creditIssued: 0, cancelReason: null, createdAt: minsAgo(90), statusChangedAt: minsAgo(20),
    estimatedTime: 40,
    items: [{ name: 'Suya', quantity: 1, price: 2500 }, { name: 'Jollof', quantity: 1, price: 2500 }],
    vendor: { businessName: 'Mama Put' },
    rider: { user: { name: 'Tunde Bakare' } },
    events: [{ type: 'STATUS_CHANGED', fromStatus: 'PICKED_UP', toStatus: 'DELIVERED', actorType: 'RIDER', createdAt: minsAgo(20) }],
  },
} as unknown as TicketForTriage;

const result = (over: Partial<TriageResult> = {}): TriageResult => ({
  category: 'MISSING_ITEM', priority: 'HIGH', summary: 'Customer says the suya was missing from a delivered order.',
  facts: ['Delivered 70 min after ordering'], flags: [], suggestedReply: 'Hi Adaeze, sorry your suya was missing… GoBuyMe Support',
  credit: { recommended: true, amount: 2500, reason: 'Suya missing from delivered order' }, ...over,
});

const plan = (over: Partial<Parameters<typeof planTriage>[0]> = {}) => planTriage({
  ticket: { id: 't1', number: 42, category: 'ORDER_ISSUE', priority: 'NORMAL', firstResponseAt: null },
  result: result(), maxCredit: 2000, creditAlreadyGiven: false, runKey: 'r1', ...over,
});

describe('buildTriageContext (what the model sees)', () => {
  const ctx = buildTriageContext(ticket, { orderCredits: [], recentTickets: [], now });
  const json = JSON.stringify(ctx);

  it('uses first names only and never includes contact fields', () => {
    expect(ctx.requester.firstName).toBe('Adaeze');
    expect(ctx.order?.riderFirstName).toBe('Tunde');
    expect(json).not.toContain('Okafor');
    expect(json).not.toContain('Bakare');
    expect(json).not.toMatch(/deliveryAddress|"phone"|"email"/);
  });

  it('includes the facts support would check', () => {
    expect(ctx.order).toMatchObject({ status: 'DELIVERED', estimatedDeliveryMinutes: 40, payment: { status: 'PAID' } });
    expect(ctx.order?.timeline[0]).toMatchObject({ to: 'DELIVERED', minutesAfterPlaced: 70 });
    expect(ctx.ticket.messages[0].from).toBe('requester');
  });
});

describe('planTriage guard rails', () => {
  it('proposes triage, a draft reply and capped credit', () => {
    const out = plan();
    expect(out.map((p) => p.action)).toEqual(['TRIAGE_TICKET', 'SEND_TICKET_REPLY', 'ISSUE_TICKET_CREDIT']);
    expect(out[0].payload).toMatchObject({ category: 'MISSING_ITEM', priority: 'HIGH', when: { unchangedCategory: 'ORDER_ISSUE', unchangedPriority: 'NORMAL' } });
    expect(out[2].payload).toMatchObject({ amount: 2000 }); // capped by the agent setting
    for (const p of out) expect((AGENT_ACTIONS[p.action].schema as import('joi').ObjectSchema).validate(p.payload).error).toBeUndefined();
  });

  it('never lowers a priority', () => {
    const out = plan({ ticket: { id: 't1', number: 42, category: 'MISSING_ITEM', priority: 'URGENT', firstResponseAt: null }, result: result({ priority: 'LOW' }) });
    expect(out.find((p) => p.action === 'TRIAGE_TICKET')).toBeUndefined();
  });

  it('skips the draft once staff have replied, and credit once compensation was given', () => {
    const out = plan({ ticket: { id: 't1', number: 42, category: 'ORDER_ISSUE', priority: 'NORMAL', firstResponseAt: minsAgo(1) }, creditAlreadyGiven: true });
    expect(out.map((p) => p.action)).toEqual(['TRIAGE_TICKET']);
  });

  it('does not propose credit the model did not recommend', () => {
    expect(plan({ result: result({ credit: { recommended: false, amount: 0, reason: '' } }) }).map((p) => p.action)).not.toContain('ISSUE_TICKET_CREDIT');
  });
});

describe('ticket staleness', () => {
  const snap = { status: 'OPEN' as const, firstResponseAt: null, category: 'ORDER_ISSUE' as const, priority: 'NORMAL' as const };
  it('drops a draft reply once staff reply, and a triage once staff re-categorise', () => {
    expect(isTicketStale({ ticketStatuses: ['OPEN'], noStaffReply: true }, { ...snap, firstResponseAt: now })).toBe(true);
    expect(isTicketStale({ ticketStatuses: ['OPEN'], unchangedCategory: 'ORDER_ISSUE' }, { ...snap, category: 'REFUND' })).toBe(true);
    expect(isTicketStale({ ticketStatuses: ['OPEN'], unchangedCategory: 'ORDER_ISSUE' }, snap)).toBe(false);
  });
});

describe('ticket actions safety', () => {
  it('replies and credit can never be automatic', () => {
    expect(AGENT_ACTIONS.SEND_TICKET_REPLY.autoAllowed).toBe(false);
    expect(AGENT_ACTIONS.ISSUE_TICKET_CREDIT.autoAllowed).toBe(false);
  });
});

describe('triageWithLLM', () => {
  beforeEach(() => mockCreate.mockReset());

  it('sends structured-output request with fallbacks and parses the result', async () => {
    mockCreate.mockResolvedValueOnce({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(result()) }] });
    const ctx = buildTriageContext(ticket, { orderCredits: [], recentTickets: [], now });
    const r = await triageWithLLM(ctx, 2000);
    expect(r.category).toBe('MISSING_ITEM');
    const req = mockCreate.mock.calls[0][0];
    expect(req).toMatchObject({ model: 'claude-opus-5-5', fallbacks: 'default', betas: ['server-side-fallback-2026-07-01'] });
    expect(req.output_config).toMatchObject({ effort: 'low', format: { type: 'json_schema' } });
    expect(req.messages[0].content).toContain('₦2,000');
  });

  it('throws on refusal so the ticket is marked failed rather than half-triaged', async () => {
    mockCreate.mockResolvedValueOnce({ stop_reason: 'refusal', content: [] });
    await expect(triageWithLLM(buildTriageContext(ticket, { orderCredits: [], recentTickets: [], now }), 2000)).rejects.toThrow(/declined/);
  });
});
