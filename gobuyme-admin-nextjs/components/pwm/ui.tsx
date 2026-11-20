'use client';
// Shared pieces for the People & Workforce (PWM) pages. Generic building blocks come from the SMOIS kit so the
// whole console looks the same; only the access context, status colours and HR helpers live here.
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { Pill } from '@/components/smois/ui';

export {
  Btn, Card, Empty, Field, Input, Notice, PageHeader, Pager, Pill, Select, Stat, Table, Tabs, Td, TextArea,
  fmtDate, fmtDateTime, pretty, useAction, useLoad,
} from '@/components/smois/ui';

// ── Access context ───────────────────────────────────────────────────────────

export type PwmCap =
  | 'view' | 'viewRestricted' | 'viewHighlyRestricted' | 'manageEmployees' | 'manageOrganisation' | 'manageContracts' | 'approveContracts' | 'recommend' | 'decide'
  | 'changeStatus' | 'approveStatus' | 'manageChecklists' | 'viewCompensation' | 'manageCompensation' | 'approveCompensation' | 'viewReminders' | 'manageReminders'
  | 'configure' | 'manageTeam' | 'viewAudit' | 'import' | 'viewRecruitment' | 'manageRecruitment' | 'approveVacancies' | 'manageTemplates' | 'managePolicies' | 'manageAnnouncements' | 'viewExitInterviews' | 'viewLeave' | 'manageLeave' | 'configureLeave' | 'viewAttendance' | 'manageAttendance' | 'viewPerformance' | 'managePerformance' | 'viewLearning' | 'manageLearning' | 'viewAssets' | 'manageAssets' | 'createCases' | 'handleCases' | 'viewERReports' | 'manageSurveys' | 'viewSurveyResults' | 'manageRecognition' | 'viewExpenses' | 'payExpenses' | 'viewAnalytics' | 'viewPlanning' | 'managePlanning' | 'approvePlanning' | 'viewSuccession' | 'manageSuccession';

export interface PwmMe {
  user: { id: string; name: string; email: string; role: string };
  level: string;
  memberId: string | null;
  isMd: boolean;
  employeeId: string | null;
  headedDepartmentIds: string[];
  unacknowledged: number;
  can: Record<PwmCap, boolean>;
}
export interface Person { userId: string; name: string; role: string }

interface Ctx { me: PwmMe | null; people: Person[]; reloadMe: () => void }
const PwmContext = createContext<Ctx>({ me: null, people: [], reloadMe: () => {} });
export const usePwm = () => useContext(PwmContext);

export function PwmProvider({ children, fallback }: { children: ReactNode; fallback: (state: 'loading' | 'denied') => ReactNode }) {
  const [me, setMe] = useState<PwmMe | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [state, setState] = useState<'loading' | 'ok' | 'denied'>('loading');
  const load = () => {
    api.get<{ data: PwmMe }>('/admin/pwm/me').then((r) => { setMe(r.data); setState('ok'); }).catch(() => setState('denied'));
  };
  useEffect(() => {
    load();
    api.get<{ data: Person[] }>('/admin/pwm/people').then((r) => setPeople(r.data)).catch(() => {});
  }, []);
  if (state !== 'ok') return <>{fallback(state)}</>;
  return <PwmContext.Provider value={{ me, people, reloadMe: load }}>{children}</PwmContext.Provider>;
}

// ── Status colours ───────────────────────────────────────────────────────────

type Tone = 'neutral' | 'info' | 'warn' | 'good' | 'bad' | 'brand';

export const EMP_STATUS_TONE: Record<string, Tone> = {
  PENDING_ONBOARDING: 'info', PROBATION: 'warn', ACTIVE: 'good', RENEWAL_PENDING: 'warn', CONTRACT_ISSUED: 'info', ON_LEAVE: 'neutral', SUSPENDED: 'bad',
  NOTICE_PERIOD: 'warn', CONTRACT_EXPIRED: 'bad', RESIGNED: 'neutral', TERMINATED: 'neutral', ARCHIVED: 'neutral',
};
export const CONTRACT_STATUS_TONE: Record<string, Tone> = {
  DRAFT: 'neutral', PENDING_APPROVAL: 'warn', APPROVED: 'info', ISSUED: 'info', SIGNED: 'info', ACTIVE: 'good', RENEWAL_PENDING: 'warn',
  EXPIRED_ACTION_REQUIRED: 'bad', EXPIRED: 'neutral', NOT_RENEWED: 'neutral', SUPERSEDED: 'neutral', TERMINATED_EARLY: 'neutral', DECLINED: 'bad', CANCELLED: 'neutral', ARCHIVED: 'neutral',
};
export const CONTRACT_STATUS_LABEL: Record<string, string> = {
  EXPIRED_ACTION_REQUIRED: 'Expired - action required', RENEWAL_PENDING: 'Renewal pending', PENDING_APPROVAL: 'Pending approval', NOT_RENEWED: 'Not renewed', TERMINATED_EARLY: 'Terminated early',
};
export const STEP_LABEL: Record<string, string> = {
  RECOMMENDATION: 'Recommendation', DECISION: 'Management decision', PREPARATION: 'Prepare contract', ISSUANCE: 'Issue contract', SIGNATURE: 'Signature', COMPLETED: 'Completed', CLOSED: 'Closed',
};
export const DECISION_LABEL: Record<string, string> = {
  RENEW_SAME_TERMS: 'Renew on the same terms', RENEW_WITH_CHANGES: 'Renew with changes', EXTEND: 'Extend', CONVERT_TO_PERMANENT: 'Convert to permanent', DO_NOT_RENEW: 'Do not renew', OTHER: 'Other arrangement',
};

