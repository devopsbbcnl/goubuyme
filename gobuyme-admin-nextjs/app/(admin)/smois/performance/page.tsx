'use client';
import { useState } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import {
  Btn, Card, Empty, Field, Input, Notice, PageHeader, Pill, Select, StatusPill, Table, Td, TextArea,
  fmtDate, fmtDateTime, num, pretty, useAction, useLoad, useSmois,
} from '@/components/smois/ui';

const PERIODS = [['week', 'This week'], ['lastWeek', 'Last week'], ['month', 'This month'], ['lastMonth', 'Last month'], ['quarter', 'This quarter'], ['lastQuarter', 'Last quarter'], ['year', 'This year'], ['lastYear', 'Last year']];

interface Row { memberId: string; name: string; role: string; isActive: boolean; jobTitle: string | null; overall: number | null; scoredWeight: number; tasks: { assigned: number; completed: number; overdue: number }; content: { created: number; published: number }; reports: { due: number; submitted: number } }
interface Detail {
  member: { id: string; name: string; email: string; role: string; isActive: boolean; jobTitle: string | null; responsibilities: string | null };
  period: { label: string; from: string; to: string };
  scorecard: { categories: { key: string; label: string; weight: number; score: number | null; detail: string }[]; overall: number | null; scoredWeight: number };
  stats: { tasks: { assigned: number; eligible: number; completed: number; onTime: number; overdue: number; open: number }; content: { created: number; submitted: number; approved: number; rejected: number; revisionRequests: number; published: number }; reviews: { reviewed: number; approved: number }; reports: { due: number; submitted: number } };
  targets: { id: string; name: string; targetValue: number; unit: string; progress: { actual: number | null; percent: number | null; status: string } }[];
  evaluations: { id: string; periodStart: string; periodEnd: string; feedback: string; rating: number | null; reviewerName: string | null; createdAt: string }[];
}

