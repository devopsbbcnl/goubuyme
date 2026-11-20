// Pure rules for leave and attendance (PRD 10.10 and 10.11): working-day counting, entitlement and accrual,
// carry-over, eligibility and clock-in classification. No database here, so they can be unit-tested.
import { addDays, dateOnly, daysBetween, isWeekend } from './rules';

// ── Leave ────────────────────────────────────────────────────────────────────

export interface DayCountInput {
  start: string; end: string; startHalf?: boolean; endHalf?: boolean;
  holidays: string[];
  /** Statutory leaves counted in calendar days (weekends and holidays included). */
  countsWeekends?: boolean;
}

/** Days a leave request takes from the balance. Weekends and public holidays are skipped unless the type counts calendar days. */
export const leaveDays = (i: DayCountInput): number => {
  if (i.end < i.start) return 0;
  let total = 0;
  for (let d = i.start; d <= i.end; d = addDays(d, 1)) {
    const counted = i.countsWeekends ? true : !isWeekend(d) && !i.holidays.includes(d);
    if (!counted) continue;
    let v = 1;
    if (i.start === i.end) v = i.startHalf || i.endHalf ? 0.5 : 1;
    else if (d === i.start && i.startHalf) v = 0.5;
    else if (d === i.end && i.endHalf) v = 0.5;
    total += v;
  }
  return total;
};

const round05 = (n: number) => Math.round(n * 2) / 2;

export interface EntitlementInput {
  annualDays: number; accrual: 'UPFRONT' | 'MONTHLY'; year: number;
  hire: string; exit?: string | null; asOf: string;
}

/** Whole months (counting a month once any of it is worked) between two dates inside one year. */
const monthsWithin = (from: string, to: string): number => {
  if (to < from) return 0;
  const m1 = +from.slice(5, 7); const m2 = +to.slice(5, 7);
  return Math.max(0, m2 - m1 + 1);
};

/**
 * Days earned for a year. Upfront gives the whole year, pro-rated for the months employed that year (hire and exit);
 * monthly accrues a twelfth for each month reached so far.
 */
export const entitlement = (i: EntitlementInput): number => {
  const yStart = `${i.year}-01-01`; const yEnd = `${i.year}-12-31`;
  if (i.hire > yEnd || (i.exit && i.exit < yStart)) return 0;
  const from = i.hire > yStart ? i.hire : yStart;
  const to = i.exit && i.exit < yEnd ? i.exit : yEnd;
  if (i.accrual === 'UPFRONT') return round05((i.annualDays * monthsWithin(from, to)) / 12);
  const accruedTo = i.asOf < to ? i.asOf : to;
  return round05((i.annualDays * monthsWithin(from, accruedTo)) / 12);
};

export interface Eligibility { afterProbationOnly: boolean; minTenureMonths: number; hire: string; probationEnd?: string | null; start: string; status: string }

/** Why a person cannot take this leave yet, or null when they can. */
export const leaveEligibility = (e: Eligibility): string | null => {
  if (e.afterProbationOnly && (e.status === 'PROBATION' || (e.probationEnd && e.start <= e.probationEnd))) return 'This leave opens once probation is complete.';
  if (e.minTenureMonths > 0) {
    const months = daysBetween(e.hire, e.start) / 30.4375;
    if (months < e.minTenureMonths) return `This leave needs at least ${e.minTenureMonths} months of service.`;
  }
  return null;
};

export interface BalanceLike { entitled: number; carriedOver: number; adjusted: number; used: number }
export const balanceOf = (b: BalanceLike): number => b.entitled + b.carriedOver + b.adjusted - b.used;

/** Year-end: up to the cap carries over, the rest is forfeited. */
export const carryOver = (remaining: number, cap: number): { carried: number; forfeited: number } => {
  const left = Math.max(0, remaining);
  const carried = Math.min(left, Math.max(0, cap));
  return { carried, forfeited: left - carried };
};

/** Days of a request that fall in a given calendar year (a request can straddle New Year). */
export const daysInYear = (i: DayCountInput, year: number): number => {
  const s = i.start < `${year}-01-01` ? `${year}-01-01` : i.start;
  const e = i.end > `${year}-12-31` ? `${year}-12-31` : i.end;
  if (e < s) return 0;
  return leaveDays({ ...i, start: s, end: e, startHalf: s === i.start ? i.startHalf : false, endHalf: e === i.end ? i.endHalf : false });
};

