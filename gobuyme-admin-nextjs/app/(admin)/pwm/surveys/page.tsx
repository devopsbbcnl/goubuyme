'use client';
import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { Btn, Card, Empty, Field, Input, Notice, PageHeader, Pill, Select, Stat, Table, Td, TextArea, fmtDate, label, useAction, useLoad, usePwm } from '@/components/pwm/ui';

interface S { id: string; title: string; status: string; anonymous: boolean; responses: number; opensAt: string | null; closesAt: string | null }
interface Res {
  title: string; responses: number; audience: number; participationPct: number | null; hidden: boolean; message?: string; minGroup: number;
  questions?: { id: string; text: string; type: string; answered: number; average?: number | null; distribution?: number[]; counts?: { option: string; count: number }[]; comments?: string[] }[];
  byDepartment?: { name: string; responses: number; questions: { id: string; text: string; type: string; average?: number | null }[] }[];
}
interface Q { type: string; text: string; options: string }

export default function SurveysPage() {
  const { me } = usePwm();
  const { data, loading, error, reload } = useLoad(() => api.get<{ data: S[] }>('/admin/pwm/surveys').then((r) => r.data), []);
  const [adding, setAdding] = useState(false);
  const [results, setResults] = useState<string | null>(null);
  const { busy, error: actionError, run } = useAction();
  return (
    <div>
      <PageHeader title="Surveys" sub="Engagement and satisfaction surveys. Anonymous answers cannot be traced to a person, and results appear only once enough people have answered." actions={<Btn kind="primary" onClick={() => setAdding(true)}>+ Survey</Btn>} />
      {(error || actionError) && <Notice kind="error">{error || actionError}</Notice>}
      {loading && !data ? <Empty>Loading…</Empty> : !data?.length ? <Empty>No surveys yet.</Empty> : (
        <Table head={['Survey', 'Type', 'Status', 'Responses', '']}>
          {data.map((s) => <tr key={s.id}><Td><b>{s.title}</b>{s.closesAt && <div style={{ fontSize: 11, opacity: 0.7 }}>closes {fmtDate(s.closesAt)}</div>}</Td><Td>{s.anonymous ? 'Anonymous' : 'Named'}</Td><Td><Pill tone={s.status === 'OPEN' ? 'good' : s.status === 'DRAFT' ? 'warn' : 'neutral'}>{label(s.status)}</Pill></Td><Td>{s.responses}</Td>
            <Td><div style={{ display: 'flex', gap: 6 }}>{s.status === 'DRAFT' && <Btn small kind="primary" disabled={busy} onClick={() => { const c = window.prompt('Closing date (YYYY-MM-DD), or leave blank'); run(async () => { await api.post(`/admin/pwm/surveys/${s.id}/open`, { closesAt: c ? new Date(`${c}T23:59:00+01:00`).toISOString() : undefined }); reload(); }); }}>Open</Btn>}{s.status === 'OPEN' && <Btn small disabled={busy} onClick={() => run(async () => { await api.post(`/admin/pwm/surveys/${s.id}/close`, {}); reload(); })}>Close</Btn>}{me?.can.viewSurveyResults && s.status !== 'DRAFT' && <Btn small onClick={() => setResults(s.id)}>Results</Btn>}</div></Td></tr>)}
        </Table>
      )}
      {adding && <Builder onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />}
      {results && <Results id={results} onClose={() => setResults(null)} />}
    </div>
  );
}

