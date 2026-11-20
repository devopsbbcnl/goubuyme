'use client';
import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import { Btn, Card, Empty, Field, Notice, PageHeader, Pill, TextArea, fmtDate, label, useAction, useLoad } from '@/components/pwm/ui';

interface More {
  enrolments: { id: string; employee: string; course: string; cost: number }[];
  claims: { id: string; employee: string; reference: string; title: string; total: number; items: { category: string; amount: number; description: string; receiptUrl: string | null; exception: string | null }[] }[];
  travel: { id: string; employee: string; destination: string; purpose: string; startDate: string; endDate: string; estimatedCost: number; advance: number; perDiem: number }[];
}

interface Data {
  leave: { id: string; employee: string; type: string; startDate: string; endDate: string; days: number; reason: string | null; docUrl: string | null; clashes: { name: string; start: string; end: string }[] }[];
  corrections: { id: string; employee: string; date: string; originalIn: string | null; originalOut: string | null; requestedIn: string | null; requestedOut: string | null; reason: string }[];
  overtime: { id: string; employee: string; date: string; hours: number; reason: string }[];
}
const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' }) : '—');

export default function MyApprovals() {
  const { data, loading, error, reload } = useLoad(() => api.get<{ data: Data }>('/my-hr/approvals').then((r) => r.data), []);
  const more = useLoad(() => api.get<{ data: More }>('/my-hr/approvals/more').then((r) => r.data), []);
  const [dlg, setDlg] = useState<{ kind: 'leave' | 'corrections' | 'overtime' | 'enrolments' | 'expenses' | 'travel'; id: string; approve: boolean } | null>(null);
  const [note, setNote] = useState('');
  const { busy, error: actionError, run } = useAction();
  const decide = () => run(async () => { if (!dlg) return; await api.post(`/my-hr/approvals/${dlg.kind}/${dlg.id}`, { approve: dlg.approve, note }); setDlg(null); setNote(''); reload(); more.reload(); window.dispatchEvent(new Event('gbm:pending-counts-updated')); });
  const none = data && !data.leave.length && !data.corrections.length && !data.overtime.length && more.data && !more.data.enrolments.length && !more.data.claims.length && !more.data.travel.length;
  const Actions = ({ kind, id }: { kind: 'leave' | 'corrections' | 'overtime' | 'enrolments' | 'expenses' | 'travel'; id: string }) => <div style={{ display: 'flex', gap: 6 }}><Btn small kind="primary" onClick={() => setDlg({ kind, id, approve: true })}>Approve</Btn><Btn small kind="danger" onClick={() => setDlg({ kind, id, approve: false })}>Decline</Btn></div>;
  return (
    <div>
      <PageHeader title="Approvals" sub="Leave, attendance corrections and overtime from the people you manage." />
      {(error || actionError) && <Notice kind="error">{error || actionError}</Notice>}
      {loading && !data ? <Empty>Loading…</Empty> : none ? <Empty>Nothing is waiting for you.</Empty> : data && (
        <>
          {data.leave.length > 0 && <Card title="Leave">{data.leave.map((l) => (
            <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '10px 0', flexWrap: 'wrap', borderBottom: '1px solid rgba(128,128,128,.2)' }}>
              <div style={{ fontSize: 13 }}><b>{l.employee}</b>: {l.type}, {fmtDate(l.startDate)} to {fmtDate(l.endDate)} ({l.days} days){l.reason && <div style={{ opacity: 0.75 }}>{l.reason}</div>}{l.docUrl && <a href={l.docUrl} target="_blank" rel="noreferrer">Document</a>}
                {l.clashes.length > 0 ? <div style={{ marginTop: 4 }}><Pill tone="warn">Also away</Pill> <span style={{ fontSize: 12 }}>{l.clashes.map((c) => `${c.name} (${fmtDate(c.start)} to ${fmtDate(c.end)})`).join(', ')}</span></div> : <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>Nobody else in the team is away then.</div>}</div>
              <Actions kind="leave" id={l.id} />
            </div>))}</Card>}
          {data.corrections.length > 0 && <div style={{ marginTop: 12 }}><Card title="Attendance corrections">{data.corrections.map((c) => (
            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '10px 0', flexWrap: 'wrap' }}>
              <div style={{ fontSize: 13 }}><b>{c.employee}</b> · {fmtDate(c.date)}<div>Was {time(c.originalIn)} to {time(c.originalOut)}, now {time(c.requestedIn)} to {time(c.requestedOut)}</div><div style={{ opacity: 0.75 }}>{c.reason}</div></div>
              <Actions kind="corrections" id={c.id} />
            </div>))}</Card></div>}
          {data.overtime.length > 0 && <div style={{ marginTop: 12 }}><Card title="Overtime">{data.overtime.map((o) => (
            <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '10px 0', flexWrap: 'wrap' }}>
              <div style={{ fontSize: 13 }}><b>{o.employee}</b> · {fmtDate(o.date)} · {o.hours} hours<div style={{ opacity: 0.75 }}>{o.reason}</div></div>
              <Actions kind="overtime" id={o.id} />
            </div>))}</Card></div>}
        </>
      )}
      {more.data && more.data.enrolments.length > 0 && <div style={{ marginTop: 12 }}><Card title="Training requests">{more.data.enrolments.map((e) => <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 0', flexWrap: 'wrap' }}><div style={{ fontSize: 13 }}><b>{e.employee}</b>: {e.course}{e.cost ? ` (₦${e.cost.toLocaleString('en-NG')})` : ' (free)'}</div><Actions kind="enrolments" id={e.id} /></div>)}</Card></div>}
      {more.data && more.data.claims.length > 0 && <div style={{ marginTop: 12 }}><Card title="Expense claims">{more.data.claims.map((c) => <div key={c.id} style={{ padding: '8px 0', borderBottom: '1px solid rgba(128,128,128,.2)' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}><div style={{ fontSize: 13 }}><b>{c.employee}</b>: {c.title} <b>₦{c.total.toLocaleString('en-NG')}</b> <span style={{ opacity: 0.7 }}>{c.reference}</span></div><Actions kind="expenses" id={c.id} /></div>{c.items.map((i, k) => <div key={k} style={{ fontSize: 12, opacity: 0.85 }}>• {label(i.category)} ₦{i.amount.toLocaleString('en-NG')}: {i.description} {i.receiptUrl ? <a href={i.receiptUrl} target="_blank" rel="noreferrer">receipt</a> : ''}{i.exception ? <span style={{ color: '#d97706' }}> (above limit: {i.exception})</span> : ''}</div>)}</div>)}</Card></div>}
      {more.data && more.data.travel.length > 0 && <div style={{ marginTop: 12 }}><Card title="Travel requests">{more.data.travel.map((t) => <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 0', flexWrap: 'wrap' }}><div style={{ fontSize: 13 }}><b>{t.employee}</b>: {t.destination}, {fmtDate(t.startDate)} to {fmtDate(t.endDate)}<div style={{ opacity: 0.75 }}>{t.purpose} · estimate ₦{t.estimatedCost.toLocaleString('en-NG')}{t.advance ? `, advance ₦${t.advance.toLocaleString('en-NG')}` : ''}, per diem ₦{t.perDiem.toLocaleString('en-NG')}</div></div><Actions kind="travel" id={t.id} /></div>)}</Card></div>}
      <Modal open={!!dlg} onClose={() => setDlg(null)} title={dlg?.approve ? 'Approve' : 'Decline'} width={440}>
        <div style={{ padding: 20 }}>
          <Field label={dlg?.approve ? 'Comment (optional)' : 'Reason (required)'}><TextArea rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><Btn onClick={() => setDlg(null)}>Cancel</Btn><Btn kind={dlg?.approve ? 'primary' : 'danger'} disabled={busy || (!dlg?.approve && !note.trim())} onClick={decide}>Confirm</Btn></div>
        </div>
      </Modal>
    </div>
  );
}
