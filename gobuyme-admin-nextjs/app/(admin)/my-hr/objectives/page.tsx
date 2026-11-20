'use client';
import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { Btn, Card, Empty, Field, Grid, Input, Notice, PageHeader, Pill, Select, TextArea, fmtDate, label, useAction, useLoad } from '@/components/pwm/ui';

interface Obj { id: string; title: string; description: string | null; measure: string | null; target: string | null; weight: number; progress: number; status: string; dueDate: string | null }
interface Data { mine: Obj[]; department: Obj[]; feedback: { id: string; kind: string; text: string; createdAt: string }[]; plan: { id: string; reason: string; objectives: string; support: string | null; reviewDate: string; milestones: { title: string; dueDate: string }[] | null } | null }
interface Rep { id: string; firstName: string; lastName: string; jobTitle: string }

export default function MyObjectives() {
  const { theme: T } = useTheme();
  const { data, loading, error, reload } = useLoad(() => api.get<{ data: Data }>('/my-hr/objectives').then((r) => r.data), []);
  const team = useLoad(() => api.get<{ data: Rep[] }>('/my-hr/team').then((r) => r.data).catch(() => [] as Rep[]), []);
  const [dlg, setDlg] = useState<{ kind: 'objective' | 'feedback'; rep: Rep } | null>(null);
  const { busy, error: actionError, run } = useAction();
  const progress = (o: Obj) => { const v = window.prompt('Progress, 0 to 100', String(o.progress)); if (v !== null) run(async () => { await api.patch(`/my-hr/objectives/${o.id}`, { progress: Number(v) }); reload(); }); };
  const bar = (n: number) => <div style={{ background: T.surface2, borderRadius: 4, height: 8, width: 120 }}><div style={{ width: `${n}%`, background: T.primary, height: 8, borderRadius: 4 }} /></div>;
  return (
    <div>
      <PageHeader title="Objectives and feedback" sub="What you are working towards, how it connects to your department, and feedback shared with you." />
      {(error || actionError) && <Notice kind="error">{error || actionError}</Notice>}
      {loading && !data ? <Empty>Loading…</Empty> : data && (
        <>
          {data.plan && <Notice kind="warn">You are on a performance improvement plan until {fmtDate(data.plan.reviewDate)}. <b>Goals:</b> {data.plan.objectives}{data.plan.support ? ` · Support: ${data.plan.support}` : ''}{data.plan.milestones?.length ? ` · Milestones: ${data.plan.milestones.map((m) => `${m.title} (${fmtDate(m.dueDate)})`).join(', ')}` : ''}</Notice>}
          <Card title="My objectives">
            {!data.mine.length ? <Empty>No objectives set yet.</Empty> : data.mine.map((o) => (
              <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '10px 0', borderBottom: `1px solid ${T.border}`, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ fontSize: 13, color: T.text }}><b>{o.title}</b> <Pill>{o.weight}% weight</Pill>{o.target && <span style={{ color: T.textSec }}> target {o.target}</span>}{o.measure && <div style={{ fontSize: 11, color: T.textSec }}>Measured by {o.measure}{o.dueDate ? ` · due ${fmtDate(o.dueDate)}` : ''}</div>}</div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>{bar(o.progress)}<span style={{ fontSize: 12 }}>{o.progress}%</span>{o.status === 'ACTIVE' && <Btn small onClick={() => progress(o)}>Update</Btn>}</div>
              </div>
            ))}
          </Card>
          {data.department.length > 0 && <div style={{ marginTop: 12 }}><Card title="My department's targets">{data.department.map((o) => <div key={o.id} style={{ padding: '6px 0', fontSize: 13, color: T.text }}><b>{o.title}</b>{o.target ? ` · target ${o.target}` : ''}</div>)}</Card></div>}
          <div style={{ marginTop: 12 }}><Card title="Feedback shared with me">{!data.feedback.length ? <Empty>Nothing yet.</Empty> : data.feedback.map((f) => <div key={f.id} style={{ padding: '8px 0', borderBottom: `1px solid ${T.border}`, fontSize: 13, color: T.text }}><Pill tone={f.kind === 'PRAISE' ? 'good' : 'warn'}>{label(f.kind)}</Pill> {f.text}<div style={{ fontSize: 11, color: T.textMuted }}>{fmtDate(f.createdAt)}</div></div>)}</Card></div>
        </>
      )}
      {team.data && team.data.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <Card title="My team">
            {team.data.map((r) => <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 0', borderBottom: `1px solid ${T.border}`, alignItems: 'center' }}><div style={{ fontSize: 13, color: T.text }}><b>{r.firstName} {r.lastName}</b> <span style={{ color: T.textSec }}>{r.jobTitle}</span></div><div style={{ display: 'flex', gap: 6 }}><Btn small onClick={() => setDlg({ kind: 'objective', rep: r })}>Set objective</Btn><Btn small onClick={() => setDlg({ kind: 'feedback', rep: r })}>Add note</Btn></div></div>)}
          </Card>
        </div>
      )}
      {dlg && <TeamForm dlg={dlg} busy={busy} onClose={() => setDlg(null)} onSave={(body) => run(async () => { await api.post(`/my-hr/team/${dlg.rep.id}/${dlg.kind === 'objective' ? 'objectives' : 'feedback'}`, body); setDlg(null); })} />}
    </div>
  );
}

function TeamForm({ dlg, busy, onClose, onSave }: { dlg: { kind: 'objective' | 'feedback'; rep: Rep }; busy: boolean; onClose: () => void; onSave: (b: Record<string, unknown>) => void }) {
  const [f, setF] = useState({ title: '', description: '', measure: '', target: '', weight: '20', dueDate: '', kind: 'NOTE', text: '', shared: false });
  return (
    <Modal open onClose={onClose} title={`${dlg.kind === 'objective' ? 'Objective' : 'Note'} for ${dlg.rep.firstName} ${dlg.rep.lastName}`} width={520}>
      <div style={{ padding: 20 }}>
        {dlg.kind === 'objective' ? (
          <>
            <Field label="Objective"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
            <Grid cols={3}><Field label="Measured by"><Input value={f.measure} onChange={(e) => setF({ ...f, measure: e.target.value })} /></Field><Field label="Target"><Input value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} /></Field><Field label="Weight %"><Input type="number" value={f.weight} onChange={(e) => setF({ ...f, weight: e.target.value })} /></Field><Field label="Due"><Input type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field></Grid>
            <Field label="Details"><TextArea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
            <Btn kind="primary" disabled={busy || !f.title} onClick={() => onSave({ title: f.title, description: f.description, measure: f.measure, target: f.target, weight: Number(f.weight), dueDate: f.dueDate || null })}>Add</Btn>
          </>
        ) : (
          <>
            <Field label="Type"><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="NOTE">Note</option><option value="PRAISE">Praise</option><option value="IMPROVE">Something to improve</option></Select></Field>
            <Field label="Note"><TextArea rows={4} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} /></Field>
            <label style={{ display: 'flex', gap: 8, fontSize: 13, marginBottom: 10 }}><input type="checkbox" checked={f.shared} onChange={(e) => setF({ ...f, shared: e.target.checked })} />Share this with {dlg.rep.firstName} (otherwise only HR and you see it)</label>
            <Btn kind="primary" disabled={busy || !f.text} onClick={() => onSave({ kind: f.kind, text: f.text, sharedWithEmployee: f.shared })}>Save</Btn>
          </>
        )}
      </div>
    </Modal>
  );
}
