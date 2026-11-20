// PWM configuration lives in one settings row (JSON) so HR can change schedules, recipients and rules
// without a code change (PRD principle P2). Anything missing falls back to the defaults below.
import prisma from '../../config/db';
import { ContractTypeRule, DEFAULT_CONTRACT_TYPES, DEFAULT_TIERS, ReminderTier } from './rules';

export interface PwmConfig {
  tiers: ReminderTier[];
  /** Hour (Lagos) from which the daily dispatch may run. */
  sendHour: number;
  /** Unacknowledged action-required reminders escalate after this many hours. */
  ackEscalationHours: number;
  /** T+n repeats every this many working days. */
  repeatEveryWorkingDays: number;
  superAdminAfterWorkingDays: number;
  probationReminderDays: number;
  certificationReminderDays: number;
  documentReminderDays: number;
  /** Public holidays (YYYY-MM-DD) skipped by working-day maths. */
  holidays: string[];
  contractTypes: ContractTypeRule[];
  /** Contract types that need management approval before they can be issued. */
  approvalRequiredTypes: string[];
  employmentTypes: string[];
  employeeIdPrefix: string;
  contractRefPrefix: string;
  /** Send the expiry reminders to the employee too (off by default). */
  employeeRecipientOn: boolean;
  minWorkingAge: number;
  /** Ordinary approvals never allow approving your own submission; this is only for tiny teams. */
  allowSelfApproval: boolean;
  /** Days before the final working day... reserved; offboarding tasks use the template offsets. */
  locations: string[];
  companyName: string;
  /// Ordinary staff can look colleagues up (name, title, department only).
  directoryVisible: boolean;
  monthlyReportOn: boolean;
  vacancyApprovalRequired: boolean;
  /// Candidates who were not hired are anonymised after this many days.
  candidateRetentionDays: number;
  preboardingDays: number;
  /** Expense categories and the most one item may claim without an explanation (0 = no limit). */
  expenseCategories: { key: string; label: string; limit: number }[];
  /** Per-diem rate per travel day, in naira. */
  perDiemRate: number;
  /** Warnings stay live this long, then are marked spent. */
  warningValidityMonths: number;
  /** Survey results appear only for groups at least this big. */
  surveyMinGroup: number;
}

export const DEFAULT_CONFIG: PwmConfig = {
  tiers: DEFAULT_TIERS,
  sendHour: 8,
  ackEscalationHours: 24,
  repeatEveryWorkingDays: 2,
  superAdminAfterWorkingDays: 5,
  probationReminderDays: 14,
  certificationReminderDays: 30,
  documentReminderDays: 30,
  holidays: [],
  contractTypes: DEFAULT_CONTRACT_TYPES,
  approvalRequiredTypes: [],
  employmentTypes: DEFAULT_CONTRACT_TYPES.map((t) => t.key),
  employeeIdPrefix: 'PWM',
  contractRefPrefix: 'CTR',
  employeeRecipientOn: false,
  minWorkingAge: 16,
  allowSelfApproval: false,
  locations: [],
  companyName: 'GoBuyMe',
  directoryVisible: true,
  monthlyReportOn: true,
  vacancyApprovalRequired: true,
  candidateRetentionDays: 365,
  preboardingDays: 14,
  expenseCategories: [
    { key: 'TRANSPORT', label: 'Transport', limit: 50000 }, { key: 'ACCOMMODATION', label: 'Accommodation', limit: 150000 }, { key: 'MEALS', label: 'Meals', limit: 15000 },
    { key: 'COMMUNICATION', label: 'Airtime and data', limit: 20000 }, { key: 'SUPPLIES', label: 'Office supplies', limit: 50000 }, { key: 'OTHER', label: 'Other', limit: 0 },
  ],
  perDiemRate: 15000,
  warningValidityMonths: 12,
  surveyMinGroup: 5,
};

export const getPwmConfig = async (): Promise<PwmConfig> => {
  const row = await prisma.pwmSettings.upsert({ where: { id: 'default' }, create: { id: 'default' }, update: {} });
  return { ...DEFAULT_CONFIG, ...((row.config as Partial<PwmConfig> | null) ?? {}) };
};

/** Next number for a named sequence, atomically (employee numbers and contract references are never reused). */
export const nextNumber = async (key: string): Promise<number> => {
  const row = await prisma.pwmCounter.upsert({ where: { key }, create: { key, value: 1 }, update: { value: { increment: 1 } } });
  return row.value;
};

export const nextEmployeeNo = async (prefix: string, year: number): Promise<string> =>
  `${prefix}-${year}-${String(await nextNumber(`employee:${year}`)).padStart(4, '0')}`;

export const nextContractRef = async (prefix: string, year: number): Promise<string> =>
  `${prefix}-${year}-${String(await nextNumber(`contract:${year}`)).padStart(6, '0')}`;
