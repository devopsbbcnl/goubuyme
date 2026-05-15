import { useTheme } from '@/context/ThemeContext';

type Status =
  | 'APPROVED' | 'PENDING' | 'REJECTED' | 'SUSPENDED'
  | 'DELIVERED' | 'IN_TRANSIT' | 'PREPARING' | 'CANCELLED'
  | 'CONFIRMED' | 'READY' | 'PICKED_UP'
  | 'PAID' | 'FAILED' | 'REFUNDED'
  | 'ONLINE' | 'OFFLINE'
  | 'AVAILABLE' | 'UNAVAILABLE';

export function Badge({ status }: { status: Status }) {
  const { theme: T } = useTheme();

  const map: Record<string, { color: string; bg: string; label: string }> = {
    APPROVED:   { color: T.success, bg: T.successBg, label: 'Approved' },
    PENDING:    { color: T.warning, bg: T.warningBg, label: 'Pending' },
    REJECTED:   { color: T.error,   bg: T.errorBg,   label: 'Rejected' },
    SUSPENDED:  { color: T.error,   bg: T.errorBg,   label: 'Suspended' },
    DELIVERED:  { color: T.success, bg: T.successBg, label: 'Delivered' },
    IN_TRANSIT: { color: T.info,    bg: T.infoBg,    label: 'In Transit' },
    PREPARING:  { color: T.warning, bg: T.warningBg, label: 'Preparing' },
    CANCELLED:  { color: T.error,   bg: T.errorBg,   label: 'Cancelled' },
    CONFIRMED:  { color: T.info,    bg: T.infoBg,    label: 'Confirmed' },
    READY:      { color: T.info,    bg: T.infoBg,    label: 'Ready' },
    PICKED_UP:  { color: T.info,    bg: T.infoBg,    label: 'Picked Up' },
    PAID:       { color: T.success, bg: T.successBg, label: 'Paid' },
    FAILED:     { color: T.error,   bg: T.errorBg,   label: 'Failed' },
    REFUNDED:   { color: T.info,    bg: T.infoBg,    label: 'Refunded' },
    ONLINE:     { color: T.success, bg: T.successBg, label: 'Online' },
    OFFLINE:    { color: T.textSec, bg: T.surface3,  label: 'Offline' },
    AVAILABLE:  { color: T.success, bg: T.successBg, label: 'Available' },
    UNAVAILABLE:{ color: T.textSec, bg: T.surface3,  label: 'Unavailable' },
  };

  const cfg = map[status] ?? map.PENDING;

  return (
    <span style={{
      fontSize: 11, fontWeight: 700, color: cfg.color,
      background: cfg.bg, borderRadius: 4,
      padding: '3px 9px', whiteSpace: 'nowrap',
    }}>
      {cfg.label}
    </span>
  );
}
