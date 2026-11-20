'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Btn, Card, Empty, Field, Grid, Input, Notice, PageHeader, Pill, Select, Table, Td, fmtDate, label, todayYmd, uploadDocument, useAction, useLoad } from '@/components/pwm/ui';

interface Data {
  categories: { key: string; label: string; limit: number }[]; perDiemRate: number;
  claims: { id: string; reference: string; title: string; status: string; total: number; decisionNote: string | null; paymentRef: string | null; items: { id: string; category: string; amount: number; description: string }[] }[];
  travel: { id: string; purpose: string; destination: string; startDate: string; endDate: string; estimatedCost: number; advance: number; perDiem: number; status: string }[];
}
interface Item { category: string; amount: string; date: string; description: string; exception: string; file: File | null }
const naira = (n: number) => `₦${n.toLocaleString('en-NG')}`;
const blank = (): Item => ({ category: 'TRANSPORT', amount: '', date: todayYmd(), description: '', exception: '', file: null });

export default function MyExpenses() {
  const { data, loading, error, reload } = useLoad(() => api.get<{ data: Data }>('/my-hr/expenses').then((r) => r.data), []);
  const [title, setTitle] = useState('');
  const [trip, setTrip] = useState('');
  const [items, setItems] = useState<Item[]>([blank()]);
  const [tr, setTr] = useState({ purpose: '', destination: '', start: todayYmd(), end: todayYmd(), estimatedCost: '', advance: '' });
  const [msg, setMsg] = useState('');
  const { busy, error: actionError, run } = useAction();
  if (loading && !data) return <Empty>Loading…</Empty>;
  const set = (i: number, p: Partial<Item>) => setItems(items.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const cat = (k: string) => data?.categories.find((c) => c.key === k);
  const submit = () => run(async () => {
    const out = [];
    for (const it of items) { const up = it.file ? await uploadDocument(it.file) : null; out.push({ category: it.category, amount: Number(it.amount), date: it.date, description: it.description, exception: it.exception || null, receiptUrl: up?.url ?? null }); }
    const r = await api.post<{ message: string }>('/my-hr/expenses', { title, travelRequestId: trip || undefined, items: out });
    setMsg(r.message); setTitle(''); setTrip(''); setItems([blank()]); reload();
  });
  const days = Math.max(1, Math.round((new Date(tr.end).getTime() - new Date(tr.start).getTime()) / 86_400_000) + 1);
  const tone = (s: string) => (s === 'PAID' || s === 'APPROVED' || s === 'COMPLETED' ? 'good' : s === 'SUBMITTED' || s === 'PENDING' ? 'warn' : 'bad') as 'good' | 'warn' | 'bad';
  return (
    <div>
      <PageHeader title="Expenses and travel" sub="Ask to travel, then claim what you spent. Your supervisor approves; Finance pays." />
      {(error || actionError) && <Notice kind="error">{error || actionError}</Notice>}{msg && <Notice kind="success">{msg}</Notice>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 12 }}>
        <Card title="Request travel">
          <Grid><Field label="Destination"><Input value={tr.destination} onChange={(e) => setTr({ ...tr, destination: e.target.value })} /></Field><Field label="Purpose"><Input value={tr.purpose} onChange={(e) => setTr({ ...tr, purpose: e.target.value })} /></Field><Field label="Leave"><Input type="date" min={todayYmd()} value={tr.start} onChange={(e) => setTr({ ...tr, start: e.target.value, end: e.target.value > tr.end ? e.target.value : tr.end })} /></Field><Field label="Return"><Input type="date" min={tr.start} value={tr.end} onChange={(e) => setTr({ ...tr, end: e.target.value })} /></Field><Field label="Estimated cost (₦)"><Input type="number" value={tr.estimatedCost} onChange={(e) => setTr({ ...tr, estimatedCost: e.target.value })} /></Field><Field label="Advance wanted (₦)"><Input type="number" value={tr.advance} onChange={(e) => setTr({ ...tr, advance: e.target.value })} /></Field></Grid>
          <div style={{ fontSize: 12, marginBottom: 8 }}>Per diem: {days} day{days === 1 ? '' : 's'} × {naira(data?.perDiemRate ?? 0)} = <b>{naira(days * (data?.perDiemRate ?? 0))}</b></div>
          <Btn kind="primary" disabled={busy || !tr.destination || !tr.purpose} onClick={() => run(async () => { const r = await api.post<{ message: string }>('/my-hr/travel', { ...tr, estimatedCost: Number(tr.estimatedCost) || 0, advance: Number(tr.advance) || 0 }); setMsg(r.message); setTr({ purpose: '', destination: '', start: todayYmd(), end: todayYmd(), estimatedCost: '', advance: '' }); reload(); })}>Send request</Btn>
          {data?.travel.map((t) => <div key={t.id} style={{ fontSize: 13, padding: '6px 0', borderTop: '1px solid rgba(128,128,128,.2)', marginTop: 8 }}><b>{t.destination}</b> {fmtDate(t.startDate)} to {fmtDate(t.endDate)} <Pill tone={tone(t.status)}>{label(t.status)}</Pill></div>)}
        </Card>
        <Card title="New expense claim">
          <Field label="What is it for?"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="Linked trip (optional)"><Select value={trip} onChange={(e) => setTrip(e.target.value)}><option value="">None</option>{data?.travel.filter((t) => ['APPROVED', 'COMPLETED'].includes(t.status)).map((t) => <option key={t.id} value={t.id}>{t.destination} ({fmtDate(t.startDate)})</option>)}</Select></Field>
          {items.map((it, i) => {
            const c = cat(it.category); const over = !!c && c.limit > 0 && Number(it.amount) > c.limit;
            return (
              <div key={i} style={{ border: '1px solid rgba(128,128,128,.3)', borderRadius: 4, padding: 8, marginBottom: 8 }}>
                <Grid cols={3}><Field label="Category"><Select value={it.category} onChange={(e) => set(i, { category: e.target.value })}>{data?.categories.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</Select></Field><Field label="Amount (₦)"><Input type="number" value={it.amount} onChange={(e) => set(i, { amount: e.target.value })} /></Field><Field label="Date"><Input type="date" max={todayYmd()} value={it.date} onChange={(e) => set(i, { date: e.target.value })} /></Field></Grid>
                <Field label="Description"><Input value={it.description} onChange={(e) => set(i, { description: e.target.value })} /></Field>
                {over && <Field label={`Above the ${c?.label} limit of ${naira(c?.limit ?? 0)}: why?`}><Input value={it.exception} onChange={(e) => set(i, { exception: e.target.value })} /></Field>}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}><input type="file" accept=".pdf,image/*" onChange={(e) => set(i, { file: e.target.files?.[0] ?? null })} />{Number(it.amount) >= 5000 && !it.file && <span style={{ color: '#d97706' }}>Receipt needed from ₦5,000</span>}{items.length > 1 && <Btn small onClick={() => setItems(items.filter((_, j) => j !== i))}>Remove</Btn>}</div>
              </div>
            );
          })}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Btn small onClick={() => setItems([...items, blank()])}>+ Item</Btn><span style={{ fontSize: 13 }}>Total <b>{naira(items.reduce((s, x) => s + (Number(x.amount) || 0), 0))}</b></span><Btn kind="primary" disabled={busy || !title || items.some((x) => !x.amount || !x.description)} onClick={submit}>{busy ? 'Sending…' : 'Submit claim'}</Btn></div>
        </Card>
      </div>
      <div style={{ marginTop: 14 }}><Card title="My claims">{!data?.claims.length ? <Empty>No claims yet.</Empty> : <Table head={['Claim', 'Total', 'Status']}>{data.claims.map((c) => <tr key={c.id}><Td><b>{c.reference}</b><div style={{ fontSize: 11, opacity: 0.7 }}>{c.title}</div></Td><Td>{naira(c.total)}</Td><Td><Pill tone={tone(c.status)}>{label(c.status)}</Pill>{c.decisionNote && <div style={{ fontSize: 11 }}>{c.decisionNote}</div>}{c.paymentRef && <div style={{ fontSize: 11 }}>Paid: {c.paymentRef}</div>}</Td></tr>)}</Table>}</Card></div>
    </div>
  );
}
