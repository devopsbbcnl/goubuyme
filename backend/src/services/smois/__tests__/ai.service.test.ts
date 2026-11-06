// The Claude call is mocked: these tests pin the rules around it (switch, limit, failure handling, number
// checking, request shape) without spending API credits.
const mockCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () => {
  const Anthropic = jest.fn().mockImplementation(() => ({ beta: { messages: { create: mockCreate } } }));
  return { __esModule: true, default: Anthropic };
});

const settings = { aiEnabled: true, aiDailyLimit: 3 };
const db = {
  smoisSettings: { upsert: jest.fn(async (_a?: unknown) => settings) },
  smoisAiRequest: { count: jest.fn(async (_a?: unknown) => 0), create: jest.fn(async (_a?: unknown) => ({})) },
};
jest.mock('../../../config/db', () => ({ __esModule: true, default: db }));
jest.mock('../../email.service', () => ({ sendSmoisAlertEmail: jest.fn() }));
jest.mock('../../notification.service', () => ({ notifyUser: jest.fn() }));
jest.mock('../../../utils/logger', () => ({ __esModule: true, default: { warn: jest.fn(), info: jest.fn(), error: jest.fn() } }));

import { AiProvider, AiRefused, claudeProvider, resetAiProvider, runAi, setAiProvider, aiStatus } from '../ai.service';
import { suggestSentiment } from '../aiFeatures';

const schema = { type: 'object' };
const opts = (over: object = {}) => ({ userId: 'u1', feature: 'ASK' as const, system: 's', user: 'u', schema, ...over });
const provider = (impl: AiProvider['call'], available = true): AiProvider => ({ name: 't', available: () => available, call: jest.fn(impl) });
const logged = () => db.smoisAiRequest.create.mock.calls.map((c) => (c[0] as { data: { status: string } }).data.status);

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(settings, { aiEnabled: true, aiDailyLimit: 3 });
  db.smoisAiRequest.count.mockResolvedValue(0);
  process.env.ANTHROPIC_API_KEY = 'test-key';
  delete process.env.SMOIS_AI_PROVIDER;
  resetAiProvider();
});

describe('runAi gates', () => {
  it('does nothing while AI is switched off, and says how to turn it on', async () => {
    settings.aiEnabled = false;
    const p = provider(async () => ({ json: {}, model: 'm' })); setAiProvider(p);
    const r = await runAi(opts());
    expect(r).toMatchObject({ ok: false, code: 'DISABLED' });
    expect(p.call).not.toHaveBeenCalled();
    expect(logged()).toEqual(['DISABLED']);
    if (!r.ok) expect(r.message).toMatch(/super admin/);
  });

  it('reports unavailable when no connection to the AI service exists', async () => {
    setAiProvider(provider(async () => ({ json: {}, model: 'm' }), false));
    expect(await runAi(opts())).toMatchObject({ ok: false, code: 'UNAVAILABLE' });
    expect(logged()).toEqual(['UNAVAILABLE']);
  });

  it('stops at the daily limit without calling the model', async () => {
    db.smoisAiRequest.count.mockResolvedValue(3);
    const p = provider(async () => ({ json: {}, model: 'm' })); setAiProvider(p);
    const r = await runAi(opts());
    expect(r).toMatchObject({ ok: false, code: 'LIMIT' });
    expect(p.call).not.toHaveBeenCalled();
  });

  it('only counts requests that reached the model against the limit', async () => {
    await aiStatus('u1');
    const where = (db.smoisAiRequest.count.mock.calls[0][0] as { where: { status: unknown } }).where;
    expect(where.status).toEqual({ in: ['OK', 'ERROR'] });
  });
});

