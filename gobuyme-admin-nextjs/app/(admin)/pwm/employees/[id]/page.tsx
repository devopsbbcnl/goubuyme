'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTheme } from '@/context/ThemeContext';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import {
  Btn, Card, ContractStatusPill, Days, Empty, EmpStatusPill, Field, Grid, Input, Notice, PageHeader, Pill, Select, Table, Tabs, Td, TextArea, fmtDate, fmtDateTime, label,
  todayYmd, uploadDocument, useAction, useLoad, usePwm, dateInput,
} from '@/components/pwm/ui';

interface Contract { id: string; reference: string; contractType: string; status: string; commencementDate: string; expiryDate: string | null; daysRemaining: number | null; amendments: { id: string; effectiveDate: string; summary: string; newExpiryDate: string | null }[] }
interface Doc { id: string; kind: string; category: string; name: string; issuer: string | null; number: string | null; expiryDate: string | null; url: string; version: number; restricted: boolean; createdAt: string }
interface StatusRow { id: string; fromStatus: string; toStatus: string; effectiveDate: string; reason: string; approvalStatus: string; appliedAt: string | null; requestedByName: string | null; approvedByName: string | null }
interface Comp { id: string; effectiveFrom: string; effectiveTo: string | null; baseSalary: string; currency: string; reason: string; approvalStatus: string; preparedByName: string | null; approvedByName: string | null; components: { name: string; amount: number }[] | null }
interface Emp {
  id: string; employeeNo: string; fullName: string; firstName: string; lastName: string; middleName: string | null; title: string | null; status: string; jobTitle: string; employmentType: string; hireDate: string; originalHireDate: string | null;
  workEmail: string | null; personalEmail?: string | null; phone?: string | null; address?: string | null; dateOfBirth?: string | null; sex?: string | null; maritalStatus?: string | null; nationality?: string | null; stateOfOrigin?: string | null;
  grade?: string | null; costCentre?: string | null; location: string | null; workArrangement: string; probationEndDate: string | null; confirmationDate: string | null; version: number; employmentEpisode: number;
  department: { id: string; name: string } | null; manager: { id: string; firstName: string; lastName: string } | null; hrOfficerUserId: string | null; hrOfficerName: string | null; userId: string | null;
  emergencyContacts?: { name?: string; relationship?: string; phone?: string }[] | null; exitType: string | null; exitDate: string | null; finalWorkingDay: string | null; rehireEligible: boolean | null;
  nin?: string; tin?: string; rsaPin?: string; nhfNo?: string; bankAccountNo?: string; bankName?: string; bankAccountName?: string; pfaName?: string;
  contracts: Contract[]; documents: Doc[]; statusLog: StatusRow[]; compensation: Comp[] | null; archivedAt: string | null;
  checklists: { id: string; kind: string; status: string; startDate: string; total: number; done: number }[];
  allowedStatuses: { status: string; label: string; approver?: string }[]; lastUpdated: { at: string; by: string | null; action: string } | null;
  permissions: { edit: boolean; reveal: boolean; compensation: boolean };
}
type Tab = 'overview' | 'contracts' | 'documents' | 'status' | 'checklists' | 'exit' | 'performance' | 'growth' | 'pay' | 'timeline';

