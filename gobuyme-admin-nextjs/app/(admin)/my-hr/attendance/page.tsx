'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Btn, Card, Empty, Field, Grid, Input, Notice, PageHeader, Pill, Table, Td, fmtDate, fmtDateTime, label, todayYmd, useAction, useLoad } from '@/components/pwm/ui';

interface Rec { id: string; date: string; clockIn: string | null; clockOut: string | null; status: string; minutesLate: number; minutesWorked: number; explanation: string | null }
interface Data { today: Rec | null; records: Rec[]; corrections: { id: string; date: string; status: string; reason: string }[]; overtime: { id: string; date: string; hours: number; status: string }[] }
const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' }) : '—');

export default function MyAttendance() {
  const { data, loading, error, reload } = useLoad(() => api.get<{ data: Data }>('/my-hr/attendance').then((r) => r.data), []);
  const [corr, setCorr] = useState({ date: todayYmd(), clockIn: '', clockOut: '', reason: '' });
  const [ot, setOt] = useState({ date: todayYmd(), hours: '', reason: '' });
  const [msg, setMsg] = useState('');
  const { busy, error: actionError, run } = useAction();
  if (loading && !data) return <Empty>Loading…</Empty>;
  const t = data?.today;
  const clock = (what: 'clock-in' | 'clock-out') => run(async () => { const r = await api.post<{ message: string }>(`/my-hr/attendance/${what}`, {}); setMsg(r.message); reload(); });
  const explain = (id: string) => { const text = window.prompt('What happened?'); if (text) run(async () => { await api.post(`/my-hr/attendance/${id}/explain`, { text }); reload(); }); };
  const tone = (s: string) => (s === 'PRESENT' || s === 'REMOTE' ? 'good' : s === 'LATE' ? 'warn' : s === 'ABSENT' ? 'bad' : 'neutral') as 'good' | 'warn' | 'bad' | 'neutral';
  return (
    <div>
      <PageHeader title="My attendance" sub="Clock in and out from here. Your location is never asked for or stored." />
      {(error || actionError) && <Notice kind="error">{error || actionError}</Notice>}{msg && <Notice kind="success">{msg}</Notice>}
      <Card title="Today">
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ fontSize: 14 }}>{t?.clockIn ? <>In <b>{time(t.clockIn)}</b>{t.minutesLate > 0 && <Pill tone="warn">{t.minutesLate} min late</Pill>}{t.clockOut ? <> · Out <b>{time(t.clockOut)}</b> · {Math.round(t.minutesWorked / 6) / 10} h worked</> : null}</> : 'You have not clocked in yet.'}</div>
          {!t?.clockIn && <Btn kind="primary" disabled={busy} onClick={() => clock('clock-in')}>Clock in</Btn>}
          {t?.clockIn && !t.clockOut && <Btn kind="primary" disabled={busy} onClick={() => clock('clock-out')}>Clock out</Btn>}
        </div>
      </Card>
      <div style={{ marginTop: 14 }}>
        <Card title="Last 45 days">
          {!data?.records.length ? <Empty>No records yet.</Empty> : (
            <Table head={['Date', 'In', 'Out', 'Status', '']}>
              {data.records.map((r) => (
                <tr key={r.id}><Td>{fmtDate(r.date)}</Td><Td>{time(r.clockIn)}</Td><Td>{time(r.clockOut)}</Td><Td><Pill tone={tone(r.status)}>{label(r.status)}</Pill>{r.status === 'LATE' && <span style={{ fontSize: 11 }}> {r.minutesLate} min</span>}{r.explanation && <div style={{ fontSize: 11, opacity: 0.7 }}>{r.explanation}</div>}</Td>
                  <Td>{r.status === 'ABSENT' && !r.explanation && <Btn small onClick={() => explain(r.id)}>Explain</Btn>}</Td></tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12, marginTop: 14 }}>
        <Card title="Correct a day">
          <Notice kind="info">Your supervisor approves it. The original times are kept on record.</Notice>
          <Grid cols={3}><Field label="Date"><Input type="date" max={todayYmd()} value={corr.date} onChange={(e) => setCorr({ ...corr, date: e.target.value })} /></Field><Field label="Clock in"><Input type="time" value={corr.clockIn} onChange={(e) => setCorr({ ...corr, clockIn: e.target.value })} /></Field><Field label="Clock out"><Input type="time" value={corr.clockOut} onChange={(e) => setCorr({ ...corr, clockOut: e.target.value })} /></Field></Grid>
          <Field label="Reason"><Input value={corr.reason} onChange={(e) => setCorr({ ...corr, reason: e.target.value })} /></Field>
          <Btn disabled={busy || !corr.reason || (!corr.clockIn && !corr.clockOut)} onClick={() => run(async () => { const r = await api.post<{ message: string }>('/my-hr/attendance/corrections', { ...corr, clockIn: corr.clockIn || null, clockOut: corr.clockOut || null }); setMsg(r.message); reload(); })}>Send</Btn>
          {data?.corrections.slice(0, 4).map((c) => <div key={c.id} style={{ fontSize: 12, marginTop: 6 }}>{fmtDate(c.date)}: <Pill tone={c.status === 'APPROVED' ? 'good' : c.status === 'PENDING' ? 'warn' : 'bad'}>{label(c.status)}</Pill></div>)}
        </Card>
        <Card title="Request overtime">
          <Grid cols={3}><Field label="Date"><Input type="date" max={todayYmd()} value={ot.date} onChange={(e) => setOt({ ...ot, date: e.target.value })} /></Field><Field label="Hours"><Input type="number" step="0.5" value={ot.hours} onChange={(e) => setOt({ ...ot, hours: e.target.value })} /></Field></Grid>
          <Field label="Reason"><Input value={ot.reason} onChange={(e) => setOt({ ...ot, reason: e.target.value })} /></Field>
          <Btn disabled={busy || !ot.hours || !ot.reason} onClick={() => run(async () => { const r = await api.post<{ message: string }>('/my-hr/overtime', { ...ot, hours: Number(ot.hours) }); setMsg(r.message); setOt({ ...ot, hours: '', reason: '' }); reload(); })}>Send</Btn>
          {data?.overtime.slice(0, 4).map((o) => <div key={o.id} style={{ fontSize: 12, marginTop: 6 }}>{fmtDate(o.date)} · {o.hours} h: <Pill tone={o.status === 'APPROVED' ? 'good' : o.status === 'PENDING' ? 'warn' : 'bad'}>{label(o.status)}</Pill></div>)}
        </Card>
      </div>
      <span style={{ display: 'none' }}>{fmtDateTime('')}</span>
    </div>
  );
}
