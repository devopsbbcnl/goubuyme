'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTheme } from '@/context/ThemeContext';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import {
  Btn, Card, ContractStatusPill, Days, DECISION_LABEL, Empty, Field, Grid, Input, Notice, PageHeader, Pill, STEP_LABEL, Table, Td, TextArea, fmtDate, fmtDateTime, label, todayYmd,
  uploadDocument, useAction, useLoad, usePwm,
} from '@/components/pwm/ui';

interface Detail {
  id: string; reference: string; contractType: string; status: string; commencementDate: string; expiryDate: string | null; daysRemaining: number | null; locked: boolean;
  duration: { years: number; months: number; days: number } | null; approvalStatus: string; approvalNote: string | null; approvedByName: string | null; issuedAt: string | null; issuedByName: string | null;
  signedDate: string | null; countersignedDate: string | null; renewalDecision: string | null; decisionRecordedAt: string | null; officerName: string | null; probationMonths: number | null; probationEndDate: string | null;
  noticeValue: number | null; noticeUnit: string | null; workingPattern: string | null; notes: string | null; isImported: boolean; templateName: string | null;
  employee: { id: string; employeeNo: string; firstName: string; lastName: string; department: { name: string } | null; status: string };
  predecessor: { id: string; reference: string; status: string } | null; successor: { id: string; reference: string; status: string } | null;
  amendments: { id: string; effectiveDate: string; summary: string; newExpiryDate: string | null; documentUrl: string | null }[];
  documents: { id: string; name: string; version: number; url: string; checksum: string | null; createdAt: string }[];
  renewals: { id: string; step: string; recommendation: string | null; decision: string | null; recommendedByName: string | null; decidedByName: string | null; closedReason: string | null; events: { id: string; action: string; note: string | null; actorName: string | null; createdAt: string }[] }[];
  reminders: { id: string; tierKey: string; severity: string; channel: string; recipient: string | null; recipientRole: string; status: string; sentAt: string | null; acknowledgedAt: string | null; cancelReason: string | null; attempts: number }[];
}

