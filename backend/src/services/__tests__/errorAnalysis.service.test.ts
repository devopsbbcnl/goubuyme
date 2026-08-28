import { ErrorCategory, ErrorSeverity } from '@prisma/client';

// Keep the unit under test hermetic: it pulls in Prisma, ioredis and the
// Anthropic SDK at import time, none of which classifyByRules/isEscalatable touch.
jest.mock('../../config/db', () => ({ __esModule: true, default: {} }));
jest.mock('../telegram.service', () => ({
  sendTelegramAlert: jest.fn(),
  escapeTelegramHtml: (s: string) => s,
}));

import { classifyByRules, isEscalatable } from '../errorAnalysis.service';

// Minimal ErrorLog row — only the fields classifyByRules reads.
const row = (over: Record<string, unknown> = {}) =>
  ({
    id: 'test',
    platform: 'BACKEND',
    source: 'rate-limit',
    message: 'Too many requests. Please try again later.',
    stack: null,
    context: null,
    url: null,
    method: 'GET',
    role: null,
    ...over,
  }) as any;

describe('classifyByRules — scan-noise suppression (rule 0)', () => {
  it('classifies a rate-limit trip on an unserved path as ATTACK / LOW', () => {
    const cls = classifyByRules(
      row({ url: '/.env.production', source: 'rate-limit' }),
    );
    expect(cls).toMatchObject({
      category: ErrorCategory.ATTACK,
      severity: ErrorSeverity.LOW,
      analyzedBy: 'rules',
    });
  });

  it('classifies an encoded path-traversal probe as ATTACK / LOW, not CRITICAL', () => {
    const cls = classifyByRules(
      row({ url: '/static/%2e%2e%2f%2e%2e%2f.env', source: 'express', message: 'Not Found' }),
    );
    expect(cls?.category).toBe(ErrorCategory.ATTACK);
    expect(cls?.severity).toBe(ErrorSeverity.LOW);
  });

  it('still flags an injection payload against a REAL endpoint (rule 1 wins)', () => {
    const cls = classifyByRules(
      row({
        platform: 'BACKEND',
        source: 'express',
        url: "/api/v1/vendors?q=' OR 1=1--",
        message: 'invalid input syntax',
      }),
    );
    expect(cls?.category).toBe(ErrorCategory.ATTACK);
    expect([ErrorSeverity.HIGH, ErrorSeverity.CRITICAL]).toContain(cls?.severity);
  });

  it('still flags a traversal probe that reaches a real /api path as HIGH+', () => {
    const cls = classifyByRules(
      row({ source: 'express', url: '/api/v1/../../etc/passwd', message: 'Not Found' }),
    );
    expect(cls?.category).toBe(ErrorCategory.ATTACK);
    expect(cls?.severity).not.toBe(ErrorSeverity.LOW);
  });

  it('does NOT suppress a client-reported (MOBILE) error with a screen-name url', () => {
    const cls = classifyByRules(
      row({
        platform: 'MOBILE',
        source: 'client',
        url: '/checkout',
        message: '"email" is required',
      }),
    );
    expect(cls?.category).not.toBe(ErrorCategory.ATTACK);
  });

  it('leaves a normal rate-limit trip on a served auth route as HIGH (rule 1a)', () => {
    const cls = classifyByRules(
      row({ url: '/api/v1/auth/login', source: 'rate-limit' }),
    );
    expect(cls?.category).toBe(ErrorCategory.ATTACK);
    expect(cls?.severity).toBe(ErrorSeverity.HIGH);
  });
});

describe('isEscalatable', () => {
  it('does not page on a LOW-severity ATTACK (scan noise)', () => {
    expect(isEscalatable({ category: ErrorCategory.ATTACK, severity: ErrorSeverity.LOW })).toBe(false);
  });

  it('pages on a HIGH/CRITICAL ATTACK', () => {
    expect(isEscalatable({ category: ErrorCategory.ATTACK, severity: ErrorSeverity.HIGH })).toBe(true);
    expect(isEscalatable({ category: ErrorCategory.ATTACK, severity: ErrorSeverity.CRITICAL })).toBe(true);
  });

  it('pages on any HIGH/CRITICAL regardless of category', () => {
    expect(isEscalatable({ category: ErrorCategory.SYSTEM_RISK, severity: ErrorSeverity.CRITICAL })).toBe(true);
    expect(isEscalatable({ category: ErrorCategory.SERVER_ERROR, severity: ErrorSeverity.HIGH })).toBe(true);
  });

  it('does not page on a LOW/MEDIUM non-attack', () => {
    expect(isEscalatable({ category: ErrorCategory.USER_ERROR, severity: ErrorSeverity.LOW })).toBe(false);
    expect(isEscalatable({ category: ErrorCategory.SERVER_ERROR, severity: ErrorSeverity.MEDIUM })).toBe(false);
  });
});
