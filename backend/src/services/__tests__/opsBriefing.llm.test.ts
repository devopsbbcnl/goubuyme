// The Claude call is mocked: these tests pin the request shape and how the reply is trusted,
// without spending API credits.
const mockCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error { status = 400; }
  const Anthropic = jest.fn().mockImplementation(() => ({ beta: { messages: { create: mockCreate } } }));
  Object.assign(Anthropic, { APIError });
  return { __esModule: true, default: Anthropic };
});
jest.mock('../../config/db', () => ({ __esModule: true, default: {} }));
jest.mock('../telegram.service', () => ({ sendTelegramAlert: jest.fn() }));

import { summarizeWithLLM } from '../opsBriefing.service';
import { OpsFlag, OpsMetrics } from '../opsBriefingFormat';

const metrics = { day: '2026-10-08', orders: { placed: 3 } } as unknown as OpsMetrics;
const redFlag: OpsFlag = { level: 'RED', code: 'READY_NO_RIDER', message: '1 order(s) ready with no rider: #GBM-1 (20m)' };

const reply = (json: unknown, stop_reason = 'end_turn') =>
  mockCreate.mockResolvedValueOnce({ stop_reason, content: [{ type: 'text', text: JSON.stringify(json) }] });

beforeEach(() => mockCreate.mockReset());

it('asks for structured JSON with refusal fallbacks enabled', async () => {
  reply({ status: 'RED', headline: 'h', concerns: [], actions: [], highlights: [] });
  await summarizeWithLLM(metrics, [redFlag]);
  const req = mockCreate.mock.calls[0][0];
  expect(req.model).toBe('claude-opus-5-5');
  expect(req.betas).toEqual(['server-side-fallback-2026-07-01']);
  expect(req.fallbacks).toBe('default');
  expect(req.output_config.format.type).toBe('json_schema');
  expect(req.thinking).toBeUndefined(); // adaptive by default on this model
  expect(req.messages[0].content).toContain('#GBM-1');
});

it('never lets the model rate the day better than the rule-based flags', async () => {
  reply({ status: 'GREEN', headline: 'All good', concerns: [], actions: [], highlights: ['Nice'] });
  const s = await summarizeWithLLM(metrics, [redFlag]);
  expect(s?.status).toBe('RED');
});

it('caps each list at four non-empty items', async () => {
  reply({ status: 'AMBER', headline: 'h', concerns: ['a', '', 'b', 'c', 'd', 'e'], actions: [42, 'x'], highlights: [] });
  const s = await summarizeWithLLM(metrics, []);
  expect(s?.concerns).toEqual(['a', 'b', 'c', 'd']);
  expect(s?.actions).toEqual(['x']);
});

it('falls back (returns null) on refusal, truncation or API errors', async () => {
  reply({}, 'refusal');
  expect(await summarizeWithLLM(metrics, [])).toBeNull();
  reply({}, 'max_tokens');
  expect(await summarizeWithLLM(metrics, [])).toBeNull();
  mockCreate.mockRejectedValueOnce(new Error('organization_on_hold'));
  expect(await summarizeWithLLM(metrics, [])).toBeNull();
});
