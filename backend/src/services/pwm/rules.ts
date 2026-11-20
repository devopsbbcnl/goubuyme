// PWM rules that don't touch the database: status transitions, contract validation, the reminder
// schedule, recipient matrix, working-day maths and default checklists. Kept pure so they can be
// unit-tested (PRD sections 9, 10.5-10.9 and 12).
import type { PwmContractStatus, PwmEmploymentStatus, PwmRenewalDecision, PwmRole } from '@prisma/client';

// ── Dates (all in Africa/Lagos calendar days, held as YYYY-MM-DD strings) ────────────────────────

export const lagosYmd = (d: Date): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

export const lagosHour = (d: Date): number =>
  Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', hour: '2-digit', hour12: false }).format(d)) % 24;

/** A @db.Date value (UTC midnight) or Date -> YYYY-MM-DD without any timezone drift. */
export const dateOnly = (d: Date | string): string => (typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10));

const toUtc = (ymd: string) => Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10));
export const fromYmd = (ymd: string): Date => new Date(toUtc(ymd));

export const addDays = (ymd: string, n: number): string => dateOnly(new Date(toUtc(ymd) + n * 86_400_000));

/** Whole calendar days from a to b (positive when b is later). */
export const daysBetween = (a: string, b: string): number => Math.round((toUtc(b) - toUtc(a)) / 86_400_000);

export const isWeekend = (ymd: string): boolean => {
  const day = new Date(toUtc(ymd)).getUTCDay();
  return day === 0 || day === 6;
};

/** Working days after `from` up to and including `to` (Mon-Fri, minus listed holidays). Negative when `to` is earlier. */
export const workingDaysBetween = (from: string, to: string, holidays: string[] = []): number => {
  if (to === from) return 0;
  const sign = to > from ? 1 : -1;
  const [start, end] = sign === 1 ? [from, to] : [to, from];
  let n = 0;
  for (let d = addDays(start, 1); d <= end; d = addDays(d, 1)) if (!isWeekend(d) && !holidays.includes(d)) n++;
  return n * sign;
};

/** Calendar duration as { years, months, days } (read-only on a contract). */
export const durationBetween = (startYmd: string, endYmd: string): { years: number; months: number; days: number } => {
  // Inclusive of the last day: a contract from 1 Jan to 31 Dec is one year.
  const s = new Date(toUtc(startYmd));
  const e = new Date(toUtc(addDays(endYmd, 1)));
  let years = e.getUTCFullYear() - s.getUTCFullYear();
  let months = e.getUTCMonth() - s.getUTCMonth();
  let days = e.getUTCDate() - s.getUTCDate();
  if (days < 0) { months -= 1; days += new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), 0)).getUTCDate(); }
  if (months < 0) { years -= 1; months += 12; }
  return { years, months, days };
};

export const addMonths = (ymd: string, months: number): string => {
  const d = new Date(toUtc(ymd));
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return dateOnly(target);
};

// ── Access ───────────────────────────────────────────────────────────────────

export type PwmLevel = 'SUPER' | PwmRole;

export interface PwmAccess {
  userId: string;
  memberId: string | null;
  level: PwmLevel;
  isMd: boolean;
  canViewCompensation: boolean;
  /** The employee record linked to this login, used for department-head scope and "own record" rules. */
  employeeId: string | null;
  /** Departments this person currently heads (effective headship). */
  headedDepartmentIds: string[];
}

export type Capability =
  | 'view'              // see the module, directory and dashboard (scoped for department heads)
  | 'viewRestricted'    // personal contact, DOB, address, emergency contacts
  | 'viewHighlyRestricted' // reveal NIN, TIN, bank etc. (every reveal is logged)
  | 'manageEmployees'
  | 'manageOrganisation'
  | 'manageContracts'
  | 'approveContracts'
  | 'recommend'         // department head renewal recommendation
  | 'decide'            // management renewal decision
  | 'changeStatus'      // initiate a status change
  | 'approveStatus'     // approve suspend / terminate and similar
  | 'manageChecklists'
  | 'viewCompensation'
  | 'manageCompensation'
  | 'approveCompensation'
  | 'viewReminders'
  | 'manageReminders'   // resend / acknowledge on behalf
  | 'configure'
  | 'manageTeam'
  | 'viewAudit'
  | 'import'
  | 'viewRecruitment'
  | 'manageRecruitment'
  | 'approveVacancies'
  | 'manageTemplates'
  | 'managePolicies'
  | 'manageAnnouncements'
  | 'viewExitInterviews'
  | 'viewLeave'
  | 'manageLeave'
  | 'configureLeave'
  | 'viewAttendance'
  | 'manageAttendance'
  | 'viewPerformance'
  | 'managePerformance'
  | 'viewLearning'
  | 'manageLearning'
  | 'viewAssets'
  | 'manageAssets'
  | 'createCases'
  | 'handleCases'
  | 'viewERReports'
  | 'manageSurveys'
  | 'viewSurveyResults'
  | 'manageRecognition'
  | 'viewExpenses'
  | 'payExpenses'
  | 'viewAnalytics'
  | 'viewPlanning'
  | 'managePlanning'
  | 'approvePlanning'
  | 'viewSuccession'
  | 'manageSuccession';

