import { useTheme } from '@/context/ThemeContext';

export interface OtherRole {
  role: 'CUSTOMER' | 'VENDOR' | 'RIDER';
  /** ACTIVE for a customer, otherwise the profile's approval status. */
  status: string;
}

const LABEL: Record<OtherRole['role'], string> = { CUSTOMER: 'Customer', VENDOR: 'Vendor', RIDER: 'Rider' };

/**
 * One GoBuyMe account can be a customer, a vendor and a rider. This marks the other roles the same
 * account holds, so staff see one person rather than two unrelated rows. A role that is not
 * approved is shown with its standing (e.g. "Rider · Suspended") so it is not mistaken for live.
 */
export function OtherRoles({ roles }: { roles?: OtherRole[] }) {
  const { theme: T } = useTheme();
  if (!roles || roles.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 3 }}>
      <span style={{ fontSize: 10, color: T.textMuted, alignSelf: 'center' }}>Also</span>
      {roles.map(r => {
        const live = r.status === 'ACTIVE' || r.status === 'APPROVED';
        return (
          <span
            key={r.role}
            title={`This account is also a ${LABEL[r.role].toLowerCase()}${live ? '' : ` (${r.status.toLowerCase()})`}`}
            style={{
              fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 999,
              color: live ? T.info : T.warning, background: live ? T.infoBg : T.warningBg,
            }}
          >
            {LABEL[r.role]}{live ? '' : ` · ${r.status.charAt(0)}${r.status.slice(1).toLowerCase()}`}
          </span>
        );
      })}
    </div>
  );
}
