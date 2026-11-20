'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Btn, Card, Empty, Field, Grid, Input, Notice, PageHeader, Pill, Select, Stat, Table, Td, TextArea, fmtDate, label, todayYmd, uploadDocument, useAction, useLoad } from '@/components/pwm/ui';

interface Bal { typeId: string; name: string; entitled: number; carriedOver: number; adjusted: number; used: number; available: number; allowHalfDay: boolean; docAfterDays: number | null }
interface Req { id: string; type: string; status: string; startDate: string; endDate: string; days: number; reason: string | null; waitingOn: string | null; canCancel: boolean }
interface Preview { days: number; available: number | null; warnings: string[]; conflicts: { name: string; start: string; end: string }[]; chain: { role: string; name: string | null }[] }

export default function MyLeave() {
  const { data, loading, error, reload } = useLoad(() => api.get<{ data: { year: number; balances: Bal[]; requests: Req[] } }>('/my-hr/leave').then((r) => r.data), []);
  const [f, setF] = useState({ typeId: '', start: todayYmd(), end: todayYmd(), startHalf: false, endHalf: false, reason: '' });
  const [file, setFile] = useState<File | null>(null);
  const [pre, setPre] = useState<Preview | null>(null);
  const [preErr, setPreErr] = useState('');
  const [msg, setMsg] = useState('');
  const { busy, error: actionError, run } = useAction();
  const type = data?.balances.find((b) => b.typeId === f.typeId);

  // Live preview: days, balance, clashes and who approves (US-LEV-01)
  useEffect(() => {
    if (!f.typeId || !f.start || !f.end) { setPre(null); return; }
    let live = true;
    const t = setTimeout(() => {
      api.post<{ data: Preview }>('/my-hr/leave/preview', f).then((r) => { if (live) { setPre(r.data); setPreErr(''); } }).catch((e) => { if (live) { setPre(null); setPreErr((e as Error).message); } });
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [f]);

  if (loading && !data) return <Empty>Loading…</Empty>;
  const submit = () => run(async () => {
    const docUrl = file ? (await uploadDocument(file)).url : undefined;
    const r = await api.post<{ message: string }>('/my-hr/leave', { ...f, docUrl });
    setMsg(r.message); setFile(null); setF({ ...f, reason: '', startHalf: false, endHalf: false }); reload(); window.dispatchEvent(new Event('gbm:pending-counts-updated'));
  });
  const cancel = (id: string) => { const reason = window.prompt('Reason for cancelling (optional)') ?? ''; run(async () => { await api.post(`/my-hr/leave/${id}/cancel`, { reason }); reload(); }); };
  const tone = (s: string) => (s === 'APPROVED' ? 'good' : s === 'PENDING' ? 'warn' : s === 'REJECTED' ? 'bad' : 'neutral') as 'good' | 'warn' | 'bad' | 'neutral';
  return (
    <div>
      <PageHeader title="My leave" sub={`Your balances for ${data?.year ?? ''} and your requests. Weekends and public holidays are never counted as leave.`} />
      {(error || actionError) && <Notice kind="error">{error || actionError}</Notice>}{msg && <Notice kind="success">{msg}</Notice>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 14 }}>
        {data?.balances.filter((b) => b.entitled > 0 || b.used > 0).map((b) => <Stat key={b.typeId} label={b.name} value={`${b.available} left`} sub={`${b.entitled + b.carriedOver + b.adjusted} total, ${b.used} used`} />)}
      </div>
      <Card title="Ask for leave">
        <Grid>
          <Field label="Type"><Select value={f.typeId} onChange={(e) => setF({ ...f, typeId: e.target.value })}><option value="">Choose…</option>{data?.balances.map((b) => <option key={b.typeId} value={b.typeId}>{b.name} ({b.available} left)</option>)}</Select></Field>
          <Field label="From"><Input type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value, end: e.target.value > f.end ? e.target.value : f.end })} /></Field>
          <Field label="To"><Input type="date" value={f.end} min={f.start} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field>
        </Grid>
        {type?.allowHalfDay && <div style={{ display: 'flex', gap: 16, fontSize: 13, marginBottom: 10 }}><label><input type="checkbox" checked={f.startHalf} onChange={(e) => setF({ ...f, startHalf: e.target.checked })} /> First day is a half day</label><label><input type="checkbox" checked={f.endHalf} onChange={(e) => setF({ ...f, endHalf: e.target.checked })} /> Last day is a half day</label></div>}
        <Field label="Reason (optional)"><TextArea rows={2} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
        {type?.docAfterDays !== null && type?.docAfterDays !== undefined && <Field label={`Supporting document (needed after ${type.docAfterDays} days)`}><input type="file" accept=".pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>}
        {preErr && <Notice kind="error">{preErr}</Notice>}
        {pre && (
          <div style={{ marginBottom: 10 }}>
            <Notice kind="info">This takes <b>{pre.days}</b> day{pre.days === 1 ? '' : 's'}{pre.available !== null ? ` and leaves you ${Math.round((pre.available - pre.days) * 10) / 10}` : ''}. Approval: {pre.chain.map((c) => c.name ?? label(c.role)).join(' then ')}.</Notice>
            {pre.warnings.map((w) => <Notice key={w} kind="warn">{w}</Notice>)}
            {pre.conflicts.length > 0 && <div style={{ fontSize: 12, opacity: 0.8 }}>Also away: {pre.conflicts.map((c) => `${c.name} (${fmtDate(c.start)} to ${fmtDate(c.end)})`).join(', ')}</div>}
          </div>
        )}
        <Btn kind="primary" disabled={busy || !pre} onClick={submit}>{busy ? 'Sending…' : 'Send request'}</Btn>
      </Card>
      <div style={{ marginTop: 14 }}>
        <Card title="My requests">
          {!data?.requests.length ? <Empty>No requests yet.</Empty> : (
            <Table head={['Type', 'Dates', 'Days', 'Status', '']}>
              {data.requests.map((r) => (
                <tr key={r.id}><Td><b>{r.type}</b>{r.reason && <div style={{ fontSize: 11, opacity: 0.7 }}>{r.reason}</div>}</Td><Td>{fmtDate(r.startDate)} to {fmtDate(r.endDate)}</Td><Td>{r.days}</Td>
                  <Td><Pill tone={tone(r.status)}>{label(r.status)}</Pill>{r.waitingOn && <div style={{ fontSize: 11 }}>waiting on {label(r.waitingOn)}</div>}</Td>
                  <Td>{r.canCancel && <Btn small onClick={() => cancel(r.id)}>Cancel</Btn>}</Td></tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}
