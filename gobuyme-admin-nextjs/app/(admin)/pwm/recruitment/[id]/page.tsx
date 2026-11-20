'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useTheme } from '@/context/ThemeContext';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import { Btn, Card, Empty, Field, Grid, Input, Notice, PageHeader, PersonSelect, Pill, Select, TextArea, fmtDate, fmtDateTime, label, todayYmd, useAction, useLoad, usePwm } from '@/components/pwm/ui';

interface Interview { id: string; scheduledAt: string; mode: string; location: string | null; status: string; panel: { userId: string; name: string }[]; feedback: { userId: string; score: number; notes: string | null }[] | null }
interface App { id: string; stage: string; rating: number | null; notes: string | null; coverNote: string | null; rejectionReason: string | null; offerNotes: string | null; hiredEmployeeId: string | null; candidate: { id: string; firstName: string; lastName: string; email: string; phone: string | null; source: string | null; cvUrl: string | null }; interviews: Interview[] }
interface Vac { id: string; reference: string; title: string; status: string; department: string | null; hiringManager: string | null; description: string | null; requirements: string | null; headcount: number; departmentId: string | null; isPublic: boolean; applications: App[]; canManage: boolean; canApprove: boolean }

const COLS = ['APPLIED', 'SCREENING', 'INTERVIEW', 'ASSESSMENT', 'OFFER', 'HIRED'];

