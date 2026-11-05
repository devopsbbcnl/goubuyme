'use client';
// Shared pieces for the SMOIS (social media operations) pages.
import { createContext, useContext, useEffect, useState, ReactNode, CSSProperties } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';

// ── Access context ───────────────────────────────────────────────────────────

export interface SmoisMe {
  user: { id: string; name: string; email: string; role: string };
  level: 'SUPER' | 'MANAGEMENT' | 'MANAGER' | 'REVIEWER' | 'VIEWER';
  memberId: string | null;
  canEmergencyPublish: boolean;
  unreadNotifications: number;
  can: Record<'createContent' | 'approve' | 'publish' | 'manageTasks' | 'completeTasks' | 'manageAccounts' | 'manageTeam' | 'configure' | 'viewAll' | 'viewActivity' | 'viewAnalytics' | 'recordMetrics' | 'correctMetrics' | 'manageTargets' | 'viewPerformance' | 'reviewReports' | 'handleInbox' | 'manageCampaigns' | 'viewCampaigns' | 'manageListening', boolean>;
}
export interface Person { memberId: string | null; userId: string; name: string; role: string; canApprove: boolean; canPublish: boolean }

interface Ctx { me: SmoisMe | null; people: Person[]; reloadMe: () => void }
const SmoisContext = createContext<Ctx>({ me: null, people: [], reloadMe: () => {} });
export const useSmois = () => useContext(SmoisContext);

export function SmoisProvider({ children, fallback }: { children: ReactNode; fallback: (state: 'loading' | 'denied') => ReactNode }) {
  const [me, setMe] = useState<SmoisMe | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [state, setState] = useState<'loading' | 'ok' | 'denied'>('loading');
  const load = () => {
    api.get<{ data: SmoisMe }>('/admin/smois/me')
      .then((r) => { setMe(r.data); setState('ok'); })
      .catch(() => setState('denied'));
  };
  useEffect(() => {
    load();
    api.get<{ data: Person[] }>('/admin/smois/people').then((r) => setPeople(r.data)).catch(() => {});
  }, []);
  if (state !== 'ok') return <>{fallback(state)}</>;
  return <SmoisContext.Provider value={{ me, people, reloadMe: load }}>{children}</SmoisContext.Provider>;
}

// ── Formatting ───────────────────────────────────────────────────────────────

export const fmtDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
export const pretty = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
export const toLocalInput = (iso?: string | null) => {
  const d = iso ? new Date(iso) : new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
export const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

export const PLATFORMS = ['FACEBOOK', 'INSTAGRAM', 'LINKEDIN', 'X', 'TIKTOK', 'YOUTUBE', 'WHATSAPP', 'PINTEREST', 'THREADS', 'OTHER'] as const;
export const PLATFORM_ICON: Record<string, string> = {
  FACEBOOK: 'f', INSTAGRAM: '◎', LINKEDIN: 'in', X: '𝕏', TIKTOK: '♪', YOUTUBE: '▶', WHATSAPP: '✆', PINTEREST: 'P', THREADS: '@', OTHER: '•',
};
export const FORMATS = ['TEXT', 'IMAGE', 'CAROUSEL', 'VIDEO', 'REEL', 'STORY', 'POLL', 'LINK', 'DOCUMENT'] as const;

// ── Status colours ───────────────────────────────────────────────────────────

type Tone = 'neutral' | 'info' | 'warn' | 'good' | 'bad' | 'brand';
export const STATUS_TONE: Record<string, Tone> = {
  IDEA: 'neutral', PLANNED: 'neutral', BRIEFED: 'neutral', IN_PRODUCTION: 'info', SUBMITTED: 'warn', RESUBMITTED: 'warn',
  REVISION_REQUESTED: 'bad', APPROVED: 'good', REJECTED: 'bad', SCHEDULED: 'brand', PUBLISHING: 'info', PUBLISHED: 'good',
  PUBLISH_FAILED: 'bad', ARCHIVED: 'neutral', CANCELLED: 'neutral',
  PENDING: 'neutral', ACCEPTED: 'info', IN_PROGRESS: 'info', UNDER_REVIEW: 'warn', REVISION_REQUIRED: 'bad', COMPLETED: 'good',
  LOW: 'neutral', NORMAL: 'info', HIGH: 'warn', URGENT: 'bad',
  MANUAL: 'neutral', CONNECTED: 'good', EXPIRED: 'warn', DISCONNECTED: 'bad', ERROR: 'bad',
};

export function useTones() {
  const { theme: T } = useTheme();
  return {
    neutral: { c: T.textSec, bg: T.surface2 }, info: { c: T.info, bg: T.infoBg }, warn: { c: T.warning, bg: T.warningBg },
    good: { c: T.success, bg: T.successBg }, bad: { c: T.error, bg: T.errorBg }, brand: { c: T.primary, bg: T.primaryTint },
  } as Record<Tone, { c: string; bg: string }>;
}

export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  const t = useTones()[tone];
  return <span style={{ fontSize: 11, fontWeight: 700, color: t.c, background: t.bg, borderRadius: 4, padding: '3px 8px', whiteSpace: 'nowrap' }}>{children}</span>;
}
export const StatusPill = ({ status }: { status: string }) => <Pill tone={STATUS_TONE[status] ?? 'neutral'}>{pretty(status)}</Pill>;
export const PlatformTag = ({ platform, name }: { platform: string; name?: string }) => {
  const { theme: T } = useTheme();
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: T.text }}>
      <span style={{ width: 20, height: 20, borderRadius: 4, background: T.surface3, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800 }}>{PLATFORM_ICON[platform] ?? '•'}</span>
      {name ?? pretty(platform)}
    </span>
  );
};