export default function ContractPage() {
  const { id } = useParams<{ id: string }>();
  const { theme: T } = useTheme();
  const { me } = usePwm();
  const { data: c, loading, error, reload } = useLoad(() => api.get<{ data: Detail }>(`/admin/pwm/contracts/${id}`).then((r) => r.data), [id]);
  const [modal, setModal] = useState<'amend' | 'sign' | 'note' | null>(null);
  const [note, setNote] = useState<{ title: string; path: string; body: Record<string, unknown> } | null>(null);
  const { busy, error: actionError, run } = useAction();
  if (loading && !c) return <Empty>Loading…</Empty>;
  if (error || !c) return <Notice kind="error">{error || 'Contract not found.'}</Notice>;
  const post = (path: string, body: Record<string, unknown> = {}) => run(async () => { await api.post(`/admin/pwm/contracts/${c.id}/${path}`, body); reload(); });
  const manage = !!me?.can.manageContracts;
  const inForce = ['ACTIVE', 'RENEWAL_PENDING', 'EXPIRED_ACTION_REQUIRED'].includes(c.status);
  const openRenewal = c.renewals.find((r) => !['COMPLETED', 'CLOSED'].includes(r.step));
  return (
    <div>
      <PageHeader title={c.reference} sub={`${c.employee.firstName} ${c.employee.lastName} (${c.employee.employeeNo}) · ${c.employee.department?.name ?? 'No department'} · ${label(c.contractType)}`}
        actions={<>
          <ContractStatusPill status={c.status} />
          {manage && c.status === 'DRAFT' && <Btn kind="primary" disabled={busy} onClick={() => post('submit')}>Submit</Btn>}
          {me?.can.approveContracts && c.status === 'PENDING_APPROVAL' && <><Btn kind="primary" disabled={busy} onClick={() => post('approval', { approve: true })}>Approve</Btn><Btn kind="danger" onClick={() => setNote({ title: 'Return to draft', path: 'approval', body: { approve: false } })}>Return</Btn></>}
          {manage && c.status === 'APPROVED' && <Btn kind="primary" disabled={busy} onClick={() => post('issue')}>Issue for signature</Btn>}
          {manage && c.status === 'ISSUED' && <><Btn kind="primary" onClick={() => setModal('sign')}>Record signature</Btn><Btn onClick={() => setNote({ title: 'Employee declined', path: 'decline', body: {} })}>Declined</Btn></>}
          {manage && ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ISSUED'].includes(c.status) && <Btn kind="danger" onClick={() => setNote({ title: 'Cancel contract', path: 'cancel', body: {} })}>Cancel</Btn>}
          {manage && (inForce || c.status === 'SIGNED') && <Btn onClick={() => setModal('amend')}>Amend</Btn>}
          {manage && inForce && !openRenewal && c.expiryDate && <Btn onClick={() => post('renewal')}>Start renewal</Btn>}
        </>} />
      {actionError && <Notice kind="error">{actionError}</Notice>}
      {c.status === 'EXPIRED_ACTION_REQUIRED' && <Notice kind="error">This contract has passed its expiry date with no recorded decision. Employment has not been ended. {openRenewal ? <Link href={`/pwm/renewals/${openRenewal.id}`}>Open the renewal</Link> : 'Start a renewal or record an amendment.'}</Notice>}
      {c.locked && <Notice kind="info">Signed contracts cannot have their core terms edited. Use Amend (for example a new expiry date) or start a renewal.</Notice>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
        <Card title="Terms">
          {([['Start', fmtDate(c.commencementDate)], ['Expiry', c.expiryDate ? <span key="e">{fmtDate(c.expiryDate)} <Days days={c.daysRemaining} /></span> : 'No expiry'], ['Duration', c.duration ? `${c.duration.years}y ${c.duration.months}m ${c.duration.days}d` : '—'],
            ['Probation', c.probationMonths ? `${c.probationMonths} months, ends ${fmtDate(c.probationEndDate)}` : '—'], ['Notice', c.noticeValue ? `${c.noticeValue} ${(c.noticeUnit ?? '').toLowerCase()}` : '—'], ['HR officer', c.officerName ?? 'Not set'],
            ['Renewal decision', c.renewalDecision ? DECISION_LABEL[c.renewalDecision] : '—'], ['Chain', <span key="ch">{c.predecessor ? <Link href={`/pwm/contracts/${c.predecessor.id}`}>← {c.predecessor.reference}</Link> : 'First'} {c.successor && <Link href={`/pwm/contracts/${c.successor.id}`}> → {c.successor.reference}</Link>}</span>]] as [string, React.ReactNode][]).map(([k, v]) => (
            <div key={k} style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: 8, padding: '7px 0', borderBottom: `1px solid ${T.border}`, fontSize: 13 }}><span style={{ color: T.textSec }}>{k}</span><span style={{ color: T.text }}>{v}</span></div>
          ))}
        </Card>
        <Card title="Approval and signature">
          {([['Approval', `${label(c.approvalStatus)}${c.approvedByName ? ` by ${c.approvedByName}` : ''}`], ['Issued', c.issuedAt ? `${fmtDateTime(c.issuedAt)} by ${c.issuedByName ?? '?'}` : '—'], ['Signed by employee', c.signedDate ? fmtDate(c.signedDate) : '—'], ['Countersigned', c.countersignedDate ? fmtDate(c.countersignedDate) : '—'], ['Source', c.isImported ? 'Bulk import (signed copy to attach)' : 'Created here']] as [string, string][]).map(([k, v]) => (
            <div key={k} style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: 8, padding: '7px 0', borderBottom: `1px solid ${T.border}`, fontSize: 13 }}><span style={{ color: T.textSec }}>{k}</span><span style={{ color: T.text }}>{v}</span></div>
          ))}
          <div style={{ marginTop: 10 }}>{c.documents.length === 0 ? <span style={{ fontSize: 12, color: T.textMuted }}>No signed document uploaded.</span> : c.documents.map((d) => <div key={d.id} style={{ fontSize: 12, marginTop: 4 }}><a href={d.url} target="_blank" rel="noreferrer" style={{ color: T.primary, fontWeight: 700 }}>{d.name} (v{d.version})</a> <span style={{ color: T.textMuted }}>{d.checksum ? `SHA-256 ${d.checksum.slice(0, 12)}…` : ''}</span></div>)}</div>
        </Card>
      </div>

      {c.amendments.length > 0 && <div style={{ marginTop: 14 }}><Card title="Amendments">{c.amendments.map((a) => <div key={a.id} style={{ padding: '6px 0', borderBottom: `1px solid ${T.border}`, fontSize: 13, color: T.text }}><b>{fmtDate(a.effectiveDate)}</b>: {a.summary}{a.newExpiryDate && <> (new expiry {fmtDate(a.newExpiryDate)})</>}</div>)}</Card></div>}

      {c.renewals.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <Card title="Renewal history">
            {c.renewals.map((r) => (
              <div key={r.id} style={{ marginBottom: 12 }}>
                <div style={{ marginBottom: 6 }}><Link href={`/pwm/renewals/${r.id}`}><Pill tone={['COMPLETED', 'CLOSED'].includes(r.step) ? 'neutral' : 'warn'}>{STEP_LABEL[r.step]}</Pill></Link> {r.closedReason && <span style={{ fontSize: 12, color: T.textSec }}>{r.closedReason}</span>}</div>
                {r.events.map((e) => <div key={e.id} style={{ fontSize: 12, color: T.textSec, padding: '2px 0' }}>{fmtDateTime(e.createdAt)} · <b style={{ color: T.text }}>{label(e.action)}</b> by {e.actorName ?? 'System'}{e.note ? `: ${e.note}` : ''}</div>)}
              </div>
            ))}
          </Card>
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        <Card title="Reminder history">
          {c.reminders.length === 0 ? <Empty>No reminders yet.</Empty> : (
            <Table head={['Tier', 'To', 'Channel', 'Status', 'Sent', 'Acknowledged']}>
              {c.reminders.map((r) => <tr key={r.id}><Td><b>{r.tierKey}</b></Td><Td>{r.recipient ?? '—'} <span style={{ opacity: 0.6, fontSize: 11 }}>{label(r.recipientRole)}</span></Td><Td>{label(r.channel)}</Td>
                <Td><Pill tone={r.status === 'FAILED' ? 'bad' : r.status === 'CANCELLED' ? 'neutral' : 'good'}>{label(r.status)}</Pill>{r.cancelReason && <div style={{ fontSize: 11 }}>{r.cancelReason}</div>}</Td><Td>{r.sentAt ? fmtDateTime(r.sentAt) : '—'}</Td><Td>{r.acknowledgedAt ? fmtDateTime(r.acknowledgedAt) : '—'}</Td></tr>)}
            </Table>
          )}
        </Card>
      </div>

      {modal === 'amend' && <Amend id={c.id} expiry={c.expiryDate} onClose={() => setModal(null)} onDone={() => { setModal(null); reload(); }} />}
      {modal === 'sign' && <Sign id={c.id} onClose={() => setModal(null)} onDone={() => { setModal(null); reload(); }} />}
      {note && <NoteModal n={note} id={c.id} onClose={() => setNote(null)} onDone={() => { setNote(null); reload(); }} />}
    </div>
  );
}

