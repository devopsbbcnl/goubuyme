'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { Btn, Card, Empty, Field, Grid, Input, Notice, PageHeader, Pill, Select, TextArea, fmtDate, fmtDateTime, useAction, useLoad } from '@/components/pwm/ui';

interface D {
  id: string; status: string; cycle: string; period: string; dueDate: string; employee: string; isEmployee: boolean; isReviewer: boolean;
  selfRating: number | null; selfComment: string | null; managerRating?: number | null; managerComment?: string | null; strengths?: string | null; improvements?: string | null; summary?: string | null;
  discussedAt: string | null; ackedAt: string | null; ackComment: string | null; objectives: { id: string; title: string; target: string | null; progress: number; status: string; weight: number }[];
  canSelf: boolean; canManager: boolean; canDiscuss: boolean; canAck: boolean;
}
const Stars = ({ n }: { n: number | null | undefined }) => <b>{n ? `${'★'.repeat(n)}${'☆'.repeat(5 - n)}` : '—'}</b>;

export default function ReviewPage() {
  const { id } = useParams<{ id: string }>();
  const { theme: T } = useTheme();
  const { data: d, loading, error, reload } = useLoad(() => api.get<{ data: D }>(`/my-hr/reviews/${id}`).then((r) => r.data), [id]);
  const [self, setSelf] = useState({ rating: '3', comment: '' });
  const [mgr, setMgr] = useState({ rating: '3', comment: '', strengths: '', improvements: '', summary: '' });
  const [ack, setAck] = useState('');
  const [msg, setMsg] = useState('');
  const { busy, error: actionError, run } = useAction();
  if (loading && !d) return <Empty>Loading…</Empty>;
  if (error || !d) return <Notice kind="error">{error || 'Review not found.'}</Notice>;
  const post = (path: string, body: Record<string, unknown>) => run(async () => { const r = await api.post<{ message: string }>(`/my-hr/reviews/${d.id}/${path}`, body); setMsg(r.message); reload(); window.dispatchEvent(new Event('gbm:pending-counts-updated')); });
  const rating = (v: string, set: (x: string) => void) => <Select value={v} onChange={(e) => set(e.target.value)}>{['1 - Needs significant improvement', '2 - Below expectations', '3 - Meets expectations', '4 - Exceeds expectations', '5 - Outstanding'].map((l, i) => <option key={l} value={i + 1}>{l}</option>)}</Select>;
  return (
    <div>
      <PageHeader title={`${d.cycle}: ${d.employee}`} sub={`${d.period} · due ${fmtDate(d.dueDate)}`} actions={<Pill tone={d.status === 'ACKNOWLEDGED' ? 'good' : 'info'}>{d.status === 'ACKNOWLEDGED' ? 'Closed' : d.status === 'SELF' ? 'Self-assessment' : d.status === 'MANAGER' ? 'Manager assessment' : 'Discussion'}</Pill>} />
      {(actionError) && <Notice kind="error">{actionError}</Notice>}{msg && <Notice kind="success">{msg}</Notice>}
      {d.objectives.length > 0 && <div style={{ marginBottom: 12 }}><Card title="Objectives">{d.objectives.map((o) => <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13, color: T.text, borderBottom: `1px solid ${T.border}` }}><span>{o.title}{o.target ? ` (target ${o.target})` : ''}</span><span>{o.weight}% weight · {o.progress}% done · {o.status.toLowerCase()}</span></div>)}</Card></div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12 }}>
        <Card title="Self-assessment">
          {d.canSelf ? (
            <>
              <Field label="How do you rate your performance?">{rating(self.rating, (v) => setSelf({ ...self, rating: v }))}</Field>
              <Field label="What went well and what was hard?"><TextArea rows={5} value={self.comment} onChange={(e) => setSelf({ ...self, comment: e.target.value })} /></Field>
              <Btn kind="primary" disabled={busy || !self.comment.trim()} onClick={() => post('self', { rating: Number(self.rating), comment: self.comment })}>Send to my manager</Btn>
            </>
          ) : d.selfComment ? <div style={{ fontSize: 13, color: T.text }}><Stars n={d.selfRating} /><div style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{d.selfComment}</div></div> : <Empty>Not completed yet.</Empty>}
        </Card>
        <Card title="Manager assessment">
          {d.canManager ? (
            <>
              <Field label="Overall rating">{rating(mgr.rating, (v) => setMgr({ ...mgr, rating: v }))}</Field>
              <Field label="Assessment"><TextArea rows={3} value={mgr.comment} onChange={(e) => setMgr({ ...mgr, comment: e.target.value })} /></Field>
              <Grid><Field label="Achievements and strengths"><TextArea rows={2} value={mgr.strengths} onChange={(e) => setMgr({ ...mgr, strengths: e.target.value })} /></Field><Field label="Areas to improve"><TextArea rows={2} value={mgr.improvements} onChange={(e) => setMgr({ ...mgr, improvements: e.target.value })} /></Field></Grid>
              <Field label="Summary (shown to management in renewal decisions)"><Input value={mgr.summary} onChange={(e) => setMgr({ ...mgr, summary: e.target.value })} /></Field>
              <Btn kind="primary" disabled={busy || !mgr.comment.trim() || !mgr.summary.trim()} onClick={() => post('manager', { ...mgr, rating: Number(mgr.rating) })}>Save assessment</Btn>
            </>
          ) : d.managerComment ? (
            <div style={{ fontSize: 13, color: T.text }}><Stars n={d.managerRating} /><div style={{ whiteSpace: 'pre-wrap', margin: '6px 0' }}>{d.managerComment}</div>{d.strengths && <div><b>Strengths:</b> {d.strengths}</div>}{d.improvements && <div><b>To improve:</b> {d.improvements}</div>}{d.summary && <div style={{ marginTop: 6 }}><b>Summary:</b> {d.summary}</div>}</div>
          ) : <Empty>Your manager has not finished yet.</Empty>}
        </Card>
      </div>
      {d.canDiscuss && <div style={{ marginTop: 12 }}><Card title="Discussion"><div style={{ fontSize: 13, marginBottom: 8 }}>Talk the review through with {d.employee}, then mark it as held so they can acknowledge it.</div><Btn kind="primary" disabled={busy} onClick={() => post('discussed', {})}>We have discussed it</Btn></Card></div>}
      {d.canAck && <div style={{ marginTop: 12 }}><Card title="Acknowledge"><Field label="Your comment (optional)"><TextArea rows={3} value={ack} onChange={(e) => setAck(e.target.value)} /></Field><div style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>Acknowledging means you have read and discussed it. The review is then closed. Only HR can reopen it, with a reason.</div><Btn kind="primary" disabled={busy} onClick={() => post('acknowledge', { comment: ack })}>Acknowledge</Btn></Card></div>}
      {d.status === 'ACKNOWLEDGED' && <div style={{ marginTop: 12 }}><Notice kind="success">Acknowledged on {fmtDateTime(d.ackedAt)}.{d.ackComment ? ` Comment: ${d.ackComment}` : ''}</Notice></div>}
    </div>
  );
}
