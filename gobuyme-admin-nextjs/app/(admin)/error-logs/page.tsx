'use client';
import { useState, useEffect, useCallback, type MouseEvent } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';

type Platform = 'MOBILE' | 'WEB' | 'ADMIN' | 'BACKEND';

interface ErrorLogEntry {
  id: string;
  userId: string | null;
  role: string | null;
  platform: Platform;
  source: string;
  message: string;
  stack: string | null;
  context: Record<string, unknown> | null;
  appVersion: string | null;
  deviceInfo: Record<string, unknown> | null;
  url: string | null;
  method: string | null;
  resolved: boolean;
  resolvedAt: string | null;
  resolvedBy: string | null;
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const PLATFORM_LABEL: Record<Platform, string> = {
  MOBILE: 'Mobile', WEB: 'Web', ADMIN: 'Admin', BACKEND: 'Backend',
};

function resolvedColor(resolved: boolean, T: Record<string, string>) {
  return resolved ? { color: T.success, bg: T.successBg } : { color: T.error, bg: T.errorBg };
}

function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatLogForCopy(log: ErrorLogEntry) {
  const lines = [
    `Message: ${log.message}`,
    `Platform: ${PLATFORM_LABEL[log.platform] ?? log.platform}`,
    `Source: ${log.source}`,
    `Status: ${log.resolved ? 'Resolved' : 'Unresolved'}`,
    `Time: ${new Date(log.createdAt).toLocaleString()}`,
  ];
  if (log.role) lines.push(`Role: ${log.role}`);
  if (log.userId) lines.push(`User ID: ${log.userId}`);
  if (log.appVersion) lines.push(`App version: ${log.appVersion}`);
  if (log.method || log.url) lines.push(`Request: ${[log.method, log.url].filter(Boolean).join(' ')}`);
  if (log.stack) lines.push(`\nStack:\n${log.stack}`);
  if (log.context) lines.push(`\nContext:\n${JSON.stringify(log.context, null, 2)}`);
  if (log.deviceInfo) lines.push(`\nDevice info:\n${JSON.stringify(log.deviceInfo, null, 2)}`);
  return lines.join('\n');
}

export default function ErrorLogsPage() {
  const { theme: T } = useTheme();
  const [resolvedFilter, setResolvedFilter] = useState<'ALL' | 'UNRESOLVED' | 'RESOLVED'>('UNRESOLVED');
  const [platform, setPlatform] = useState<'ALL' | Platform>('ALL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [logs, setLogs] = useState<ErrorLogEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkUpdating, setBulkUpdating] = useState(false);
  // True once the user explicitly opts into "select all N matching errors" — as
  // opposed to `selected`, which only ever holds ids for the current page.
  const [selectAllMatching, setSelectAllMatching] = useState(false);

  const fetchLogs = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (resolvedFilter !== 'ALL') params.set('resolved', String(resolvedFilter === 'RESOLVED'));
    if (platform !== 'ALL') params.set('platform', platform);
    if (search) params.set('search', search);
    api.get<{ data: ErrorLogEntry[]; pagination: Pagination }>(`/admin/error-logs?${params}`)
      .then(res => { setLogs(res.data); setPagination(res.pagination); })
      .catch(() => { setLogs([]); setPagination(null); })
      .finally(() => setLoading(false));
  }, [resolvedFilter, platform, search, page, limit]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);
  // Selection is page-scoped — clear it whenever the underlying list changes so a stale
  // checked id from a previous page/filter can never ride along into a bulk action.
  useEffect(() => { setSelected(new Set()); setSelectAllMatching(false); }, [logs]);

