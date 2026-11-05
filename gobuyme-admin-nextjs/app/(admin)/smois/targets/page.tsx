'use client';
import { useState } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import {
  Btn, Empty, Field, Input, Notice, PageHeader, PLATFORMS, Pill, Select, Table, Tabs, Td, TextArea,
  fmtDate, num, pretty, toLocalInput, useAction, useLoad, useSmois,
} from '@/components/smois/ui';

type Status = 'NOT_STARTED' | 'ON_TRACK' | 'AT_RISK' | 'ACHIEVED' | 'EXCEEDED' | 'MISSED';
interface Target {
  id: string; name: string; metric: string; scope: string; targetValue: number; unit: string; platform: string | null; startsAt: string; endsAt: string; notes: string | null;
  memberName: string | null; accountName: string | null; supervisorName: string | null;
  progress: { actual: number | null; percent: number | null; remaining: number | null; status: Status; note?: string };
}

const METRICS: [string, string, boolean][] = [
  ['FOLLOWER_GROWTH', 'Follower growth', false], ['ENGAGEMENT_RATE', 'Engagement rate (%)', false], ['REACH', 'Reach', false], ['IMPRESSIONS', 'Impressions', false],
  ['VIDEO_VIEWS', 'Video views', false], ['WEBSITE_CLICKS', 'Website clicks', false], ['POSTS_PUBLISHED', 'Posts published', true],
  ['TASK_COMPLETION', 'Task completion (%)', true], ['ON_TIME_TASKS', 'On-time task completion (%)', true], ['APPROVAL_RATE', 'Approval rate (%)', true], ['REPORT_COMPLIANCE', 'Weekly report compliance (%)', true],
];
const TONE: Record<Status, 'neutral' | 'info' | 'warn' | 'good' | 'bad' | 'brand'> = { NOT_STARTED: 'neutral', ON_TRACK: 'info', AT_RISK: 'warn', ACHIEVED: 'good', EXCEEDED: 'good', MISSED: 'bad' };