export const can = (a: PwmAccess, cap: Capability): boolean => {
  const L = a.level;
  const hr = L === 'HR_ADMIN' || L === 'HR_OFFICER';
  switch (cap) {
    case 'view': return true;
    case 'viewRestricted': return L === 'SUPER' || L === 'EXECUTIVE' || L === 'HR_ADMIN' || L === 'HR_OFFICER' || L === 'FINANCE' || L === 'AUDITOR';
    case 'viewHighlyRestricted': return L === 'SUPER' || L === 'HR_ADMIN' || L === 'HR_OFFICER' || L === 'EXECUTIVE' || L === 'FINANCE';
    case 'manageEmployees': return L === 'SUPER' || hr;
    case 'manageOrganisation': return L === 'SUPER' || L === 'HR_ADMIN';
    case 'manageContracts': return L === 'SUPER' || hr;
    case 'approveContracts': return L === 'SUPER' || L === 'EXECUTIVE';
    case 'recommend': return L === 'SUPER' || hr || L === 'DEPARTMENT_HEAD';
    case 'decide': return L === 'SUPER' || L === 'EXECUTIVE';
    case 'changeStatus': return L === 'SUPER' || hr || L === 'DEPARTMENT_HEAD';
    case 'approveStatus': return L === 'SUPER' || L === 'EXECUTIVE';
    case 'manageChecklists': return L === 'SUPER' || hr;
    case 'viewCompensation': return L === 'SUPER' || L === 'EXECUTIVE' || L === 'FINANCE' || (L === 'HR_ADMIN' && a.canViewCompensation);
    case 'manageCompensation': return L === 'FINANCE' || L === 'SUPER' || (L === 'HR_ADMIN' && a.canViewCompensation);
    case 'approveCompensation': return L === 'SUPER' || L === 'EXECUTIVE';
    case 'viewReminders': return true;
    case 'manageReminders': return L === 'SUPER' || L === 'HR_ADMIN';
    case 'configure': return L === 'SUPER' || L === 'HR_ADMIN';
    case 'manageTeam': return L === 'SUPER';
    case 'viewAudit': return L === 'SUPER' || L === 'EXECUTIVE' || L === 'AUDITOR' || L === 'HR_ADMIN';
    case 'import': return L === 'SUPER' || L === 'HR_ADMIN';
    case 'viewRecruitment': return L === 'SUPER' || hr || L === 'EXECUTIVE' || L === 'DEPARTMENT_HEAD' || L === 'AUDITOR';
    case 'manageRecruitment': return L === 'SUPER' || hr;
    case 'approveVacancies': return L === 'SUPER' || L === 'EXECUTIVE';
    case 'manageTemplates': return L === 'SUPER' || hr;
    case 'managePolicies': return L === 'SUPER' || L === 'HR_ADMIN';
    case 'manageAnnouncements': return L === 'SUPER' || hr;
    case 'viewExitInterviews': return L === 'SUPER' || L === 'HR_ADMIN';
    case 'viewLeave': case 'viewAttendance': return L === 'SUPER' || hr || L === 'EXECUTIVE' || L === 'DEPARTMENT_HEAD' || L === 'AUDITOR';
    case 'manageLeave': case 'manageAttendance': return L === 'SUPER' || hr;
    case 'configureLeave': return L === 'SUPER' || L === 'HR_ADMIN';
    case 'viewPerformance': return L === 'SUPER' || hr || L === 'EXECUTIVE' || L === 'DEPARTMENT_HEAD' || L === 'AUDITOR';
    case 'managePerformance': return L === 'SUPER' || hr;
    case 'viewLearning': return L === 'SUPER' || hr || L === 'EXECUTIVE' || L === 'DEPARTMENT_HEAD' || L === 'FINANCE' || L === 'AUDITOR';
    case 'manageLearning': return L === 'SUPER' || hr;
    case 'viewAssets': return L === 'SUPER' || hr || L === 'EXECUTIVE' || L === 'DEPARTMENT_HEAD' || L === 'FINANCE' || L === 'AUDITOR';
    case 'manageAssets': return L === 'SUPER' || hr;
    case 'createCases': return L === 'HR_ADMIN' || L === 'HR_OFFICER';
    case 'handleCases': return L === 'HR_ADMIN' || L === 'HR_OFFICER' || L === 'EXECUTIVE' || L === 'DEPARTMENT_HEAD';
    case 'viewERReports': return L === 'SUPER' || L === 'HR_ADMIN' || L === 'EXECUTIVE' || L === 'AUDITOR';
    case 'manageSurveys': return L === 'SUPER' || hr;
    case 'viewSurveyResults': return L === 'SUPER' || L === 'HR_ADMIN' || L === 'EXECUTIVE' || L === 'AUDITOR';
    case 'manageRecognition': return L === 'SUPER' || hr || L === 'DEPARTMENT_HEAD';
    case 'viewExpenses': return L === 'SUPER' || hr || L === 'FINANCE' || L === 'EXECUTIVE' || L === 'AUDITOR';
    case 'payExpenses': return L === 'SUPER' || L === 'FINANCE';
    case 'viewAnalytics': return L === 'SUPER' || hr || L === 'EXECUTIVE' || L === 'AUDITOR' || L === 'DEPARTMENT_HEAD';
    case 'viewPlanning': return L === 'SUPER' || hr || L === 'EXECUTIVE' || L === 'FINANCE' || L === 'AUDITOR';
    case 'managePlanning': return L === 'SUPER' || L === 'HR_ADMIN';
    case 'approvePlanning': return L === 'SUPER' || L === 'EXECUTIVE';
    // Succession names people as future leaders: only HR admin and the executive see it.
    case 'viewSuccession': return L === 'SUPER' || L === 'HR_ADMIN' || L === 'EXECUTIVE';
    case 'manageSuccession': return L === 'SUPER' || L === 'HR_ADMIN';
    default: return false;
  }
};

