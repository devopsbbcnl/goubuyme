'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Btn, Card, Empty, Field, Grid, Input, Notice, PageHeader, Pill, Select, TextArea, fmtDate, fmtDateTime, label, useAction, useLoad } from '@/components/pwm/ui';

interface C { id: string; reference: string; type: string; category: string; stage: string; summary: string | null; responseDue: string | null; hearingAt: string | null; outcome: string | null; outcomeNote: string | null; appealDue: string | null; canRespond: boolean; canAppeal: boolean; events: { id: string; kind: string; text: string; createdAt: string }[] }

export default function MyCases() {
  const { data, loading, error, reload } = useLoad(() => api.get<{ data: C[] }>('/my-hr/cases').then((r) => r.data), []);
  const [text, setText] = useState<Record<string, string>>({});
  const [g, setG] = useState({ category: '', severity: 'MEDIUM', description: '' });
  const [msg, setMsg] = useState('');
  const { busy, error: actionError, run } = useAction();
  return (
    <div>
      <PageHeader title="My cases and concerns" sub="Raise a concern with HR, and respond to or appeal anything that concerns you. Only the people handling a case can see it." />
      {(error || actionError) && <Notice kind="error">{error || actionError}</Notice>}{msg && <Notice kind="success">{msg}</Notice>}
      {loading && !data ? <Empty>Loading…</Empty> : data?.map((c) => (
        <div key={c.id} style={{ marginBottom: 12 }}><Card title={`${c.reference}: ${label(c.type)} (${label(c.stage)})`}>
          {c.summary && <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', marginBottom: 8 }}>{c.summary}</div>}
          <div style={{ fontSize: 12, lineHeight: 1.8 }}>{c.responseDue && <div>Please respond by <b>{fmtDate(c.responseDue)}</b></div>}{c.hearingAt && <div>Hearing: <b>{fmtDateTime(c.hearingAt)}</b>. You may bring a colleague or representative.</div>}{c.outcome && <div>Outcome: <Pill tone="brand">{label(c.outcome)}</Pill> {c.outcomeNote}</div>}{c.appealDue && <div>You may appeal until {fmtDate(c.appealDue)}.</div>}</div>
          {c.events.map((e) => <div key={e.id} style={{ fontSize: 13, padding: '6px 0', borderTop: '1px solid rgba(128,128,128,.2)', marginTop: 6 }}><Pill>{label(e.kind)}</Pill> <span style={{ whiteSpace: 'pre-wrap' }}>{e.text}</span><div style={{ fontSize: 11, opacity: 0.7 }}>{fmtDateTime(e.createdAt)}</div></div>)}
          {(c.canRespond || c.canAppeal) && <div style={{ marginTop: 8 }}><Field label={c.canAppeal ? 'Your appeal' : 'Your response'}><TextArea rows={4} value={text[c.id] ?? ''} onChange={(e) => setText({ ...text, [c.id]: e.target.value })} /></Field><Btn kind="primary" disabled={busy || !(text[c.id] ?? '').trim()} onClick={() => run(async () => { const r = await api.post<{ message: string }>(`/my-hr/cases/${c.id}/${c.canAppeal ? 'appeal' : 'respond'}`, { text: text[c.id] }); setMsg(r.message); setText({ ...text, [c.id]: '' }); reload(); })}>{c.canAppeal ? 'Send appeal' : 'Send response'}</Btn></div>}
        </Card></div>
      ))}
      {data && data.length === 0 && <Empty>No cases.</Empty>}
      <Card title="Raise a concern">
        <Notice kind="info">This goes to HR administrators only. It is handled confidentially and you will see its progress here.</Notice>
        <Grid><Field label="What is it about?"><Input value={g.category} onChange={(e) => setG({ ...g, category: e.target.value })} placeholder="e.g. Workplace conduct, pay, safety" /></Field><Field label="How serious is it?"><Select value={g.severity} onChange={(e) => setG({ ...g, severity: e.target.value })}><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option></Select></Field></Grid>
        <Field label="What happened?"><TextArea rows={5} value={g.description} onChange={(e) => setG({ ...g, description: e.target.value })} /></Field>
        <Btn kind="primary" disabled={busy || !g.category || !g.description.trim()} onClick={() => run(async () => { const r = await api.post<{ message: string }>('/my-hr/grievance', g); setMsg(r.message); setG({ category: '', severity: 'MEDIUM', description: '' }); reload(); })}>Send to HR</Btn>
      </Card>
    </div>
  );
}