// ── Layout ───────────────────────────────────────────────────────────────────

export function PageHeader({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  const { theme: T } = useTheme();
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
      <div>
        <div style={{ fontSize: 20, fontWeight: 800, color: T.text }}>{title}</div>
        {sub && <div style={{ fontSize: 13, color: T.textSec, marginTop: 3, maxWidth: 680 }}>{sub}</div>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{actions}</div>}
    </div>
  );
}

export function Card({ children, style, title, right }: { children: ReactNode; style?: CSSProperties; title?: string; right?: ReactNode }) {
  const { theme: T } = useTheme();
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, padding: 16, ...style }}>
      {(title || right) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8 }}>
          {title && <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>{title}</div>}
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

export function Btn({ children, onClick, kind = 'secondary', disabled, small, type = 'button', style }: {
  children: ReactNode; onClick?: () => void; kind?: 'primary' | 'secondary' | 'danger' | 'ghost'; disabled?: boolean; small?: boolean; type?: 'button' | 'submit'; style?: CSSProperties;
}) {
  const { theme: T } = useTheme();
  const k = {
    primary: { background: T.primary, color: '#fff', border: `1px solid ${T.primary}` },
    secondary: { background: T.surface2, color: T.text, border: `1px solid ${T.border}` },
    danger: { background: T.errorBg, color: T.error, border: `1px solid ${T.error}` },
    ghost: { background: 'transparent', color: T.textSec, border: '1px solid transparent' },
  }[kind];
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={{
      ...k, borderRadius: 4, padding: small ? '5px 10px' : '9px 16px', fontSize: small ? 12 : 13, fontWeight: 700,
      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1, fontFamily: 'inherit', whiteSpace: 'nowrap', ...style,
    }}>{children}</button>
  );
}

const fieldBase = (T: ReturnType<typeof useTheme>['theme']): CSSProperties => ({
  width: '100%', boxSizing: 'border-box', background: T.surface2, color: T.text, border: `1px solid ${T.border}`,
  borderRadius: 4, padding: '9px 11px', fontSize: 13, fontFamily: 'inherit', outline: 'none',
});

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  const { theme: T } = useTheme();
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.textSec, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      {children}
      {hint && <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>{hint}</div>}
    </label>
  );
}
export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { theme: T } = useTheme();
  return <input {...props} style={{ ...fieldBase(T), ...(props.style ?? {}) }} />;
}
export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { theme: T } = useTheme();
  return <textarea rows={4} {...props} style={{ ...fieldBase(T), resize: 'vertical', ...(props.style ?? {}) }} />;
}
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { theme: T } = useTheme();
  return <select {...props} style={{ ...fieldBase(T), ...(props.style ?? {}) }} />;
}