/** Department heads and a plain employee-level view only see their own department's people. */
export const isScopedToDepartments = (a: PwmAccess): boolean => a.level === 'DEPARTMENT_HEAD';

// ── Employment status ────────────────────────────────────────────────────────

type S = PwmEmploymentStatus;

export const STATUS_LABEL: Record<S, string> = {
  PENDING_ONBOARDING: 'Pending onboarding', PROBATION: 'Probation', ACTIVE: 'Active', RENEWAL_PENDING: 'Renewal pending',
  CONTRACT_ISSUED: 'Contract issued', ON_LEAVE: 'On leave', SUSPENDED: 'Suspended', NOTICE_PERIOD: 'Notice period',
  CONTRACT_EXPIRED: 'Contract expired', RESIGNED: 'Resigned', TERMINATED: 'Terminated', ARCHIVED: 'Archived',
};

/** Statuses that count as a current employee (PRD 10.9). Pending onboarding is shown separately. */
export const CURRENT_STATUSES: readonly S[] = ['PROBATION', 'ACTIVE', 'RENEWAL_PENDING', 'CONTRACT_ISSUED', 'ON_LEAVE', 'SUSPENDED', 'NOTICE_PERIOD', 'CONTRACT_EXPIRED'];
export const FORMER_STATUSES: readonly S[] = ['RESIGNED', 'TERMINATED', 'ARCHIVED'];

type Approver = 'NONE' | 'HR_ADMIN' | 'MANAGEMENT' | 'HR';

/** from -> to -> who must approve. A missing entry means the move is not allowed. */
const TRANSITIONS: Record<S, Partial<Record<S, Approver>>> = {
  PENDING_ONBOARDING: { PROBATION: 'HR_ADMIN', ACTIVE: 'HR_ADMIN', ARCHIVED: 'HR_ADMIN' },
  PROBATION: { ACTIVE: 'HR', PROBATION: 'HR', ON_LEAVE: 'NONE', SUSPENDED: 'MANAGEMENT', NOTICE_PERIOD: 'HR', RENEWAL_PENDING: 'NONE', RESIGNED: 'HR', TERMINATED: 'MANAGEMENT' },
  ACTIVE: { ON_LEAVE: 'NONE', SUSPENDED: 'MANAGEMENT', RENEWAL_PENDING: 'NONE', NOTICE_PERIOD: 'HR', CONTRACT_EXPIRED: 'NONE', RESIGNED: 'HR', TERMINATED: 'MANAGEMENT' },
  RENEWAL_PENDING: { CONTRACT_ISSUED: 'NONE', ACTIVE: 'NONE', NOTICE_PERIOD: 'HR', CONTRACT_EXPIRED: 'NONE' },
  CONTRACT_ISSUED: { ACTIVE: 'HR', RENEWAL_PENDING: 'NONE', CONTRACT_EXPIRED: 'NONE' },
  ON_LEAVE: { ACTIVE: 'NONE', PROBATION: 'NONE', NOTICE_PERIOD: 'HR', RESIGNED: 'HR', TERMINATED: 'MANAGEMENT' },
  SUSPENDED: { ACTIVE: 'MANAGEMENT', NOTICE_PERIOD: 'MANAGEMENT', TERMINATED: 'MANAGEMENT' },
  NOTICE_PERIOD: { RESIGNED: 'HR', TERMINATED: 'MANAGEMENT', ACTIVE: 'MANAGEMENT' },
  CONTRACT_EXPIRED: { CONTRACT_ISSUED: 'NONE', ACTIVE: 'MANAGEMENT', NOTICE_PERIOD: 'MANAGEMENT', RESIGNED: 'HR', TERMINATED: 'MANAGEMENT' },
  RESIGNED: { ARCHIVED: 'HR_ADMIN' },
  TERMINATED: { ARCHIVED: 'HR_ADMIN' },
  ARCHIVED: {},
};

/** Only these two may be set by the system itself (STS-05). Never Resigned or Terminated. */
export const SYSTEM_STATUSES: readonly S[] = ['RENEWAL_PENDING', 'CONTRACT_EXPIRED'];

