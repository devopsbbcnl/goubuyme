'use client';
// A month grid shared by the HR calendar and My HR calendar. Items can span several days.
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { Btn, Empty, Notice, Pill, useLoad } from './ui';

interface Item { date: string; end?: string; kind: string; title: string; link?: string }
const KIND_TONE: Record<string, 'bad' | 'warn' | 'info' | 'good' | 'neutral' | 'brand'> = { HOLIDAY: 'good', LEAVE: 'info', CONTRACT_EXPIRY: 'bad', PROBATION: 'warn', REVIEW_DUE: 'brand', INTERVIEW: 'neutral' };
const ymd = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

export function CalendarView({ endpoint }: { endpoint: string }) {
  const { theme: T } = useTheme();
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const first = new Date(Date.UTC(ym.y, ym.m, 1));
  const days = new Date(Date.UTC(ym.y, ym.m + 1, 0)).getUTCDate();
  const from = ymd(ym.y, ym.m, 1); const to = ymd(ym.y, ym.m, days);
  const { data, loading, error } = useLoad(() => api.get<{ data: { items: Item[] } }>(`${endpoint}?from=${from}&to=${to}`).then((r) => r.data.items), [endpoint, from]);
  const offset = (first.getUTCDay() + 6) % 7; // Monday first
  const byDay = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const it of data ?? []) {
      const end = it.end ?? it.date;
      for (let d = 1; d <= days; d++) { const k = ymd(ym.y, ym.m, d); if (k >= it.date && k <= end) m.set(k, [...(m.get(k) ?? []), it]); }
    }
    return m;
  }, [data, ym, days]);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date());
  const title = first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const step = (n: number) => setYm(({ y, m }) => { const d = new Date(Date.UTC(y, m + n, 1)); return { y: d.getUTCFullYear(), m: d.getUTCMonth() }; });
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}><Btn small onClick={() => step(-1)}>‹</Btn><b style={{ color: T.text, minWidth: 150, textAlign: 'center' }}>{title}</b><Btn small onClick={() => step(1)}>›</Btn><Btn small onClick={() => setYm({ y: now.getFullYear(), m: now.getMonth() })}>Today</Btn></div>
      {error && <Notice kind="error">{error}</Notice>}
      {loading && !data ? <Empty>Loading…</Empty> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4 }}>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} style={{ fontSize: 11, fontWeight: 800, color: T.textSec, textAlign: 'center' }}>{d}</div>)}
          {Array.from({ length: offset }).map((_, i) => <div key={`o${i}`} />)}
          {Array.from({ length: days }).map((_, i) => {
            const k = ymd(ym.y, ym.m, i + 1); const items = byDay.get(k) ?? [];
            return (
              <div key={k} style={{ minHeight: 84, background: k === today ? T.primaryTint : T.surface, border: `1px solid ${k === today ? T.primary : T.border}`, borderRadius: 4, padding: 4, overflow: 'hidden' }}>
                <div style={{ fontSize: 11, color: T.textSec, fontWeight: 700 }}>{i + 1}</div>
                {items.slice(0, 3).map((it, j) => {
                  const inner = <Pill tone={KIND_TONE[it.kind] ?? 'neutral'}>{it.title.length > 22 ? `${it.title.slice(0, 21)}…` : it.title}</Pill>;
                  return <div key={j} title={it.title} style={{ marginTop: 3 }}>{it.link ? <Link href={it.link} style={{ textDecoration: 'none' }}>{inner}</Link> : inner}</div>;
                })}
                {items.length > 3 && <div style={{ fontSize: 10, color: T.textMuted }}>+{items.length - 3} more</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
