'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import {
  Btn, ContractStatusPill, Days, Empty, EmpStatusPill, Field, Grid, Input, Notice, PageHeader, Pager, Select, Table, Td, downloadCsv, fmtDate, label,
  todayYmd, useAction, useDebounced, useLoad, usePwm,
} from '@/components/pwm/ui';

interface Row {
  id: string; employeeNo: string; firstName: string; lastName: string; jobTitle: string; status: string; employmentType: string; hireDate: string; workEmail: string | null;
  department: { id: string; name: string } | null; manager: { firstName: string; lastName: string } | null;
  contract: { id: string; status: string; expiryDate: string | null; daysRemaining: number | null; reference: string } | null;
}
interface Dept { id: string; name: string }

export default function EmployeesPage() {
  const { me } = usePwm();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('current');
  const [dept, setDept] = useState('');
  const [pg, setPg] = useState(1);
  const [adding, setAdding] = useState(false);
  const dq = useDebounced(q);
  const depts = useLoad(() => api.get<{ data: Dept[] }>('/admin/pwm/departments').then((r) => r.data), []);
  const { data, loading, error } = useLoad(
    () => api.get<{ data: Row[]; pagination: { totalPages: number; total: number } }>(`/admin/pwm/employees?page=${pg}&limit=25&status=${status}${dq ? `&q=${encodeURIComponent(dq)}` : ''}${dept ? `&departmentId=${dept}` : ''}`),
    [pg, status, dq, dept],
  );
  const { error: exportError, run } = useAction();
  return (
    <div>
      <PageHeader
        title="Employees" sub="One permanent record per person. Search, filter, and open a profile for the full employment history."
        actions={<>
          {me?.can.manageEmployees && <Btn onClick={() => run(() => downloadCsv(`/admin/pwm/employees/export.csv?status=${status}${dept ? `&departmentId=${dept}` : ''}`, 'employees.csv'))}>Export CSV</Btn>}
          {me?.can.import && <Btn onClick={() => router.push('/pwm/import')}>Bulk import</Btn>}
          {me?.can.manageEmployees && <Btn kind="primary" onClick={() => setAdding(true)}>+ Add employee</Btn>}
        </>}
      />
      {(error || exportError) && <Notice kind="error">{error || exportError}</Notice>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 14 }}>
        <Input placeholder="Search name, ID, email, title" value={q} onChange={(e) => { setQ(e.target.value); setPg(1); }} />
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPg(1); }}>
          <option value="current">Current employees</option><option value="PENDING_ONBOARDING">Pending onboarding</option><option value="former">Former employees</option><option value="">All except archived</option><option value="ARCHIVED">Archived</option>
        </Select>
        <Select value={dept} onChange={(e) => { setDept(e.target.value); setPg(1); }}><option value="">All departments</option>{depts.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
      </div>
      {loading && !data ? <Empty>Loading…</Empty> : !data?.data.length ? <Empty>No employees match. {me?.can.import ? 'Use Bulk import to bring in current staff.' : ''}</Empty> : (
        <>
          <Table head={['ID', 'Name', 'Department', 'Job title', 'Type', 'Status', 'Contract', 'Hired']}>
            {data.data.map((e) => (
              <tr key={e.id}>
                <Td style={{ whiteSpace: 'nowrap' }}>{e.employeeNo}</Td>
                <Td><Link href={`/pwm/employees/${e.id}`} style={{ fontWeight: 700, color: 'inherit' }}>{e.firstName} {e.lastName}</Link>{e.workEmail && <div style={{ fontSize: 11, opacity: 0.7 }}>{e.workEmail}</div>}</Td>
                <Td>{e.department?.name ?? '—'}</Td><Td>{e.jobTitle}</Td><Td>{label(e.employmentType)}</Td><Td><EmpStatusPill status={e.status} /></Td>
                <Td>{e.contract ? <div style={{ display: 'grid', gap: 4 }}><ContractStatusPill status={e.contract.status} />{e.contract.expiryDate && <Days days={e.contract.daysRemaining} />}</div> : '—'}</Td>
                <Td style={{ whiteSpace: 'nowrap' }}>{fmtDate(e.hireDate)}</Td>
              </tr>
            ))}
          </Table>
          <Pager page={pg} pages={data.pagination.totalPages} onPage={setPg} />
        </>
      )}
      {adding && <AddEmployee depts={depts.data ?? []} onClose={() => setAdding(false)} onCreated={(id) => router.push(`/pwm/employees/${id}`)} />}
    </div>
  );
}

