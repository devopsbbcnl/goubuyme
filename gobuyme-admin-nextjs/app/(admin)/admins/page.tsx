'use client';
import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: 'SUPER_ADMIN' | 'OPERATIONS_ADMIN' | 'SUPPORT_ADMIN';
  isActive: boolean;
  createdAt: string;
}

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN:      'Super Admin',
  OPERATIONS_ADMIN: 'Operations Admin',
  SUPPORT_ADMIN:    'Support Admin',
};

const ROLE_COLOR: Record<string, string> = {
  SUPER_ADMIN:      '#FF521B',
  OPERATIONS_ADMIN: '#3B82F6',
  SUPPORT_ADMIN:    '#10B981',
};

const ROLE_PERMS: Record<string, string> = {
  SUPER_ADMIN:      'Full access — vendors, riders, payouts, offers, admin users',
  OPERATIONS_ADMIN: 'Approve/reject vendors & riders, manage orders — no payouts',
  SUPPORT_ADMIN:    'Read-only access to all sections',
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });

export default function AdminUsersPage() {
  const { theme: T } = useTheme();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [actionTarget, setActionTarget] = useState<AdminUser | null>(null);
  const [actionType, setActionType] = useState<'role' | 'deactivate' | null>(null);

  // Create form state
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'OPERATIONS_ADMIN' });
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  // Role change state
  const [newRole, setNewRole] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: AdminUser[] }>('/admin/admins');
      setAdmins(res.data ?? []);
    } catch {
      setAdmins([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    setFormError('');
    if (!form.name.trim() || !form.email.trim() || !form.password) {
      setFormError('All fields are required.');
      return;
    }
    setFormLoading(true);
    try {
      await api.post('/admin/admins', form);
      setShowCreate(false);
      setForm({ name: '', email: '', password: '', role: 'OPERATIONS_ADMIN' });
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create admin.');
    } finally {
      setFormLoading(false);
    }
  };

  const handleRoleChange = async () => {
    if (!actionTarget || !newRole) return;
    try {
      await api.patch(`/admin/admins/${actionTarget.id}/role`, { role: newRole });
      setActionTarget(null);
      setActionType(null);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update role.');
    }
  };

  const handleDeactivate = async () => {
    if (!actionTarget) return;
    try {
      await api.del(`/admin/admins/${actionTarget.id}`);
      setActionTarget(null);
      setActionType(null);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to deactivate admin.');
    }
  };

  const inputStyle = {
    width: '100%', boxSizing: 'border-box' as const,
    background: T.surface2, border: `1px solid ${T.border}`,
    borderRadius: 4, padding: '10px 12px',
    color: T.text, fontSize: 13, outline: 'none',
    fontFamily: 'inherit',
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.text }}>Admin Users</div>
          <div style={{ fontSize: 13, color: T.textSec, marginTop: 3 }}>
            Manage who can access this dashboard and what they can do
          </div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{
            background: T.primary, color: '#fff', border: 'none',
            borderRadius: 4, padding: '10px 18px',
            fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}
        >
          + New Admin
        </button>
      </div>

      {/* Role legend */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 24 }}>
        {(['SUPER_ADMIN', 'OPERATIONS_ADMIN', 'SUPPORT_ADMIN'] as const).map(role => (
          <div key={role} style={{
            background: T.surface, border: `1px solid ${T.border}`,
            borderRadius: 4, padding: '14px 16px',
            borderLeft: `3px solid ${ROLE_COLOR[role]}`,
          }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: ROLE_COLOR[role], marginBottom: 4 }}>
              {ROLE_LABEL[role]}
            </div>
            <div style={{ fontSize: 11, color: T.textSec, lineHeight: 1.5 }}>{ROLE_PERMS[role]}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${T.border}`, background: T.surface2 }}>
              {['Name', 'Email', 'Role', 'Status', 'Created', 'Actions'].map(h => (
                <th key={h} style={{ padding: '11px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: T.textSec, letterSpacing: '0.4px' }}>
                  {h.toUpperCase()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: T.textSec, fontSize: 13 }}>Loading…</td></tr>
            ) : admins.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: T.textSec, fontSize: 13 }}>No admin users found.</td></tr>
            ) : admins.map((admin, i) => (
              <tr key={admin.id} style={{ borderBottom: i < admins.length - 1 ? `1px solid ${T.border}` : 'none' }}>
                <td style={{ padding: '13px 16px' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{admin.name}</div>
                </td>
                <td style={{ padding: '13px 16px' }}>
                  <div style={{ fontSize: 13, color: T.textSec }}>{admin.email}</div>
                </td>
                <td style={{ padding: '13px 16px' }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 4,
                    color: ROLE_COLOR[admin.role],
                    background: `${ROLE_COLOR[admin.role]}18`,
                  }}>
                    {ROLE_LABEL[admin.role] ?? admin.role}
                  </span>
                </td>
                <td style={{ padding: '13px 16px' }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 4,
                    color: admin.isActive ? '#10B981' : '#EF4444',
                    background: admin.isActive ? '#10B98118' : '#EF444418',
                  }}>
                    {admin.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td style={{ padding: '13px 16px', fontSize: 12, color: T.textSec }}>
                  {fmtDate(admin.createdAt)}
                </td>
                <td style={{ padding: '13px 16px' }}>
                  {admin.role !== 'SUPER_ADMIN' && admin.isActive && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => { setActionTarget(admin); setNewRole(admin.role); setActionType('role'); }}
                        style={{
                          background: T.surface2, border: `1px solid ${T.border}`,
                          borderRadius: 4, padding: '5px 10px',
                          fontSize: 11, fontWeight: 600, color: T.textSec, cursor: 'pointer',
                        }}
                      >
                        Change Role
                      </button>
                      <button
                        onClick={() => { setActionTarget(admin); setActionType('deactivate'); }}
                        style={{
                          background: '#EF444415', border: `1px solid #EF444440`,
                          borderRadius: 4, padding: '5px 10px',
                          fontSize: 11, fontWeight: 600, color: '#EF4444', cursor: 'pointer',
                        }}
                      >
                        Deactivate
                      </button>
                    </div>
                  )}
                  {admin.role === 'SUPER_ADMIN' && (
                    <span style={{ fontSize: 11, color: T.textMuted }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={() => setShowCreate(false)}>
          <div style={{
            background: T.surface, border: `1px solid ${T.border}`,
            borderRadius: 8, padding: 28, width: 420, maxWidth: '90vw',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 800, color: T.text, marginBottom: 20 }}>New Admin User</div>

            {[
              { label: 'Full Name', key: 'name', type: 'text', placeholder: 'Jane Doe' },
              { label: 'Email', key: 'email', type: 'email', placeholder: 'jane@gobuyme.shop' },
              { label: 'Password', key: 'password', type: 'password', placeholder: '••••••••' },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: T.textSec, marginBottom: 6 }}>
                  {f.label.toUpperCase()}
                </label>
                <input
                  type={f.type}
                  placeholder={f.placeholder}
                  value={form[f.key as keyof typeof form]}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  style={inputStyle}
                />
              </div>
            ))}

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: T.textSec, marginBottom: 6 }}>
                ROLE
              </label>
              <select
                value={form.role}
                onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
                style={{ ...inputStyle }}
              >
                <option value="OPERATIONS_ADMIN">Operations Admin — approve/reject, manage orders</option>
                <option value="SUPPORT_ADMIN">Support Admin — read-only access</option>
              </select>
            </div>

            {formError && (
              <div style={{
                background: `${T.error}15`, border: `1px solid ${T.error}40`,
                borderRadius: 4, padding: '9px 12px', fontSize: 12, color: T.error, marginBottom: 14,
              }}>
                {formError}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setShowCreate(false)}
                style={{
                  flex: 1, padding: '10px', borderRadius: 4,
                  background: T.surface2, border: `1px solid ${T.border}`,
                  color: T.textSec, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={formLoading}
                style={{
                  flex: 1, padding: '10px', borderRadius: 4,
                  background: formLoading ? T.surface3 : T.primary,
                  border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: formLoading ? 'not-allowed' : 'pointer',
                }}
              >
                {formLoading ? 'Creating…' : 'Create Admin'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Role Modal */}
      {actionTarget && actionType === 'role' && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={() => { setActionTarget(null); setActionType(null); }}>
          <div style={{
            background: T.surface, border: `1px solid ${T.border}`,
            borderRadius: 8, padding: 28, width: 380, maxWidth: '90vw',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.text, marginBottom: 6 }}>Change Role</div>
            <div style={{ fontSize: 13, color: T.textSec, marginBottom: 20 }}>
              Updating role for <strong style={{ color: T.text }}>{actionTarget.name}</strong>
            </div>

            <select
              value={newRole}
              onChange={e => setNewRole(e.target.value)}
              style={{ ...inputStyle, marginBottom: 20 }}
            >
              <option value="OPERATIONS_ADMIN">Operations Admin</option>
              <option value="SUPPORT_ADMIN">Support Admin</option>
            </select>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => { setActionTarget(null); setActionType(null); }}
                style={{
                  flex: 1, padding: '10px', borderRadius: 4,
                  background: T.surface2, border: `1px solid ${T.border}`,
                  color: T.textSec, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleRoleChange}
                style={{
                  flex: 1, padding: '10px', borderRadius: 4,
                  background: T.primary, border: 'none',
                  color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                }}
              >
                Save Change
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deactivate Confirm Modal */}
      {actionTarget && actionType === 'deactivate' && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={() => { setActionTarget(null); setActionType(null); }}>
          <div style={{
            background: T.surface, border: `1px solid ${T.border}`,
            borderRadius: 8, padding: 28, width: 380, maxWidth: '90vw',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#EF4444', marginBottom: 6 }}>Deactivate Admin</div>
            <div style={{ fontSize: 13, color: T.textSec, marginBottom: 20 }}>
              <strong style={{ color: T.text }}>{actionTarget.name}</strong> will lose access to the dashboard immediately.
              This can be reversed by recreating their account.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => { setActionTarget(null); setActionType(null); }}
                style={{
                  flex: 1, padding: '10px', borderRadius: 4,
                  background: T.surface2, border: `1px solid ${T.border}`,
                  color: T.textSec, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeactivate}
                style={{
                  flex: 1, padding: '10px', borderRadius: 4,
                  background: '#EF4444', border: 'none',
                  color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                }}
              >
                Deactivate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