export default function EmployeePage() {
  const { id } = useParams<{ id: string }>();
  const { theme: T } = useTheme();
  const { me } = usePwm();
  const { data: e, loading, error, reload } = useLoad(() => api.get<{ data: Emp }>(`/admin/pwm/employees/${id}`).then((r) => r.data), [id]);
  const [tab, setTab] = useState<Tab>('overview');
  const [modal, setModal] = useState<'edit' | 'status' | 'contract' | 'doc' | 'cert' | 'rehire' | 'pay' | 'access' | 'preboard' | 'generate' | null>(null);
  if (loading && !e) return <Empty>Loading…</Empty>;
  if (error || !e) return <Notice kind="error">{error || 'Employee not found.'}</Notice>;
  const current = e.contracts.find((c) => ['ACTIVE', 'RENEWAL_PENDING', 'EXPIRED_ACTION_REQUIRED'].includes(c.status));
  const done = () => { setModal(null); reload(); };
  return (
    <div>
      <PageHeader
        title={e.fullName}
        sub={`${e.employeeNo} · ${e.jobTitle} · ${e.department?.name ?? 'No department'}${e.employmentEpisode > 1 ? ` · employment episode ${e.employmentEpisode}` : ''}`}
        actions={<>
          <EmpStatusPill status={e.status} />
          {e.permissions.edit && !e.archivedAt && <Btn onClick={() => setModal('edit')}>Edit</Btn>}
          {me?.can.changeStatus && e.allowedStatuses.length > 0 && <Btn onClick={() => setModal('status')}>Change status</Btn>}
          {me?.can.manageEmployees && e.status === 'ARCHIVED' && <Btn kind="primary" onClick={() => setModal('rehire')}>Rehire</Btn>}
          {me?.can.manageTemplates && <Btn onClick={() => setModal('generate')}>Generate document</Btn>}
          {me?.can.manageEmployees && e.status === 'PENDING_ONBOARDING' && <Btn onClick={() => setModal('preboard')}>Pre-boarding link</Btn>}
          {me?.can.manageEmployees && !['RESIGNED', 'TERMINATED', 'ARCHIVED'].includes(e.status) && <Btn onClick={() => setModal('access')}>My HR access</Btn>}
        </>}
      />
      {e.status === 'CONTRACT_EXPIRED' && <Notice kind="error">The contract has expired with no recorded decision. Employment has not ended. Management must decide on a renewal, extension or exit.</Notice>}
      {e.lastUpdated && <div style={{ fontSize: 12, color: T.textSec, marginBottom: 12 }}>Last updated {fmtDateTime(e.lastUpdated.at)} by {e.lastUpdated.by ?? 'unknown'}.</div>}
      <Tabs<Tab> value={tab} onChange={setTab} items={[
        { id: 'overview', label: 'Overview' }, { id: 'contracts', label: `Contracts (${e.contracts.length})` }, { id: 'documents', label: `Documents (${e.documents.length})` }, { id: 'status', label: 'Status history' },
        { id: 'checklists', label: 'Onboarding & exit' }, ...(['NOTICE_PERIOD', 'RESIGNED', 'TERMINATED', 'ARCHIVED'].includes(e.status) ? [{ id: 'exit' as Tab, label: 'Exit clearance' }] : []), ...(me?.can.viewPerformance ? [{ id: 'performance' as Tab, label: 'Performance' }] : []), ...(me?.can.viewLearning || me?.can.viewAssets ? [{ id: 'growth' as Tab, label: 'Learning, assets, recognition' }] : []), ...(e.permissions.compensation ? [{ id: 'pay' as Tab, label: 'Pay' }] : []), ...(me?.can.manageEmployees ? [{ id: 'timeline' as Tab, label: 'Timeline' }] : []),
      ]} />

      {tab === 'overview' && <Overview e={e} current={current} reload={reload} />}
      {tab === 'contracts' && (
        <div>
          {me?.can.manageContracts && !e.archivedAt && <div style={{ marginBottom: 12 }}><Btn kind="primary" onClick={() => setModal('contract')}>+ Record contract</Btn></div>}
          {e.contracts.length === 0 ? <Empty>No contracts recorded.</Empty> : (
            <Table head={['Reference', 'Type', 'Status', 'Start', 'Expiry', 'Amendments']}>
              {e.contracts.map((c) => (
                <tr key={c.id}>
                  <Td><Link href={`/pwm/contracts/${c.id}`} style={{ fontWeight: 700, color: 'inherit' }}>{c.reference}</Link></Td><Td>{label(c.contractType)}</Td><Td><ContractStatusPill status={c.status} /></Td>
                  <Td>{fmtDate(c.commencementDate)}</Td><Td>{c.expiryDate ? <>{fmtDate(c.expiryDate)} <Days days={c.daysRemaining} /></> : 'No expiry'}</Td><Td>{c.amendments.length || '—'}</Td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      )}
      {tab === 'documents' && (
        <div>
          {me?.can.manageEmployees && !e.archivedAt && <div style={{ marginBottom: 12, display: 'flex', gap: 8 }}><Btn kind="primary" onClick={() => setModal('doc')}>+ Add document</Btn><Btn onClick={() => setModal('cert')}>+ Add certification</Btn></div>}
          {e.documents.length === 0 ? <Empty>No documents yet.</Empty> : (
            <Table head={['Name', 'Category', 'Version', 'Expiry', 'Added', '']}>
              {e.documents.map((d) => (
                <tr key={d.id}>
                  <Td><b>{d.name}</b>{d.number && <div style={{ fontSize: 11, opacity: 0.7 }}>{d.issuer ? `${d.issuer} · ` : ''}{d.number}</div>}{d.restricted && <Pill tone="warn">Restricted</Pill>}</Td>
                  <Td>{d.kind === 'CERTIFICATION' ? 'Certification' : d.category}</Td><Td>v{d.version}</Td><Td>{d.expiryDate ? fmtDate(d.expiryDate) : '—'}</Td><Td>{fmtDate(d.createdAt)}</Td>
                  <Td><a href={d.url} target="_blank" rel="noreferrer" style={{ color: T.primary, fontWeight: 700 }}>Open</a></Td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      )}
      {tab === 'status' && (e.statusLog.length === 0 ? <Empty>No status changes yet.</Empty> : (
        <Table head={['When', 'From', 'To', 'Reason', 'Requested by', 'Approved by', 'State']}>
          {e.statusLog.map((s) => (
            <tr key={s.id}><Td>{fmtDate(s.effectiveDate)}</Td><Td>{label(s.fromStatus)}</Td><Td><b>{label(s.toStatus)}</b></Td><Td>{s.reason}</Td><Td>{s.requestedByName ?? '—'}</Td><Td>{s.approvedByName ?? '—'}</Td>
              <Td><Pill tone={s.appliedAt ? 'good' : s.approvalStatus === 'PENDING' ? 'warn' : s.approvalStatus === 'REJECTED' ? 'bad' : 'info'}>{s.appliedAt ? 'Applied' : s.approvalStatus === 'PENDING' ? 'Awaiting approval' : s.approvalStatus === 'REJECTED' ? 'Declined' : 'Scheduled'}</Pill></Td></tr>
          ))}
        </Table>
      ))}
      {tab === 'checklists' && <Checklists e={e} reload={reload} />}
      {tab === 'exit' && <ExitTab e={e} />}
      {tab === 'performance' && <PerformanceTab e={e} />}
      {tab === 'growth' && <GrowthTab e={e} />}
      {tab === 'pay' && e.permissions.compensation && <Pay e={e} onAdd={() => setModal('pay')} />}
      {tab === 'timeline' && <Timeline id={e.id} />}

      {modal === 'edit' && <EditEmployee e={e} onClose={() => setModal(null)} onSaved={done} />}
      {modal === 'status' && <ChangeStatus e={e} onClose={() => setModal(null)} onDone={done} />}
      {modal === 'contract' && <RecordContract e={e} onClose={() => setModal(null)} onDone={done} />}
      {(modal === 'doc' || modal === 'cert') && <AddDoc e={e} cert={modal === 'cert'} onClose={() => setModal(null)} onDone={done} />}
      {modal === 'rehire' && <Rehire e={e} onClose={() => setModal(null)} onDone={done} />}
      {modal === 'access' && <MyHrAccess e={e} onClose={() => setModal(null)} onDone={done} />}
      {modal === 'preboard' && <Preboard e={e} onClose={() => setModal(null)} />}
      {modal === 'generate' && <Generate e={e} onClose={() => setModal(null)} />}
      {modal === 'pay' && <ProposePay e={e} onClose={() => setModal(null)} onDone={done} />}
    </div>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  const { theme: T } = useTheme();
  return <div style={{ padding: '7px 0', borderBottom: `1px solid ${T.border}`, display: 'grid', gridTemplateColumns: '150px 1fr', gap: 8, fontSize: 13 }}><span style={{ color: T.textSec }}>{k}</span><span style={{ color: T.text }}>{v || '—'}</span></div>;
}

function Overview({ e, current, reload }: { e: Emp; current?: Contract; reload: () => void }) {
  const { me } = usePwm();
  const [shown, setShown] = useState<{ field: string; value: string } | null>(null);
  const [ask, setAsk] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const { busy, error, run, setError } = useAction();
  const reveal = () => run(async () => {
    const r = await api.post<{ data: { field: string; value: string } }>(`/admin/pwm/employees/${e.id}/reveal`, { field: ask, reason });
    setShown(r.data); setAsk(null); setReason(''); setTimeout(() => setShown(null), 20_000);
  });
  const sens: [string, string, string | undefined][] = [['nin', 'NIN', e.nin], ['tin', 'Tax ID', e.tin], ['rsaPin', 'RSA PIN', e.rsaPin], ['nhfNo', 'NHF number', e.nhfNo], ['bankAccountNo', 'Bank account', e.bankAccountNo]];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
      <Card title="Employment">
        <KV k="Department" v={e.department?.name} /><KV k="Job title" v={e.jobTitle} /><KV k="Type" v={label(e.employmentType)} /><KV k="Manager" v={e.manager ? <Link href={`/pwm/employees/${e.manager.id}`}>{e.manager.firstName} {e.manager.lastName}</Link> : null} />
        <KV k="HR officer" v={e.hrOfficerName} /><KV k="Hired" v={fmtDate(e.hireDate)} /><KV k="Location" v={e.location ? `${e.location} (${label(e.workArrangement)})` : label(e.workArrangement)} />
        <KV k="Probation ends" v={e.probationEndDate ? fmtDate(e.probationEndDate) : null} /><KV k="Confirmed" v={e.confirmationDate ? fmtDate(e.confirmationDate) : null} />
        <KV k="Current contract" v={current ? <Link href={`/pwm/contracts/${current.id}`}>{current.reference}{current.expiryDate ? ` · expires ${fmtDate(current.expiryDate)}` : ' · no expiry'}</Link> : 'None in force'} />
        {e.exitDate && <><KV k="Exit" v={`${label(e.exitType)} on ${fmtDate(e.exitDate)}`} /><KV k="Rehire eligible" v={e.rehireEligible === null ? null : e.rehireEligible ? 'Yes' : 'No'} /></>}
      </Card>
      {'personalEmail' in e && (
        <Card title="Personal and contact">
          <KV k="Work email" v={e.workEmail} /><KV k="Personal email" v={e.personalEmail} /><KV k="Phone" v={e.phone} /><KV k="Address" v={e.address} /><KV k="Date of birth" v={e.dateOfBirth ? fmtDate(e.dateOfBirth) : null} />
          <KV k="Sex / marital" v={[e.sex, e.maritalStatus].filter(Boolean).join(' · ')} /><KV k="Origin" v={[e.stateOfOrigin, e.nationality].filter(Boolean).join(', ')} />
          <KV k="Emergency contact" v={e.emergencyContacts?.length ? e.emergencyContacts.map((c) => `${c.name ?? ''} (${c.relationship ?? ''}) ${c.phone ?? ''}`).join('; ') : null} />
        </Card>
      )}
      {sens.some(([, , v]) => v) && (
        <Card title="Statutory and bank (highly restricted)">
          {error && <Notice kind="error">{error}</Notice>}
          {sens.filter(([, , v]) => v).map(([key, name, masked]) => (
            <KV key={key} k={name} v={<span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span style={{ fontFamily: 'monospace' }}>{shown?.field === key ? shown.value : masked}</span>{me?.can.viewHighlyRestricted && shown?.field !== key && <Btn small onClick={() => { setError(''); setAsk(key); }}>Reveal</Btn>}</span>} />
          ))}
          <KV k="Bank" v={[e.bankName, e.bankAccountName].filter(Boolean).join(' · ')} /><KV k="Pension administrator" v={e.pfaName} />
          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 8 }}>Each reveal is logged with your reason. The value hides again after 20 seconds.</div>
        </Card>
      )}
      <Modal open={!!ask} onClose={() => setAsk(null)} title="Why do you need this number?" width={440}>
        <div style={{ padding: 20 }}>
          {error && <Notice kind="error">{error}</Notice>}
          <Field label="Reason (recorded)"><Input value={reason} onChange={(ev) => setReason(ev.target.value)} placeholder="e.g. Pension registration" /></Field>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><Btn onClick={() => setAsk(null)}>Cancel</Btn><Btn kind="primary" disabled={busy || reason.trim().length < 8} onClick={reveal}>Reveal</Btn></div>
        </div>
      </Modal>
      <span style={{ display: 'none' }}>{reload.length}</span>
    </div>
  );
}

function Checklists({ e, reload }: { e: Emp; reload: () => void }) {
  const { me } = usePwm();
  const { busy, error, run } = useAction();
  const start = (kind: string) => run(async () => { await api.post(`/admin/pwm/employees/${e.id}/checklists`, { kind }); reload(); });
  return (
    <div>
      {error && <Notice kind="error">{error}</Notice>}
      {me?.can.manageChecklists && <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}><Btn disabled={busy} onClick={() => start('ONBOARDING')}>Start onboarding</Btn><Btn disabled={busy} onClick={() => start('OFFBOARDING')}>Start offboarding</Btn></div>}
      {e.checklists.length === 0 ? <Empty>No checklists yet.</Empty> : (
        <Table head={['Checklist', 'Started', 'Progress', 'State']}>
          {e.checklists.map((c) => <tr key={c.id}><Td><Link href={`/pwm/checklists/${c.id}`} style={{ fontWeight: 700, color: 'inherit' }}>{label(c.kind)}</Link></Td><Td>{fmtDate(c.startDate)}</Td><Td>{c.done} of {c.total} tasks</Td><Td><Pill tone={c.status === 'COMPLETED' ? 'good' : 'info'}>{label(c.status)}</Pill></Td></tr>)}
        </Table>
      )}
    </div>
  );
}

function Pay({ e, onAdd }: { e: Emp; onAdd: () => void }) {
  const { me } = usePwm();
  const { data } = useLoad(() => api.get<{ data: Comp[] }>(`/admin/pwm/employees/${e.id}/compensation`).then((r) => r.data), [e.id]);
  const rows = data ?? e.compensation ?? [];
  return (
    <div>
      <Notice kind="info">Pay is visible only to Finance, executives and anyone given pay access. Every view is logged. A change is prepared by one person and approved by another.</Notice>
      {me?.can.manageCompensation && <div style={{ marginBottom: 12 }}><Btn kind="primary" onClick={onAdd}>+ Propose pay change</Btn></div>}
      {rows.length === 0 ? <Empty>No pay records.</Empty> : (
        <Table head={['From', 'To', 'Base salary', 'Components', 'Reason', 'Prepared', 'State']}>
          {rows.map((c) => (
            <tr key={c.id}><Td>{fmtDate(c.effectiveFrom)}</Td><Td>{c.effectiveTo ? fmtDate(c.effectiveTo) : 'Current'}</Td><Td><b>{c.currency} {Number(c.baseSalary).toLocaleString('en-NG')}</b></Td>
              <Td style={{ fontSize: 12 }}>{c.components?.map((x) => `${x.name}: ${x.amount.toLocaleString('en-NG')}`).join(', ') || '—'}</Td><Td>{c.reason}</Td><Td>{c.preparedByName ?? '—'}</Td>
              <Td><Pill tone={c.approvalStatus === 'APPROVED' ? 'good' : c.approvalStatus === 'PENDING' ? 'warn' : 'bad'}>{label(c.approvalStatus)}</Pill>{c.approvedByName && <div style={{ fontSize: 11 }}>by {c.approvedByName}</div>}</Td></tr>
          ))}
        </Table>
      )}
    </div>
  );
}

function Timeline({ id }: { id: string }) {
  const { theme: T } = useTheme();
  const { data, loading } = useLoad(() => api.get<{ data: { id: string; at: string; action: string; by: string }[] }>(`/admin/pwm/employees/${id}/timeline`).then((r) => r.data), [id]);
  if (loading) return <Empty>Loading…</Empty>;
  if (!data?.length) return <Empty>No activity.</Empty>;
  return <div>{data.map((r) => <div key={r.id} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: `1px solid ${T.border}`, fontSize: 13 }}><span style={{ width: 150, color: T.textSec, flexShrink: 0 }}>{fmtDateTime(r.at)}</span><b style={{ color: T.text }}>{label(r.action)}</b><span style={{ color: T.textSec }}>by {r.by}</span></div>)}</div>;
}

// ── Modals ───────────────────────────────────────────────────────────────────

type Setter = (k: string) => (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
const useForm = <T extends Record<string, string>>(init: T): [T, Setter, (v: T) => void] => {
  const [f, setF] = useState(init);
  return [f, (k) => (ev) => setF((x) => ({ ...x, [k]: ev.target.value })), setF];
};

function EditEmployee({ e, onClose, onSaved }: { e: Emp; onClose: () => void; onSaved: () => void }) {
  const depts = useLoad(() => api.get<{ data: { id: string; name: string }[] }>('/admin/pwm/departments').then((r) => r.data), []);
  const managers = useLoad(() => api.get<{ data: { id: string; firstName: string; lastName: string; employeeNo: string }[] }>('/admin/pwm/employees/lookup').then((r) => r.data), []);
  const { people } = usePwm();
  const [f, set] = useForm({
    firstName: e.firstName, middleName: e.middleName ?? '', lastName: e.lastName, jobTitle: e.jobTitle, departmentId: e.department?.id ?? '', managerId: e.manager?.id ?? '', hrOfficerUserId: e.hrOfficerUserId ?? '',
    workEmail: e.workEmail ?? '', personalEmail: e.personalEmail ?? '', phone: e.phone ?? '', address: e.address ?? '', dateOfBirth: dateInput(e.dateOfBirth), location: e.location ?? '',
    probationEndDate: dateInput(e.probationEndDate), grade: e.grade ?? '', nin: '', tin: '', rsaPin: '', nhfNo: '', bankName: '', bankAccountNo: '', bankAccountName: '', pfaName: '',
    ecName: e.emergencyContacts?.[0]?.name ?? '', ecRel: e.emergencyContacts?.[0]?.relationship ?? '', ecPhone: e.emergencyContacts?.[0]?.phone ?? '',
  });
  const { busy, error, run } = useAction();
  const restricted = 'personalEmail' in e;
  const save = () => run(async () => {
    const body: Record<string, unknown> = { version: e.version, firstName: f.firstName, middleName: f.middleName, lastName: f.lastName, jobTitle: f.jobTitle, departmentId: f.departmentId, managerId: f.managerId || null, hrOfficerUserId: f.hrOfficerUserId || null, workEmail: f.workEmail || null, location: f.location, probationEndDate: f.probationEndDate || null };
    if (restricted) {
      Object.assign(body, { personalEmail: f.personalEmail || null, phone: f.phone || null, address: f.address, dateOfBirth: f.dateOfBirth || null, grade: f.grade, emergencyContacts: f.ecName ? [{ name: f.ecName, relationship: f.ecRel, phone: f.ecPhone }] : [] });
      // Only send sensitive values that were actually typed, so blank boxes never wipe a stored number.
      for (const k of ['nin', 'tin', 'rsaPin', 'nhfNo', 'bankName', 'bankAccountNo', 'bankAccountName', 'pfaName'] as const) if (f[k]) body[k] = f[k];
    }
    await api.patch(`/admin/pwm/employees/${e.id}`, body);
    onSaved();
  });
  return (
    <Modal open onClose={onClose} title={`Edit ${e.fullName}`} width={760}>
      <div style={{ padding: 20, maxHeight: '75vh', overflowY: 'auto' }}>
        {error && <Notice kind="error">{error}</Notice>}
        <Grid cols={3}>
          <Field label="First name"><Input value={f.firstName} onChange={set('firstName')} /></Field><Field label="Middle name"><Input value={f.middleName} onChange={set('middleName')} /></Field><Field label="Last name"><Input value={f.lastName} onChange={set('lastName')} /></Field>
          <Field label="Job title"><Input value={f.jobTitle} onChange={set('jobTitle')} /></Field>
          <Field label="Department"><Select value={f.departmentId} onChange={set('departmentId')}>{depts.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
          <Field label="Reporting manager"><Select value={f.managerId} onChange={set('managerId')}><option value="">None</option>{managers.data?.filter((m) => m.id !== e.id).map((m) => <option key={m.id} value={m.id}>{m.firstName} {m.lastName} ({m.employeeNo})</option>)}</Select></Field>
          <Field label="Responsible HR officer"><Select value={f.hrOfficerUserId} onChange={set('hrOfficerUserId')}><option value="">Not set</option>{people.map((p) => <option key={p.userId} value={p.userId}>{p.name}</option>)}</Select></Field>
          <Field label="Work email"><Input value={f.workEmail} onChange={set('workEmail')} /></Field><Field label="Location"><Input value={f.location} onChange={set('location')} /></Field>
          <Field label="Probation end"><Input type="date" value={f.probationEndDate} onChange={set('probationEndDate')} /></Field>
          {restricted && <>
            <Field label="Personal email"><Input value={f.personalEmail} onChange={set('personalEmail')} /></Field><Field label="Phone"><Input value={f.phone} onChange={set('phone')} /></Field><Field label="Date of birth"><Input type="date" value={f.dateOfBirth} onChange={set('dateOfBirth')} /></Field>
            <Field label="Address"><Input value={f.address} onChange={set('address')} /></Field><Field label="Grade"><Input value={f.grade} onChange={set('grade')} /></Field>
            <Field label="Emergency contact name"><Input value={f.ecName} onChange={set('ecName')} /></Field><Field label="Relationship"><Input value={f.ecRel} onChange={set('ecRel')} /></Field><Field label="Emergency phone"><Input value={f.ecPhone} onChange={set('ecPhone')} /></Field>
          </>}
        </Grid>
        {restricted && <>
          <Notice kind="info">Statutory and bank details are stored encrypted. Leave a box empty to keep the current value; type to replace it.</Notice>
          <Grid cols={3}>
            <Field label="NIN (11 digits)"><Input value={f.nin} onChange={set('nin')} inputMode="numeric" /></Field><Field label="Tax ID"><Input value={f.tin} onChange={set('tin')} /></Field><Field label="RSA PIN"><Input value={f.rsaPin} onChange={set('rsaPin')} /></Field>
            <Field label="Pension administrator"><Input value={f.pfaName} onChange={set('pfaName')} /></Field><Field label="NHF number"><Input value={f.nhfNo} onChange={set('nhfNo')} /></Field>
            <Field label="Bank"><Input value={f.bankName} onChange={set('bankName')} /></Field><Field label="Account number"><Input value={f.bankAccountNo} onChange={set('bankAccountNo')} /></Field><Field label="Account name"><Input value={f.bankAccountName} onChange={set('bankAccountName')} /></Field>
          </Grid>
        </>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</Btn></div>
      </div>
    </Modal>
  );
}

function ChangeStatus({ e, onClose, onDone }: { e: Emp; onClose: () => void; onDone: () => void }) {
  const [f, set] = useForm({ to: e.allowedStatuses[0]?.status ?? '', reason: '', effectiveDate: todayYmd(), finalWorkingDay: '', exitType: '', rehireEligible: '' });
  const { busy, error, run } = useAction();
  const [msg, setMsg] = useState('');
  const sel = e.allowedStatuses.find((s) => s.status === f.to);
  const exiting = ['RESIGNED', 'TERMINATED', 'NOTICE_PERIOD'].includes(f.to);
  const save = () => run(async () => {
    const r = await api.post<{ message: string }>(`/admin/pwm/employees/${e.id}/status`, { to: f.to, reason: f.reason, effectiveDate: f.effectiveDate, ...(exiting ? { finalWorkingDay: f.finalWorkingDay || undefined, exitType: f.exitType || undefined } : {}), ...(f.rehireEligible ? { rehireEligible: f.rehireEligible === 'yes' } : {}) });
    setMsg(r.message);
    setTimeout(onDone, 1200);
  });
  return (
    <Modal open onClose={onClose} title={`Change status: ${e.fullName}`} width={520}>
      <div style={{ padding: 20 }}>
        {error && <Notice kind="error">{error}</Notice>}{msg && <Notice kind="success">{msg}</Notice>}
        <Field label="New status"><Select value={f.to} onChange={set('to')}>{e.allowedStatuses.map((s) => <option key={s.status} value={s.status}>{s.label}</option>)}</Select></Field>
        {sel?.approver === 'MANAGEMENT' && <Notice kind="warn">This needs management approval. It will be sent as a request and the employee keeps their current status until it is approved.</Notice>}
        <Grid><Field label="Effective date" hint="A future date schedules the change."><Input type="date" value={f.effectiveDate} onChange={set('effectiveDate')} /></Field>
          {exiting && <Field label="Final working day"><Input type="date" value={f.finalWorkingDay} onChange={set('finalWorkingDay')} /></Field>}</Grid>
        {f.to === 'RESIGNED' || f.to === 'TERMINATED' ? <Field label="Eligible for rehire?"><Select value={f.rehireEligible} onChange={set('rehireEligible')}><option value="">Decide later</option><option value="yes">Yes</option><option value="no">No</option></Select></Field> : null}
        <Field label="Reason (recorded)"><TextArea rows={3} value={f.reason} onChange={set('reason')} /></Field>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy || !f.reason.trim() || !f.to || !!msg} onClick={save}>{busy ? 'Saving…' : 'Submit'}</Btn></div>
      </div>
    </Modal>
  );
}

function RecordContract({ e, onClose, onDone }: { e: Emp; onClose: () => void; onDone: () => void }) {
  const [f, set] = useForm({ contractType: e.employmentType, commencementDate: dateInput(e.hireDate), expiryDate: '', signedDate: '', existing: 'yes', probationMonths: '', noticeValue: '', noticeUnit: 'MONTHS' });
  const { busy, error, run } = useAction();
  const types = ['PERMANENT', 'FIXED_TERM', 'PROBATIONARY', 'TEMPORARY', 'INTERNSHIP', 'GRADUATE_TRAINEE', 'CONSULTANCY', 'PART_TIME'];
  const save = () => run(async () => {
    await api.post('/admin/pwm/contracts', { employeeId: e.id, contractType: f.contractType, commencementDate: f.commencementDate, expiryDate: f.expiryDate || null, recordExisting: f.existing === 'yes', signedDate: f.signedDate || undefined, probationMonths: f.probationMonths || null, noticeValue: f.noticeValue || null, noticeUnit: f.noticeValue ? f.noticeUnit : null });
    onDone();
  });
  return (
    <Modal open onClose={onClose} title="Record a contract" width={600}>
      <div style={{ padding: 20 }}>
        {error && <Notice kind="error">{error}</Notice>}
        <Field label="This is"><Select value={f.existing} onChange={set('existing')}><option value="yes">An agreement already signed (existing staff)</option><option value="no">A new contract to prepare, approve and issue</option></Select></Field>
        <Grid>
          <Field label="Type"><Select value={f.contractType} onChange={set('contractType')}>{types.map((t) => <option key={t} value={t}>{label(t)}</option>)}</Select></Field>
          <Field label="Commencement date"><Input type="date" value={f.commencementDate} onChange={set('commencementDate')} /></Field>
          <Field label="Expiry date" hint={f.contractType === 'PERMANENT' ? 'Not needed for permanent.' : 'Required for this type.'}><Input type="date" value={f.expiryDate} onChange={set('expiryDate')} /></Field>
          {f.existing === 'yes' && <Field label="Date signed"><Input type="date" value={f.signedDate} onChange={set('signedDate')} /></Field>}
          <Field label="Probation (months)"><Input type="number" value={f.probationMonths} onChange={set('probationMonths')} /></Field>
          <Field label="Notice period"><div style={{ display: 'flex', gap: 6 }}><Input type="number" value={f.noticeValue} onChange={set('noticeValue')} /><Select value={f.noticeUnit} onChange={set('noticeUnit')}><option value="DAYS">Days</option><option value="WEEKS">Weeks</option><option value="MONTHS">Months</option></Select></div></Field>
        </Grid>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy || !f.commencementDate} onClick={save}>{busy ? 'Saving…' : 'Save contract'}</Btn></div>
      </div>
    </Modal>
  );
}

function AddDoc({ e, cert, onClose, onDone }: { e: Emp; cert: boolean; onClose: () => void; onDone: () => void }) {
  const [f, set] = useForm({ name: '', category: 'Other', issuer: '', number: '', issueDate: '', expiryDate: '' });
  const [file, setFile] = useState<File | null>(null);
  const { busy, error, run } = useAction();
  const cats = ['Identification', 'Contract', 'Offer/Appointment', 'Qualification', 'Guarantor', 'Medical', 'Disciplinary', 'Exit', 'Other'];
  const save = () => run(async () => {
    if (!file) throw new Error('Choose a file first.');
    const up = await uploadDocument(file);
    await api.post(`/admin/pwm/employees/${e.id}/documents`, { ...f, kind: cert ? 'CERTIFICATION' : 'DOCUMENT', url: up.url, checksum: up.checksum, issueDate: f.issueDate || null, expiryDate: f.expiryDate || null });
    onDone();
  });
  return (
    <Modal open onClose={onClose} title={cert ? 'Add certification' : 'Add document'} width={560}>
      <div style={{ padding: 20 }}>
        {error && <Notice kind="error">{error}</Notice>}
        <Grid>
          <Field label="Name"><Input value={f.name} onChange={set('name')} /></Field>
          {!cert && <Field label="Category"><Select value={f.category} onChange={set('category')}>{cats.map((c) => <option key={c}>{c}</option>)}</Select></Field>}
          <Field label={cert ? 'Awarding body' : 'Issuer'}><Input value={f.issuer} onChange={set('issuer')} /></Field><Field label="Number"><Input value={f.number} onChange={set('number')} /></Field>
          <Field label="Issue date"><Input type="date" value={f.issueDate} onChange={set('issueDate')} /></Field><Field label="Expiry date" hint="Reminders go to HR 30 days before."><Input type="date" value={f.expiryDate} onChange={set('expiryDate')} /></Field>
        </Grid>
        <Field label="File (PDF or image, up to 10 MB)"><input type="file" accept=".pdf,image/*" onChange={(ev) => setFile(ev.target.files?.[0] ?? null)} /></Field>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy || !f.name || !file} onClick={save}>{busy ? 'Uploading…' : 'Save'}</Btn></div>
      </div>
    </Modal>
  );
}

function Rehire({ e, onClose, onDone }: { e: Emp; onClose: () => void; onDone: () => void }) {
  const [f, set] = useForm({ hireDate: todayYmd(), jobTitle: e.jobTitle, overrideReason: '' });
  const { busy, error, run } = useAction();
  return (
    <Modal open onClose={onClose} title={`Rehire ${e.fullName}`} width={480}>
      <div style={{ padding: 20 }}>
        {error && <Notice kind="error">{error}</Notice>}
        <Notice kind="info">The same record is reused with a new employment episode, so history is kept.</Notice>
        {e.rehireEligible === false && <Notice kind="warn">Marked not eligible for rehire. An override reason is required.</Notice>}
        <Field label="New employment date"><Input type="date" value={f.hireDate} onChange={set('hireDate')} /></Field><Field label="Job title"><Input value={f.jobTitle} onChange={set('jobTitle')} /></Field>
        {e.rehireEligible === false && <Field label="Override reason"><Input value={f.overrideReason} onChange={set('overrideReason')} /></Field>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy} onClick={() => run(async () => { await api.post(`/admin/pwm/employees/${e.id}/rehire`, f); onDone(); })}>Rehire</Btn></div>
      </div>
    </Modal>
  );
}

function ProposePay({ e, onClose, onDone }: { e: Emp; onClose: () => void; onDone: () => void }) {
  const [f, set] = useForm({ effectiveFrom: todayYmd(), baseSalary: '', reason: '', cName: '', cAmount: '' });
  const { busy, error, run } = useAction();
  return (
    <Modal open onClose={onClose} title="Propose pay change" width={480}>
      <div style={{ padding: 20 }}>
        {error && <Notice kind="error">{error}</Notice>}
        <Notice kind="info">Sent to an approver. You cannot approve your own proposal.</Notice>
        <Grid><Field label="Effective from"><Input type="date" value={f.effectiveFrom} onChange={set('effectiveFrom')} /></Field><Field label="Base salary (NGN)"><Input type="number" value={f.baseSalary} onChange={set('baseSalary')} /></Field>
          <Field label="Allowance name"><Input value={f.cName} onChange={set('cName')} /></Field><Field label="Allowance amount"><Input type="number" value={f.cAmount} onChange={set('cAmount')} /></Field></Grid>
        <Field label="Reason"><Input value={f.reason} onChange={set('reason')} /></Field>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy || !f.baseSalary || !f.reason} onClick={() => run(async () => { await api.post(`/admin/pwm/employees/${e.id}/compensation`, { effectiveFrom: f.effectiveFrom, baseSalary: Number(f.baseSalary), reason: f.reason, components: f.cName ? [{ name: f.cName, amount: Number(f.cAmount) || 0 }] : [] }); onDone(); })}>Submit</Btn></div>
      </div>
    </Modal>
  );
}

function MyHrAccess({ e, onClose, onDone }: { e: Emp; onClose: () => void; onDone: () => void }) {
  const [res, setRes] = useState<{ email: string; tempPassword: string | null; message: string } | null>(null);
  const { busy, error, run } = useAction();
  const grant = () => run(async () => { const r = await api.post<{ message: string; data: { email: string; tempPassword: string | null } }>(`/admin/pwm/employees/${e.id}/my-hr-access`, {}); setRes({ ...r.data, message: r.message }); });
  const revoke = () => run(async () => { const r = await api.post<{ message: string }>(`/admin/pwm/employees/${e.id}/my-hr-access/revoke`, { reason: 'Switched off by HR' }); setRes({ email: '', tempPassword: null, message: r.message }); });
  return (
    <Modal open onClose={res ? onDone : onClose} title={`My HR access: ${e.fullName}`} width={500}>
      <div style={{ padding: 20 }}>
        {error && <Notice kind="error">{error}</Notice>}
        {!res ? (
          <>
            <Notice kind="info">My HR lets {e.firstName} see their own contract, update contact details, read and acknowledge policies, and finish their tasks. It needs a login. {e.userId ? 'A login is already linked.' : 'A staff login will be created from their work or personal email.'}</Notice>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>{e.userId && <Btn kind="danger" disabled={busy} onClick={revoke}>Switch off</Btn>}<Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy} onClick={grant}>{e.userId ? 'Make sure it is on' : 'Create login'}</Btn></div>
          </>
        ) : (
          <>
            <Notice kind="success">{res.message}</Notice>
            {res.tempPassword && <div style={{ fontSize: 13, lineHeight: 1.9 }}>Email: <b>{res.email}</b><br />Temporary password: <b style={{ fontFamily: 'monospace' }}>{res.tempPassword}</b><br /><span style={{ fontSize: 12, opacity: 0.75 }}>Shown once. Share it privately and ask them to change it after signing in at the admin site.</span></div>}
            <div style={{ textAlign: 'right', marginTop: 14 }}><Btn kind="primary" onClick={onDone}>Done</Btn></div>
          </>
        )}
      </div>
    </Modal>
  );
}

function Preboard({ e, onClose }: { e: Emp; onClose: () => void }) {
  const [link, setLink] = useState<{ link: string; expiresAt: string } | null>(null);
  const { busy, error, run } = useAction();
  return (
    <Modal open onClose={onClose} title={`Pre-boarding link: ${e.fullName}`} width={540}>
      <div style={{ padding: 20 }}>
        {error && <Notice kind="error">{error}</Notice>}
        {!link ? (
          <>
            <Notice kind="info">Creates a secure link that expires, emailed to their personal address. They confirm it is them with a one-time code, then add their details, bank, statutory numbers and documents before day one. Sending a new link cancels any older one.</Notice>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy} onClick={() => run(async () => { const r = await api.post<{ data: { link: string; expiresAt: string } }>(`/admin/pwm/employees/${e.id}/preboarding`, {}); setLink(r.data); })}>Create and email link</Btn></div>
          </>
        ) : (
          <>
            <Notice kind="success">Link created and emailed. It works until {fmtDate(link.expiresAt)}.</Notice>
            <Input readOnly value={link.link} onFocus={(ev) => ev.currentTarget.select()} />
            <div style={{ textAlign: 'right', marginTop: 14 }}><Btn kind="primary" onClick={onClose}>Done</Btn></div>
          </>
        )}
      </div>
    </Modal>
  );
}

function Generate({ e, onClose }: { e: Emp; onClose: () => void }) {
  const tpls = useLoad(() => api.get<{ data: { templates: { id: string; name: string; kind: string; version: number; status: string }[] } }>('/admin/pwm/templates').then((r) => r.data.templates.filter((t) => t.status === 'APPROVED')), []);
  const [f, setF] = useState({ templateId: '', contractId: '', format: 'docx' });
  const [preview, setPreview] = useState<{ text: string; empty: string[] } | null>(null);
  const { busy, error, run } = useAction();
  const body = (extra: Record<string, unknown> = {}) => ({ employeeId: e.id, contractId: f.contractId || undefined, format: f.format, ...extra });
  const download = (allowEmpty: boolean) => run(async () => {
    const res = await fetch(`/api/proxy/admin/pwm/templates/${f.templateId}/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body({ allowEmpty })) });
    if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.message ?? 'Could not generate.'); }
    const blob = await res.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${e.employeeNo}.${f.format}`; a.click(); URL.revokeObjectURL(a.href);
  });
  return (
    <Modal open onClose={onClose} title={`Generate a document for ${e.fullName}`} width={640}>
      <div style={{ padding: 20 }}>
        {error && <Notice kind="error">{error}</Notice>}
        {tpls.data && tpls.data.length === 0 && <Notice kind="warn">There are no approved templates yet. Add and approve one under Templates.</Notice>}
        <Grid>
          <Field label="Template"><Select value={f.templateId} onChange={(ev) => { setF({ ...f, templateId: ev.target.value }); setPreview(null); }}><option value="">Choose…</option>{tpls.data?.map((t) => <option key={t.id} value={t.id}>{t.name} (v{t.version})</option>)}</Select></Field>
          <Field label="Contract"><Select value={f.contractId} onChange={(ev) => setF({ ...f, contractId: ev.target.value })}><option value="">Most recent</option>{e.contracts.map((c) => <option key={c.id} value={c.id}>{c.reference}</option>)}</Select></Field>
          <Field label="Format"><Select value={f.format} onChange={(ev) => setF({ ...f, format: ev.target.value })}><option value="docx">Word (.docx)</option><option value="pdf">PDF</option><option value="txt">Plain text</option></Select></Field>
        </Grid>
        {preview && <div style={{ background: 'rgba(128,128,128,0.1)', borderRadius: 4, padding: 12, fontSize: 12, whiteSpace: 'pre-wrap', maxHeight: 260, overflowY: 'auto', marginBottom: 10 }}>{preview.text}{preview.empty.length > 0 && <div style={{ color: '#d97706', marginTop: 8 }}>No value on record for: {preview.empty.join(', ')}</div>}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Btn onClick={onClose}>Close</Btn>
          <Btn disabled={busy || !f.templateId} onClick={() => run(async () => { const r = await api.post<{ data: { text: string; empty: string[] } }>(`/admin/pwm/templates/${f.templateId}/generate`, body({ preview: true })); setPreview(r.data); })}>Preview</Btn>
          <Btn kind="primary" disabled={busy || !f.templateId} onClick={() => download(!!preview && preview.empty.length > 0 && window.confirm('Some fields have no value and will be blank. Generate anyway?'))}>Download</Btn>
        </div>
      </div>
    </Modal>
  );
}

interface ExitData {
  employee: { status: string; exitType: string | null; exitDate: string | null; finalWorkingDay: string | null; rehireEligible: boolean | null };
  clearance: { id: string; area: string; status: string; note: string | null; signedByName: string | null; signedAt: string | null; canSign: boolean }[];
  interview: { reasonCategory: string | null; wouldRecommend: boolean | null; answers: { question: string; answer: string }[] | null; confidential: boolean; conductedByName: string | null; exists?: boolean } | null;
  canRecordInterview: boolean;
}
const QUESTIONS = ['What is the main reason you are leaving?', 'What did you value most about working here?', 'What should we change?', 'Would you consider returning?'];
const REASONS = ['BETTER_PAY', 'CAREER_GROWTH', 'MANAGEMENT', 'WORK_ENVIRONMENT', 'RELOCATION', 'PERSONAL', 'STUDY', 'CONTRACT_ENDED', 'DISMISSAL', 'OTHER'];

function ExitTab({ e }: { e: Emp }) {
  const { data, loading, error, reload } = useLoad(() => api.get<{ data: ExitData }>(`/admin/pwm/employees/${e.id}/exit`).then((r) => r.data), [e.id]);
  const { busy, error: actionError, run } = useAction();
  const [answers, setAnswers] = useState<string[]>(QUESTIONS.map(() => ''));
  const [reason, setReason] = useState('');
  const [rec, setRec] = useState('');
  if (loading && !data) return <Empty>Loading…</Empty>;
  if (error || !data) return <Notice kind="error">{error || 'Not available.'}</Notice>;
  const sign = (id: string, status: string) => {
    const note = status === 'BLOCKED' ? window.prompt('What is outstanding?') : '';
    if (status === 'BLOCKED' && !note) return;
    run(async () => { await api.post(`/admin/pwm/clearance/${id}/sign`, { status, note }); reload(); });
  };
  const iv = data.interview;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12 }}>
      {actionError && <div style={{ gridColumn: '1 / -1' }}><Notice kind="error">{actionError}</Notice></div>}
      <Card title="Clearance sign-offs">
        {data.clearance.length === 0 ? <Empty>Clearance starts when offboarding starts.</Empty> : data.clearance.map((c) => (
          <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 0', borderBottom: '1px solid rgba(128,128,128,.2)', alignItems: 'center' }}>
            <div style={{ fontSize: 13 }}><b>{label(c.area)}</b><div style={{ fontSize: 11, opacity: 0.75 }}>{c.signedByName ? `${c.signedByName}, ${fmtDate(c.signedAt)}` : 'Not signed'}{c.note ? ` · ${c.note}` : ''}</div></div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Pill tone={c.status === 'CLEARED' ? 'good' : c.status === 'BLOCKED' ? 'bad' : 'warn'}>{label(c.status)}</Pill>{c.canSign && c.status !== 'CLEARED' && <Btn small kind="primary" disabled={busy} onClick={() => sign(c.id, 'CLEARED')}>Clear</Btn>}{c.canSign && c.status !== 'BLOCKED' && <Btn small disabled={busy} onClick={() => sign(c.id, 'BLOCKED')}>Block</Btn>}</div>
          </div>
        ))}
        <div style={{ fontSize: 11, opacity: 0.7, marginTop: 8 }}>The offboarding checklist cannot close until every area is cleared. The employee cannot sign off their own clearance.</div>
      </Card>
      <Card title="Exit interview">
        {iv && iv.exists ? <Notice kind="info">A confidential exit interview was recorded. Only the HR administrator and the interviewer can read it.</Notice> : iv ? (
          <div style={{ fontSize: 13 }}><div><b>Reason:</b> {label(iv.reasonCategory)} · Would recommend: {iv.wouldRecommend === null ? '—' : iv.wouldRecommend ? 'Yes' : 'No'}</div>{iv.answers?.map((a, i) => <div key={i} style={{ marginTop: 6 }}><div style={{ opacity: 0.7 }}>{a.question}</div>{a.answer}</div>)}<div style={{ fontSize: 11, opacity: 0.7, marginTop: 8 }}>Held by {iv.conductedByName ?? '?'} · {iv.confidential ? 'Confidential' : 'Shared with HR'}</div></div>
        ) : data.canRecordInterview ? (
          <>
            <Field label="Main reason"><Select value={reason} onChange={(ev) => setReason(ev.target.value)}><option value="">Choose…</option>{REASONS.map((r) => <option key={r} value={r}>{label(r)}</option>)}</Select></Field>
            {QUESTIONS.map((q, i) => <Field key={q} label={q}><TextArea rows={2} value={answers[i]} onChange={(ev) => setAnswers(answers.map((a, j) => (j === i ? ev.target.value : a)))} /></Field>)}
            <Field label="Would they recommend us?"><Select value={rec} onChange={(ev) => setRec(ev.target.value)}><option value="">Not asked</option><option value="yes">Yes</option><option value="no">No</option></Select></Field>
            <Btn kind="primary" disabled={busy || !reason} onClick={() => run(async () => { await api.put(`/admin/pwm/employees/${e.id}/exit-interview`, { reasonCategory: reason, wouldRecommend: rec ? rec === 'yes' : undefined, answers: QUESTIONS.map((q, i) => ({ question: q, answer: answers[i] })).filter((a) => a.answer), confidential: true }); reload(); })}>Save (confidential)</Btn>
          </>
        ) : <Empty>No exit interview recorded.</Empty>}
      </Card>
    </div>
  );
}

interface PerfData {
  reviews: { id: string; status: string; managerRating: number | null; summary: string | null; cycle: { name: string; periodEnd: string } }[];
  objectives: { id: string; title: string; target: string | null; weight: number; progress: number; status: string }[];
  notes: { id: string; kind: string; text: string; sharedWithEmployee: boolean; authorName: string | null; createdAt: string }[];
  pips: { id: string; reason: string; status: string; reviewDate: string; objectives: string; outcomeNote: string | null }[];
  canManage: boolean;
}

function PerformanceTab({ e }: { e: Emp }) {
  const { data, loading, error, reload } = useLoad(() => api.get<{ data: PerfData }>(`/admin/pwm/employees/${e.id}/performance`).then((r) => r.data), [e.id]);
  const [note, setNote] = useState({ kind: 'NOTE', text: '', shared: false });
  const [pip, setPip] = useState({ reason: '', objectives: '', support: '', startDate: todayYmd(), reviewDate: '' });
  const [showPip, setShowPip] = useState(false);
  const { busy, error: actionError, run } = useAction();
  if (loading && !data) return <Empty>Loading…</Empty>;
  if (error || !data) return <Notice kind="error">{error || 'Not available.'}</Notice>;
  const done = data.reviews.filter((r) => r.status === 'ACKNOWLEDGED' && r.managerRating);
  const trend = done.slice().reverse();
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12 }}>
      {actionError && <div style={{ gridColumn: '1 / -1' }}><Notice kind="error">{actionError}</Notice></div>}
      <Card title="Review history">
        {data.reviews.length === 0 ? <Empty>No reviews yet.</Empty> : data.reviews.map((r) => <div key={r.id} style={{ padding: '7px 0', borderBottom: '1px solid rgba(128,128,128,.2)', fontSize: 13 }}><b>{r.cycle.name}</b> <Pill tone={r.status === 'ACKNOWLEDGED' ? 'good' : 'info'}>{label(r.status)}</Pill> {r.managerRating ? <b>{'★'.repeat(r.managerRating)}{'☆'.repeat(5 - r.managerRating)}</b> : null}{r.summary && r.status === 'ACKNOWLEDGED' && <div style={{ fontSize: 12, opacity: 0.8 }}>{r.summary}</div>}</div>)}
        {trend.length > 1 && <div style={{ marginTop: 10, fontSize: 12 }}>Trend: {trend.map((r) => r.managerRating).join(' → ')}</div>}
      </Card>
      <Card title="Objectives">
        {data.objectives.length === 0 ? <Empty>None set.</Empty> : data.objectives.map((o) => <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13 }}><span>{o.title}{o.target ? ` (${o.target})` : ''}</span><span>{o.weight}% · {o.progress}% · {label(o.status)}</span></div>)}
      </Card>
      <Card title="Feedback notes">
        {data.notes.map((n) => <div key={n.id} style={{ padding: '6px 0', fontSize: 13, borderBottom: '1px solid rgba(128,128,128,.2)' }}><Pill tone={n.kind === 'PRAISE' ? 'good' : n.kind === 'IMPROVE' ? 'warn' : 'neutral'}>{label(n.kind)}</Pill> {n.text}<div style={{ fontSize: 11, opacity: 0.7 }}>{n.authorName} · {fmtDate(n.createdAt)}{n.sharedWithEmployee ? ' · shared with employee' : ''}</div></div>)}
        <div style={{ marginTop: 10 }}><Grid><Field label="Type"><Select value={note.kind} onChange={(ev) => setNote({ ...note, kind: ev.target.value })}><option value="NOTE">Note</option><option value="PRAISE">Praise</option><option value="IMPROVE">To improve</option></Select></Field></Grid><TextArea rows={2} value={note.text} onChange={(ev) => setNote({ ...note, text: ev.target.value })} />
          <label style={{ display: 'flex', gap: 6, fontSize: 12, margin: '6px 0' }}><input type="checkbox" checked={note.shared} onChange={(ev) => setNote({ ...note, shared: ev.target.checked })} />Share with the employee</label>
          <Btn small disabled={busy || !note.text.trim()} onClick={() => run(async () => { await api.post(`/admin/pwm/employees/${e.id}/feedback`, { kind: note.kind, text: note.text, sharedWithEmployee: note.shared }); setNote({ kind: 'NOTE', text: '', shared: false }); reload(); })}>Add note</Btn></div>
      </Card>
      <Card title="Performance improvement plans" right={data.canManage && !data.pips.some((p) => p.status === 'ACTIVE') ? <Btn small onClick={() => setShowPip(!showPip)}>{showPip ? 'Hide' : 'Start a plan'}</Btn> : undefined}>
        {data.pips.length === 0 && !showPip && <Empty>No plans.</Empty>}
        {data.pips.map((p) => <div key={p.id} style={{ padding: '8px 0', fontSize: 13, borderBottom: '1px solid rgba(128,128,128,.2)' }}><Pill tone={p.status === 'ACTIVE' ? 'warn' : p.status === 'PASSED' ? 'good' : 'neutral'}>{label(p.status)}</Pill> review {fmtDate(p.reviewDate)}<div>{p.objectives}</div><div style={{ fontSize: 12, opacity: 0.75 }}>{p.reason}{p.outcomeNote ? ` · Outcome: ${p.outcomeNote}` : ''}</div>
          {data.canManage && p.status === 'ACTIVE' && <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>{(['PASSED', 'FAILED'] as const).map((s) => <Btn key={s} small disabled={busy} onClick={() => { const n = window.prompt(`Outcome note (${s.toLowerCase()})`); if (n) run(async () => { await api.post(`/admin/pwm/pips/${p.id}/close`, { status: s, note: n }); reload(); }); }}>{label(s)}</Btn>)}</div>}</div>)}
        {showPip && <div style={{ marginTop: 8 }}><Notice kind="info">A plan supports improvement. Its outcome is information for management; it never ends employment by itself.</Notice><Field label="Why"><Input value={pip.reason} onChange={(ev) => setPip({ ...pip, reason: ev.target.value })} /></Field><Field label="Objectives to meet"><TextArea rows={2} value={pip.objectives} onChange={(ev) => setPip({ ...pip, objectives: ev.target.value })} /></Field><Field label="Support offered"><Input value={pip.support} onChange={(ev) => setPip({ ...pip, support: ev.target.value })} /></Field><Grid><Field label="Start"><Input type="date" value={pip.startDate} onChange={(ev) => setPip({ ...pip, startDate: ev.target.value })} /></Field><Field label="Review on"><Input type="date" value={pip.reviewDate} onChange={(ev) => setPip({ ...pip, reviewDate: ev.target.value })} /></Field></Grid>
          <Btn kind="primary" disabled={busy || !pip.reason || !pip.objectives || !pip.reviewDate} onClick={() => run(async () => { await api.post(`/admin/pwm/employees/${e.id}/pips`, pip); setShowPip(false); reload(); })}>Start plan</Btn></div>}
      </Card>
    </div>
  );
}

