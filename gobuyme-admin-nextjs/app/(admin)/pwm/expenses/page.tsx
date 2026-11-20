'use client';
import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import { Btn, Empty, Field, Input, Notice, PageHeader, Pill, Select, Table, Tabs, Td, TextArea, downloadCsv, fmtDate, label, useAction, useLoad, usePwm } from '@/components/pwm/ui';

type Tab = 'claims' | 'travel';
const naira = (n: number) => `₦${n.toLocaleString('en-NG')}`;
interface Claim { id: string; reference: string; title: string; status: string; total: number; employee: { name: string; department: string | null }; submittedAt: string | null; paidByName: string | null; paymentRef: string | null; decisionNote: string | null; canDecide: boolean; canPay: boolean; items: { id: string; category: string; amount: number; date: string; description: string; receiptUrl: string | null; exception: string | null }[] }
interface Trip { id: string; purpose: string; destination: string; startDate: string; endDate: string; estimatedCost: number; advance: number; perDiem: number; status: string; employee: { name: string }; canDecide: boolean }

export default function ExpensesPage() {
  const [tab, setTab] = useState<Tab>('claims');
  return (
    <div>
      <PageHeader title="Expenses and travel" sub="Claims go to the supervisor first, then to Finance for payment. Whoever approves a claim cannot also pay it." />
      <Tabs<Tab> value={tab} onChange={setTab} items={[{ id: 'claims', label: 'Expense claims' }, { id: 'travel', label: 'Travel requests' }]} />
      {tab === 'claims' ? <Claims /> : <Travel />}
    </div>
  );
}

function Claims() {
  const { me } = usePwm();
  const [status, setStatus] = useState('APPROVED');
  const { data, loading, error, reload } = useLoad(() => api.get<{ data: Claim[] }>(`/admin/pwm/expenses${status ? `?status=${status}` : ''}`).then((r) => r.data), [status]);
  const [open, setOpen] = useState<Claim | null>(null);
  const [dlg, setDlg] = useState<{ id: string; approve: boolean } | null>(null);
  const [note, setNote] = useState('');
  const { busy, error: actionError, run } = useAction();
  const decide = () => run(async () => { if (!dlg) return; await api.post(`/admin/pwm/expenses/${dlg.id}/decide`, { approve: dlg.approve, note }); setDlg(null); setNote(''); reload(); });
  const pay = (id: string) => { const ref = window.prompt('Payment reference (bank transfer reference)'); if (ref) run(async () => { await api.post(`/admin/pwm/expenses/${id}/pay`, { paymentRef: ref }); reload(); }); };
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}><Select value={status} onChange={(e) => setStatus(e.target.value)} style={{ maxWidth: 220 }}><option value="SUBMITTED">Waiting for approval</option><option value="APPROVED">Approved, to pay</option><option value="PAID">Paid</option><option value="REJECTED">Declined</option><option value="">All</option></Select>{me?.can.viewExpenses && <Btn onClick={() => run(() => downloadCsv('/admin/pwm/expenses/export.csv', 'expense-claims.csv'))}>Export for accounting</Btn>}</div>
      {(error || actionError) && <Notice kind="error">{error || actionError}</Notice>}
      {loading && !data ? <Empty>Loading…</Empty> : !data?.length ? <Empty>No claims here.</Empty> : (
        <Table head={['Claim', 'Employee', 'Total', 'Status', '']}>
          {data.map((c) => <tr key={c.id}><Td><b>{c.reference}</b><div style={{ fontSize: 11, opacity: 0.7 }}>{c.title}</div></Td><Td>{c.employee.name}<div style={{ fontSize: 11, opacity: 0.7 }}>{c.employee.department}</div></Td><Td><b>{naira(c.total)}</b></Td><Td><Pill tone={c.status === 'PAID' ? 'good' : c.status === 'APPROVED' ? 'info' : c.status === 'SUBMITTED' ? 'warn' : 'bad'}>{label(c.status)}</Pill>{c.paymentRef && <div style={{ fontSize: 11 }}>{c.paymentRef}</div>}</Td>
            <Td><div style={{ display: 'flex', gap: 6 }}><Btn small onClick={() => setOpen(c)}>Items</Btn>{c.canDecide && <><Btn small kind="primary" onClick={() => setDlg({ id: c.id, approve: true })}>Approve</Btn><Btn small kind="danger" onClick={() => setDlg({ id: c.id, approve: false })}>Decline</Btn></>}{c.canPay && <Btn small kind="primary" onClick={() => pay(c.id)}>Pay</Btn>}</div></Td></tr>)}
        </Table>
      )}
      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.reference ?? ''} width={620}><div style={{ padding: 20 }}>{open?.items.map((i) => <div key={i.id} style={{ padding: '7px 0', borderBottom: '1px solid rgba(128,128,128,.2)', fontSize: 13 }}><b>{label(i.category)}</b> · {naira(i.amount)} · {fmtDate(i.date)}<div>{i.description}</div>{i.exception && <div style={{ color: '#d97706', fontSize: 12 }}>Above the limit: {i.exception}</div>}{i.receiptUrl && <a href={i.receiptUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>Receipt</a>}</div>)}</div></Modal>
      <Modal open={!!dlg} onClose={() => setDlg(null)} title={dlg?.approve ? 'Approve' : 'Decline'} width={440}><div style={{ padding: 20 }}><Field label={dlg?.approve ? 'Comment (optional)' : 'Reason (required)'}><TextArea rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field><div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><Btn onClick={() => setDlg(null)}>Cancel</Btn><Btn kind={dlg?.approve ? 'primary' : 'danger'} disabled={busy || (!dlg?.approve && !note.trim())} onClick={decide}>Confirm</Btn></div></div></Modal>
      <span style={{ display: 'none' }}><Input readOnly value="" /></span>
    </div>
  );
}

