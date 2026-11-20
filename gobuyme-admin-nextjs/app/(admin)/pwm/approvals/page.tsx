'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import { Btn, Card, Empty, Field, Notice, PageHeader, Pill, TextArea, fmtDate, label, useAction, useLoad } from '@/components/pwm/ui';

interface SR { id: string; fromStatus: string; toStatus: string; effectiveDate: string; reason: string; requestedByName: string | null; approver: string; canDecide: boolean; employee: { id: string; employeeNo: string; firstName: string; lastName: string; jobTitle: string } }
interface Pay { id: string; employee: { id: string; employeeNo: string; firstName: string; lastName: string }; effectiveFrom: string; reason: string; preparedByName: string | null; baseSalary: string; canDecide: boolean }
interface BR { id: string; createdAt: string; employee: { id: string; employeeNo: string; firstName: string; lastName: string; bankName: string | null } | null; requested: { bankName?: string; accountEnding: string } }
interface CR { id: string; reference: string; contractType: string; status: string; employee: { id: string; firstName: string; lastName: string; employeeNo: string } }

export default function ApprovalsPage() {
  const status = useLoad(() => api.get<{ data: SR[] }>('/admin/pwm/status-requests').then((r) => r.data), []);
  const pay = useLoad(() => api.get<{ data: Pay[] }>('/admin/pwm/compensation/pending').then((r) => r.data).catch(() => [] as Pay[]), []);
  const contracts = useLoad(() => api.get<{ data: CR[] }>('/admin/pwm/contracts?view=all&status=PENDING_APPROVAL').then((r) => r.data).catch(() => [] as CR[]), []);
  const bank = useLoad(() => api.get<{ data: BR[] }>('/admin/pwm/change-requests').then((r) => r.data).catch(() => [] as BR[]), []);
  const [dlg, setDlg] = useState<{ kind: 'status' | 'pay' | 'bank'; id: string; approve: boolean } | null>(null);
  const [note, setNote] = useState('');
  const { busy, error, run } = useAction();
  const decide = () => run(async () => {
    if (!dlg) return;
    await api.post(dlg.kind === 'status' ? `/admin/pwm/status-requests/${dlg.id}/decide` : dlg.kind === 'bank' ? `/admin/pwm/change-requests/${dlg.id}/decide` : `/admin/pwm/compensation/${dlg.id}/decide`, { approve: dlg.approve, note });
    setDlg(null); setNote(''); status.reload(); pay.reload(); bank.reload();
  });
  const empty = !status.data?.length && !pay.data?.length && !contracts.data?.length && !bank.data?.length;
  return (
    <div>
      <PageHeader title="Approvals" sub="Suspensions, terminations, contracts and pay changes wait here for a second person. You cannot approve your own request." />
      {error && <Notice kind="error">{error}</Notice>}
      {empty && !status.loading && <Empty>Nothing is waiting for approval.</Empty>}
      {!!status.data?.length && (
        <Card title="Status changes">
          {status.data.map((s) => (
            <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '10px 0', borderBottom: '1px solid rgba(128,128,128,0.2)', flexWrap: 'wrap' }}>
              <div style={{ fontSize: 13 }}><Link href={`/pwm/employees/${s.employee.id}`} style={{ fontWeight: 700, color: 'inherit' }}>{s.employee.firstName} {s.employee.lastName}</Link> ({s.employee.employeeNo}): {label(s.fromStatus)} → <b>{label(s.toStatus)}</b> from {fmtDate(s.effectiveDate)}<div style={{ fontSize: 12, opacity: 0.75 }}>Requested by {s.requestedByName ?? '?'}. {s.reason}</div></div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>{s.canDecide ? <><Btn small kind="primary" onClick={() => setDlg({ kind: 'status', id: s.id, approve: true })}>Approve</Btn><Btn small kind="danger" onClick={() => setDlg({ kind: 'status', id: s.id, approve: false })}>Decline</Btn></> : <Pill>Needs {label(s.approver)}</Pill>}</div>
            </div>
          ))}
        </Card>
      )}
      {!!contracts.data?.length && <div style={{ marginTop: 12 }}><Card title="Contracts awaiting approval">{contracts.data.map((c) => <div key={c.id} style={{ padding: '8px 0', fontSize: 13 }}><Link href={`/pwm/contracts/${c.id}`} style={{ fontWeight: 700 }}>{c.reference}</Link> · {c.employee.firstName} {c.employee.lastName} · {label(c.contractType)}</div>)}</Card></div>}
      {!!bank.data?.length && (
        <div style={{ marginTop: 12 }}><Card title="Bank detail changes to verify">
          {bank.data.map((b) => (
            <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '10px 0', flexWrap: 'wrap' }}>
              <div style={{ fontSize: 13 }}><b>{b.employee?.firstName} {b.employee?.lastName}</b> ({b.employee?.employeeNo}) asked to change to <b>{b.requested.bankName}</b> account ending <b>{b.requested.accountEnding}</b><div style={{ fontSize: 12, opacity: 0.75 }}>Confirm with them through a number or channel you already hold before approving.</div></div>
              <div style={{ display: 'flex', gap: 6 }}><Btn small kind="primary" onClick={() => setDlg({ kind: 'bank', id: b.id, approve: true })}>Verified, approve</Btn><Btn small kind="danger" onClick={() => setDlg({ kind: 'bank', id: b.id, approve: false })}>Decline</Btn></div>
            </div>
          ))}
        </Card></div>
      )}
      {!!pay.data?.length && (
        <div style={{ marginTop: 12 }}><Card title="Pay changes">
          {pay.data.map((p) => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '10px 0', flexWrap: 'wrap' }}>
              <div style={{ fontSize: 13 }}><b>{p.employee.firstName} {p.employee.lastName}</b> ({p.employee.employeeNo}) from {fmtDate(p.effectiveFrom)}: base ₦{Number(p.baseSalary).toLocaleString('en-NG')}<div style={{ fontSize: 12, opacity: 0.75 }}>Prepared by {p.preparedByName ?? '?'}. {p.reason}</div></div>
              {p.canDecide ? <div style={{ display: 'flex', gap: 6 }}><Btn small kind="primary" onClick={() => setDlg({ kind: 'pay', id: p.id, approve: true })}>Approve</Btn><Btn small kind="danger" onClick={() => setDlg({ kind: 'pay', id: p.id, approve: false })}>Decline</Btn></div> : <Pill>Needs another approver</Pill>}
            </div>
          ))}
        </Card></div>
      )}
      <Modal open={!!dlg} onClose={() => setDlg(null)} title={dlg?.approve ? 'Approve' : 'Decline'} width={440}>
        <div style={{ padding: 20 }}>
          <Field label={dlg?.kind === 'bank' && dlg.approve ? 'How you verified it (required)' : dlg?.approve ? 'Comment (optional)' : 'Reason (required)'}><TextArea rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><Btn onClick={() => setDlg(null)}>Cancel</Btn><Btn kind={dlg?.approve ? 'primary' : 'danger'} disabled={busy || ((!dlg?.approve || dlg?.kind === 'bank') && !note.trim())} onClick={decide}>Confirm</Btn></div>
        </div>
      </Modal>
    </div>
  );
}