interface Growth {
  dev: { plans: { id: string; goal: string; status: string }[]; enrolments: { id: string; course: string; mandatory: boolean; status: string; completedAt: string | null }[]; skills: { skill: string; level: number }[] } | null;
  assets: { outstanding: number; assignments: { id: string; status: string; assignedAt: string; returnedAt: string | null; acknowledgedAt: string | null; asset: { id: string; tag: string; name: string } }[] } | null;
  recognition: { items: { id: string; kind: string; title: string; citation: string | null; date: string }[]; canGive: boolean } | null;
  warnings: { reference: string; outcome: string; warningExpiresAt: string | null; spent: boolean }[] | null;
}

function GrowthTab({ e }: { e: Emp }) {
  const { data, reload } = useLoad<Growth>(async () => {
    const get = <T,>(p: string) => api.get<{ data: T }>(`/admin/pwm/employees/${e.id}/${p}`).then((r) => r.data).catch(() => null);
    const [dev, assets, recognition, warnings] = await Promise.all([get<NonNullable<Growth['dev']>>('development'), get<NonNullable<Growth['assets']>>('assets'), get<NonNullable<Growth['recognition']>>('recognition'), get<NonNullable<Growth['warnings']>>('warnings')]);
    return { dev, assets, recognition, warnings };
  }, [e.id]);
  const [r, setR] = useState({ kind: 'COMMENDATION', title: '', citation: '', announce: false });
  const { busy, error, run } = useAction();
  if (!data) return <Empty>Loading…</Empty>;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12 }}>
      {error && <div style={{ gridColumn: '1 / -1' }}><Notice kind="error">{error}</Notice></div>}
      {data.dev && <Card title="Training and development">
        {data.dev.enrolments.length === 0 ? <Empty>No courses.</Empty> : data.dev.enrolments.map((x) => <div key={x.id} style={{ padding: '4px 0', fontSize: 13 }}>{x.course} {x.mandatory && <Pill tone="warn">Mandatory</Pill>} <Pill tone={x.status === 'COMPLETED' ? 'good' : 'info'}>{label(x.status)}</Pill>{x.completedAt && <span style={{ fontSize: 11 }}> {fmtDate(x.completedAt)}</span>}</div>)}
        {data.dev.plans.map((p) => <div key={p.id} style={{ fontSize: 13, marginTop: 6 }}><b>Goal:</b> {p.goal} <Pill>{label(p.status)}</Pill></div>)}
        {data.dev.skills.length > 0 && <div style={{ fontSize: 12, marginTop: 8 }}><b>Skills:</b> {data.dev.skills.slice(0, 8).map((s) => `${s.skill} ${s.level}/5`).join(', ')}</div>}
      </Card>}
      {data.assets && <Card title={`Company property (${data.assets.outstanding} held)`}>
        {data.assets.assignments.length === 0 ? <Empty>Nothing assigned.</Empty> : data.assets.assignments.map((a) => <div key={a.id} style={{ padding: '4px 0', fontSize: 13 }}><b>{a.asset.name}</b> ({a.asset.tag}) <Pill tone={a.status === 'ACTIVE' ? 'info' : 'neutral'}>{label(a.status)}</Pill>{a.status === 'ACTIVE' && !a.acknowledgedAt && <Pill tone="warn">Not acknowledged</Pill>}<span style={{ fontSize: 11, opacity: 0.7 }}> {fmtDate(a.assignedAt)}</span></div>)}
        <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>Outstanding items block the assets clearance when this person leaves.</div>
      </Card>}
      {data.recognition && <Card title="Recognition">
        {data.recognition.items.map((x) => <div key={x.id} style={{ padding: '4px 0', fontSize: 13 }}>🏅 <b>{x.title}</b> <span style={{ opacity: 0.7, fontSize: 11 }}>{fmtDate(x.date)}</span>{x.citation && <div style={{ fontSize: 12, opacity: 0.8 }}>{x.citation}</div>}</div>)}
        {data.recognition.canGive && <div style={{ marginTop: 8 }}><Grid><Field label="Type"><Select value={r.kind} onChange={(ev) => setR({ ...r, kind: ev.target.value })}><option value="COMMENDATION">Commendation</option><option value="AWARD">Award</option><option value="MILESTONE">Milestone</option></Select></Field><Field label="Title"><Input value={r.title} onChange={(ev) => setR({ ...r, title: ev.target.value })} /></Field></Grid><Field label="Citation"><Input value={r.citation} onChange={(ev) => setR({ ...r, citation: ev.target.value })} /></Field><label style={{ display: 'flex', gap: 6, fontSize: 12, marginBottom: 6 }}><input type="checkbox" checked={r.announce} onChange={(ev) => setR({ ...r, announce: ev.target.checked })} />Announce to the company</label><Btn small kind="primary" disabled={busy || !r.title} onClick={() => run(async () => { await api.post(`/admin/pwm/employees/${e.id}/recognition`, r); setR({ kind: 'COMMENDATION', title: '', citation: '', announce: false }); reload(); })}>Give recognition</Btn></div>}
      </Card>}
      {data.warnings && <Card title="Warnings (HR administrators and executives only)">
        {data.warnings.length === 0 ? <Empty>No warnings on record.</Empty> : data.warnings.map((w) => <div key={w.reference} style={{ padding: '4px 0', fontSize: 13 }}>{w.reference}: {label(w.outcome)} <Pill tone={w.spent ? 'neutral' : 'warn'}>{w.spent ? 'Spent' : `Valid until ${fmtDate(w.warningExpiresAt)}`}</Pill></div>)}
        <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>Case details are visible only to the people named on the case.</div>
      </Card>}
    </div>
  );
}