describe('runAi results', () => {
  it('returns a draft marked for review, and checks figures against the facts', async () => {
    setAiProvider(provider(async () => ({ json: { answer: 'Followers are 4,700 and growth was 77.7%.' }, model: 'm1' })));
    const r = await runAi<{ answer: string }>(opts({ facts: { followers: 4700 }, textOf: (d: { answer: string }) => d.answer }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r).toMatchObject({ aiGenerated: true, reviewRequired: true, model: 'm1' });
      expect(r.verification.unverified).toEqual(['77.7%']);
      expect(r.verification.checked).toBe(2);
    }
    expect((db.smoisAiRequest.create.mock.calls[0][0] as { data: { unverifiedCount: number } }).data.unverifiedCount).toBe(1);
  });

  it('never stores the question or the answer', async () => {
    setAiProvider(provider(async () => ({ json: { answer: 'secret answer 123' }, model: 'm' })));
    await runAi(opts({ user: 'secret question about Ada', facts: {}, textOf: (d: { answer: string }) => d.answer }));
    const row = JSON.stringify(db.smoisAiRequest.create.mock.calls[0][0]);
    expect(row).not.toMatch(/secret/);
  });

  it('turns a provider failure into a calm message and never throws', async () => {
    setAiProvider(provider(async () => { throw new Error('socket hang up: key sk-abc123'); }));
    const r = await runAi(opts());
    expect(r).toMatchObject({ ok: false, code: 'ERROR' });
    if (!r.ok) expect(r.message).not.toMatch(/sk-abc123|socket/);
    expect(logged()).toEqual(['ERROR']);
  });

  it('passes a model refusal through in plain words', async () => {
    setAiProvider(provider(async () => { throw new AiRefused('The model declined to answer that.'); }));
    const r = await runAi(opts());
    if (!r.ok) expect(r.message).toBe('The model declined to answer that.');
  });
});

describe('claudeProvider request', () => {
  const reply = (over: object = {}) => mockCreate.mockResolvedValueOnce({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ ok: 1 }) }], ...over });

  it('asks for structured output with fallbacks, and uses the configured model', async () => {
    reply();
    const out = await claudeProvider.call({ feature: 'ASK', system: 'sys', user: 'usr', schema: { type: 'object' } });
    const req = mockCreate.mock.calls[0][0];
    expect(req.model).toBe('claude-sonnet-5-5');
    expect(req.betas).toEqual(['server-side-fallback-2026-07-01']);
    expect(req.output_config.format).toEqual({ type: 'json_schema', schema: { type: 'object' } });
    expect(req.system).toBe('sys');
    expect(req.messages).toEqual([{ role: 'user', content: 'usr' }]);
    expect(out.json).toEqual({ ok: 1 });
  });

  it('treats a refusal or a cut-off answer as a failure, not as data', async () => {
    reply({ stop_reason: 'refusal' });
    await expect(claudeProvider.call({ feature: 'ASK', system: 's', user: 'u', schema })).rejects.toBeInstanceOf(AiRefused);
    reply({ stop_reason: 'max_tokens' });
    await expect(claudeProvider.call({ feature: 'ASK', system: 's', user: 'u', schema })).rejects.toThrow(/too long/);
    mockCreate.mockResolvedValueOnce({ stop_reason: 'end_turn', content: [] });
    await expect(claudeProvider.call({ feature: 'ASK', system: 's', user: 'u', schema })).rejects.toThrow(/nothing/);
  });

  it('is unavailable without an API key', () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(claudeProvider.available()).toBe(false);
  });
});

describe('sentiment suggestion', () => {
  it('will not offer a label the model was unsure about', async () => {
    setAiProvider(provider(async () => ({ json: { sentiment: 'NEGATIVE', confidence: 'LOW', reason: 'Maybe sarcasm' }, model: 'm' })));
    const r = await suggestSentiment('u1', 'oh great, another late delivery');
    expect(r.ok && r.data.sentiment).toBe('UNCERTAIN');
  });
  it('keeps a confident label', async () => {
    setAiProvider(provider(async () => ({ json: { sentiment: 'NEGATIVE', confidence: 'HIGH', reason: 'Complaint' }, model: 'm' })));
    const r = await suggestSentiment('u1', 'Terrible service');
    expect(r.ok && r.data.sentiment).toBe('NEGATIVE');
  });
  it('only sends the mention text, trimmed', async () => {
    const p = provider(async () => ({ json: { sentiment: 'NEUTRAL', confidence: 'HIGH', reason: 'x' }, model: 'm' })); setAiProvider(p);
    await suggestSentiment('u1', '  hello '.padEnd(3000, 'x'));
    const sent = (p.call as jest.Mock).mock.calls[0][0] as { user: string; feature: string };
    expect(sent.feature).toBe('SENTIMENT');
    expect(sent.user.length).toBeLessThan(1100);
  });
});
