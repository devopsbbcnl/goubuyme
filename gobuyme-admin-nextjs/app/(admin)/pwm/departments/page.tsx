'use client';
import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import { Btn, Empty, Field, Input, Notice, PageHeader, Pill, Select, Table, Td, useAction, useLoad, usePwm } from '@/components/pwm/ui';

interface Dept { id: string; name: string; code: string | null; headcount: number; parentId: string | null; head: { id: string; firstName: string; lastName: string; employeeNo: string; userId: string | null } | null }

export default function DepartmentsPage() {
  const { me } = usePwm();
  const { data, loading, error, reload } = useLoad(() => api.get<{ data: Dept[] }>('/admin/pwm/departments').then((r) => r.data), []);
  const [edit, setEdit] = useState<Dept | 'new' | null>(null);
  const { busy, error: actionError, run } = useAction();
  const canManage = !!me?.can.manageOrganisation;
  return (
    <div>
      <PageHeader title="Departments" sub="Headship drives who sees whose records and who receives contract alerts. A department with no head sends its alerts to HR instead."
        actions={canManage ? <><Btn disabled={busy} onClick={() => run(async () => { await api.post('/admin/pwm/departments/seed', {}); reload(); })}>Add default departments</Btn><Btn kind="primary" onClick={() => setEdit('new')}>+ Department</Btn></> : undefined} />
      {(error || actionError) && <Notice kind="error">{error || actionError}</Notice>}
      {loading && !data ? <Empty>Loading…</Empty> : !data?.length ? <Empty>No departments yet. Use “Add default departments” to start from the standard list.</Empty> : (
        <Table head={['Department', 'Head', 'Current staff', '']}>
          {data.map((d) => (
            <tr key={d.id}>
              <Td><b>{d.name}</b>{d.code && <span style={{ opacity: 0.6 }}> · {d.code}</span>}</Td>
              <Td>{d.head ? <>{d.head.firstName} {d.head.lastName} {!d.head.userId && <Pill tone="warn">No login linked</Pill>}</> : <Pill tone="warn">No head set</Pill>}</Td>
              <Td>{d.headcount}</Td><Td>{canManage && <Btn small onClick={() => setEdit(d)}>Edit</Btn>}</Td>
            </tr>
          ))}
        </Table>
      )}
      {edit && <EditDept d={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </div>
  );
}

function EditDept({ d, onClose, onSaved }: { d: Dept | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(d?.name ?? '');
  const [code, setCode] = useState(d?.code ?? '');
  const [head, setHead] = useState(d?.head?.id ?? '');
  const emps = useLoad(() => api.get<{ data: { id: string; firstName: string; lastName: string; employeeNo: string }[] }>('/admin/pwm/employees/lookup').then((r) => r.data), []);
  const { busy, error, run } = useAction();
  const save = () => run(async () => {
    const body = { name, code, headEmployeeId: head || null };
    if (d) await api.patch(`/admin/pwm/departments/${d.id}`, body); else await api.post('/admin/pwm/departments', body);
    onSaved();
  });
  return (
    <Modal open onClose={onClose} title={d ? `Edit ${d.name}` : 'New department'} width={460}>
      <div style={{ padding: 20 }}>
        {error && <Notice kind="error">{error}</Notice>}
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Code"><Input value={code} onChange={(e) => setCode(e.target.value)} /></Field>
        <Field label="Department head" hint="The head's login must be linked to their employee record to receive alerts and see their team."><Select value={head} onChange={(e) => setHead(e.target.value)}><option value="">No head</option>{emps.data?.map((x) => <option key={x.id} value={x.id}>{x.firstName} {x.lastName} ({x.employeeNo})</option>)}</Select></Field>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy || !name.trim()} onClick={save}>Save</Btn></div>
      </div>
    </Modal>
  );
}
