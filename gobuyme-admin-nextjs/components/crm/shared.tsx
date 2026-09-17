'use client';
import { useTheme } from '@/context/ThemeContext';

export type CrmRole = 'CUSTOMER' | 'VENDOR' | 'RIDER';
export type LifecycleStage = 'NEW' | 'ACTIVE' | 'AT_RISK' | 'CHURNED';

export interface CrmTag {
  id: string;
  name: string;
  color: string;
  userCount?: number;
}

export const fmtNaira = (n: number) => `₦${Math.round(n).toLocaleString()}`;

export const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

export const fmtRelative = (iso: string | null) => {
  if (!iso) return 'Never';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
};

export const ROLE_LABEL: Record<CrmRole, string> = { CUSTOMER: 'Customer', VENDOR: 'Vendor', RIDER: 'Rider' };
export const STAGE_LABEL: Record<LifecycleStage, string> = { NEW: 'New', ACTIVE: 'Active', AT_RISK: 'At risk', CHURNED: 'Churned' };

export function RoleBadge({ role }: { role: CrmRole }) {
  const { theme: T } = useTheme();
  const cfg = {
    CUSTOMER: { color: T.info, bg: T.infoBg },
    VENDOR: { color: T.primary, bg: T.primaryTint },
    RIDER: { color: T.success, bg: T.successBg },
  }[role];
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: cfg.color, background: cfg.bg, borderRadius: 4, padding: '3px 9px', whiteSpace: 'nowrap' }}>
      {ROLE_LABEL[role]}
    </span>
  );
}

export function StageBadge({ stage }: { stage: LifecycleStage }) {
  const { theme: T } = useTheme();
  const cfg = {
    NEW: { color: T.info, bg: T.infoBg },
    ACTIVE: { color: T.success, bg: T.successBg },
    AT_RISK: { color: T.warning, bg: T.warningBg },
    CHURNED: { color: T.error, bg: T.errorBg },
  }[stage];
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: cfg.color, background: cfg.bg, borderRadius: 4, padding: '3px 9px', whiteSpace: 'nowrap' }}>
      {STAGE_LABEL[stage]}
    </span>
  );
}

export function TagChip({ tag, onRemove }: { tag: CrmTag; onRemove?: () => void }) {
  const { theme: T } = useTheme();
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontSize: 11, fontWeight: 700, color: T.text,
      background: T.surface2, border: `1px solid ${T.border}`,
      borderRadius: 999, padding: '3px 10px', whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 8, height: 8, borderRadius: 9999, background: tag.color, flexShrink: 0 }} />
      {tag.name}
      {onRemove && (
        <button
          onClick={onRemove}
          aria-label={`Remove tag ${tag.name}`}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: T.textSec, fontSize: 13, lineHeight: 1 }}
        >×</button>
      )}
    </span>
  );
}

/** Small uppercase section heading used throughout the CRM pages. */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  const { theme: T } = useTheme();
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: T.textSec, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
      {children}
    </div>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  const { theme: T } = useTheme();
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, padding: 18, ...style }}>
      {children}
    </div>
  );
}
