// Segments must reject anything outside the whitelist, compile to the intended Prisma filter,
// and campaigns/automations must respect consent, content limits and cooldowns.

jest.mock('../../config/db', () => ({ __esModule: true, default: {} }));
jest.mock('../notification.service', () => ({ notifyUser: jest.fn() }));
jest.mock('../email.service', () => ({ sendEmail: jest.fn(), emailLayout: (s: string) => s }));
jest.mock('../sms.service', () => ({ sendSms: jest.fn() }));

import { AggregateLookup, SegmentRuleError, compileSegment, validateRules } from '../crm/segment.service';
import { CampaignError, marketableWhere, personalize, validateContent } from '../crm/campaign.service';
import { unsubscribeToken, verifyUnsubscribeToken } from '../crm/unsubscribe.service';
import { automationAudienceWhere, triggerWhere } from '../crm/automation.service';

const NOW = new Date('2026-09-17T09:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

const lookup: AggregateLookup = {
  profileIdsByOrderCount: jest.fn(async (_role, cmp) => (cmp === 'gte' ? ['c1', 'c2'] : ['c9'])),
  customerIdsBySpend: jest.fn(async () => ['c3']),
};

describe('validateRules', () => {
  it('normalizes valid rules', () => {
    expect(validateRules('CUSTOMER', {
      match: 'all',
      conditions: [
        { field: 'lastOrderDays', op: 'olderThanDays', value: '30' },
        { field: 'city', op: 'in', value: [' Port Harcourt ', 'Port Harcourt', ''] },
      ],
    })).toEqual({
      match: 'all',
      conditions: [
        { field: 'lastOrderDays', op: 'olderThanDays', value: 30 },
        { field: 'city', op: 'in', value: ['Port Harcourt'] },
      ],
    });
  });

  it.each([
    [{ match: 'all', conditions: [{ field: 'password', op: 'is', value: true }] }, 'unknown field'],
    [{ match: 'all', conditions: [{ field: 'vendorTier', op: 'is', value: 'TIER_1' }] }, "doesn't apply"],
    [{ match: 'all', conditions: [{ field: 'signupDays', op: 'gte', value: 3 }] }, 'invalid operator'],
    [{ match: 'all', conditions: [{ field: 'signupDays', op: 'withinDays', value: -1 }] }, 'needs a number'],
    [{ match: 'all', conditions: [{ field: 'stage', op: 'in', value: ['VIP'] }] }, 'invalid value'],
    [{ match: 'some', conditions: [] }, 'Match must be'],
  ])('rejects %j', (rules, message) => {
    expect(() => validateRules('CUSTOMER', rules)).toThrow(SegmentRuleError);
    expect(() => validateRules('CUSTOMER', rules)).toThrow(message);
  });
});

describe('compileSegment', () => {
  it('always scopes to live, active accounts of the role', async () => {
    expect(await compileSegment('RIDER', { match: 'all', conditions: [] }, lookup, NOW))
      .toEqual({ role: 'RIDER', deletedAt: null, isActive: true });
  });

  it('compiles order-count thresholds via id lookups, including "at most" as an exclusion', async () => {
    const where = await compileSegment('CUSTOMER', {
      match: 'any',
      conditions: [
        { field: 'orderCount', op: 'gte', value: 3 },
        { field: 'orderCount', op: 'lte', value: 1 },
        { field: 'signupDays', op: 'withinDays', value: 7 },
      ],
    }, lookup, NOW);
    expect(where).toEqual({
      AND: [
        { role: 'CUSTOMER', deletedAt: null, isActive: true },
        {
          OR: [
            { customer: { id: { in: ['c1', 'c2'] } } },
            { customer: { id: { notIn: ['c9'] } } },
            { createdAt: { gte: daysAgo(7) } },
          ],
        },
      ],
    });
    expect(lookup.profileIdsByOrderCount).toHaveBeenCalledWith('CUSTOMER', 'gt', 1);
  });

  it('treats "lapsed" as ordered before but not recently', async () => {
    const where = await compileSegment('VENDOR', {
      match: 'all', conditions: [{ field: 'lastOrderDays', op: 'olderThanDays', value: 14 }],
    }, lookup, NOW);
    expect(where).toEqual({
      AND: [
        { role: 'VENDOR', deletedAt: null, isActive: true },
        { AND: [{ AND: [
          { vendor: { orders: { some: { status: { not: 'CANCELLED' } } } } },
          { vendor: { orders: { none: { status: { not: 'CANCELLED' }, createdAt: { gte: daysAgo(14) } } } } },
        ] }] },
      ],
    });
  });
});

describe('campaign content', () => {
  const base = { channels: ['PUSH'], title: 'Hi {{name}}', body: 'Free delivery today' };

  it('accepts valid content and personalizes by first name', () => {
    expect(validateContent(base).channels).toEqual(['PUSH']);
    expect(personalize('Hi {{ name }}!', 'Ada Obi')).toBe('Hi Ada!');
    expect(personalize('Hi {{name}}', '')).toBe('Hi there');
  });

  it('enforces channels, SMS length and https links', () => {
    expect(() => validateContent({ ...base, channels: ['WHATSAPP'] })).toThrow(CampaignError);
    expect(() => validateContent({ ...base, channels: ['SMS'], body: 'x'.repeat(321) })).toThrow('SMS messages');
    expect(() => validateContent({ ...base, ctaUrl: 'javascript:alert(1)' })).toThrow('https://');
  });

  it('excludes opted-out users and anyone messaged inside the frequency cap', () => {
    expect(marketableWhere(NOW)).toEqual({
      marketingOptIn: true,
      campaignRecipients: { none: { status: 'SENT', sentAt: { gte: new Date(NOW.getTime() - 24 * 3_600_000) } } },
    });
  });
});

describe('unsubscribe tokens', () => {
  beforeAll(() => { process.env.JWT_ACCESS_SECRET = 'test-secret'; });

  it('round-trips and rejects tampering', () => {
    const token = unsubscribeToken('user-123');
    expect(verifyUnsubscribeToken(token)).toBe('user-123');
    const forged = `${Buffer.from('user-999').toString('base64url')}.${token.split('.')[1]}`;
    expect(verifyUnsubscribeToken(forged)).toBeNull();
    expect(verifyUnsubscribeToken('garbage')).toBeNull();
  });
});

describe('automations', () => {
  it('first-order nudge targets older sign-ups with no live orders', () => {
    expect(triggerWhere('FIRST_ORDER_NUDGE', 3, NOW)).toEqual({
      role: 'CUSTOMER', deletedAt: null, isActive: true,
      createdAt: { lt: daysAgo(3) },
      customer: { orders: { none: { status: { not: 'CANCELLED' } } } },
    });
  });

  it('skips users this automation already messaged within the cooldown', () => {
    const where = automationAudienceWhere({ id: 'auto-1', trigger: 'WIN_BACK', days: 30, cooldownDays: 14 }, NOW);
    expect((where.AND as unknown[])[2]).toEqual({
      campaignRecipients: { none: { campaign: { automationId: 'auto-1' }, createdAt: { gte: daysAgo(14) } } },
    });
  });
});
