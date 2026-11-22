import { retentionWindows, cutoff } from '../retention.service';

describe('retentionWindows', () => {
  it('uses the documented defaults', () => {
    expect(retentionWindows({})).toEqual({
      errorLogDays: 90, chatDays: 90, notificationDays: 180, rejectedKycDays: 30, orderAddressDays: 0,
    });
  });
  it('accepts overrides', () => {
    const w = retentionWindows({ ERROR_LOG_RETENTION_DAYS: '120', ORDER_ADDRESS_RETENTION_DAYS: '365' } as NodeJS.ProcessEnv);
    expect(w.errorLogDays).toBe(120);
    expect(w.orderAddressDays).toBe(365);
  });
  it('ignores values below the safety floor or not numbers', () => {
    const w = retentionWindows({ ERROR_LOG_RETENTION_DAYS: '1', CHAT_RETENTION_DAYS: 'abc', REJECTED_KYC_RETENTION_DAYS: '0', ORDER_ADDRESS_RETENTION_DAYS: '30' } as NodeJS.ProcessEnv);
    expect(w.errorLogDays).toBe(90);
    expect(w.chatDays).toBe(90);
    expect(w.rejectedKycDays).toBe(30);
    expect(w.orderAddressDays).toBe(0);
  });
});

describe('cutoff', () => {
  it('goes back the stated number of days', () => {
    expect(cutoff(new Date('2026-11-22T00:00:00Z'), 30).toISOString()).toBe('2026-10-23T00:00:00.000Z');
  });
});
