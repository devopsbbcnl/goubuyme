'use client';
import { useMemo, useState } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { ContentDetail } from '@/components/smois/ContentDetail';
import { api } from '@/lib/api';
import {
  Btn, Card, Empty, Notice, PageHeader, PLATFORMS, PlatformTag, Pill, Select, StatusPill, STATUS_TONE, Table, Td, Tabs,
  fmtDateTime, pretty, useLoad, useTones,
} from '@/components/smois/ui';

interface Item {
  id: string; status: string; caption: string; at: string | null; account: { id: string; name: string; platform: string }; content: { id: string; title: string }; creatorName: string | null;
}
interface Conflict { type: string; variantIds: string[]; message: string }
interface Cal { items: Item[]; conflicts: Conflict[]; minPostGapMinutes: number }

const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function CalendarPage() {
  const { theme: T } = useTheme();
  const tones = useTones();
  const [cursor, setCursor] = useState(startOfMonth(new Date()));
  const [mode, setMode] = useState<'month' | 'list'>('month');
  const [platform, setPlatform] = useState('');
  const [accountId, setAccountId] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [moveError, setMoveError] = useState('');

  // Monday-first grid covering the month.
  const gridStart = useMemo(() => { const s = new Date(cursor); const dow = (s.getDay() + 6) % 7; s.setDate(s.getDate() - dow); return s; }, [cursor]);
  const gridEnd = useMemo(() => { const e = new Date(gridStart); e.setDate(e.getDate() + 42); e.setMilliseconds(-1); return e; }, [gridStart]);

  const accounts = useLoad(() => api.get<{ data: { id: string; name: string; platform: string }[] }>('/admin/smois/accounts').then((r) => r.data), []);
  const qs = new URLSearchParams({ from: gridStart.toISOString(), to: gridEnd.toISOString(), ...(platform ? { platform } : {}), ...(accountId ? { accountId } : {}) });
  const { data, loading, error, reload } = useLoad(() => api.get<{ data: Cal }>(`/admin/smois/calendar?${qs}`).then((r) => r.data), [qs.toString()]);

  const byDay = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const i of data?.items ?? []) if (i.at) { const k = ymd(new Date(i.at)); m.set(k, [...(m.get(k) ?? []), i]); }
    for (const list of m.values()) list.sort((a, b) => new Date(a.at!).getTime() - new Date(b.at!).getTime());
    return m;
  }, [data]);
  const conflicted = useMemo(() => new Set((data?.conflicts ?? []).flatMap((c) => c.variantIds)), [data]);
  const byId = useMemo(() => new Map((data?.items ?? []).map((i) => [i.id, i])), [data]);

  // Drag a post to another day: keeps its time of day, and the server checks who may reschedule what.
  const movable = (status: string) => !['PUBLISHED', 'CANCELLED', 'ARCHIVED', 'REJECTED', 'PUBLISHING'].includes(status);
  const moveTo = async (variantId: string, day: Date) => {
    const item = data?.items.find((i) => i.id === variantId);
    if (!item?.at || !movable(item.status)) return;
    const from = new Date(item.at);
    const next = new Date(day.getFullYear(), day.getMonth(), day.getDate(), from.getHours(), from.getMinutes());
    if (ymd(next) === ymd(from)) return;
    setMoveError('');
    try { await api.post(`/admin/smois/variants/${variantId}/plan`, { plannedAt: next.toISOString() }); reload(); } catch (e) { setMoveError((e as Error).message); }
  };

  const days = Array.from({ length: 42 }, (_, n) => { const d = new Date(gridStart); d.setDate(d.getDate() + n); return d; });
  const today = ymd(new Date());
  const colorFor = (status: string) => tones[STATUS_TONE[status] ?? 'neutral'];

  return (
    <div>
      <PageHeader title="Content calendar" sub="Planned, scheduled and published posts across every account. Red outlines mark conflicts; empty weekdays are publishing gaps. Drag a post to another day to reschedule it." />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <Btn small onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>‹</Btn>
        <div style={{ fontWeight: 800, color: T.text, minWidth: 140, textAlign: 'center' }}>{cursor.toLocaleDateString('en-NG', { month: 'long', year: 'numeric' })}</div>
        <Btn small onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>›</Btn>
        <Btn small onClick={() => setCursor(startOfMonth(new Date()))}>Today</Btn>
        <div style={{ width: 150 }}><Select value={platform} onChange={(e) => { setPlatform(e.target.value); setAccountId(''); }}><option value="">All platforms</option>{PLATFORMS.map((p) => <option key={p} value={p}>{pretty(p)}</option>)}</Select></div>
        <div style={{ width: 190 }}><Select value={accountId} onChange={(e) => setAccountId(e.target.value)}><option value="">All accounts</option>{accounts.data?.filter((a) => !platform || a.platform === platform).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></div>
        <div style={{ marginLeft: 'auto' }}><Tabs value={mode} onChange={setMode} items={[{ id: 'month', label: 'Month' }, { id: 'list', label: 'List' }]} /></div>
      </div>

      {error && <Notice kind="error">{error}</Notice>}
      {moveError && <Notice kind="error">{moveError}</Notice>}
      {data && data.conflicts.length > 0 && (
        <Card title={`${data.conflicts.length} scheduling ${data.conflicts.length === 1 ? 'conflict' : 'conflicts'}`} style={{ marginBottom: 14, borderColor: T.error }}>
          {data.conflicts.slice(0, 8).map((c, n) => {
            const first = byId.get(c.variantIds[0]);
            return (
              <div key={n} style={{ fontSize: 12, padding: '5px 0', color: T.textSec, cursor: first ? 'pointer' : 'default' }} onClick={() => first && setOpen(first.content.id)}>
                <Pill tone="bad">{pretty(c.type)}</Pill> <b style={{ color: T.text }}>{first?.content.title}</b>{first && ` · ${first.account.name}`}. {c.message}
              </div>
            );
          })}
        </Card>
      )}

      {loading && !data ? <Empty>Loading…</Empty> : mode === 'month' ? (
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 720, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', border: `1px solid ${T.border}`, borderRadius: 4, background: T.surface }}>
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} style={{ padding: 8, fontSize: 11, fontWeight: 800, color: T.textSec, borderBottom: `1px solid ${T.border}`, textAlign: 'center' }}>{d}</div>)}
            {days.map((d) => {
              const k = ymd(d);
              const list = byDay.get(k) ?? [];
              const inMonth = d.getMonth() === cursor.getMonth();
              const weekday = d.getDay() !== 0 && d.getDay() !== 6;
              const gap = inMonth && weekday && list.length === 0 && k >= today;
              return (
                <div key={k}
                  onDragOver={(e) => { e.preventDefault(); if (dragOver !== k) setDragOver(k); }}
                  onDragLeave={() => setDragOver((cur) => (cur === k ? null : cur))}
                  onDrop={(e) => { e.preventDefault(); setDragOver(null); const id = e.dataTransfer.getData('text/plain'); if (id) moveTo(id, d); }}
                  style={{ minHeight: 98, padding: 6, borderRight: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}`, background: dragOver === k ? T.infoBg : k === today ? T.primaryTint : 'transparent', opacity: inMonth ? 1 : 0.4 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: k === today ? T.primary : T.textSec, display: 'flex', justifyContent: 'space-between' }}>
                    {d.getDate()}{gap && <span title="No posts planned" style={{ color: T.textMuted, fontWeight: 600 }}>gap</span>}
                  </div>
                  {list.slice(0, 3).map((i) => (
                    <div key={i.id} draggable={movable(i.status)} onDragStart={(e) => e.dataTransfer.setData('text/plain', i.id)} onClick={() => setOpen(i.content.id)} title={`${i.content.title} · ${i.account.name} · ${pretty(i.status)}${movable(i.status) ? ' · drag to another day to reschedule' : ''}`} style={{
                      marginTop: 4, padding: '3px 5px', borderRadius: 3, fontSize: 10.5, fontWeight: 600, cursor: movable(i.status) ? 'grab' : 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      background: colorFor(i.status).bg, color: colorFor(i.status).c, outline: conflicted.has(i.id) ? `1.5px solid ${T.error}` : 'none',
                    }}>
                      {new Date(i.at!).toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit' })} {i.content.title}
                    </div>
                  ))}
                  {list.length > 3 && <div style={{ fontSize: 10.5, color: T.textSec, marginTop: 3 }}>+{list.length - 3} more</div>}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        data && (data.items.length === 0 ? <Empty>Nothing planned in this range.</Empty> : (
          <Table head={['When', 'Content', 'Account', 'Status', 'Author']}>
            {[...data.items].sort((a, b) => new Date(a.at ?? 0).getTime() - new Date(b.at ?? 0).getTime()).map((i) => (
              <tr key={i.id} onClick={() => setOpen(i.content.id)} style={{ cursor: 'pointer' }}>
                <Td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(i.at)} {conflicted.has(i.id) && <Pill tone="bad">Conflict</Pill>}</Td>
                <Td><b>{i.content.title}</b></Td>
                <Td><PlatformTag platform={i.account.platform} name={i.account.name} /></Td>
                <Td><StatusPill status={i.status} /></Td>
                <Td>{i.creatorName}</Td>
              </tr>
            ))}
          </Table>
        ))
      )}
      <div style={{ fontSize: 11, color: T.textMuted, marginTop: 10 }}>Posts closer than {data?.minPostGapMinutes ?? 30} minutes on one account are flagged. Change this under Social Settings.</div>
      {open && <ContentDetail id={open} onClose={() => setOpen(null)} onChanged={reload} />}
    </div>
  );
}
