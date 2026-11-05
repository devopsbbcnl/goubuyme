'use client';
import { useState, useEffect } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { Badge } from '@/components/ui/Badge';
import { Pagination } from '@/components/ui/Pagination';
import { api } from '@/lib/api';

type CompanyStatus = 'APPROVED' | 'PENDING' | 'REJECTED' | 'SUSPENDED';

interface Company {
  id: string; userId: string; companyName: string; registrationNumber: string | null;
  address: string; city: string; state: string; approvalStatus: CompanyStatus; createdAt: string;
  ownerName: string; ownerEmail: string; ownerPhone: string | null; riders: number;
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const TABS: Array<'ALL' | CompanyStatus> = ['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'];

export default function CompaniesPage() {
  const { theme: T } = useTheme();
  const { user } = useAuth();
  // The API requires OPERATIONS_ADMIN or above to change a status; support admins read only.
  const canAct = user?.role === 'SUPER_ADMIN' || user?.role === 'OPERATIONS_ADMIN';

  const [companies, setCompanies] = useState<Company[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | CompanyStatus>('ALL');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [refreshKey, setRefreshKey] = useState(0);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => { setPage(1); setDebouncedSearch(search); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(perPage) });
    if (filter !== 'ALL') params.set('status', filter);
    if (debouncedSearch) params.set('search', debouncedSearch);
    api.get<{ data: Company[]; pagination: { total: number } }>(`/admin/companies?${params}`)
      .then(res => { setCompanies(res.data); setTotal(res.pagination.total); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, perPage, filter, debouncedSearch, refreshKey]);

  const setStatus = async (id: string, status: CompanyStatus) => {
    setActingId(id);
    setError('');
    try {
      await api.patch(`/admin/companies/${id}/status`, { status });
      setCompanies(cs => cs.map(c => (c.id === id ? { ...c, approvalStatus: status } : c)));
    } catch {
      setError('Could not update the company. Please try again.');
      setRefreshKey(k => k + 1);
    } finally {
      setActingId(null);
    }
  };

  const actionBtn = (label: string, status: CompanyStatus, color: string, id: string) => (
    <button
      key={status}
      disabled={actingId === id}
      onClick={() => setStatus(id, status)}
      style={{ padding: '5px 10px', borderRadius: 4, border: `1px solid ${color}`, background: 'none', color, fontSize: 11, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', opacity: actingId === id ? 0.5 : 1 }}
    >
      {label}
    </button>
  );

  const pendingCount = companies.filter(c => c.approvalStatus === 'PENDING').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: 20, fontWeight: 800, color: T.text }}>Logistics companies</div>
        <div style={{ fontSize: 13, color: T.textSec }}>
          {loading ? 'Loading…' : `${total} total${filter === 'ALL' ? ` · ${pendingCount} pending on this page` : ''}`}
        </div>
        <div style={{ fontSize: 12, color: T.textMuted, marginTop: 4 }}>
          A company&apos;s riders can only take jobs while their company is approved. Rejecting or suspending a company takes its whole fleet offline.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', rowGap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => { setFilter(t); setPage(1); }} style={{
              padding: '7px 14px', borderRadius: 4,
              border: filter === t ? `1px solid ${T.primary}` : 'none',
              background: filter === t ? T.primaryTint : T.surface2,
              color: filter === t ? T.primary : T.textSec,
              fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
            }}>
              {t}
            </button>
          ))}
        </div>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search companies…"
          style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4, padding: '8px 14px', color: T.text, fontSize: 13, outline: 'none', flex: '1 1 160px', minWidth: 140, maxWidth: 240 }}
        />
      </div>

      {!!error && <div style={{ fontSize: 13, color: T.error }}>{error}</div>}

      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: T.surface2 }}>
                {['Company', 'Owner', 'Location', 'Riders', 'Status', ...(canAct ? ['Actions'] : [])].map(h => (
                  <th key={h} style={{ padding: '11px 16px', fontSize: 11, fontWeight: 700, color: T.textSec, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!loading && companies.length === 0 && (
                <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', fontSize: 13, color: T.textSec }}>No companies found.</td></tr>
              )}
              {companies.map(c => (
                <tr key={c.id} style={{ borderTop: `1px solid ${T.border}` }}>
                  <td style={{ padding: '13px 16px' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{c.companyName}</div>
                    <div style={{ fontSize: 11, color: T.textMuted }}>
                      {c.registrationNumber ? `${c.registrationNumber} · ` : ''}{fmtDate(c.createdAt)}
                    </div>
                  </td>
                  <td style={{ padding: '13px 16px' }}>
                    <div style={{ fontSize: 13, color: T.text }}>{c.ownerName}</div>
                    <div style={{ fontSize: 11, color: T.textMuted }}>{c.ownerEmail}{c.ownerPhone ? ` · ${c.ownerPhone}` : ''}</div>
                  </td>
                  <td style={{ padding: '13px 16px', fontSize: 12, color: T.textSec }}>{c.address}, {c.city}</td>
                  <td style={{ padding: '13px 16px', fontSize: 13, fontWeight: 600, color: T.text }}>{c.riders}</td>
                  <td style={{ padding: '13px 16px' }}><Badge status={c.approvalStatus} /></td>
                  {canAct && (
                    <td style={{ padding: '13px 16px' }}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {c.approvalStatus !== 'APPROVED' && actionBtn('Approve', 'APPROVED', T.success, c.id)}
                        {c.approvalStatus === 'PENDING' && actionBtn('Reject', 'REJECTED', T.error, c.id)}
                        {c.approvalStatus === 'APPROVED' && actionBtn('Suspend', 'SUSPENDED', T.error, c.id)}
                      </div>
                    </td>
                  )}
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
          onPerPageChange={(size) => { setPerPage(size); setPage(1); }}
        />
      </div>
    </div>
  );
}