export function Notice({ kind = 'info', children }: { kind?: 'info' | 'warn' | 'error' | 'success'; children: ReactNode }) {
  const t = useTones()[{ info: 'info', warn: 'warn', error: 'bad', success: 'good' }[kind] as Tone];
  return <div style={{ background: t.bg, color: t.c, borderRadius: 4, padding: '9px 12px', fontSize: 12, fontWeight: 600, marginBottom: 12, lineHeight: 1.5 }}>{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  const { theme: T } = useTheme();
  return <div style={{ padding: '28px 12px', textAlign: 'center', color: T.textSec, fontSize: 13 }}>{children}</div>;
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; label: string; badge?: number }[] }) {
  const { theme: T } = useTheme();
  return (
    <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${T.border}`, marginBottom: 16, overflowX: 'auto' }}>
      {items.map((i) => (
        <button key={i.id} onClick={() => onChange(i.id)} style={{
          background: 'none', border: 'none', borderBottom: `2px solid ${value === i.id ? T.primary : 'transparent'}`,
          color: value === i.id ? T.primary : T.textSec, fontWeight: value === i.id ? 800 : 600, fontSize: 13, padding: '9px 14px',
          cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
        }}>
          {i.label}{!!i.badge && <span style={{ marginLeft: 6, background: T.warning, color: '#fff', borderRadius: 999, padding: '1px 7px', fontSize: 11 }}>{i.badge}</span>}
        </button>
      ))}
    </div>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  const { theme: T } = useTheme();
  return (
    <div style={{ overflowX: 'auto', border: `1px solid ${T.border}`, borderRadius: 4, background: T.surface }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>{head.map((h, i) => <th key={`${h}-${i}`} style={{ textAlign: 'left', padding: '10px 12px', fontSize: 11, fontWeight: 700, color: T.textSec, textTransform: 'uppercase', letterSpacing: 0.4, borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' }}>{h}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
export function Td({ children, style, onClick, title }: { children?: ReactNode; style?: CSSProperties; onClick?: () => void; title?: string }) {
  const { theme: T } = useTheme();
  return <td onClick={onClick} title={title} style={{ padding: '10px 12px', borderBottom: `1px solid ${T.border}`, color: T.text, verticalAlign: 'top', ...style }}>{children}</td>;
}

export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  const { theme: T } = useTheme();
  if (pages <= 1) return null;
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'flex-end', marginTop: 12, fontSize: 12, color: T.textSec }}>
      <Btn small disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Btn>
      Page {page} of {pages}
      <Btn small disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</Btn>
    </div>
  );
}

/** Run an async action, surfacing the error message. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true); setError('');
    try { return await fn(); } catch (e) { setError((e as Error).message); return undefined; } finally { setBusy(false); }
  };
  return { busy, error, setError, run };
}

/** Load data on mount and whenever `deps` change. */
export function useLoad<T>(loader: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    loader().then((d) => { if (live) { setData(d); setError(''); } }).catch((e) => { if (live) setError((e as Error).message); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, loading, error, reload: () => setTick((t) => t + 1) };
}

// ── Phase 2 helpers ──────────────────────────────────────────────────────────

/** A figure that may not have been recorded: shows "Not recorded", never a misleading 0. */
export const num = (v: number | null | undefined, suffix = '') =>
  v === null || v === undefined ? 'Not recorded' : `${v.toLocaleString('en-NG', { maximumFractionDigits: 2 })}${suffix}`;

/** Change versus the previous period; says "no comparison" when there is nothing honest to compare. */
export function Delta({ pct }: { pct: number | null | undefined }) {
  const { theme: T } = useTheme();
  if (pct === null || pct === undefined) return <span style={{ fontSize: 11, color: T.textMuted }}>no comparison</span>;
  const up = pct > 0; const flat = pct === 0;
  return <span style={{ fontSize: 11, fontWeight: 700, color: flat ? T.textSec : up ? T.success : T.error }}>{flat ? '–' : up ? '▲' : '▼'} {Math.abs(pct)}%</span>;
}

export function Stat({ label, value, sub, delta }: { label: string; value: ReactNode; sub?: ReactNode; delta?: number | null }) {
  const { theme: T } = useTheme();
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.textSec, textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: T.text, marginTop: 6 }}>{value}</div>
      <div style={{ marginTop: 4, display: 'flex', gap: 8, alignItems: 'center', minHeight: 16 }}>{delta !== undefined && <Delta pct={delta} />}{sub && <span style={{ fontSize: 11, color: T.textSec }}>{sub}</span>}</div>
    </div>
  );
}

/** Minimal SVG line chart. Gaps (null) break the line, so unrecorded days are visibly empty. */
export function LineChart({ points, height = 140 }: { points: { label: string; value: number | null }[]; height?: number }) {
  const { theme: T } = useTheme();
  const vals = points.map((p) => p.value).filter((v): v is number => v !== null);
  if (vals.length < 2) return <Empty>Not enough readings to draw a trend yet.</Empty>;
  const W = 600; const H = height; const pad = 6;
  const min = Math.min(...vals); const max = Math.max(...vals); const span = max - min || 1;
  const x = (i: number) => pad + (i / Math.max(1, points.length - 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - ((v - min) / span) * (H - pad * 2 - 14);
  let d = ''; let pen = false;
  points.forEach((p, i) => { if (p.value === null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)} `; pen = true; });
  const last = [...points].reverse().find((p) => p.value !== null);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img" aria-label="Follower trend">
        <path d={d} fill="none" stroke={T.primary} strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.textSec }}>
        <span>{points[0].label} · low {min.toLocaleString()}</span><span>high {max.toLocaleString()} · latest {last?.value?.toLocaleString()}</span>
      </div>
    </div>
  );
}

/**
 * Image preview that degrades gracefully. The site only loads images from approved hosts (Cloudinary and a few
 * others), so a link pasted from elsewhere still works as a link but cannot be previewed here.
 */
export function Thumb({ src, alt, style }: { src: string; alt: string; style?: CSSProperties }) {
  const { theme: T } = useTheme();
  const [bad, setBad] = useState(false);
  if (bad) {
    return (
      <span title="This image is hosted somewhere the admin site does not preview. The link still works." style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 4, color: T.textMuted, fontSize: 11, textAlign: 'center', padding: 6 }}>
        <span style={{ fontSize: 26 }}>🖼️</span>No preview
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} onError={() => setBad(true)} style={style} />;
}