export interface TransitionCheck { ok: boolean; reason?: string; approver?: Approver; needsApproval?: boolean }

export const checkTransition = (from: S, to: S): TransitionCheck => {
  if (from === 'ARCHIVED' && to === 'PENDING_ONBOARDING') return { ok: false, reason: 'An archived employee can only be brought back through Rehire.' };
  if (from === to && from !== 'PROBATION') return { ok: false, reason: 'The employee already has that status.' };
  const approver = TRANSITIONS[from]?.[to];
  if (!approver) return { ok: false, reason: `${STATUS_LABEL[from]} cannot move to ${STATUS_LABEL[to]}.` };
  return { ok: true, approver, needsApproval: approver === 'MANAGEMENT' };
};

export const allowedNextStatuses = (from: S): S[] => Object.keys(TRANSITIONS[from] ?? {}) as S[];

// ── Contract rules ───────────────────────────────────────────────────────────

export interface ContractTypeRule { key: string; label: string; expiryRequired: boolean; defaultMonths?: number; probationMonths?: number; concurrentAllowed?: boolean }

export const DEFAULT_CONTRACT_TYPES: ContractTypeRule[] = [
  { key: 'PERMANENT', label: 'Permanent', expiryRequired: false, probationMonths: 6 },
  { key: 'FIXED_TERM', label: 'Fixed-term', expiryRequired: true, defaultMonths: 12 },
  { key: 'PROBATIONARY', label: 'Probationary', expiryRequired: true, defaultMonths: 6 },
  { key: 'TEMPORARY', label: 'Temporary', expiryRequired: true, defaultMonths: 6 },
  { key: 'INTERNSHIP', label: 'Internship', expiryRequired: true, defaultMonths: 6 },
  { key: 'GRADUATE_TRAINEE', label: 'Graduate trainee programme', expiryRequired: true, defaultMonths: 12 },
  { key: 'CONSULTANCY', label: 'Consultancy agreement', expiryRequired: true, defaultMonths: 12, concurrentAllowed: true },
  { key: 'PART_TIME', label: 'Part-time', expiryRequired: true, defaultMonths: 12 },
];

export interface ContractInput { contractType: string; commencementDate: string; expiryDate?: string | null }

export const validateContractDates = (c: ContractInput, types: ContractTypeRule[] = DEFAULT_CONTRACT_TYPES): string[] => {
  const errors: string[] = [];
  const t = types.find((x) => x.key === c.contractType);
  if (!t) return [`Unknown contract type "${c.contractType}".`];
  if (!c.commencementDate) errors.push('Commencement date is required.');
  if (t.expiryRequired && !c.expiryDate) errors.push(`Expiry date is required for ${t.label} contracts.`);
  if (c.expiryDate && c.commencementDate && c.expiryDate <= c.commencementDate) errors.push('Expiry date must be after the commencement date.');
  return errors;
};

/** Two date ranges overlap (open-ended ranges run forever). Ends are inclusive. */
export const rangesOverlap = (aStart: string, aEnd: string | null, bStart: string, bEnd: string | null): boolean =>
  aStart <= (bEnd ?? '9999-12-31') && bStart <= (aEnd ?? '9999-12-31');

/** Statuses in which a contract is the one currently governing employment. */
export const IN_FORCE_CONTRACT: readonly PwmContractStatus[] = ['ACTIVE', 'RENEWAL_PENDING', 'EXPIRED_ACTION_REQUIRED'];
/** Statuses the expiry engine watches (PRD 12.2 step 1). */
export const WATCHED_CONTRACT: readonly PwmContractStatus[] = ['ACTIVE', 'RENEWAL_PENDING', 'EXPIRED_ACTION_REQUIRED'];
export const CLOSED_CONTRACT: readonly PwmContractStatus[] = ['EXPIRED', 'NOT_RENEWED', 'SUPERSEDED', 'TERMINATED_EARLY', 'DECLINED', 'CANCELLED', 'ARCHIVED'];

/** Core terms of a signed contract cannot be edited; changes go through an amendment or a renewal (CON-14). */
export const isLockedForEdit = (status: PwmContractStatus): boolean =>
  ['SIGNED', 'ACTIVE', 'RENEWAL_PENDING', 'EXPIRED_ACTION_REQUIRED', ...CLOSED_CONTRACT].includes(status);

export const CONTRACT_STATUS_LABEL: Record<PwmContractStatus, string> = {
  DRAFT: 'Draft', PENDING_APPROVAL: 'Pending approval', APPROVED: 'Approved', ISSUED: 'Issued', SIGNED: 'Signed', ACTIVE: 'Active',
  RENEWAL_PENDING: 'Renewal pending', EXPIRED_ACTION_REQUIRED: 'Expired - action required', EXPIRED: 'Expired', NOT_RENEWED: 'Not renewed',
  SUPERSEDED: 'Superseded', TERMINATED_EARLY: 'Terminated early', DECLINED: 'Declined', CANCELLED: 'Cancelled', ARCHIVED: 'Archived',
};

// ── Expiry buckets (the Contract Expiry Tracker) ─────────────────────────────

