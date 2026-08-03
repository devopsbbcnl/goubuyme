'use client';
import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';

type LogType = 'combined' | 'error';

interface LogFile {
  filename: string;
  type: LogType;
  date: string;
}

interface LogEntry {
  level?: string;
  message?: string;
  timestamp?: string | null;
  stack?: string;
  [key: string]: unknown;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

const levelColor = (level: string | undefined, T: Record<string, string>) => {
  switch (level) {
    case 'error': return { color: T.error, bg: T.errorBg };
    case 'warn':  return { color: T.warning, bg: T.warningBg };
    case 'info':  return { color: T.info, bg: T.infoBg };
    default:      return { color: T.textSec, bg: T.surface3 };
  }
};

export default function ServerLogsPage() {
  const { theme: T } = useTheme();
  const [dates, setDates] = useState<string[]>([]);
  const [type, setType] = useState<LogType>('combined');
  const [date, setDate] = useState(todayISO());
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    api.get<{ data: LogFile[] }>('/admin/logs/files')
      .then(res => {
        const uniqueDates = Array.from(new Set(res.data.map(f => f.date))).sort().reverse();
        setDates(uniqueDates);
        if (uniqueDates.length > 0 && !uniqueDates.includes(todayISO())) {
          setDate(uniqueDates[0]);
        }
      })
      .catch(() => {});
  }, []);

  const fetchLogs = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ type, date, page: String(page), limit: '50' });
    if (search) params.set('search', search);
    api.get<{ data: LogEntry[]; pagination: Pagination }>(`/admin/logs?${params}`)
      .then(res => { setEntries(res.data); setPagination(res.pagination); })
      .catch(() => { setEntries([]); setPagination(null); })
      .finally(() => setLoading(false));
  }, [type, date, page, search]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: 20, fontWeight: 800, color: T.text }}>Server Logs</div>
        <div style={{ fontSize: 13, color: T.textSec, marginTop: 2 }}>
          {pagination ? `${pagination.total} entries` : loading ? 'Loading…' : 'No entries'}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          value={type}
          onChange={e => { setType(e.target.value as LogType); setPage(1); }}
          style={{ background: T.surface, color: T.text, border: `1px solid ${T.border}`, borderRadius: 4, padding: '8px 10px', fontSize: 13 }}
        >
          <option value="combined">All levels</option>
          <option value="error">Errors only</option>
        </select>

        <input
          type="date"
          value={date}
          max={todayISO()}
          onChange={e => { setDate(e.target.value); setPage(1); }}
          style={{ background: T.surface, color: T.text, border: `1px solid ${T.border}`, borderRadius: 4, padding: '8px 10px', fontSize: 13 }}
        />

        <input
          type="text"
          placeholder="Search message…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          style={{ background: T.surface, color: T.text, border: `1px solid ${T.border}`, borderRadius: 4, padding: '8px 10px', fontSize: 13, flex: 1, minWidth: 180 }}
        />
      </div>

      {dates.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {dates.slice(0, 14).map(d => (
            <button
              key={d}
              onClick={() => { setDate(d); setPage(1); }}
              style={{
                fontSize: 11, fontWeight: d === date ? 700 : 500,
                color: d === date ? T.primary : T.textSec,
                background: d === date ? T.surface3 : 'transparent',
                border: `1px solid ${d === date ? T.primary : T.border}`,
                borderRadius: 4, padding: '4px 8px', cursor: 'pointer',
              }}
            >{d}</button>
          ))}
        </div>
      )}

      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '32px 20px', textAlign: 'center', fontSize: 13, color: T.textSec }}>Loading…</div>
        ) : entries.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center', fontSize: 13, color: T.textSec }}>No log entries found.</div>
        ) : entries.map((entry, i) => {
          const { color, bg } = levelColor(entry.level, T);
          const isOpen = expanded === i;
          return (
            <div key={i} style={{ borderTop: i > 0 ? `1px solid ${T.border}` : 'none' }}>
              <div
                onClick={() => setExpanded(isOpen ? null : i)}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: '14px 20px', cursor: 'pointer' }}
              >
                <span style={{
                  fontSize: 11, fontWeight: 700, color, background: bg,
                  borderRadius: 4, padding: '2px 8px', whiteSpace: 'nowrap', flexShrink: 0,
                }}>{(entry.level ?? 'unknown').toUpperCase()}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, color: T.text, lineHeight: 1.4,
                    whiteSpace: isOpen ? 'pre-wrap' : 'nowrap',
                    overflow: isOpen ? 'visible' : 'hidden',
                    textOverflow: isOpen ? 'clip' : 'ellipsis',
                    fontFamily: isOpen ? 'monospace' : 'inherit',
                  }}>
                    {isOpen ? JSON.stringify(entry, null, 2) : (entry.message ?? '(no message)')}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: T.textMuted, whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : ''}
                </div>
              </div>
            </div>
          );
        })}
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