export const DEFAULT_LEAVE_TYPES = [
  { key: 'ANNUAL', name: 'Annual leave', annualDays: 20, accrual: 'UPFRONT', afterProbationOnly: false, minTenureMonths: 0, carryOverCap: 5, maxConsecutiveDays: 20, allowHalfDay: true, docAfterDays: null, paid: true, allowNegative: false, approvalChain: ['SUPERVISOR', 'HR'], setsOnLeaveStatus: false, countsWeekends: false, sortOrder: 1 },
  { key: 'SICK', name: 'Sick leave', annualDays: 12, accrual: 'UPFRONT', afterProbationOnly: false, minTenureMonths: 0, carryOverCap: 0, maxConsecutiveDays: null, allowHalfDay: true, docAfterDays: 2, paid: true, allowNegative: false, approvalChain: ['SUPERVISOR'], setsOnLeaveStatus: false, countsWeekends: false, sortOrder: 2 },
  { key: 'MATERNITY', name: 'Maternity leave', annualDays: 84, accrual: 'UPFRONT', afterProbationOnly: false, minTenureMonths: 0, carryOverCap: 0, maxConsecutiveDays: 120, allowHalfDay: false, docAfterDays: 0, paid: true, allowNegative: false, approvalChain: ['HR'], setsOnLeaveStatus: true, countsWeekends: true, sortOrder: 3 },
  { key: 'PATERNITY', name: 'Paternity leave', annualDays: 10, accrual: 'UPFRONT', afterProbationOnly: false, minTenureMonths: 0, carryOverCap: 0, maxConsecutiveDays: 10, allowHalfDay: false, docAfterDays: 0, paid: true, allowNegative: false, approvalChain: ['SUPERVISOR', 'HR'], setsOnLeaveStatus: false, countsWeekends: false, sortOrder: 4 },
  { key: 'COMPASSIONATE', name: 'Compassionate leave', annualDays: 5, accrual: 'UPFRONT', afterProbationOnly: false, minTenureMonths: 0, carryOverCap: 0, maxConsecutiveDays: 5, allowHalfDay: true, docAfterDays: null, paid: true, allowNegative: false, approvalChain: ['SUPERVISOR'], setsOnLeaveStatus: false, countsWeekends: false, sortOrder: 5 },
  { key: 'UNPAID', name: 'Unpaid leave', annualDays: 30, accrual: 'UPFRONT', afterProbationOnly: false, minTenureMonths: 0, carryOverCap: 0, maxConsecutiveDays: 30, allowHalfDay: true, docAfterDays: null, paid: false, allowNegative: false, approvalChain: ['SUPERVISOR', 'DEPT_HEAD', 'HR'], setsOnLeaveStatus: false, countsWeekends: false, sortOrder: 6 },
  { key: 'STUDY', name: 'Study / examination leave', annualDays: 10, accrual: 'UPFRONT', afterProbationOnly: true, minTenureMonths: 0, carryOverCap: 0, maxConsecutiveDays: 10, allowHalfDay: true, docAfterDays: 0, paid: true, allowNegative: false, approvalChain: ['SUPERVISOR', 'HR'], setsOnLeaveStatus: false, countsWeekends: false, sortOrder: 7 },
] as const;

/** Nigerian federal holidays that fall on the same date every year. Moveable ones (Eid, Good Friday, Easter Monday) are added by HR each year. */
export const FIXED_HOLIDAYS: { md: string; name: string }[] = [
  { md: '01-01', name: "New Year's Day" }, { md: '05-01', name: "Workers' Day" }, { md: '06-12', name: 'Democracy Day' },
  { md: '10-01', name: 'Independence Day' }, { md: '12-25', name: 'Christmas Day' }, { md: '12-26', name: 'Boxing Day' },
];

// ── Attendance ───────────────────────────────────────────────────────────────

/** Minutes after midnight in Lagos for an instant. */
export const lagosMinutes = (d: Date): number => {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
  const h = Number(p.find((x) => x.type === 'hour')?.value) % 24;
  return h * 60 + Number(p.find((x) => x.type === 'minute')?.value);
};

export const hhmm = (s: string): number => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));

export interface ScheduleLike { startTime: string; endTime: string; breakMinutes: number; graceMinutes: number; workDays: number[] }

/** Not late up to and including the grace period (08:14 on an 08:00 start with 15 minutes grace); late from 08:16. */
export const lateMinutes = (clockInMin: number, s: ScheduleLike): number => {
  const start = hhmm(s.startTime);
  return clockInMin > start + s.graceMinutes ? clockInMin - start : 0;
};

export const earlyMinutes = (clockOutMin: number, s: ScheduleLike): number => {
  const end = hhmm(s.endTime);
  return clockOutMin < end - s.graceMinutes ? end - clockOutMin : 0;
};

export const workedMinutes = (clockIn: Date, clockOut: Date, breakMinutes: number): number =>
  Math.max(0, Math.round((clockOut.getTime() - clockIn.getTime()) / 60_000) - breakMinutes);

/** ISO weekday (Mon = 1 ... Sun = 7) of a YYYY-MM-DD date. */
export const isoWeekday = (ymd: string): number => { const d = new Date(`${ymd}T00:00:00Z`).getUTCDay(); return d === 0 ? 7 : d; };

export const isWorkDay = (ymd: string, s: ScheduleLike, holidays: string[]): boolean => s.workDays.includes(isoWeekday(ymd)) && !holidays.includes(ymd);

export const DEFAULT_SCHEDULE = { name: 'Standard office hours', startTime: '08:00', endTime: '17:00', breakMinutes: 60, workDays: [1, 2, 3, 4, 5], graceMinutes: 15, isDefault: true };

export { dateOnly };
