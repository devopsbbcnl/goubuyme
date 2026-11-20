import { balanceOf, carryOver, daysInYear, earlyMinutes, entitlement, isWorkDay, lateMinutes, leaveDays, leaveEligibility, workedMinutes, ScheduleLike } from '../timeRules';

const sched: ScheduleLike = { startTime: '08:00', endTime: '17:00', breakMinutes: 60, graceMinutes: 15, workDays: [1, 2, 3, 4, 5] };

describe('leave day counting', () => {
  it('skips weekends', () => {
    expect(leaveDays({ start: '2026-12-04', end: '2026-12-08', holidays: [] })).toBe(3); // Fri, Mon, Tue
  });
  it('does not deduct a public holiday inside the request (AC-LEV-02)', () => {
    expect(leaveDays({ start: '2026-12-23', end: '2026-12-28', holidays: ['2026-12-25', '2026-12-26'] })).toBe(3); // Wed, Thu, Mon
  });
  it('counts half days at either end and a single half day', () => {
    expect(leaveDays({ start: '2026-12-07', end: '2026-12-09', startHalf: true, endHalf: true, holidays: [] })).toBe(2);
    expect(leaveDays({ start: '2026-12-07', end: '2026-12-07', startHalf: true, holidays: [] })).toBe(0.5);
  });
  it('counts calendar days for statutory leaves', () => {
    expect(leaveDays({ start: '2026-12-04', end: '2026-12-08', holidays: ['2026-12-07'], countsWeekends: true })).toBe(5);
  });
  it('splits a request across New Year', () => {
    const i = { start: '2026-12-29', end: '2027-01-04', holidays: [] as string[] };
    expect(daysInYear(i, 2026)).toBe(3);
    expect(daysInYear(i, 2027)).toBe(2);
  });
});

describe('entitlement and balance', () => {
  it('gives the full year upfront and pro-rates for a mid-year hire', () => {
    expect(entitlement({ annualDays: 24, accrual: 'UPFRONT', year: 2026, hire: '2020-01-01', asOf: '2026-03-01' })).toBe(24);
    expect(entitlement({ annualDays: 24, accrual: 'UPFRONT', year: 2026, hire: '2026-07-01', asOf: '2026-07-01' })).toBe(12);
  });
  it('accrues monthly up to the current month', () => {
    expect(entitlement({ annualDays: 24, accrual: 'MONTHLY', year: 2026, hire: '2020-01-01', asOf: '2026-03-15' })).toBe(6);
  });
  it('stops at exit and gives nothing before hire', () => {
    expect(entitlement({ annualDays: 24, accrual: 'UPFRONT', year: 2026, hire: '2020-01-01', exit: '2026-06-30', asOf: '2026-03-01' })).toBe(12);
    expect(entitlement({ annualDays: 24, accrual: 'UPFRONT', year: 2026, hire: '2027-02-01', asOf: '2026-03-01' })).toBe(0);
  });
  it('computes the available balance', () => {
    expect(balanceOf({ entitled: 20, carriedOver: 3, adjusted: -1, used: 12 })).toBe(10);
  });
  it('carries over up to the cap and forfeits the rest', () => {
    expect(carryOver(8, 5)).toEqual({ carried: 5, forfeited: 3 });
    expect(carryOver(2, 5)).toEqual({ carried: 2, forfeited: 0 });
    expect(carryOver(-1, 5)).toEqual({ carried: 0, forfeited: 0 });
  });
});

describe('leave eligibility', () => {
  it('blocks probation-only leave during probation', () => {
    expect(leaveEligibility({ afterProbationOnly: true, minTenureMonths: 0, hire: '2026-01-01', probationEnd: '2026-06-30', start: '2026-05-01', status: 'PROBATION' })).toMatch(/probation/);
    expect(leaveEligibility({ afterProbationOnly: true, minTenureMonths: 0, hire: '2025-01-01', probationEnd: null, start: '2026-05-01', status: 'ACTIVE' })).toBeNull();
  });
  it('enforces minimum tenure', () => {
    expect(leaveEligibility({ afterProbationOnly: false, minTenureMonths: 6, hire: '2026-03-01', start: '2026-05-01', status: 'ACTIVE' })).toMatch(/6 months/);
  });
});

describe('attendance', () => {
  it('is not late at 08:14 but late at 08:16 with a 15 minute grace (AC-ATT-01)', () => {
    expect(lateMinutes(8 * 60 + 14, sched)).toBe(0);
    expect(lateMinutes(8 * 60 + 15, sched)).toBe(0);
    expect(lateMinutes(8 * 60 + 16, sched)).toBe(16);
  });
  it('flags early departure beyond the grace period', () => {
    expect(earlyMinutes(16 * 60 + 50, sched)).toBe(0);
    expect(earlyMinutes(16 * 60, sched)).toBe(60);
  });
  it('works out hours worked net of the break', () => {
    expect(workedMinutes(new Date('2026-12-01T07:00:00Z'), new Date('2026-12-01T16:00:00Z'), 60)).toBe(480);
  });
  it('knows work days and holidays', () => {
    expect(isWorkDay('2026-12-07', sched, [])).toBe(true);
    expect(isWorkDay('2026-12-06', sched, [])).toBe(false);
    expect(isWorkDay('2026-12-25', sched, ['2026-12-25'])).toBe(false);
  });
});
