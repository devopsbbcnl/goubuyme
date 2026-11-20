'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import {
  Btn, Card, ContractStatusPill, DECISION_LABEL, Empty, Field, Grid, Input, Notice, PageHeader, Select, SlaPill, STEP_LABEL, TextArea, fmtDate, fmtDateTime, label, useAction, useLoad,
} from '@/components/pwm/ui';

interface Detail {
  id: string; step: string; sla: string; due: string | null; recommendation: string | null; recommendationNote: string | null; recommendedByName: string | null; decision: string | null; decisionNote: string | null;
  decidedByName: string | null; closedReason: string | null; successorContractId: string | null; canRecommend: boolean; canDecide: boolean; canPrepare: boolean;
  contract: { id: string; reference: string; contractType: string; status: string; commencementDate: string; expiryDate: string | null };
  employee: { id: string; employeeNo: string; firstName: string; lastName: string; jobTitle: string; status: string; department: { name: string } | null };
  history: { id: string; reference: string; contractType: string; status: string; commencementDate: string; expiryDate: string | null }[];
  recentStatus: { toStatus: string; reason: string; effectiveDate: string }[];
  events: { id: string; action: string; note: string | null; actorName: string | null; createdAt: string }[];
  latestReview: { cycle: string; rating: number | null; summary: string | null; strengths: string | null; improvements: string | null; at: string } | null;
}