function Builder({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ title: '', description: '', anonymous: true });
  const [qs, setQs] = useState<Q[]>([{ type: 'RATING', text: '', options: '' }]);
  const { busy, error, run } = useAction();
  const setQ = (i: number, p: Partial<Q>) => setQs(qs.map((q, j) => (j === i ? { ...q, ...p } : q)));
  return (
    <Modal open onClose={onClose} title="New survey" width={680}><div style={{ padding: 20, maxHeight: '78vh', overflowY: 'auto' }}>{error && <Notice kind="error">{error}</Notice>}
      <Field label="Title"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
      <Field label="Introduction"><TextArea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      <label style={{ display: 'flex', gap: 8, fontSize: 13, marginBottom: 12 }}><input type="checkbox" checked={f.anonymous} onChange={(e) => setF({ ...f, anonymous: e.target.checked })} />Anonymous (answers are stored without the person&apos;s name)</label>
      {qs.map((q, i) => <div key={i} style={{ border: '1px solid rgba(128,128,128,.3)', borderRadius: 4, padding: 10, marginBottom: 8 }}><div style={{ display: 'flex', gap: 8 }}><Select value={q.type} onChange={(e) => setQ(i, { type: e.target.value })} style={{ maxWidth: 140 }}><option value="RATING">Rating 1-5</option><option value="CHOICE">Choice</option><option value="TEXT">Comment</option></Select><Input placeholder={`Question ${i + 1}`} value={q.text} onChange={(e) => setQ(i, { text: e.target.value })} />{qs.length > 1 && <Btn small onClick={() => setQs(qs.filter((_, j) => j !== i))}>✕</Btn>}</div>{q.type === 'CHOICE' && <div style={{ marginTop: 6 }}><Input placeholder="Choices, separated by commas" value={q.options} onChange={(e) => setQ(i, { options: e.target.value })} /></div>}</div>)}
      <Btn small onClick={() => setQs([...qs, { type: 'RATING', text: '', options: '' }])}>+ Question</Btn>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy || !f.title || qs.some((q) => !q.text.trim())} onClick={() => run(async () => { await api.post('/admin/pwm/surveys', { ...f, questions: qs.map((q) => ({ type: q.type, text: q.text, options: q.type === 'CHOICE' ? q.options.split(',').map((x) => x.trim()).filter(Boolean) : undefined })) }); onSaved(); })}>Save draft</Btn></div>
    </div></Modal>
  );
}

function Results({ id, onClose }: { id: string; onClose: () => void }) {
  const { theme: T } = useTheme();
  const { data, error } = useLoad(() => api.get<{ data: Res }>(`/admin/pwm/surveys/${id}/results`).then((r) => r.data), [id]);
  return (
    <Modal open onClose={onClose} title={data?.title ?? 'Results'} width={760}><div style={{ padding: 20, maxHeight: '78vh', overflowY: 'auto' }}>
      {error && <Notice kind="error">{error}</Notice>}{!data ? <Empty>Loading…</Empty> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 12 }}><Stat label="Responses" value={data.responses} /><Stat label="Invited" value={data.audience} /><Stat label="Participation" value={data.participationPct === null ? 'n/a' : `${data.participationPct}%`} /></div>
          {data.hidden ? <Notice kind="info">{data.message}</Notice> : (
            <>
              {data.questions?.map((q) => (
                <div key={q.id} style={{ marginBottom: 12 }}><Card title={q.text}>
                  {q.type === 'RATING' && <div style={{ fontSize: 13, color: T.text }}>Average <b>{q.average}</b> from {q.answered} answers · {q.distribution?.map((n, i) => `${i + 1}★ ${n}`).join(' · ')}</div>}
                  {q.type === 'CHOICE' && q.counts?.map((c) => <div key={c.option} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '2px 0', color: T.text }}><span>{c.option}</span><b>{c.count}</b></div>)}
                  {q.type === 'TEXT' && (q.comments?.length ? q.comments.map((c, i) => <div key={i} style={{ fontSize: 13, padding: '4px 0', borderBottom: `1px solid ${T.border}`, color: T.text }}>“{c}”</div>) : <div style={{ fontSize: 12, color: T.textMuted }}>No comments.</div>)}
                </Card></div>
              ))}
              {data.byDepartment && data.byDepartment.length > 0 && <Card title={`By department (groups of ${data.minGroup}+ only)`}>{data.byDepartment.map((d) => <div key={d.name} style={{ fontSize: 13, padding: '4px 0', color: T.text }}><b>{d.name}</b> ({d.responses}): {d.questions.filter((q) => q.type === 'RATING').map((q) => `${q.text.slice(0, 36)}… ${q.average}`).join('; ')}</div>)}</Card>}
            </>
          )}
        </>
      )}
    </div></Modal>
  );
}