export type ExpiryBucket = 'EXPIRED_ACTION' | 'TODAY' | 'D1_3' | 'D4_7' | 'D8_30' | 'D31_60' | 'D61_90' | 'LATER' | 'NO_EXPIRY';

export const BUCKET_LABEL: Record<ExpiryBucket, string> = {
  EXPIRED_ACTION: 'Expired - action required', TODAY: 'Expires today', D1_3: '1-3 days', D4_7: '4-7 days', D8_30: '8-30 days',
  D31_60: '31-60 days', D61_90: '61-90 days', LATER: 'More than 90 days', NO_EXPIRY: 'No expiry',
};

export const expiryBucket = (daysRemaining: number | null): ExpiryBucket => {
  if (daysRemaining === null) return 'NO_EXPIRY';
  if (daysRemaining < 0) return 'EXPIRED_ACTION';
  if (daysRemaining === 0) return 'TODAY';
  if (daysRemaining <= 3) return 'D1_3';
  if (daysRemaining <= 7) return 'D4_7';
  if (daysRemaining <= 30) return 'D8_30';
  if (daysRemaining <= 60) return 'D31_60';
  if (daysRemaining <= 90) return 'D61_90';
  return 'LATER';
};

// ── Reminder schedule (PRD 10.6 and 12) ──────────────────────────────────────

export type Recipient = 'HR_OFFICER' | 'HR_ADMIN' | 'DEPT_HEAD' | 'MANAGEMENT' | 'MD' | 'SUPER_ADMIN' | 'EMPLOYEE';
export type Severity = 'EARLY' | 'ACTION' | 'URGENT' | 'CRITICAL';
export type Channel = 'IN_APP' | 'EMAIL';

export interface ReminderTier {
  /** T-30, T-7, T-3, T-1, T0, T+1 or T+n */
  key: string;
  /** Days before expiry (negative = after). T+n repeats and ignores this. */
  offsetDays: number;
  severity: Severity;
  recipients: Recipient[];
  /** Only when the department head's recommendation is still outstanding. */
  deptHeadOnlyIfRecommendationOutstanding?: boolean;
  channels: Channel[];
  /** Management receives a digest rather than one message per contract (T-30). */
  digest?: boolean;
  repeat?: boolean;
}

export const DEFAULT_TIERS: ReminderTier[] = [
  { key: 'T-30', offsetDays: 30, severity: 'EARLY', recipients: ['HR_OFFICER', 'HR_ADMIN', 'MANAGEMENT'], channels: ['IN_APP', 'EMAIL'], digest: true },
  { key: 'T-7', offsetDays: 7, severity: 'ACTION', recipients: ['HR_OFFICER', 'HR_ADMIN', 'MANAGEMENT', 'DEPT_HEAD'], deptHeadOnlyIfRecommendationOutstanding: true, channels: ['IN_APP', 'EMAIL'] },
  { key: 'T-3', offsetDays: 3, severity: 'URGENT', recipients: ['HR_OFFICER', 'HR_ADMIN', 'MANAGEMENT', 'DEPT_HEAD'], channels: ['IN_APP', 'EMAIL'] },
  { key: 'T-1', offsetDays: 1, severity: 'CRITICAL', recipients: ['HR_OFFICER', 'HR_ADMIN', 'MANAGEMENT', 'DEPT_HEAD', 'MD'], channels: ['IN_APP', 'EMAIL'] },
  { key: 'T0', offsetDays: 0, severity: 'CRITICAL', recipients: ['HR_OFFICER', 'HR_ADMIN', 'MANAGEMENT', 'DEPT_HEAD', 'MD'], channels: ['IN_APP', 'EMAIL'] },
  { key: 'T+1', offsetDays: -1, severity: 'CRITICAL', recipients: ['HR_OFFICER', 'HR_ADMIN', 'MANAGEMENT', 'DEPT_HEAD', 'MD'], channels: ['IN_APP', 'EMAIL'] },
  { key: 'T+n', offsetDays: -2, severity: 'CRITICAL', recipients: ['HR_OFFICER', 'HR_ADMIN', 'MANAGEMENT', 'DEPT_HEAD', 'MD'], channels: ['IN_APP', 'EMAIL'], repeat: true },
];

export interface DueTier { tier: ReminderTier; key: string }

/**
 * Which tiers have come due for a contract today, most severe last-first.
 * `daysRemaining` is expiry minus today; `workingDaysAfter` counts working days since expiry.
 * T+n repeats every `repeatEvery` working days once the contract is more than two working days past expiry.
 */
export const dueTiers = (daysRemaining: number, workingDaysAfter: number, tiers: ReminderTier[] = DEFAULT_TIERS, repeatEvery = 2): DueTier[] => {
  const out: DueTier[] = [];
  for (const t of tiers) {
    if (t.repeat) {
      if (daysRemaining < -1 && workingDaysAfter >= 1 + repeatEvery) {
        const idx = Math.floor((workingDaysAfter - 1) / repeatEvery);
        out.push({ tier: t, key: `${t.key}#${idx}` });
      }
    } else if (daysRemaining <= t.offsetDays) {
      out.push({ tier: t, key: t.key });
    }
  }
  return out;
};

