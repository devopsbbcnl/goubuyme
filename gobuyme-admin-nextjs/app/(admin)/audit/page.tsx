'use client';
import { useState, useEffect } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';

type ActionType =
  | 'VENDOR_APPROVED' | 'VENDOR_REGISTERED' | 'VENDOR_SUSPENDED'
  | 'RIDER_APPROVED' | 'RIDER_SUSPENDED'
  | 'ORDER_CANCELLED' | 'ORDER_DELIVERED'
  | 'OFFER_CREATED' | 'SETTINGS_UPDATED' | 'PAYOUT_SENT';

interface AuditLog {
  id: string;
  action: ActionType;
  entity: string;
  entityId: string;
  adminId: string;
  meta: Record<string, unknown> | string | null;
  createdAt: string;
}

const formatMeta = (meta: AuditLog['meta']): string => {
  if (!meta) return '';
  if (typeof meta === 'string') return meta;
  return Object.entries(meta)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => `${k.replace(/([A-Z])/g, ' $1').trim()}: ${v}`)
    .join(' · ');
};

const timeAgo = (iso: string) => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diffMs / 60_000);
  const h = Math.floor(diffMs / 3_600_000);
  const d = Math.floor(h / 24);
  if (d >= 1) return `${d} day${d !== 1 ? 's' : ''} ago`;
  if (h >= 1) return `${h} hr ago`;
  if (m >= 1) return `${m} min ago`;
  return 'Just now';
};

export default function AuditPage() {
  const { theme: T } = useTheme();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ data: AuditLog[] }>('/admin/audit')
      .then(res => setLogs(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const actionColor: Partial<Record<ActionType, string>> & { default: string } = {
    VENDOR_APPROVED:   T.success,
    VENDOR_REGISTERED: T.textSec,
    VENDOR_SUSPENDED:  T.error,
    RIDER_APPROVED:    T.success,
    RIDER_SUSPENDED:   T.warning,
    ORDER_CANCELLED:   T.error,
    ORDER_DELIVERED:   T.success,
    OFFER_CREATED:     T.info,
    SETTINGS_UPDATED:  T.info,
    PAYOUT_SENT:       T.success,
    default:           T.textSec,
  };

  const actionBg: Partial<Record<ActionType, string>> & { default: string } = {
    VENDOR_APPROVED:   T.successBg,
    VENDOR_REGISTERED: T.surface3,
    VENDOR_SUSPENDED:  T.errorBg,
    RIDER_APPROVED:    T.successBg,
    RIDER_SUSPENDED:   T.warningBg,
    ORDER_CANCELLED:   T.errorBg,
    ORDER_DELIVERED:   T.successBg,
    OFFER_CREATED:     T.infoBg,
    SETTINGS_UPDATED:  T.infoBg,
    PAYOUT_SENT:       T.successBg,
    default:           T.surface3,
  };

  const getColor = (action: string) => actionColor[action as ActionType] ?? actionColor.default;
  const getBg = (action: string) => actionBg[action as ActionType] ?? actionBg.default;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: 20, fontWeight: 800, color: T.text }}>Audit Logs</div>
        <div style={{ fontSize: 13, color: T.textSec, marginTop: 2 }}>
          {loading ? 'Loading…' : `${logs.length} recent events`}
        </div>
      </div>

      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '32px 20px', textAlign: 'center', fontSize: 13, color: T.textSec }}>Loading…</div>
        ) : logs.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center', fontSize: 13, color: T.textSec }}>No audit logs found.</div>
        ) : logs.map((log, i) => (
          <div key={log.id} style={{
            display: 'flex', alignItems: 'flex-start', gap: 16, padding: '16px 20px',
            borderTop: i > 0 ? `1px solid ${T.border}` : 'none',
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 6,
              background: getColor(log.action),
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: 11, fontWeight: 700,
                  color: getColor(log.action),
                  background: getBg(log.action),
                  borderRadius: 4, padding: '2px 8px', whiteSpace: 'nowrap',
                }}>{log.action.replace(/_/g, ' ')}</span>
                <span style={{ fontSize: 12, color: T.textMuted }}>
                  {log.entity} <span style={{ color: T.primary, fontWeight: 600 }}>#{log.entityId}</span>
                </span>
              </div>
              <div style={{ fontSize: 13, color: T.textSec, marginTop: 5, lineHeight: 1.4 }}>{formatMeta(log.meta)}</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 11, color: T.textMuted, whiteSpace: 'nowrap' }}>{timeAgo(log.createdAt)}</div>
              <div style={{ fontSize: 11, color: T.textSec, marginTop: 3 }}>by {log.adminId}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