function Travel() {
  const [status, setStatus] = useState('PENDING');
  const { data, loading, error, reload } = useLoad(() => api.get<{ data: Trip[] }>(`/admin/pwm/travel${status ? `?status=${status}` : ''}`).then((r) => r.data), [status]);
  const { busy, error: actionError, run } = useAction();
  const decide = (id: string, approve: boolean) => { const note = approve ? '' : window.prompt('Reason'); if (!approve && !note) return; run(async () => { await api.post(`/admin/pwm/travel/${id}/decide`, { approve, note }); reload(); }); };
  return (
    <div>
      <div style={{ maxWidth: 220, marginBottom: 12 }}><Select value={status} onChange={(e) => setStatus(e.target.value)}><option value="PENDING">Waiting</option><option value="APPROVED">Approved</option><option value="COMPLETED">Completed</option><option value="">All</option></Select></div>
      {(error || actionError) && <Notice kind="error">{error || actionError}</Notice>}
      {loading && !data ? <Empty>Loading…</Empty> : !data?.length ? <Empty>No travel requests.</Empty> : (
        <Table head={['Employee', 'Trip', 'Dates', 'Estimate', 'Status', '']}>
          {data.map((t) => <tr key={t.id}><Td><b>{t.employee.name}</b></Td><Td>{t.destination}<div style={{ fontSize: 11, opacity: 0.7 }}>{t.purpose}</div></Td><Td>{fmtDate(t.startDate)} to {fmtDate(t.endDate)}</Td><Td>{naira(t.estimatedCost)}<div style={{ fontSize: 11 }}>per diem {naira(t.perDiem)}{t.advance ? ` · advance ${naira(t.advance)}` : ''}</div></Td><Td><Pill tone={t.status === 'APPROVED' || t.status === 'COMPLETED' ? 'good' : t.status === 'PENDING' ? 'warn' : 'bad'}>{label(t.status)}</Pill></Td><Td>{t.canDecide && <div style={{ display: 'flex', gap: 6 }}><Btn small kind="primary" disabled={busy} onClick={() => decide(t.id, true)}>Approve</Btn><Btn small kind="danger" disabled={busy} onClick={() => decide(t.id, false)}>Decline</Btn></div>}</Td></tr>)}
        </Table>
      )}
    </div>
  );
}