/**
 * The catch-up rule (PRD 12.4): only the most severe tier already due is sent; earlier ones are marked skipped.
 * `done` holds tier keys that already have a record for this expiry date.
 */
export const pickTierToSend = (due: DueTier[], done: Set<string>): { send: DueTier | null; skipped: DueTier[] } => {
  const pending = due.filter((d) => !done.has(d.key));
  if (!pending.length) return { send: null, skipped: [] };
  // Most severe = latest in the schedule that is due (T+n#k over T+1 over T0 ...).
  const send = pending[pending.length - 1];
  return { send, skipped: pending.slice(0, -1) };
};

export interface RecipientContext {
  hrOfficerUserId?: string | null;
  hrAdminUserIds: string[];
  deptHeadUserId?: string | null;
  managementUserIds: string[];
  mdUserIds: string[];
  superAdminUserIds: string[];
  employeeUserId?: string | null;
  recommendationOutstanding: boolean;
  workingDaysAfter: number;
  employeeRecipientOn?: boolean;
  superAdminAfterWorkingDays?: number;
}

export interface ResolvedRecipient { userId: string; role: Recipient; fallbackFor?: Recipient }

/**
 * Turn the tier's role list into people. Duplicates collapse to one entry; a role with nobody falls back to the
 * HR administrators and is reported as a configuration gap (REM-13).
 */
export const resolveRecipients = (tier: ReminderTier, ctx: RecipientContext): { people: ResolvedRecipient[]; gaps: Recipient[] } => {
  const seen = new Map<string, ResolvedRecipient>();
  const gaps: Recipient[] = [];
  const add = (userId: string | null | undefined, role: Recipient, fallbackFor?: Recipient) => {
    if (userId && !seen.has(userId)) seen.set(userId, { userId, role, fallbackFor });
  };
  const fallback = (role: Recipient) => { gaps.push(role); ctx.hrAdminUserIds.forEach((id) => add(id, 'HR_ADMIN', role)); };

  for (const r of tier.recipients) {
    switch (r) {
      case 'HR_OFFICER': ctx.hrOfficerUserId ? add(ctx.hrOfficerUserId, r) : fallback(r); break;
      case 'HR_ADMIN': ctx.hrAdminUserIds.forEach((id) => add(id, r)); break;
      case 'DEPT_HEAD':
        if (tier.deptHeadOnlyIfRecommendationOutstanding && !ctx.recommendationOutstanding) break;
        ctx.deptHeadUserId ? add(ctx.deptHeadUserId, r) : fallback(r);
        break;
      case 'MANAGEMENT': ctx.managementUserIds.length ? ctx.managementUserIds.forEach((id) => add(id, r)) : fallback(r); break;
      case 'MD': (ctx.mdUserIds.length ? ctx.mdUserIds : ctx.managementUserIds).forEach((id) => add(id, r)); break;
      case 'SUPER_ADMIN':
        if (ctx.workingDaysAfter >= (ctx.superAdminAfterWorkingDays ?? 5)) ctx.superAdminUserIds.forEach((id) => add(id, r));
        break;
      case 'EMPLOYEE': if (ctx.employeeRecipientOn) add(ctx.employeeUserId, r); break;
    }
  }
  // Escalation to the super admin after five working days is part of the default T+n matrix.
  if (tier.repeat && ctx.workingDaysAfter >= (ctx.superAdminAfterWorkingDays ?? 5)) ctx.superAdminUserIds.forEach((id) => add(id, 'SUPER_ADMIN'));
  return { people: [...seen.values()], gaps };
};

/** Idempotency key: the same reminder is never created twice for the same person and channel. */
export const reminderKey = (parts: (string | number)[]): string => parts.join('|');

/** Back-off in minutes after the nth failed attempt (1, 5, 15, 60, 240); null once attempts run out. */
export const RETRY_MINUTES = [1, 5, 15, 60, 240] as const;
export const retryDelay = (attemptsSoFar: number): number | null => (attemptsSoFar < 1 || attemptsSoFar > RETRY_MINUTES.length ? null : RETRY_MINUTES[attemptsSoFar - 1]);

export const SEVERITY_LABEL: Record<Severity, string> = { EARLY: 'Early warning', ACTION: 'Action required', URGENT: 'Urgent', CRITICAL: 'Critical' };
export const SEVERITY_NEEDS_ACK: Record<Severity, boolean> = { EARLY: false, ACTION: true, URGENT: true, CRITICAL: true };

export interface MessageFields {
  employeeName: string; employeeNo: string; department: string; contractRef: string; contractType: string;
  expiryDate: string; daysRemaining: number; stage: string; owner?: string;
}