function NoteModal({ n, id, onClose, onDone }: { n: { title: string; path: string; body: Record<string, unknown> }; id: string; onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState('');
  const { busy, error, run } = useAction();
  return (
    <Modal open onClose={onClose} title={n.title} width={440}>
      <div style={{ padding: 20 }}>{error && <Notice kind="error">{error}</Notice>}
        <Field label="Reason (recorded)"><TextArea rows={3} value={text} onChange={(e) => setText(e.target.value)} /></Field>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><Btn onClick={onClose}>Back</Btn><Btn kind="primary" disabled={busy || !text.trim()} onClick={() => run(async () => { await api.post(`/admin/pwm/contracts/${id}/${n.path}`, { ...n.body, note: text }); onDone(); })}>Confirm</Btn></div>
      </div>
    </Modal>
  );
}

function Amend({ id, expiry, onClose, onDone }: { id: string; expiry: string | null; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ effectiveDate: todayYmd(), summary: '', newExpiryDate: '' });
  const { busy, error, run } = useAction();
  return (
    <Modal open onClose={onClose} title="Amend contract" width={500}>
      <div style={{ padding: 20 }}>{error && <Notice kind="error">{error}</Notice>}
        <Notice kind="info">An amendment is recorded as an addendum; the original contract is never overwritten. Changing the expiry date restarts the reminder schedule for the new date.</Notice>
        <Grid><Field label="Effective date"><Input type="date" value={f.effectiveDate} onChange={(e) => setF({ ...f, effectiveDate: e.target.value })} /></Field>
          <Field label="New expiry date" hint={expiry ? `Currently ${fmtDate(expiry)}` : undefined}><Input type="date" value={f.newExpiryDate} onChange={(e) => setF({ ...f, newExpiryDate: e.target.value })} /></Field></Grid>
        <Field label="What changed"><TextArea rows={3} value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} /></Field>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy || !f.summary.trim()} onClick={() => run(async () => { await api.post(`/admin/pwm/contracts/${id}/amendments`, { ...f, newExpiryDate: f.newExpiryDate || null }); onDone(); })}>Record</Btn></div>
      </div>
    </Modal>
  );
}

function Sign({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ signedDate: todayYmd(), countersignedDate: todayYmd() });
  const [file, setFile] = useState<File | null>(null);
  const { busy, error, run } = useAction();
  return (
    <Modal open onClose={onClose} title="Record signature" width={480}>
      <div style={{ padding: 20 }}>{error && <Notice kind="error">{error}</Notice>}
        <Grid><Field label="Signed by employee"><Input type="date" value={f.signedDate} onChange={(e) => setF({ ...f, signedDate: e.target.value })} /></Field><Field label="Countersigned by company"><Input type="date" value={f.countersignedDate} onChange={(e) => setF({ ...f, countersignedDate: e.target.value })} /></Field></Grid>
        <Field label="Signed contract (PDF)" hint="A checksum is stored so any later change to the file can be detected."><input type="file" accept=".pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy || !file} onClick={() => run(async () => { const up = await uploadDocument(file as File); await api.post(`/admin/pwm/contracts/${id}/sign`, { ...f, documentUrl: up.url, documentChecksum: up.checksum }); onDone(); })}>{busy ? 'Saving…' : 'Save'}</Btn></div>
      </div>
    </Modal>
  );
}