export default function VacancyPage() {
  const { id } = useParams<{ id: string }>();
  const { theme: T } = useTheme();
  const { me } = usePwm();
  const { data: v, loading, error, reload } = useLoad(() => api.get<{ data: Vac }>(`/admin/pwm/vacancies/${id}`).then((r) => r.data), [id]);
  const [open, setOpen] = useState<App | null>(null);
  const [adding, setAdding] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const { busy, error: actionError, run } = useAction();
  if (loading && !v) return <Empty>Loading…</Empty>;
  if (error || !v) return <Notice kind="error">{error || 'Vacancy not found.'}</Notice>;
  const act = (action: string, note?: string) => run(async () => { await api.post(`/admin/pwm/vacancies/${v.id}/status`, { action, note }); reload(); });
  const closed = v.applications.filter((a) => ['REJECTED', 'WITHDRAWN'].includes(a.stage));
  return (
    <div>
      <PageHeader title={v.title} sub={`${v.reference} · ${v.department ?? 'No department'} · ${v.headcount} position${v.headcount === 1 ? '' : 's'}${v.hiringManager ? ` · hiring manager ${v.hiringManager}` : ''}`}
        actions={<>
          <Pill tone={v.status === 'OPEN' ? 'good' : 'neutral'}>{label(v.status)}</Pill>
          {v.canManage && v.status === 'DRAFT' && <Btn kind="primary" disabled={busy} onClick={() => act('submit')}>Submit for approval</Btn>}
          {v.canApprove && v.status === 'PENDING_APPROVAL' && <><Btn kind="primary" disabled={busy} onClick={() => act('approve')}>Approve</Btn><Btn kind="danger" onClick={() => { const n = window.prompt('Why is it being returned?'); if (n) act('reject', n); }}>Return</Btn></>}
          {v.canManage && v.status === 'OPEN' && <Btn disabled={busy} onClick={() => act('hold')}>Hold</Btn>}
          {v.canManage && ['ON_HOLD', 'CLOSED'].includes(v.status) && <Btn disabled={busy} onClick={() => act('reopen')}>Reopen</Btn>}
          {v.canManage && !['FILLED', 'CLOSED'].includes(v.status) && <Btn kind="danger" disabled={busy} onClick={() => act('close')}>Close</Btn>}
          {v.canManage && ['OPEN', 'ON_HOLD'].includes(v.status) && <Btn kind="primary" onClick={() => setAdding(true)}>+ Candidate</Btn>}
        </>} />
      {actionError && <Notice kind="error">{actionError}</Notice>}
      {v.status === 'PENDING_APPROVAL' && <Notice kind="warn">Waiting for management approval before it can be advertised or receive applications.</Notice>}
      {v.status === 'OPEN' && v.isPublic && <Notice kind="info">This role is on the public careers feed. Applications from the website appear here as Applied.</Notice>}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLS.length}, minmax(190px, 1fr))`, gap: 10, overflowX: 'auto' }}>
        {COLS.map((col) => (
          <div key={col} style={{ background: T.surface2, borderRadius: 4, padding: 10, minHeight: 140 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: T.textSec, marginBottom: 8, textTransform: 'uppercase' }}>{label(col)} ({v.applications.filter((a) => a.stage === col).length})</div>
            {v.applications.filter((a) => a.stage === col).map((a) => (
              <button key={a.id} onClick={() => setOpen(a)} style={{ all: 'unset', display: 'block', width: '100%', boxSizing: 'border-box', cursor: 'pointer', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, padding: 10, marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{a.candidate.firstName} {a.candidate.lastName}</div>
                <div style={{ fontSize: 11, color: T.textSec }}>{a.candidate.source ?? 'Direct'}{a.rating ? ` · ${'★'.repeat(a.rating)}` : ''}{a.interviews.some((i) => i.status === 'SCHEDULED') ? ' · interview set' : ''}</div>
              </button>
            ))}
          </div>
        ))}
      </div>
      {closed.length > 0 && <div style={{ marginTop: 12 }}><Btn small onClick={() => setShowClosed((s) => !s)}>{showClosed ? 'Hide' : 'Show'} {closed.length} rejected or withdrawn</Btn>{showClosed && closed.map((a) => <div key={a.id} style={{ fontSize: 13, padding: '6px 0', color: T.textSec }}>{a.candidate.firstName} {a.candidate.lastName}: {label(a.stage)}{a.rejectionReason ? ` (${a.rejectionReason})` : ''}</div>)}</div>}
      {(v.description || v.requirements) && <div style={{ marginTop: 14 }}><Card title="Role">{v.description && <div style={{ fontSize: 13, color: T.text, whiteSpace: 'pre-wrap', marginBottom: 8 }}>{v.description}</div>}{v.requirements && <div style={{ fontSize: 13, color: T.textSec, whiteSpace: 'pre-wrap' }}><b>Requirements</b>{'\n'}{v.requirements}</div>}</Card></div>}
      {open && <Candidate a={v.applications.find((x) => x.id === open.id) ?? open} vac={v} canManage={v.canManage} meUserId={me?.user.id ?? ''} onClose={() => setOpen(null)} onChanged={reload} />}
      {adding && <AddCandidate vacId={v.id} onClose={() => setAdding(false)} onDone={() => { setAdding(false); reload(); }} />}
    </div>
  );
}

function AddCandidate({ vacId, onClose, onDone }: { vacId: string; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ firstName: '', lastName: '', email: '', phone: '', source: '', notes: '', consentGiven: false });
  const { busy, error, run } = useAction();
  return (
    <Modal open onClose={onClose} title="Add candidate" width={520}>
      <div style={{ padding: 20 }}>{error && <Notice kind="error">{error}</Notice>}
        <Grid><Field label="First name"><Input value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} /></Field><Field label="Last name"><Input value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} /></Field>
          <Field label="Email"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field><Field label="Phone"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <Field label="Source"><Input placeholder="Referral, LinkedIn…" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} /></Field></Grid>
        <label style={{ display: 'flex', gap: 8, fontSize: 13, marginBottom: 12 }}><input type="checkbox" checked={f.consentGiven} onChange={(e) => setF({ ...f, consentGiven: e.target.checked })} />The candidate agreed to us keeping their details for this process</label>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy || !f.firstName || !f.lastName || !f.email} onClick={() => run(async () => { await api.post(`/admin/pwm/vacancies/${vacId}/applications`, f); onDone(); })}>Add</Btn></div>
      </div>
    </Modal>
  );
}

function Candidate({ a, vac, canManage, meUserId, onClose, onChanged }: { a: App; vac: Vac; canManage: boolean; meUserId: string; onClose: () => void; onChanged: () => void }) {
  const { theme: T } = useTheme();
  const [stage, setStage] = useState('');
  const [reason, setReason] = useState('');
  const [offer, setOffer] = useState(a.offerNotes ?? '');
  const [notes, setNotes] = useState(a.notes ?? '');
  const [iv, setIv] = useState({ scheduledAt: '', mode: 'IN_PERSON', location: '', panel: '' });
  const [hire, setHire] = useState({ hireDate: todayYmd(), jobTitle: vac.title });
  const [score, setScore] = useState<Record<string, { s: string; n: string }>>({});
  const { busy, error, run } = useAction();
  const patch = (body: Record<string, unknown>) => run(async () => { await api.patch(`/admin/pwm/applications/${a.id}`, body); onChanged(); });
  const hired = a.stage === 'HIRED';
  return (
    <Modal open onClose={onClose} title={`${a.candidate.firstName} ${a.candidate.lastName}`} width={720}>
      <div style={{ padding: 20, maxHeight: '78vh', overflowY: 'auto' }}>
        {error && <Notice kind="error">{error}</Notice>}
        <div style={{ fontSize: 13, color: T.text, lineHeight: 1.8, marginBottom: 10 }}>{a.candidate.email}{a.candidate.phone ? ` · ${a.candidate.phone}` : ''} · {a.candidate.source ?? 'Direct'} · <Pill>{label(a.stage)}</Pill>{a.candidate.cvUrl && <> · <a href={a.candidate.cvUrl} target="_blank" rel="noreferrer" style={{ color: T.primary }}>CV</a></>}{a.coverNote && <div style={{ color: T.textSec }}>“{a.coverNote}”</div>}</div>
        {hired && a.hiredEmployeeId && <Notice kind="success">Hired. <a href={`/pwm/employees/${a.hiredEmployeeId}`}>Open the employee record</a>.</Notice>}
        {canManage && !hired && (
          <>
            <Card title="Move forward">
              <Grid>
                <Field label="Stage"><Select value={stage} onChange={(e) => setStage(e.target.value)}><option value="">Choose…</option>{['SCREENING', 'INTERVIEW', 'ASSESSMENT', 'OFFER', 'REJECTED', 'WITHDRAWN'].map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select></Field>
                <Field label="Rating"><Select value={a.rating ?? ''} onChange={(e) => patch({ rating: Number(e.target.value) })}><option value="">Not rated</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} ★</option>)}</Select></Field>
              </Grid>
              {stage === 'REJECTED' && <Field label="Reason (recorded)"><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>}
              {stage === 'OFFER' && <Field label="Offer terms (no salary figures here)"><Input value={offer} onChange={(e) => setOffer(e.target.value)} placeholder="e.g. Fixed-term 12 months, starts in two weeks" /></Field>}
              <Btn kind="primary" disabled={busy || !stage} onClick={() => patch({ stage, rejectionReason: reason, offerNotes: offer })}>Move</Btn>
            </Card>
            <div style={{ marginTop: 10 }}><Card title="Notes"><TextArea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /><div style={{ marginTop: 8 }}><Btn small disabled={busy} onClick={() => patch({ notes })}>Save notes</Btn></div></Card></div>
          </>
        )}
        <div style={{ marginTop: 10 }}>
          <Card title="Interviews">
            {a.interviews.length === 0 && <div style={{ fontSize: 12, color: T.textMuted }}>None yet.</div>}
            {a.interviews.map((i) => (
              <div key={i.id} style={{ padding: '8px 0', borderBottom: `1px solid ${T.border}`, fontSize: 13, color: T.text }}>
                <b>{fmtDateTime(i.scheduledAt)}</b> · {label(i.mode)}{i.location ? ` · ${i.location}` : ''} · <Pill tone={i.status === 'COMPLETED' ? 'good' : i.status === 'CANCELLED' ? 'neutral' : 'info'}>{label(i.status)}</Pill>
                <div style={{ fontSize: 12, color: T.textSec }}>Panel: {i.panel.map((p) => p.name).join(', ') || '—'}</div>
                {i.feedback?.map((f) => <div key={f.userId} style={{ fontSize: 12, color: T.textSec }}>{i.panel.find((p) => p.userId === f.userId)?.name ?? 'Reviewer'}: {'★'.repeat(f.score)} {f.notes}</div>)}
                {i.status !== 'CANCELLED' && (i.panel.some((p) => p.userId === meUserId) || canManage) && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <select value={score[i.id]?.s ?? ''} onChange={(e) => setScore({ ...score, [i.id]: { s: e.target.value, n: score[i.id]?.n ?? '' } })}><option value="">Score…</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</select>
                    <input placeholder="Feedback" value={score[i.id]?.n ?? ''} onChange={(e) => setScore({ ...score, [i.id]: { s: score[i.id]?.s ?? '', n: e.target.value } })} style={{ flex: 1 }} />
                    <Btn small disabled={busy || !score[i.id]?.s} onClick={() => run(async () => { await api.post(`/admin/pwm/interviews/${i.id}/feedback`, { score: Number(score[i.id].s), notes: score[i.id].n }); onChanged(); })}>Save</Btn>
                  </div>
                )}
              </div>
            ))}
            {canManage && !hired && (
              <div style={{ marginTop: 10 }}>
                <Grid cols={3}><Field label="When"><Input type="datetime-local" value={iv.scheduledAt} onChange={(e) => setIv({ ...iv, scheduledAt: e.target.value })} /></Field>
                  <Field label="How"><Select value={iv.mode} onChange={(e) => setIv({ ...iv, mode: e.target.value })}><option value="IN_PERSON">In person</option><option value="VIDEO">Video</option><option value="PHONE">Phone</option></Select></Field>
                  <Field label="Where / link"><Input value={iv.location} onChange={(e) => setIv({ ...iv, location: e.target.value })} /></Field>
                  <Field label="Interviewer"><PersonSelect value={iv.panel} onChange={(v) => setIv({ ...iv, panel: v })} /></Field></Grid>
                <Btn disabled={busy || !iv.scheduledAt} onClick={() => run(async () => { await api.post(`/admin/pwm/applications/${a.id}/interviews`, { scheduledAt: new Date(iv.scheduledAt).toISOString(), mode: iv.mode, location: iv.location, panelUserIds: iv.panel ? [iv.panel] : [] }); setIv({ scheduledAt: '', mode: 'IN_PERSON', location: '', panel: '' }); onChanged(); })}>Schedule interview</Btn>
              </div>
            )}
          </Card>
        </div>
        {canManage && a.stage === 'OFFER' && (
          <div style={{ marginTop: 10 }}><Card title="Hire">
            <Notice kind="info">Creates the employee record (Pending onboarding) and starts the onboarding checklist from the start date.</Notice>
            <Grid><Field label="Start date"><Input type="date" value={hire.hireDate} onChange={(e) => setHire({ ...hire, hireDate: e.target.value })} /></Field><Field label="Job title"><Input value={hire.jobTitle} onChange={(e) => setHire({ ...hire, jobTitle: e.target.value })} /></Field></Grid>
            <Btn kind="primary" disabled={busy} onClick={() => run(async () => { await api.post(`/admin/pwm/applications/${a.id}/hire`, { ...hire, departmentId: vac.departmentId }); onChanged(); onClose(); })}>Hire</Btn>
          </Card></div>
        )}
      </div>
    </Modal>
  );
}

export { fmtDate };
