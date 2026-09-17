'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import { api } from '@/lib/api';
import {
  CrmRole, CrmTag, LifecycleStage, RoleBadge, STAGE_LABEL, StageBadge, TagChip, fmtDate, fmtRelative,
} from '@/components/crm/shared';

interface ProfileRow {
  id: string;
  name: string;
  displayName: string;
  email: string;
  phone: string | null;
  role: CrmRole;
  isActive: boolean;
  approvalStatus: string | null;
  createdAt: string;
  orderCount: number;
  lastActivityAt: string | null;
  stage: LifecycleStage;
  tags: CrmTag[];
}

const ROLE_FILTERS: Array<{ value: '' | CrmRole; label: string }> = [
  { value: '', label: 'All' },
  { value: 'CUSTOMER', label: 'Customers' },
  { value: 'VENDOR', label: 'Vendors' },
  { value: 'RIDER', label: 'Riders' },
];
const STAGES: LifecycleStage[] = ['NEW', 'ACTIVE', 'AT_RISK', 'CHURNED'];
const TAG_COLORS = ['#FF521B', '#1A6EFF', '#1A9E5F', '#F5A623', '#E23B3B', '#8B5CF6', '#0EA5E9', '#6B7280'];

export default function CrmProfilesPage() {
  const { theme: T } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const canManageTags = user?.role === 'SUPER_ADMIN' || user?.role === 'OPERATIONS_ADMIN';

  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tags, setTags] = useState<CrmTag[]>([]);

  const [role, setRole] = useState<'' | CrmRole>('');
  const [stage, setStage] = useState<'' | LifecycleStage>('');
  const [tagId, setTagId] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);

  const [tagsOpen, setTagsOpen] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);
  const [tagError, setTagError] = useState('');
  const [tagSaving, setTagSaving] = useState(false);

  const loadTags = () =>
    api.get<{ data: CrmTag[] }>('/admin/crm/tags').then(res => setTags(res.data)).catch(() => {});

  useEffect(() => { loadTags(); }, []);

  useEffect(() => {
    const t = setTimeout(() => { setPage(1); setDebouncedSearch(search); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ page: String(page), limit: String(perPage) });
    if (role) params.set('role', role);
    if (stage) params.set('stage', stage);
    if (tagId) params.set('tagId', tagId);
    if (debouncedSearch) params.set('search', debouncedSearch);
    api.get<{ data: ProfileRow[]; pagination: { total: number } }>(`/admin/crm/profiles?${params}`)
      .then(res => { setRows(res.data); setTotal(res.pagination.total); })
      .catch(err => { setRows([]); setTotal(0); setError(err.message); })
      .finally(() => setLoading(false));
  }, [page, perPage, role, stage, tagId, debouncedSearch]);

  const createTag = async () => {
    if (!newTagName.trim()) return;
    setTagSaving(true);
    setTagError('');
    try {
      await api.post('/admin/crm/tags', { name: newTagName.trim(), color: newTagColor });
      setNewTagName('');
      await loadTags();
    } catch (err) {
      setTagError((err as Error).message);
    } finally {
      setTagSaving(false);
    }
  };

  const deleteTag = async (tag: CrmTag) => {
    setTagError('');
    try {
      await api.del(`/admin/crm/tags/${tag.id}`);
      if (tagId === tag.id) setTagId('');
      await loadTags();
    } catch (err) {
      setTagError((err as Error).message);
    }
  };

  const chip = (active: boolean): React.CSSProperties => ({
    padding: '7px 14px', borderRadius: 4,
    border: active ? `1px solid ${T.primary}` : 'none',
    background: active ? T.primaryTint : T.surface2,
    color: active ? T.primary : T.textSec,
    fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
  });

  const selectStyle: React.CSSProperties = {
    background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4,
    padding: '8px 10px', color: T.text, fontSize: 13, fontFamily: 'inherit', outline: 'none',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Modal open={tagsOpen} onClose={() => setTagsOpen(false)} title="Manage Tags" width={460}>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={newTagName}
              onChange={e => setNewTagName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createTag(); }}
              maxLength={40}
              placeholder="New tag name, e.g. VIP"
              style={{ ...selectStyle, flex: 1 }}
            />
            <button onClick={createTag} disabled={tagSaving || !newTagName.trim()} style={{
              padding: '8px 16px', borderRadius: 4, border: 'none', background: T.primary, color: '#fff',
              fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', opacity: tagSaving || !newTagName.trim() ? 0.6 : 1,
            }}>Add</button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {TAG_COLORS.map(c => (
              <button key={c} onClick={() => setNewTagColor(c)} aria-label={`Color ${c}`} style={{
                width: 22, height: 22, borderRadius: 9999, background: c, cursor: 'pointer',
                border: newTagColor === c ? `2px solid ${T.text}` : '2px solid transparent',
              }} />
            ))}
          </div>
          {tagError && <div style={{ fontSize: 12, color: T.error }}>{tagError}</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {tags.length === 0 ? (
              <div style={{ fontSize: 12, color: T.textSec }}>No tags yet.</div>
            ) : tags.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${T.border}` }}>
                <TagChip tag={t} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 12, color: T.textSec }}>{t.userCount ?? 0} profiles</span>
                  <button onClick={() => deleteTag(t)} style={{
                    padding: '4px 10px', borderRadius: 4, border: `1px solid ${T.error}`, background: 'none',
                    color: T.error, fontSize: 11, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
                  }}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.text }}>CRM Profiles</div>
          <div style={{ fontSize: 13, color: T.textSec }}>
            {loading ? 'Loading…' : `${total.toLocaleString()} customers, vendors and riders`}
          </div>
        </div>
        {canManageTags && (
          <button onClick={() => setTagsOpen(true)} style={{
            padding: '10px 18px', borderRadius: 4, background: T.surface2, border: `1px solid ${T.border}`,
            color: T.text, fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
          }}>Manage tags</button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', rowGap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {ROLE_FILTERS.map(f => (
            <button key={f.label} onClick={() => { setRole(f.value); setPage(1); }} style={chip(role === f.value)}>
              {f.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select aria-label="Lifecycle stage" value={stage} onChange={e => { setStage(e.target.value as '' | LifecycleStage); setPage(1); }} style={selectStyle}>
            <option value="">Any stage</option>
            {STAGES.map(s => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
          </select>
          <select aria-label="Tag" value={tagId} onChange={e => { setTagId(e.target.value); setPage(1); }} style={selectStyle}>
            <option value="">Any tag</option>
            {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Name, email, phone, business…"
            style={{ ...selectStyle, padding: '8px 14px', flex: '1 1 180px', minWidth: 160, maxWidth: 260 }}
          />
        </div>
      </div>

      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', minWidth: 820, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: T.surface2 }}>
                {['Profile', 'Type', 'Stage', 'Orders', 'Last activity', 'Tags', 'Joined', 'Account'].map(h => (
                  <th key={h} style={{ padding: '11px 16px', fontSize: 11, fontWeight: 700, color: T.textSec, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: T.textSec }}>Loading profiles…</td></tr>
              ) : error ? (
                <tr><td colSpan={8} style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: T.error }}>{error}</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: T.textSec }}>No profiles match these filters.</td></tr>
              ) : rows.map(r => (
                <tr
                  key={r.id}
                  onClick={() => router.push(`/crm/profiles/${r.id}`)}
                  style={{ borderTop: `1px solid ${T.border}`, cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = T.surface2)}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '13px 16px' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{r.displayName}</div>
                    <div style={{ fontSize: 11, color: T.textSec }}>
                      {r.displayName !== r.name ? `${r.name} · ` : ''}{r.phone ?? r.email}
                    </div>
                  </td>
                  <td style={{ padding: '13px 16px' }}><RoleBadge role={r.role} /></td>
                  <td style={{ padding: '13px 16px' }}><StageBadge stage={r.stage} /></td>
                  <td style={{ padding: '13px 16px', fontSize: 13, fontWeight: 600, color: T.text }}>{r.orderCount}</td>
                  <td style={{ padding: '13px 16px', fontSize: 12, color: T.textSec, whiteSpace: 'nowrap' }}>{fmtRelative(r.lastActivityAt)}</td>
                  <td style={{ padding: '13px 16px' }}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', maxWidth: 220 }}>
                      {r.tags.length === 0 ? <span style={{ fontSize: 12, color: T.textMuted }}>—</span> : r.tags.map(t => <TagChip key={t.id} tag={t} />)}
                    </div>
                  </td>
                  <td style={{ padding: '13px 16px', fontSize: 12, color: T.textSec, whiteSpace: 'nowrap' }}>{fmtDate(r.createdAt)}</td>
                  <td style={{ padding: '13px 16px' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, borderRadius: 4, padding: '3px 9px',
                      color: r.isActive ? T.success : T.error,
                      background: r.isActive ? T.successBg : T.errorBg,
                    }}>
                      {r.isActive ? 'Active' : 'Suspended'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination
          total={total}
          page={page}
          perPage={perPage}
          onPageChange={setPage}
          onPerPageChange={size => { setPerPage(size); setPage(1); }}
        />
      </div>
    </div>
  );
}