export default function TargetsPage() {
  const { theme: T } = useTheme();
  const { me } = useSmois();
  const [view, setView] = useState<'active' | 'ended'>('active');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Target | null>(null);
  const { data, loading, error, reload } = useLoad(() => api.get<{ data: Target[] }>(`/admin/smois/targets?view=${view}`).then((r) => r.data), [view]);
  const manage = !!me?.can.manageTargets;

  return (
    <div>
      <PageHeader
        title="Targets and KPIs"
        sub="Goals for the department, a platform, an account or a person. Progress is counted from SMOIS records. Shared audience growth is never counted as one person's result: individuals only get goals their own work decides."
        actions={manage ? <Btn kind="primary" onClick={() => setAdding(true)}>+ New target</Btn> : undefined}
      />
      <Tabs value={view} onChange={setView} items={[{ id: 'active', label: 'Running and upcoming' }, { id: 'ended', label: 'Ended' }]} />
      {error && <Notice kind="error">{error}</Notice>}
      {loading && !data ? <Empty>Loading…</Empty> : data && data.length === 0 ? <Empty>No targets here.</Empty> : data && (
        <Table head={['Target', 'Applies to', 'Period', 'Target', 'Actual', 'Achieved', 'Status', '']}>
          {data.map((t) => (
            <tr key={t.id}>
              <Td><b>{t.name}</b><div style={{ fontSize: 11, color: T.textSec }}>{METRICS.find((m) => m[0] === t.metric)?.[1] ?? pretty(t.metric)}</div></Td>
              <Td>{t.scope === 'EMPLOYEE' ? t.memberName : t.scope === 'ACCOUNT' ? t.accountName : t.scope === 'PLATFORM' ? pretty(t.platform ?? '') : 'Whole department'}</Td>
              <Td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{fmtDate(t.startsAt)} – {fmtDate(t.endsAt)}</Td>
              <Td>{t.targetValue.toLocaleString()} {t.unit}</Td>
              <Td title={t.progress.note}>{num(t.progress.actual)}{t.progress.note && <div style={{ fontSize: 10, color: T.textMuted }}>{t.progress.note}</div>}</Td>
              <Td style={{ minWidth: 110 }}>
                {t.progress.percent === null ? '—' : (
                  <div><div style={{ fontSize: 12, fontWeight: 700 }}>{t.progress.percent}%</div>
                    <div style={{ height: 5, background: T.surface3, borderRadius: 3, marginTop: 3 }}><div style={{ width: `${Math.min(100, t.progress.percent)}%`, height: '100%', background: t.progress.status === 'MISSED' ? T.error : t.progress.status === 'AT_RISK' ? T.warning : T.success, borderRadius: 3 }} /></div></div>
                )}
              </Td>
              <Td><Pill tone={TONE[t.progress.status]}>{pretty(t.progress.status)}</Pill></Td>
              <Td>{manage && <Btn small onClick={() => setEditing(t)}>Change</Btn>}</Td>
            </tr>
          ))}
        </Table>
      )}
      {adding && <TargetForm onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />}
      {editing && <EditTarget t={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </div>
  );
}

function TargetForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { people } = useSmois();
  const accounts = useLoad(() => api.get<{ data: { id: string; name: string }[] }>('/admin/smois/accounts').then((r) => r.data), []);
  const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 0);
  const [f, setF] = useState({ name: '', metric: 'FOLLOWER_GROWTH', scope: 'DEPARTMENT', targetValue: '', platform: 'INSTAGRAM', accountId: '', memberId: '', startsAt: toLocalInput(start.toISOString()), endsAt: toLocalInput(end.toISOString()), supervisorId: '', notes: '' });
  const { busy, error, run } = useAction();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const personal = f.scope === 'EMPLOYEE';
  const metrics = personal ? METRICS.filter((m) => m[2]) : METRICS;
  const doers = people.filter((p) => p.memberId && (p.role === 'MANAGER' || p.role === 'MANAGEMENT'));
  const save = () => run(async () => {
    await api.post('/admin/smois/targets', { ...f, targetValue: Number(f.targetValue), startsAt: new Date(f.startsAt).toISOString(), endsAt: new Date(f.endsAt).toISOString(), supervisorId: f.supervisorId || null, accountId: f.accountId || undefined, memberId: f.memberId || undefined });
    onSaved();
  });
  return (
    <Modal open onClose={onClose} title="New target" width={600}>
      <div style={{ padding: 20 }}>
        {error && <Notice kind="error">{error}</Notice>}
        <Field label="Name"><Input value={f.name} onChange={set('name')} placeholder="Grow Instagram by 500" /></Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Applies to"><Select value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value, metric: e.target.value === 'EMPLOYEE' ? 'POSTS_PUBLISHED' : f.metric })}><option value="DEPARTMENT">Whole department</option><option value="PLATFORM">One platform</option><option value="ACCOUNT">One account</option><option value="EMPLOYEE">One person</option></Select></Field>
          <Field label="Measure" hint={personal ? 'People can only be held to measures their own work decides.' : undefined}><Select value={f.metric} onChange={set('metric')}>{metrics.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
          {f.scope === 'PLATFORM' && <Field label="Platform"><Select value={f.platform} onChange={set('platform')}>{PLATFORMS.map((p) => <option key={p} value={p}>{pretty(p)}</option>)}</Select></Field>}
          {f.scope === 'ACCOUNT' && <Field label="Account"><Select value={f.accountId} onChange={set('accountId')}><option value="">Choose…</option>{accounts.data?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>}
          {personal && <Field label="Person"><Select value={f.memberId} onChange={set('memberId')}><option value="">Choose…</option>{doers.map((p) => <option key={p.memberId!} value={p.memberId!}>{p.name}</option>)}</Select></Field>}
          <Field label="Target value"><Input type="number" min={0} value={f.targetValue} onChange={set('targetValue')} /></Field>
          <Field label="Starts"><Input type="datetime-local" value={f.startsAt} onChange={set('startsAt')} /></Field>
          <Field label="Ends"><Input type="datetime-local" value={f.endsAt} onChange={set('endsAt')} /></Field>
          <Field label="Responsible supervisor"><Select value={f.supervisorId} onChange={set('supervisorId')}><option value="">—</option>{people.filter((p) => p.role === 'SUPER' || p.role === 'MANAGEMENT').map((p) => <option key={p.userId} value={p.userId}>{p.name}</option>)}</Select></Field>
        </div>
        <Field label="Notes"><TextArea rows={2} value={f.notes} onChange={set('notes')} /></Field>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy || !f.name.trim() || !f.targetValue} onClick={save}>{busy ? 'Saving…' : 'Set target'}</Btn></div>
      </div>
    </Modal>
  );
}

function EditTarget({ t, onClose, onSaved }: { t: Target; onClose: () => void; onSaved: () => void }) {
  const [value, setValue] = useState(String(t.targetValue));
  const [ends, setEnds] = useState(toLocalInput(t.endsAt));
  const [reason, setReason] = useState('');
  const { busy, error, run } = useAction();
  const save = (extra: object = {}) => run(async () => { await api.patch(`/admin/smois/targets/${t.id}`, { targetValue: Number(value), endsAt: new Date(ends).toISOString(), reason, ...extra }); onSaved(); });
  return (
    <Modal open onClose={onClose} title={`Change: ${t.name}`} width={480}>
      <div style={{ padding: 20 }}>
        <Notice kind="info">Changes are recorded with your reason and the old values.</Notice>
        {error && <Notice kind="error">{error}</Notice>}
        <Field label="Target value"><Input type="number" value={value} onChange={(e) => setValue(e.target.value)} /></Field>
        <Field label="Ends"><Input type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} /></Field>
        <Field label="Reason"><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
          <Btn kind="danger" disabled={busy || !reason.trim()} onClick={() => save({ isActive: false })}>Retire target</Btn>
          <div style={{ display: 'flex', gap: 8 }}><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy || !reason.trim()} onClick={() => save()}>Save</Btn></div>
        </div>
      </div>
    </Modal>
  );
}