export const label = (s: string | null | undefined) => (s ? s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : '—');

export const EmpStatusPill = ({ status }: { status: string }) => <Pill tone={EMP_STATUS_TONE[status] ?? 'neutral'}>{label(status)}</Pill>;
export const ContractStatusPill = ({ status }: { status: string }) => <Pill tone={CONTRACT_STATUS_TONE[status] ?? 'neutral'}>{CONTRACT_STATUS_LABEL[status] ?? label(status)}</Pill>;

/** Days to expiry, always as text as well as colour (PRD 10.5). */
export function Days({ days }: { days: number | null | undefined }) {
  if (days === null || days === undefined) return <Pill>No expiry</Pill>;
  if (days < 0) return <Pill tone="bad">{Math.abs(days)} day{Math.abs(days) === 1 ? '' : 's'} overdue</Pill>;
  if (days === 0) return <Pill tone="bad">Expires today</Pill>;
  return <Pill tone={days <= 7 ? 'bad' : days <= 30 ? 'warn' : 'neutral'}>{days} day{days === 1 ? '' : 's'} left</Pill>;
}

export function SlaPill({ sla }: { sla: string }) {
  const tone: Tone = sla === 'OVERDUE' ? 'bad' : sla === 'DUE_SOON' ? 'warn' : sla === 'DONE' ? 'good' : 'neutral';
  return <Pill tone={tone}>{sla === 'OVERDUE' ? 'Overdue' : sla === 'DUE_SOON' ? 'Due soon' : sla === 'DONE' ? 'Done' : 'On track'}</Pill>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** YYYY-MM-DD from an ISO timestamp or date, for <input type="date">. */
export const dateInput = (iso?: string | null) => (iso ? iso.slice(0, 10) : '');

export const todayYmd = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date());

export const fullName = (e: { firstName: string; middleName?: string | null; lastName: string }) => [e.firstName, e.middleName, e.lastName].filter(Boolean).join(' ');

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/** Download a CSV from the API through the same-origin proxy. */
export async function downloadCsv(path: string, fallbackName: string) {
  const res = await fetch(`/api/proxy${path}`);
  if (!res.ok) throw new Error('Could not export. You may not have permission.');
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fallbackName;
  a.click();
  URL.revokeObjectURL(a.href);
}

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? '';
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? '';

/** Upload a PDF or image and return its link plus a SHA-256 checksum (stored so a changed file is detectable). */
export async function uploadDocument(file: File): Promise<{ url: string; checksum: string }> {
  if (!CLOUD_NAME || !UPLOAD_PRESET) throw new Error('File uploads are not configured on this site.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Files must be 10 MB or smaller.');
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buf);
  const checksum = Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
  const form = new FormData();
  form.append('file', file);
  form.append('upload_preset', UPLOAD_PRESET);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`, { method: 'POST', body: form }).catch(() => null);
  const data = (await res?.json().catch(() => ({}))) as { secure_url?: string; error?: { message?: string } } | undefined;
  if (!res || !res.ok || !data?.secure_url) throw new Error(`Upload failed: ${data?.error?.message ?? 'network error'}`);
  return { url: data.secure_url, checksum };
}

/** A small form-row grid. */
export function Grid({ cols = 2, children }: { cols?: number; children: ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${cols >= 3 ? 170 : 230}px, 1fr))`, gap: 12 }}>{children}</div>;
}

export function Muted({ children }: { children: ReactNode }) {
  const { theme: T } = useTheme();
  return <span style={{ color: T.textMuted, fontSize: 12 }}>{children}</span>;
}

export function PersonSelect({ value, onChange, allowEmpty = true }: { value: string; onChange: (v: string) => void; allowEmpty?: boolean }) {
  const { people } = usePwm();
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', fontSize: 13, borderRadius: 4, fontFamily: 'inherit' }}>
      {allowEmpty && <option value="">Not set</option>}
      {people.map((p) => <option key={p.userId} value={p.userId}>{p.name} · {label(p.role)}</option>)}
    </select>
  );
}