export default function PerformancePage() {
  const { me } = useSmois();
  const [period, setPeriod] = useState('month');
  const [open, setOpen] = useState<string | null>(null);
  const all = !!me?.can.viewPerformance;
  const team = useLoad(() => (all ? api.get<{ data: { members: Row[] } }>(`/admin/smois/performance?period=${period}`).then((r) => r.data.members) : Promise.resolve(null)), [period, all]);
  const mine = !all && !!me?.memberId;

  return (
    <div>
      <PageHeader
        title={all ? 'Staff performance' : 'My performance'}
        sub="Measured from recorded work: tasks, content, reviews and reports. Categories with nothing to measure are left unscored rather than counted as zero, and shared account growth is never credited to one person."
        actions={<div style={{ width: 170 }}><Select value={period} onChange={(e) => setPeriod(e.target.value)}>{PERIODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></div>}
      />
      {all && (
        <>
          {team.error && <Notice kind="error">{team.error}</Notice>}
          {team.loading && !team.data ? <Empty>Loading…</Empty> : team.data && team.data.length === 0 ? <Empty>No active managers yet.</Empty> : team.data && (
            <Table head={['Person', 'Score', 'Tasks done', 'Overdue', 'Content created', 'Published', 'Weekly reports']}>
              {team.data.map((r) => (
                <tr key={r.memberId} onClick={() => setOpen(r.memberId)} style={{ cursor: 'pointer', opacity: r.isActive ? 1 : 0.55 }}>
                  <Td><b>{r.name}</b><div style={{ fontSize: 11, opacity: 0.7 }}>{pretty(r.role)}{r.jobTitle ? ` · ${r.jobTitle}` : ''}{!r.isActive && ' · access revoked'}</div></Td>
                  <Td>{r.overall === null ? <Pill>Not measurable</Pill> : <><b>{r.overall}</b><span style={{ fontSize: 11, opacity: 0.6 }}> / 100 · {r.scoredWeight}% of model</span></>}</Td>
                  <Td>{r.tasks.completed}/{r.tasks.assigned}</Td><Td>{r.tasks.overdue > 0 ? <Pill tone="bad">{r.tasks.overdue}</Pill> : 0}</Td>
                  <Td>{r.content.created}</Td><Td>{r.content.published}</Td><Td>{r.reports.submitted}/{r.reports.due}</Td>
                </tr>
              ))}
            </Table>
          )}
        </>
      )}
      {mine && <PersonView memberId={me!.memberId!} period={period} self />}
      {!all && !mine && <Empty>Super admins don&apos;t have a personal scorecard. Use Staff performance as a team member or management.</Empty>}
      {open && <Modal open onClose={() => setOpen(null)} title="Performance detail" width={820}><div style={{ padding: 20 }}><PersonView memberId={open} period={period} /></div></Modal>}
    </div>
  );
}

function PersonView({ memberId, period, self }: { memberId: string; period: string; self?: boolean }) {
  const { theme: T } = useTheme();
  const { me } = useSmois();
  const { data, loading, error, reload } = useLoad(() => api.get<{ data: Detail }>(`/admin/smois/performance/${self ? 'me' : memberId}?period=${period}`).then((r) => r.data), [memberId, period]);
  const [writing, setWriting] = useState(false);
  if (loading && !data) return <Empty>Loading…</Empty>;
  if (error) return <Notice kind="error">{error}</Notice>;
  if (!data) return null;
  const s = data.stats;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        <div><div style={{ fontSize: 17, fontWeight: 800, color: T.text }}>{data.member.name}</div><div style={{ fontSize: 12, color: T.textSec }}>{pretty(data.member.role)}{data.member.jobTitle ? ` · ${data.member.jobTitle}` : ''} · {data.period.label}</div></div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: T.text }}>{data.scorecard.overall === null ? '—' : data.scorecard.overall}</div>
          <div style={{ fontSize: 11, color: T.textSec }}>{data.scorecard.overall === null ? 'Nothing measurable yet' : `covers ${data.scorecard.scoredWeight}% of the scorecard`}</div>
        </div>
      </div>
      <Card title="Scorecard" style={{ marginBottom: 14 }}>
        {data.scorecard.categories.map((c) => (
          <div key={c.key} style={{ padding: '8px 0', borderTop: `1px solid ${T.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span style={{ color: T.text, fontWeight: 600 }}>{c.label} <span style={{ color: T.textMuted, fontWeight: 400 }}>({c.weight}%)</span></span><b style={{ color: c.score === null ? T.textMuted : T.text }}>{c.score === null ? 'Not scored' : c.score}</b></div>
            {c.score !== null && <div style={{ height: 5, background: T.surface3, borderRadius: 3, margin: '5px 0' }}><div style={{ width: `${c.score}%`, height: '100%', background: c.score >= 75 ? T.success : c.score >= 50 ? T.warning : T.error, borderRadius: 3 }} /></div>}
            <div style={{ fontSize: 11, color: T.textSec }}>{c.detail}</div>
          </div>
        ))}
      </Card>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
        {([['Tasks assigned', s.tasks.assigned], ['Completed', s.tasks.completed], ['On time', s.tasks.onTime], ['Overdue now', s.tasks.overdue], ['Content created', s.content.created], ['Submitted', s.content.submitted], ['Approved', s.content.approved], ['Rejected', s.content.rejected], ['Changes requested', s.content.revisionRequests], ['Published', s.content.published], ['Reports', `${s.reports.submitted}/${s.reports.due}`]] as [string, number | string][]).map(([l, v]) => (
          <div key={l} style={{ background: T.surface2, borderRadius: 4, padding: '8px 10px' }}><div style={{ fontSize: 10, fontWeight: 700, color: T.textSec, textTransform: 'uppercase' }}>{l}</div><div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>{v}</div></div>
        ))}
      </div>
      <Card title="Assigned targets" style={{ marginBottom: 14 }}>
        {data.targets.length === 0 ? <Empty>No targets assigned in this period.</Empty> : data.targets.map((t) => (
          <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '7px 0', borderTop: `1px solid ${T.border}`, fontSize: 13 }}>
            <span style={{ color: T.text }}>{t.name}</span><span>{num(t.progress.actual)} / {t.targetValue} {t.unit} <StatusPill status={t.progress.status} /></span>
          </div>
        ))}
      </Card>
      {me?.can.viewPerformance && (
        <Card title="Management evaluations (confidential)" right={<Btn small kind="primary" onClick={() => setWriting(true)}>+ Add evaluation</Btn>}>
          {data.evaluations.length === 0 ? <Empty>No evaluations yet.</Empty> : data.evaluations.map((e) => (
            <div key={e.id} style={{ padding: '9px 0', borderTop: `1px solid ${T.border}`, fontSize: 12 }}>
              <b style={{ color: T.text }}>{fmtDate(e.periodStart)} – {fmtDate(e.periodEnd)}</b>{e.rating !== null && <Pill tone="brand">{e.rating}/5</Pill>} <span style={{ color: T.textMuted }}>by {e.reviewerName} · {fmtDateTime(e.createdAt)}</span>
              <div style={{ color: T.textSec, marginTop: 3, whiteSpace: 'pre-wrap' }}>{e.feedback}</div>
            </div>
          ))}
          <div style={{ fontSize: 11, color: T.textMuted, marginTop: 8 }}>Evaluations are added, never edited or deleted, and are not shown to the person.</div>
        </Card>
      )}
      {writing && <EvaluationForm memberId={data.member.id} from={data.period.from} to={data.period.to} onClose={() => setWriting(false)} onSaved={() => { setWriting(false); reload(); }} />}
    </div>
  );
}

function EvaluationForm({ memberId, from, to, onClose, onSaved }: { memberId: string; from: string; to: string; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ periodStart: from.slice(0, 10), periodEnd: to.slice(0, 10), feedback: '', rating: '' });
  const { busy, error, run } = useAction();
  return (
    <Modal open onClose={onClose} title="Add evaluation" width={520}>
      <div style={{ padding: 20 }}>
        {error && <Notice kind="error">{error}</Notice>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <Field label="From"><Input type="date" value={f.periodStart} onChange={(e) => setF({ ...f, periodStart: e.target.value })} /></Field>
          <Field label="To"><Input type="date" value={f.periodEnd} onChange={(e) => setF({ ...f, periodEnd: e.target.value })} /></Field>
          <Field label="Rating"><Select value={f.rating} onChange={(e) => setF({ ...f, rating: e.target.value })}><option value="">No rating</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</Select></Field>
        </div>
        <Field label="Feedback"><TextArea rows={5} value={f.feedback} onChange={(e) => setF({ ...f, feedback: e.target.value })} /></Field>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy || !f.feedback.trim()} onClick={() => run(async () => { await api.post('/admin/smois/evaluations', { memberId, ...f, periodStart: new Date(f.periodStart).toISOString(), periodEnd: new Date(`${f.periodEnd}T23:59:59`).toISOString(), rating: f.rating || null }); onSaved(); })}>{busy ? 'Saving…' : 'Save'}</Btn></div>
      </div>
    </Modal>
  );
}
