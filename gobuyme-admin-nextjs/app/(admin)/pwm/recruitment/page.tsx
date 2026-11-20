'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import { Btn, Empty, Field, Grid, Input, Notice, PageHeader, Pill, Select, Stat, Table, Tabs, Td, TextArea, fmtDate, label, useAction, useLoad, usePwm } from '@/components/pwm/ui';

interface V { id: string; reference: string; title: string; department: string | null; status: string; employmentType: string; headcount: number; applicants: number; active: number; hired: number; closingDate: string | null; isPublic: boolean }
type View = 'ALL' | 'OPEN' | 'PENDING_APPROVAL' | 'DRAFT' | 'CLOSED';
const TONE: Record<string, 'good' | 'warn' | 'neutral' | 'info' | 'bad'> = { OPEN: 'good', PENDING_APPROVAL: 'warn', DRAFT: 'neutral', ON_HOLD: 'info', FILLED: 'good', CLOSED: 'neutral' };

export default function RecruitmentPage() {
  const { me } = usePwm();
  const router = useRouter();
  const [view, setView] = useState<View>('ALL');
  const [adding, setAdding] = useState(false);
  const list = useLoad(() => api.get<{ data: V[] }>(`/admin/pwm/vacancies${view !== 'ALL' ? `?status=${view}` : ''}`).then((r) => r.data), [view]);
  const sum = useLoad(() => api.get<{ data: { openVacancies: number; pendingApproval: number; activeCandidates: number; hiredThisYear: number } }>('/admin/pwm/recruitment/summary').then((r) => r.data), []);
  return (
    <div>
      <PageHeader title="Recruitment" sub="Vacancies, candidates and interviews, from approval to hire. Hiring someone creates their employee record and starts onboarding." actions={me?.can.manageRecruitment ? <Btn kind="primary" onClick={() => setAdding(true)}>+ Vacancy</Btn> : undefined} />
      {list.error && <Notice kind="error">{list.error}</Notice>}
      {sum.data && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 14 }}><Stat label="Open vacancies" value={sum.data.openVacancies} /><Stat label="Awaiting approval" value={sum.data.pendingApproval} /><Stat label="Active candidates" value={sum.data.activeCandidates} /><Stat label="Hired this year" value={sum.data.hiredThisYear} /></div>}
      <Tabs<View> value={view} onChange={setView} items={[{ id: 'ALL', label: 'All' }, { id: 'OPEN', label: 'Open' }, { id: 'PENDING_APPROVAL', label: 'Awaiting approval' }, { id: 'DRAFT', label: 'Drafts' }, { id: 'CLOSED', label: 'Closed' }]} />
      {list.loading && !list.data ? <Empty>Loading…</Empty> : !list.data?.length ? <Empty>No vacancies here.</Empty> : (
        <Table head={['Reference', 'Role', 'Department', 'Status', 'Candidates', 'Hired / needed', 'Closes']}>
          {list.data.map((v) => (
            <tr key={v.id}>
              <Td>{v.reference}</Td><Td><Link href={`/pwm/recruitment/${v.id}`} style={{ fontWeight: 700, color: 'inherit' }}>{v.title}</Link> {v.isPublic && <Pill tone="info">On careers page</Pill>}</Td><Td>{v.department ?? '—'}</Td>
              <Td><Pill tone={TONE[v.status] ?? 'neutral'}>{label(v.status)}</Pill></Td><Td>{v.active} active of {v.applicants}</Td><Td>{v.hired} / {v.headcount}</Td><Td>{v.closingDate ? fmtDate(v.closingDate) : '—'}</Td>
            </tr>
          ))}
        </Table>
      )}
      {adding && <NewVacancy onClose={() => setAdding(false)} onCreated={(id) => router.push(`/pwm/recruitment/${id}`)} />}
    </div>
  );
}

function NewVacancy({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const depts = useLoad(() => api.get<{ data: { id: string; name: string }[] }>('/admin/pwm/departments').then((r) => r.data), []);
  const [f, setF] = useState({ title: '', departmentId: '', employmentType: 'FIXED_TERM', headcount: '1', location: '', description: '', requirements: '', closingDate: '', isPublic: false });
  const { busy, error, run } = useAction();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const types = ['PERMANENT', 'FIXED_TERM', 'PROBATIONARY', 'TEMPORARY', 'INTERNSHIP', 'GRADUATE_TRAINEE', 'CONSULTANCY', 'PART_TIME'];
  return (
    <Modal open onClose={onClose} title="New vacancy" width={640}>
      <div style={{ padding: 20 }}>
        {error && <Notice kind="error">{error}</Notice>}
        <Grid>
          <Field label="Job title"><Input value={f.title} onChange={set('title')} /></Field>
          <Field label="Department"><Select value={f.departmentId} onChange={set('departmentId')}><option value="">Choose…</option>{depts.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
          <Field label="Employment type"><Select value={f.employmentType} onChange={set('employmentType')}>{types.map((t) => <option key={t} value={t}>{label(t)}</option>)}</Select></Field>
          <Field label="Positions"><Input type="number" min={1} value={f.headcount} onChange={set('headcount')} /></Field>
          <Field label="Location"><Input value={f.location} onChange={set('location')} /></Field>
          <Field label="Closing date"><Input type="date" value={f.closingDate} onChange={set('closingDate')} /></Field>
        </Grid>
        <Field label="Description"><TextArea rows={3} value={f.description} onChange={set('description')} /></Field>
        <Field label="Requirements"><TextArea rows={3} value={f.requirements} onChange={set('requirements')} /></Field>
        <label style={{ display: 'flex', gap: 8, fontSize: 13, marginBottom: 12 }}><input type="checkbox" checked={f.isPublic} onChange={(e) => setF({ ...f, isPublic: e.target.checked })} />Show on the public careers page once open</label>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy || !f.title || !f.departmentId} onClick={() => run(async () => { const r = await api.post<{ data: { id: string } }>('/admin/pwm/vacancies', { ...f, headcount: Number(f.headcount), closingDate: f.closingDate || null }); onCreated(r.data.id); })}>Create draft</Btn></div>
      </div>
    </Modal>
  );
}
