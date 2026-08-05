// Store hours are stored as 24h "HH:MM" strings in the vendor's local (WAT) time.
const STORE_TZ = process.env.STORE_TIMEZONE || 'Africa/Lagos';

/** Parse "HH:MM" into minutes since midnight, or null if invalid. */
export const parseTimeToMinutes = (value?: string | null): number | null => {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
};

/** Current minutes-since-midnight in the store timezone. */
export const nowMinutesInStoreTz = (date = new Date()): number => {
  return localTimeInZone(STORE_TZ, date).minutes;
};

/**
 * The vendor-local weekday (0 = Sunday … 6 = Saturday) and minutes-since-midnight
 * for a given IANA timezone. Falls back to the default store timezone if the
 * provided zone is invalid, so a bad DB value never crashes availability checks.
 */
export const localTimeInZone = (
  timeZone: string = STORE_TZ,
  date = new Date(),
): { dayOfWeek: number; minutes: number } => {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);
  } catch {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: STORE_TZ,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);
  }
  const hour = Number(parts.find(p => p.type === 'hour')?.value ?? '0') % 24;
  const minute = Number(parts.find(p => p.type === 'minute')?.value ?? '0');
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const dayOfWeek = weekdayMap[parts.find(p => p.type === 'weekday')?.value ?? 'Sun'] ?? 0;
  return { dayOfWeek, minutes: hour * 60 + minute };
};

/** Format minutes-since-midnight as a 12-hour clock string, e.g. 570 → "9:30 AM". */
export const formatMinutesTo12h = (value?: string | number | null): string | null => {
  const minutes = typeof value === 'string' ? parseTimeToMinutes(value) : value;
  if (minutes === null || minutes === undefined || Number.isNaN(minutes)) return null;
  const h24 = Math.floor(minutes / 60) % 24;
  const min = minutes % 60;
  const period = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(min).padStart(2, '0')} ${period}`;
};

/**
 * Whether a store should be open right now given its opening/closing times.
 * Returns null when hours are not fully configured (vendor stays on manual control).
 * Handles overnight ranges (e.g. 22:00 – 06:00).
 */
export const isWithinOpenHours = (
  openingTime?: string | null,
  closingTime?: string | null,
  now = nowMinutesInStoreTz(),
): boolean | null => {
  const open = parseTimeToMinutes(openingTime);
  const close = parseTimeToMinutes(closingTime);
  if (open === null || close === null) return null;
  if (open === close) return true; // open all day
  if (open < close) return now >= open && now < close;
  // overnight span
  return now >= open || now < close;
};
