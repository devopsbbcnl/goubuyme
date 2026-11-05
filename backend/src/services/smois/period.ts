// Reporting periods in Lagos time (UTC+1, no daylight saving). Weeks start on Monday.
const OFFSET_MS = 3_600_000;

export type PeriodKey =
  | 'today' | 'yesterday' | 'week' | 'lastWeek' | 'month' | 'lastMonth'
  | 'quarter' | 'lastQuarter' | 'year' | 'lastYear' | 'custom';

export const PERIOD_KEYS: readonly PeriodKey[] = ['today', 'yesterday', 'week', 'lastWeek', 'month', 'lastMonth', 'quarter', 'lastQuarter', 'year', 'lastYear', 'custom'];

export interface Period { key: PeriodKey; from: Date; to: Date; label: string }

/** Lagos wall-clock start of a day, expressed as a real instant. */
const lagosMidnight = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d) - OFFSET_MS);

export const resolvePeriod = (key: PeriodKey, now = new Date(), custom?: { from?: Date | null; to?: Date | null }): Period => {
  const local = new Date(now.getTime() + OFFSET_MS); // read UTC fields as Lagos wall time
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const d = local.getUTCDate();
  const dow = (local.getUTCDay() + 6) % 7; // Monday = 0
  const startOfToday = lagosMidnight(y, m, d);
  const day = 86_400_000;
  const mk = (from: Date, to: Date, label: string): Period => ({ key, from, to, label });

  switch (key) {
    case 'today': return mk(startOfToday, new Date(startOfToday.getTime() + day - 1), 'Today');
    case 'yesterday': return mk(new Date(startOfToday.getTime() - day), new Date(startOfToday.getTime() - 1), 'Yesterday');
    case 'week': { const s = new Date(startOfToday.getTime() - dow * day); return mk(s, new Date(s.getTime() + 7 * day - 1), 'This week'); }
    case 'lastWeek': { const s = new Date(startOfToday.getTime() - (dow + 7) * day); return mk(s, new Date(s.getTime() + 7 * day - 1), 'Last week'); }
    case 'month': return mk(lagosMidnight(y, m, 1), new Date(lagosMidnight(y, m + 1, 1).getTime() - 1), 'This month');
    case 'lastMonth': return mk(lagosMidnight(y, m - 1, 1), new Date(lagosMidnight(y, m, 1).getTime() - 1), 'Last month');
    case 'quarter': { const q = Math.floor(m / 3) * 3; return mk(lagosMidnight(y, q, 1), new Date(lagosMidnight(y, q + 3, 1).getTime() - 1), 'This quarter'); }
    case 'lastQuarter': { const q = Math.floor(m / 3) * 3 - 3; return mk(lagosMidnight(y, q, 1), new Date(lagosMidnight(y, q + 3, 1).getTime() - 1), 'Last quarter'); }
    case 'year': return mk(lagosMidnight(y, 0, 1), new Date(lagosMidnight(y + 1, 0, 1).getTime() - 1), 'This year');
    case 'lastYear': return mk(lagosMidnight(y - 1, 0, 1), new Date(lagosMidnight(y, 0, 1).getTime() - 1), 'Last year');
    case 'custom': {
      const from = custom?.from ?? startOfToday;
      const to = custom?.to ?? new Date(startOfToday.getTime() + day - 1);
      return mk(from, to, 'Custom range');
    }
  }
};