export default function RenewalPage() {
  const { id } = useParams<{ id: string }>();
  const { theme: T } = useTheme();
  const { data: r, loading, error, reload } = useLoad(() => api.get<{ data: Detail }>(`/admin/pwm/renewals/${id}`).then((x) => x.data), [id]);
  const { busy, error: actionError, run } = useAction();
  const [rec, setRec] = useState({ recommendation: 'RENEW_SAME_TERMS', note: '' });
  const [dec, setDec] = useState({ outcome: 'APPROVE', decision: 'RENEW_SAME_TERMS', note: '', newExpiryDate: '' });
  const [prep, setPrep] = useState({ contractType: '', commencementDate: '', expiryDate: '' });
  const [msg, setMsg] = useState('');
  if (loading && !r) return <Empty>Loading…</Empty>;
  if (error || !r) return <Notice kind="error">{error || 'Renewal not found.'}</Notice>;
  const call = (path: string, body: Record<string, unknown>) => run(async () => { const x = await api.post<{ message: string }>(`/admin/pwm/renewals/${r.id}/${path}`, body); setMsg(x.message); reload(); });
  const effDecision = dec.outcome === 'MODIFY' ? dec.decision : r.recommendation;
  const steps = ['RECOMMENDATION', 'DECISION', 'PREPARATION', 'ISSUANCE', 'SIGNATURE'];
  const idx = steps.indexOf(r.step);
  return (
    <div>
      <PageHeader title={`Renewal: ${r.employee.firstName} ${r.employee.lastName}`} sub={`${r.employee.employeeNo} · ${r.employee.jobTitle} · ${r.employee.department?.name ?? 'No department'}`} actions={<>{['COMPLETED', 'CLOSED'].includes(r.step) ? <ContractStatusPill status="ARCHIVED" /> : <SlaPill sla={r.sla} />}</>} />
      {(actionError) && <Notice kind="error">{actionError}</Notice>}{msg && <Notice kind="success">{msg}</Notice>}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {steps.map((s, i) => <span key={s} style={{ padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, background: i < idx || r.step === 'COMPLETED' ? T.successBg : i === idx ? T.primaryTint : T.surface2, color: i < idx || r.step === 'COMPLETED' ? T.success : i === idx ? T.primary : T.textMuted }}>{i + 1}. {STEP_LABEL[s]}</span>)}
        {r.step === 'CLOSED' && <span style={{ padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, background: T.surface2, color: T.textSec }}>Closed: {r.closedReason}</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 12 }}>
        <Card title="Contract">
          <div style={{ fontSize: 13, color: T.text, lineHeight: 1.9 }}>
            <Link href={`/pwm/contracts/${r.contract.id}`} style={{ color: T.primary, fontWeight: 700 }}>{r.contract.reference}</Link> · {label(r.contract.contractType)} <ContractStatusPill status={r.contract.status} /><br />
            {fmtDate(r.contract.commencementDate)} to {r.contract.expiryDate ? fmtDate(r.contract.expiryDate) : 'open-ended'}{r.due && <><br />Current step due {fmtDate(r.due)}</>}
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: T.textSec }}>History: {r.history.map((h) => `${h.reference} (${label(h.status)})`).join(' → ')}</div>
        </Card>
        <Card title="Evidence for the decision">
          {r.recentStatus.length === 0 ? <div style={{ fontSize: 12, color: T.textMuted }}>No status changes recorded.</div> : r.recentStatus.map((s, i) => <div key={i} style={{ fontSize: 12, color: T.textSec, padding: '3px 0' }}>{fmtDate(s.effectiveDate)}: {label(s.toStatus)} ({s.reason})</div>)}
          {r.latestReview ? (
            <div style={{ marginTop: 10, fontSize: 13, color: T.text }}><b>Latest review ({r.latestReview.cycle}):</b> {r.latestReview.rating ? `${'★'.repeat(r.latestReview.rating)}${'☆'.repeat(5 - r.latestReview.rating)}` : 'no rating'}<div style={{ color: T.textSec }}>{r.latestReview.summary}</div>{r.latestReview.strengths && <div style={{ fontSize: 12 }}>Strengths: {r.latestReview.strengths}</div>}{r.latestReview.improvements && <div style={{ fontSize: 12 }}>To improve: {r.latestReview.improvements}</div>}</div>
          ) : <div style={{ fontSize: 12, color: T.textMuted, marginTop: 8 }}>No completed performance review on file for this person.</div>}
        </Card>
      </div>

      {r.recommendation && <div style={{ marginTop: 12 }}><Card title="Department head recommendation"><b>{DECISION_LABEL[r.recommendation]}</b> by {r.recommendedByName}<div style={{ fontSize: 13, color: T.textSec, marginTop: 4 }}>{r.recommendationNote}</div></Card></div>}
      {r.decision && <div style={{ marginTop: 12 }}><Card title="Management decision"><b>{DECISION_LABEL[r.decision]}</b> by {r.decidedByName}{r.decisionNote && <div style={{ fontSize: 13, color: T.textSec, marginTop: 4 }}>{r.decisionNote}</div>}</Card></div>}

      {r.canRecommend && (
        <div style={{ marginTop: 12 }}><Card title="Your recommendation">
          <Grid><Field label="Recommendation"><Select value={rec.recommendation} onChange={(e) => setRec({ ...rec, recommendation: e.target.value })}>{Object.entries(DECISION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field></Grid>
          <Field label="Justification (required)"><TextArea rows={3} value={rec.note} onChange={(e) => setRec({ ...rec, note: e.target.value })} /></Field>
          <Btn kind="primary" disabled={busy || !rec.note.trim()} onClick={() => call('recommend', rec)}>Submit recommendation</Btn>
        </Card></div>
      )}
      {r.canDecide && (
        <div style={{ marginTop: 12 }}><Card title="Management decision">
          <Grid>
            <Field label="Outcome"><Select value={dec.outcome} onChange={(e) => setDec({ ...dec, outcome: e.target.value })}><option value="APPROVE">Approve the recommendation</option><option value="MODIFY">Approve with a different decision</option><option value="REJECT">Send back to the department head</option></Select></Field>
            {dec.outcome === 'MODIFY' && <Field label="Decision"><Select value={dec.decision} onChange={(e) => setDec({ ...dec, decision: e.target.value })}>{Object.entries(DECISION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>}
            {dec.outcome !== 'REJECT' && effDecision === 'EXTEND' && <Field label="New expiry date"><Input type="date" value={dec.newExpiryDate} onChange={(e) => setDec({ ...dec, newExpiryDate: e.target.value })} /></Field>}
          </Grid>
          {dec.outcome !== 'REJECT' && effDecision === 'DO_NOT_RENEW' && <Notice kind="warn">This starts offboarding with the final working day set to the expiry date. The employee is not marked terminated until HR records the exit.</Notice>}
          <Field label={dec.outcome === 'APPROVE' ? 'Comment (optional)' : 'Reason (required)'}><TextArea rows={3} value={dec.note} onChange={(e) => setDec({ ...dec, note: e.target.value })} /></Field>
          <Btn kind="primary" disabled={busy || (dec.outcome !== 'APPROVE' && !dec.note.trim())} onClick={() => call('decide', { ...dec, newExpiryDate: dec.newExpiryDate || undefined })}>Record decision</Btn>
        </Card></div>
      )}
      {r.canPrepare && (
        <div style={{ marginTop: 12 }}><Card title="Prepare the new contract">
          <Notice kind="info">Leave fields blank to follow on from the current contract: it starts the day after expiry and keeps the same length.</Notice>
          <Grid cols={3}><Field label="Type"><Input placeholder="Same as current" value={prep.contractType} onChange={(e) => setPrep({ ...prep, contractType: e.target.value.toUpperCase() })} /></Field>
            <Field label="Start date"><Input type="date" value={prep.commencementDate} onChange={(e) => setPrep({ ...prep, commencementDate: e.target.value })} /></Field>
            <Field label="Expiry date"><Input type="date" value={prep.expiryDate} onChange={(e) => setPrep({ ...prep, expiryDate: e.target.value })} /></Field></Grid>
          <Btn kind="primary" disabled={busy} onClick={() => call('prepare', Object.fromEntries(Object.entries(prep).filter(([, v]) => v)))}>Prepare contract</Btn>
        </Card></div>
      )}
      {r.successorContractId && !['COMPLETED', 'CLOSED'].includes(r.step) && <Notice kind="info"><Link href={`/pwm/contracts/${r.successorContractId}`}>Open the new contract</Link> to issue it for signature and record the signed copy.</Notice>}

      <div style={{ marginTop: 14 }}><Card title="History">{r.events.map((e) => <div key={e.id} style={{ fontSize: 12, color: T.textSec, padding: '3px 0' }}>{fmtDateTime(e.createdAt)} · <b style={{ color: T.text }}>{label(e.action)}</b> by {e.actorName ?? 'System'}{e.note ? `: ${e.note}` : ''}</div>)}</Card></div>
    </div>
  );
}