function AddEmployee({ depts, onClose, onCreated }: { depts: Dept[]; onClose: () => void; onCreated: (id: string) => void }) {
  const [f, setF] = useState({ title: '', firstName: '', middleName: '', lastName: '', personalEmail: '', phone: '', workEmail: '', departmentId: '', jobTitle: '', employmentType: 'FIXED_TERM', hireDate: todayYmd(), location: '', workArrangement: 'ON_SITE', startStatus: 'PENDING_ONBOARDING' });
  const [dups, setDups] = useState<{ id: string; employeeNo: string; firstName: string; lastName: string }[] | null>(null);
  const { busy, error, run } = useAction();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const types = ['PERMANENT', 'FIXED_TERM', 'PROBATIONARY', 'TEMPORARY', 'INTERNSHIP', 'GRADUATE_TRAINEE', 'CONSULTANCY', 'PART_TIME'];
  const save = (confirmNotDuplicate = false) => run(async () => {
    try {
      const r = await api.post<{ data: { id: string } }>('/admin/pwm/employees', { ...f, confirmNotDuplicate });
      onCreated(r.data.id);
    } catch (e) {
      const err = e as Error & { fieldErrors?: unknown };
      if (/already on record/i.test(err.message)) setDups((err.fieldErrors as unknown as typeof dups) ?? []);
      throw e;
    }
  });
  return (
    <Modal open onClose={onClose} title="Add employee" width={720}>
      <div style={{ padding: 20 }}>
        {error && <Notice kind="error">{error}</Notice>}
        {dups && dups.length > 0 && <Notice kind="warn">Possible match: {dups.map((d) => `${d.firstName} ${d.lastName} (${d.employeeNo})`).join(', ')}. One person has one record. If this really is someone new, create it anyway.</Notice>}
        <Grid cols={3}>
          <Field label="First name"><Input value={f.firstName} onChange={set('firstName')} /></Field>
          <Field label="Middle name"><Input value={f.middleName} onChange={set('middleName')} /></Field>
          <Field label="Last name"><Input value={f.lastName} onChange={set('lastName')} /></Field>
          <Field label="Personal email"><Input type="email" value={f.personalEmail} onChange={set('personalEmail')} /></Field>
          <Field label="Phone" hint="0803… or +234…"><Input value={f.phone} onChange={set('phone')} /></Field>
          <Field label="Work email"><Input type="email" value={f.workEmail} onChange={set('workEmail')} /></Field>
          <Field label="Department"><Select value={f.departmentId} onChange={set('departmentId')}><option value="">Choose…</option>{depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
          <Field label="Job title"><Input value={f.jobTitle} onChange={set('jobTitle')} /></Field>
          <Field label="Employment type"><Select value={f.employmentType} onChange={set('employmentType')}>{types.map((t) => <option key={t} value={t}>{label(t)}</option>)}</Select></Field>
          <Field label="Date of employment"><Input type="date" value={f.hireDate} onChange={set('hireDate')} /></Field>
          <Field label="Location"><Input value={f.location} onChange={set('location')} /></Field>
          <Field label="Work arrangement"><Select value={f.workArrangement} onChange={set('workArrangement')}><option value="ON_SITE">On-site</option><option value="REMOTE">Remote</option><option value="HYBRID">Hybrid</option></Select></Field>
          <Field label="Starting status" hint="New hires start in onboarding. Choose Active only when recording someone already working here."><Select value={f.startStatus} onChange={set('startStatus')}><option value="PENDING_ONBOARDING">Pending onboarding</option><option value="PROBATION">Probation</option><option value="ACTIVE">Active (existing staff)</option></Select></Field>
        </Grid>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <Btn onClick={onClose}>Cancel</Btn>
          {dups && <Btn disabled={busy} onClick={() => save(true)}>Create anyway</Btn>}
          <Btn kind="primary" disabled={busy || !f.firstName || !f.lastName || !f.departmentId || !f.jobTitle} onClick={() => save(false)}>{busy ? 'Saving…' : 'Create'}</Btn>
        </div>
      </div>
    </Modal>
  );
}
