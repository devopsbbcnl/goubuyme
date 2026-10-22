// Which notifications a user can switch off. Categories follow the notification
// `type` the server actually sends. Anything not listed here (a broadcast, a
// message from staff, a campaign) is never blocked by these switches: broadcasts
// and staff messages are the platform speaking, and campaigns are already
// governed by the marketing opt-in before they reach notifyUser.
export const NOTIFICATION_CATEGORIES = ['orders', 'earnings', 'account'] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

const CATEGORY_BY_TYPE: Record<string, NotificationCategory> = {
  order: 'orders',
  job: 'orders',
  payout: 'earnings',
  store_credit: 'earnings',
  referral: 'earnings',
  account: 'account',
  support_ticket: 'account',
};

export const categoryOf = (type: string): NotificationCategory | null => CATEGORY_BY_TYPE[type] ?? null;

type Prefs = Partial<Record<NotificationCategory, boolean>>;

const asPrefs = (value: unknown): Prefs =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Prefs) : {};

// A missing key means on, so a new user (or a new category) is opted in by default.
export const isCategoryEnabled = (stored: unknown, category: NotificationCategory): boolean =>
  asPrefs(stored)[category] !== false;

export const resolvePrefs = (stored: unknown): Record<NotificationCategory, boolean> =>
  Object.fromEntries(NOTIFICATION_CATEGORIES.map(c => [c, isCategoryEnabled(stored, c)])) as Record<NotificationCategory, boolean>;

// True when this user should be sent a notification of this type.
export const wantsNotification = (stored: unknown, type: string): boolean => {
  const category = categoryOf(type);
  return category === null || isCategoryEnabled(stored, category);
};

export const mergePrefs = (stored: unknown, changes: Prefs): Record<NotificationCategory, boolean> =>
  resolvePrefs({ ...asPrefs(stored), ...changes });