/** Message standards (PRD 12.6): who, which contract, expiry, days left, stage, action. Never any pay or restricted data. */
export const buildExpiryMessage = (tierKey: string, severity: Severity, m: MessageFields): { title: string; body: string } => {
  const base = tierKey.startsWith('T+n') ? 'T+n' : tierKey;
  const who = `${m.employeeName} (${m.employeeNo})`;
  const facts = `Contract ${m.contractRef} (${m.contractType}, ${m.department}) expires on ${m.expiryDate}.`;
  switch (base) {
    case 'T-30': return { title: `[Early warning] Contract expires in 30 days: ${who}`, body: `${facts} A renewal task has been created. Current stage: ${m.stage}.${m.owner ? ` Owner: ${m.owner}.` : ''}` };
    case 'T-7': return { title: `[Action required] Renewal decision needed, ${Math.max(m.daysRemaining, 0)} days left: ${who}`, body: `${facts} Current stage: ${m.stage}. A decision is required.` };
    case 'T-3': return { title: `[Urgent] Renewal still pending, ${Math.max(m.daysRemaining, 0)} days left: ${who}`, body: `No final decision or new contract has been recorded. ${facts} Current stage: ${m.stage}.` };
    case 'T-1': return { title: `[Critical] Contract expires tomorrow: ${who}`, body: `Final reminder. ${facts} Current stage: ${m.stage}.` };
    case 'T0': return { title: `[Critical] Contract expires today, record flagged for review: ${who}`, body: `The contract has reached its expiry date and the employee record is flagged for immediate review. Employment has not been ended. ${facts}` };
    case 'T+1': return { title: `[Critical] Expired, action required: ${who}`, body: `No renewal, extension or other authorised decision has been recorded, so the contract is marked Expired - action required. Employment has not been ended. ${facts}` };
    default: return { title: `[${SEVERITY_LABEL[severity]}] Contract still without a decision, ${Math.abs(m.daysRemaining)} days past expiry: ${who}`, body: `${facts} Record a decision to stop these reminders.` };
  }
};

// ── Renewal schedule (PRD 10.7) ──────────────────────────────────────────────

export interface RenewalDueDates { recommendation: string; decision: string; preparation: string; issuance: string; signature: string }

/** Default step SLAs counted back from the expiry date: T-14, T-7, T-5, T-3, T-1. */
export const renewalDueDates = (expiryYmd: string): RenewalDueDates => ({
  recommendation: addDays(expiryYmd, -14), decision: addDays(expiryYmd, -7), preparation: addDays(expiryYmd, -5),
  issuance: addDays(expiryYmd, -3), signature: addDays(expiryYmd, -1),
});

export type SlaState = 'ON_TRACK' | 'DUE_SOON' | 'OVERDUE' | 'DONE';
export const slaState = (dueYmd: string, todayYmd: string, done: boolean): SlaState =>
  done ? 'DONE' : todayYmd > dueYmd ? 'OVERDUE' : daysBetween(todayYmd, dueYmd) <= 2 ? 'DUE_SOON' : 'ON_TRACK';

export const DECISIONS_NEEDING_NEW_CONTRACT: readonly PwmRenewalDecision[] = ['RENEW_SAME_TERMS', 'RENEW_WITH_CHANGES', 'CONVERT_TO_PERMANENT', 'OTHER'];

// ── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_DEPARTMENTS = ['Management', 'Technology & Engineering', 'Cybersecurity', 'Operations', 'Marketing & Communications', 'Finance & Administration', 'Human Resources', 'Business Development'];

export interface ChecklistTemplateTask { stage: string; title: string; ownerRole: 'HR_OFFICER' | 'HR_ADMIN' | 'IT' | 'ASSETS' | 'DEPARTMENT_HEAD' | 'EMPLOYEE' | 'FINANCE'; offsetDays: number; mandatory?: boolean }

/** Onboarding (PRD 10.8). Offsets are days from the start date. */
export const ONBOARDING_TEMPLATE: ChecklistTemplateTask[] = [
  { stage: 'Pre-boarding', title: 'Assign department, position and supervisor', ownerRole: 'HR_OFFICER', offsetDays: -7 },
  { stage: 'Pre-boarding', title: 'Record employment date and probation review date', ownerRole: 'HR_OFFICER', offsetDays: -7 },
  { stage: 'Pre-boarding', title: 'Collect personal details, bank and statutory numbers, emergency contacts, guarantor', ownerRole: 'HR_OFFICER', offsetDays: -5 },
  { stage: 'Pre-boarding', title: 'Upload signed contract and offer acceptance', ownerRole: 'HR_OFFICER', offsetDays: -3 },
  { stage: 'Pre-boarding', title: 'Request company email and system access', ownerRole: 'IT', offsetDays: -5 },
  { stage: 'Pre-boarding', title: 'Allocate equipment (laptop, phone, ID card, access card)', ownerRole: 'ASSETS', offsetDays: -2, mandatory: false },
  { stage: 'Day 1', title: 'Company policies and handbook acknowledgement', ownerRole: 'EMPLOYEE', offsetDays: 0 },
  { stage: 'Day 1', title: 'Orientation session attendance', ownerRole: 'HR_OFFICER', offsetDays: 0 },
  { stage: 'Week 1', title: 'Department induction and buddy assignment', ownerRole: 'DEPARTMENT_HEAD', offsetDays: 7 },
  { stage: 'Week 1', title: 'Mandatory training (information security, data protection)', ownerRole: 'EMPLOYEE', offsetDays: 7 },
  { stage: 'Month 1', title: 'Set initial objectives', ownerRole: 'DEPARTMENT_HEAD', offsetDays: 30 },
  { stage: 'Probation', title: 'Schedule the probation review', ownerRole: 'DEPARTMENT_HEAD', offsetDays: 30, mandatory: false },
  { stage: 'Close', title: 'Confirm onboarding completion', ownerRole: 'HR_OFFICER', offsetDays: 30 },
];

