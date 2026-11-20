'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Btn, Card, Empty, Notice, PageHeader, Pill, Select, TextArea, fmtDate, useAction, useLoad } from '@/components/pwm/ui';

interface Q { id: string; type: 'RATING' | 'TEXT' | 'CHOICE'; text: string; options?: string[] }
interface S { id: string; title: string; description: string | null; anonymous: boolean; closesAt: string | null; answered: boolean; questions: Q[] }
type Ans = Record<string, { rating?: number; text?: string; choice?: string }>;

export default function MySurveys() {
  const { data, loading, error, reload } = useLoad(() => api.get<{ data: S[] }>('/my-hr/surveys').then((r) => r.data), []);
  const [ans, setAns] = useState<Record<string, Ans>>({});
  const [msg, setMsg] = useState('');
  const { busy, error: actionError, run } = useAction();
  const set = (sid: string, qid: string, v: Ans[string]) => setAns({ ...ans, [sid]: { ...(ans[sid] ?? {}), [qid]: { ...(ans[sid]?.[qid] ?? {}), ...v } } });
  return (
    <div>
      <PageHeader title="Surveys" sub="Your answers help the company improve. Anonymous surveys never store your name with your answers." />
      {(error || actionError) && <Notice kind="error">{error || actionError}</Notice>}{msg && <Notice kind="success">{msg}</Notice>}
      {loading && !data ? <Empty>Loading…</Empty> : !data?.length ? <Empty>No open surveys.</Empty> : data.map((s) => (
        <div key={s.id} style={{ marginBottom: 12 }}><Card title={s.title} right={<Pill tone={s.anonymous ? 'good' : 'neutral'}>{s.anonymous ? 'Anonymous' : 'Named'}</Pill>}>
          {s.description && <div style={{ fontSize: 13, marginBottom: 10 }}>{s.description}</div>}{s.closesAt && <div style={{ fontSize: 12, marginBottom: 8 }}>Closes {fmtDate(s.closesAt)}</div>}
          {s.answered ? <Notice kind="success">You have answered this survey. Thank you.</Notice> : (
            <>
              {s.questions.map((q) => (
                <div key={q.id} style={{ marginBottom: 12 }}><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{q.text}</div>
                  {q.type === 'RATING' && <div style={{ display: 'flex', gap: 6 }}>{[1, 2, 3, 4, 5].map((n) => <button key={n} onClick={() => set(s.id, q.id, { rating: n })} style={{ width: 38, height: 38, borderRadius: 4, border: '1px solid rgba(128,128,128,.4)', background: ans[s.id]?.[q.id]?.rating === n ? '#FF521B' : 'transparent', color: ans[s.id]?.[q.id]?.rating === n ? '#fff' : 'inherit', cursor: 'pointer', fontWeight: 700 }}>{n}</button>)}<span style={{ fontSize: 11, alignSelf: 'center', opacity: 0.7 }}>1 = strongly disagree, 5 = strongly agree</span></div>}
                  {q.type === 'CHOICE' && <Select value={ans[s.id]?.[q.id]?.choice ?? ''} onChange={(e) => set(s.id, q.id, { choice: e.target.value })}><option value="">Choose…</option>{q.options?.map((o) => <option key={o}>{o}</option>)}</Select>}
                  {q.type === 'TEXT' && <TextArea rows={3} value={ans[s.id]?.[q.id]?.text ?? ''} onChange={(e) => set(s.id, q.id, { text: e.target.value })} />}
                </div>
              ))}
              <Btn kind="primary" disabled={busy || !Object.keys(ans[s.id] ?? {}).length} onClick={() => run(async () => { const answers = Object.entries(ans[s.id] ?? {}).map(([qid, v]) => ({ qid, ...v })); const r = await api.post<{ message: string }>(`/my-hr/surveys/${s.id}/respond`, { answers }); setMsg(r.message); reload(); })}>Submit</Btn>
            </>
          )}
        </Card></div>
      ))}
    </div>
  );
}