  const toggleSelected = (id: string) => {
    setSelectAllMatching(false);
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allSelected = logs.length > 0 && selected.size === logs.length;
  const toggleSelectAll = () => {
    setSelectAllMatching(false);
    setSelected(allSelected ? new Set() : new Set(logs.map(l => l.id)));
  };

  // Sidebar's error-log badge fetches its own count once on mount — nudge it to
  // refetch after any action here instead of making the user reload the page.
  const notifyPendingCountsChanged = () => window.dispatchEvent(new Event('gbm:pending-counts-updated'));

  const bulkResolve = async (resolved: boolean) => {
    if (selectAllMatching) {
      setBulkUpdating(true);
      try {
        await api.patch('/admin/error-logs/bulk-resolve', {
          all: true,
          resolved,
          ...(platform !== 'ALL' ? { platform } : {}),
          ...(search ? { search } : {}),
          ...(resolvedFilter !== 'ALL' ? { filterResolved: resolvedFilter === 'RESOLVED' } : {}),
        });
        setSelected(new Set());
        setSelectAllMatching(false);
        setPage(1);
        fetchLogs();
        notifyPendingCountsChanged();
      } finally {
        setBulkUpdating(false);
      }
      return;
    }
    if (selected.size === 0) return;
    setBulkUpdating(true);
    try {
      await api.patch('/admin/error-logs/bulk-resolve', { ids: Array.from(selected), resolved });
      setSelected(new Set());
      fetchLogs();
      notifyPendingCountsChanged();
    } finally {
      setBulkUpdating(false);
    }
  };

  const copyLog = async (e: MouseEvent, log: ErrorLogEntry) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(formatLogForCopy(log));
      setCopiedId(log.id);
      setTimeout(() => setCopiedId(id => (id === log.id ? null : id)), 1500);
    } catch {
      // clipboard unavailable — ignore
    }
  };

  const toggleResolved = async (log: ErrorLogEntry) => {
    setUpdating(log.id);
    try {
      await api.patch(`/admin/error-logs/${log.id}/resolve`, { resolved: !log.resolved });
      fetchLogs();
      notifyPendingCountsChanged();
    } finally {
      setUpdating(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: 20, fontWeight: 800, color: T.text }}>Error Logs</div>
        <div style={{ fontSize: 13, color: T.textSec, marginTop: 2 }}>
          {pagination ? `${pagination.total} errors` : loading ? 'Loading…' : 'No errors'}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 4, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4, padding: 3 }}>
          {(['UNRESOLVED', 'RESOLVED', 'ALL'] as const).map(f => (
            <button
              key={f}
              onClick={() => { setResolvedFilter(f); setPage(1); }}
              style={{
                fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 4, border: 'none', cursor: 'pointer',
                background: resolvedFilter === f ? T.primaryTint : 'transparent',
                color: resolvedFilter === f ? T.primary : T.textSec,
              }}
            >{f === 'UNRESOLVED' ? 'Unresolved' : f === 'RESOLVED' ? 'Resolved' : 'All'}</button>
          ))}
        </div>

        <select
          value={platform}
          onChange={e => { setPlatform(e.target.value as 'ALL' | Platform); setPage(1); }}
          style={{ background: T.surface, color: T.text, border: `1px solid ${T.border}`, borderRadius: 4, padding: '8px 10px', fontSize: 13 }}
        >
          <option value="ALL">All platforms</option>
          <option value="MOBILE">Mobile</option>
          <option value="WEB">Web</option>
          <option value="ADMIN">Admin</option>
          <option value="BACKEND">Backend</option>
        </select>

        <input
          type="text"
          placeholder="Search message…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          style={{ background: T.surface, color: T.text, border: `1px solid ${T.border}`, borderRadius: 4, padding: '8px 10px', fontSize: 13, flex: 1, minWidth: 180 }}
        />

        <select
          value={limit}
          onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}
          style={{ background: T.surface, color: T.text, border: `1px solid ${T.border}`, borderRadius: 4, padding: '8px 10px', fontSize: 13 }}
        >
          <option value={20}>20 / page</option>
          <option value={50}>50 / page</option>
          <option value={100}>100 / page</option>
        </select>
      </div>

      {allSelected && !selectAllMatching && pagination && pagination.total > logs.length && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px',
          background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4, fontSize: 12, color: T.textSec,
        }}>
          <span>All {logs.length} errors on this page are selected.</span>
          <button
            onClick={() => setSelectAllMatching(true)}
            style={{ fontSize: 12, fontWeight: 700, color: T.primary, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
          >Select all {pagination.total} matching errors</button>
        </div>
      )}

      {(selected.size > 0 || selectAllMatching) && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
          background: T.primaryTint, border: `1px solid ${T.primary}`, borderRadius: 4,
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: T.primary }}>
            {selectAllMatching ? `All ${pagination?.total ?? selected.size} matching errors selected` : `${selected.size} selected`}
          </span>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => bulkResolve(true)}
            disabled={bulkUpdating}
            style={{
              fontSize: 12, fontWeight: 700, color: '#fff', background: T.primary, border: 'none',
              borderRadius: 4, padding: '6px 12px', cursor: bulkUpdating ? 'default' : 'pointer', opacity: bulkUpdating ? 0.6 : 1,
            }}
          >Mark resolved</button>
          <button
            onClick={() => bulkResolve(false)}
            disabled={bulkUpdating}
            style={{
              fontSize: 12, fontWeight: 700, color: T.text, background: T.surface, border: `1px solid ${T.border}`,
              borderRadius: 4, padding: '6px 12px', cursor: bulkUpdating ? 'default' : 'pointer', opacity: bulkUpdating ? 0.6 : 1,
            }}
          >Reopen</button>
          <button
            onClick={() => { setSelected(new Set()); setSelectAllMatching(false); }}
            disabled={bulkUpdating}
            style={{
              fontSize: 12, fontWeight: 700, color: T.textSec, background: 'transparent', border: 'none',
              cursor: bulkUpdating ? 'default' : 'pointer',
            }}
          >Clear</button>
        </div>
      )}

      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '32px 20px', textAlign: 'center', fontSize: 13, color: T.textSec }}>Loading…</div>
        ) : logs.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center', fontSize: 13, color: T.textSec }}>No error logs found.</div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', borderBottom: `1px solid ${T.border}` }}>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                style={{ width: 15, height: 15, cursor: 'pointer', flexShrink: 0 }}
              />
              <span style={{ fontSize: 11, fontWeight: 700, color: T.textSec }}>Select all on page</span>
            </div>
            {logs.map((log, i) => {
          const { color, bg } = resolvedColor(log.resolved, T);
          const isOpen = expanded === log.id;
          return (
            <div key={log.id} style={{ borderTop: i > 0 ? `1px solid ${T.border}` : 'none' }}>
              <div
                onClick={() => setExpanded(isOpen ? null : log.id)}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 20px', cursor: 'pointer' }}
              >
                <input
                  type="checkbox"
                  checked={selected.has(log.id)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => toggleSelected(log.id)}
                  style={{ width: 15, height: 15, cursor: 'pointer', flexShrink: 0, marginTop: 2 }}
                />
                <span style={{
                  fontSize: 11, fontWeight: 700, color, background: bg,
                  borderRadius: 4, padding: '2px 8px', whiteSpace: 'nowrap', flexShrink: 0, marginTop: 1,
                }}>{log.resolved ? 'RESOLVED' : 'UNRESOLVED'}</span>

                <span style={{
                  fontSize: 11, fontWeight: 700, color: T.textSec, background: T.surface3,
                  borderRadius: 4, padding: '2px 8px', whiteSpace: 'nowrap', flexShrink: 0, marginTop: 1,
                }}>{PLATFORM_LABEL[log.platform] ?? log.platform}</span>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, color: T.text, lineHeight: 1.4,
                    whiteSpace: isOpen ? 'pre-wrap' : 'nowrap',
                    overflow: isOpen ? 'visible' : 'hidden',
                    textOverflow: isOpen ? 'clip' : 'ellipsis',
                  }}>
                    {log.message}
                  </div>
                  <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>
                    {log.source}{log.role ? ` · ${log.role}` : ''}{log.userId ? ` · ${log.userId}` : ''} · {timeAgo(log.createdAt)}
                  </div>
                  {isOpen && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
                        <button
                          onClick={(e) => copyLog(e, log)}
                          style={{
                            fontSize: 11, fontWeight: 700, color: copiedId === log.id ? T.success : T.textSec,
                            background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4,
                            padding: '4px 10px', cursor: 'pointer',
                          }}
                        >{copiedId === log.id ? 'Copied!' : 'Copy details'}</button>
                      </div>
                      {(log.context || log.stack || log.deviceInfo) && (
                        <div style={{
                          fontSize: 12, fontFamily: 'monospace', color: T.textSec,
                          background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4,
                          padding: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                        }}>
                          {log.stack && `${log.stack}\n\n`}
                          {log.context && `context: ${JSON.stringify(log.context, null, 2)}\n\n`}
                          {log.deviceInfo && `deviceInfo: ${JSON.stringify(log.deviceInfo, null, 2)}`}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                  <div style={{ fontSize: 11, color: T.textMuted, whiteSpace: 'nowrap' }}>
                    {new Date(log.createdAt).toLocaleString()}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleResolved(log); }}
                    disabled={updating === log.id}
                    style={{
                      fontSize: 11, fontWeight: 700, color: T.text, background: T.surface2,
                      border: `1px solid ${T.border}`, borderRadius: 4, padding: '4px 10px',
                      cursor: updating === log.id ? 'default' : 'pointer', opacity: updating === log.id ? 0.5 : 1,
                    }}
                  >{log.resolved ? 'Reopen' : 'Mark resolved'}</button>
                </div>
              </div>
            </div>
          );
            })}
          </>
        )}
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center' }}>
          <button
            disabled={page <= 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            style={{ fontSize: 13, color: T.text, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, padding: '6px 12px', cursor: page <= 1 ? 'default' : 'pointer', opacity: page <= 1 ? 0.5 : 1 }}
          >Prev</button>
          <span style={{ fontSize: 12, color: T.textSec }}>Page {pagination.page} of {pagination.totalPages}</span>
          <button
            disabled={page >= pagination.totalPages}
            onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
            style={{ fontSize: 13, color: T.text, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, padding: '6px 12px', cursor: page >= pagination.totalPages ? 'default' : 'pointer', opacity: page >= pagination.totalPages ? 0.5 : 1 }}
          >Next</button>
        </div>
      )}
    </div>
  );
}