/** Offboarding (PRD 10.18). Offsets are days from the final working day (negative = before). */
export const OFFBOARDING_TEMPLATE: ChecklistTemplateTask[] = [
  { stage: 'Initiation', title: 'Record exit type, reason and final working day', ownerRole: 'HR_OFFICER', offsetDays: -14 },
  { stage: 'Notice', title: 'Confirm notice period and any waiver or payment in lieu', ownerRole: 'HR_ADMIN', offsetDays: -14 },
  { stage: 'Handover', title: 'Handover of duties, files, relationships and credentials', ownerRole: 'DEPARTMENT_HEAD', offsetDays: -7 },
  { stage: 'Property', title: 'Return company property (laptop, phone, ID and access cards)', ownerRole: 'ASSETS', offsetDays: 0 },
  { stage: 'Access', title: 'Revoke email and system access', ownerRole: 'IT', offsetDays: 0 },
  { stage: 'Access', title: 'Revoke building access and shared accounts', ownerRole: 'IT', offsetDays: 0 },
  { stage: 'Exit interview', title: 'Hold the exit interview', ownerRole: 'HR_OFFICER', offsetDays: -3, mandatory: false },
  { stage: 'Clearance', title: 'Finance clearance: outstanding payments, loans, advances; final pay instruction', ownerRole: 'FINANCE', offsetDays: 0 },
  { stage: 'Clearance', title: 'HR clearance sign-off', ownerRole: 'HR_ADMIN', offsetDays: 2 },
  { stage: 'Documentation', title: 'Issue certificate of service and reference letter', ownerRole: 'HR_OFFICER', offsetDays: 2, mandatory: false },
  { stage: 'Closure', title: 'Record rehire eligibility and archive the record', ownerRole: 'HR_ADMIN', offsetDays: 5 },
];

// ── Sensitive fields ─────────────────────────────────────────────────────────

export const SENSITIVE_FIELDS = ['nin', 'tin', 'rsaPin', 'nhfNo', 'bankAccountNo'] as const;
export type SensitiveField = (typeof SENSITIVE_FIELDS)[number];

/** ******1234: never enough to use the number, enough to recognise it. */
export const maskValue = (plain: string): string => (plain.length <= 4 ? '****' : `${'*'.repeat(Math.max(4, plain.length - 4))}${plain.slice(-4)}`);

export const isNin = (v: string): boolean => /^\d{11}$/.test(v);

export const fullName = (e: { title?: string | null; firstName: string; middleName?: string | null; lastName: string }, withTitle = false): string =>
  [withTitle ? e.title : null, e.firstName, e.middleName, e.lastName].filter(Boolean).join(' ');

export const tenureYears = (hireYmd: string, endYmd: string): number => Math.max(0, daysBetween(hireYmd, endYmd) / 365.25);

/** Nigerian numbers to E.164 (+234...). Anything else must already start with +. Returns null when it cannot be read. */
export const normalisePhone = (raw: string): string | null => {
  const s = raw.replace(/[\s()-]/g, '');
  if (/^\+\d{8,15}$/.test(s)) return s;
  if (/^0\d{10}$/.test(s)) return `+234${s.slice(1)}`;
  if (/^234\d{10}$/.test(s)) return `+${s}`;
  return null;
};

// ── Phase 5: workforce planning ──────────────────────────────────────────────

export interface StaffingLine { planned: number; actual: number; openVacancies: number }
/** Gap against plan. Positive = short of plan; hiring in progress is shown separately, never netted off the gap. */
export const staffingGap = (l: StaffingLine): { gap: number; toRecruit: number; state: 'ON_PLAN' | 'SHORT' | 'OVER' } => {
  const gap = l.planned - l.actual;
  return { gap, toRecruit: Math.max(0, gap - l.openVacancies), state: gap === 0 ? 'ON_PLAN' : gap > 0 ? 'SHORT' : 'OVER' };
};

export const READINESS = ['READY_NOW', 'ONE_TO_TWO_YEARS', 'THREE_PLUS_YEARS'] as const;
/** Exposed when nobody is ready now and the seat is critical (or nobody is named at all); thin when cover is a single person. */
export const successionRisk = (criticality: string, successors: { readiness: string }[]): 'COVERED' | 'THIN' | 'EXPOSED' => {
  const ready = successors.filter((s) => s.readiness === 'READY_NOW').length;
  if (ready >= 2 || (ready === 1 && criticality !== 'HIGH')) return 'COVERED';
  if (ready === 1) return 'THIN';
  return successors.length === 0 || criticality === 'HIGH' ? 'EXPOSED' : 'THIN';
};
