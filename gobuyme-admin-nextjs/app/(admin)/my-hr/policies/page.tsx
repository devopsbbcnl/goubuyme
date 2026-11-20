'use client';
import { useState } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { Btn, Card, Empty, Notice, PageHeader, Pill, fmtDate, useAction, useLoad } from '@/components/pwm/ui';

interface P { id: string; title: string; category: string | null; version: number; body: string | null; fileUrl: string | null; requiresAck: boolean; effectiveDate: string | null; acknowledgedAt: string | null }

export default function MyPolicies() {
  const { theme: T } = useTheme();
  const { data, loading, error, reload } = useLoad(() => api.get<{ data: P[] }>('/my-hr/policies').then((r) => r.data), []);
  const [open, setOpen] = useState<string | null>(null);
  const { busy, error: actionError, run } = useAction();
  const ack = (id: string) => run(async () => { await api.post(`/my-hr/policies/${id}/ack`, {}); reload(); window.dispatchEvent(new Event('gbm:pending-counts-updated')); });
  return (
    <div>
      <PageHeader title="Policies" sub="Read each policy, then confirm you have read and understood it. The version, time and your device are recorded." />
      {(error || actionError) && <Notice kind="error">{error || actionError}</Notice>}
      {loading && !data ? <Empty>Loading…</Empty> : !data?.length ? <Empty>No policies are published yet.</Empty> : data.map((p) => (
        <div key={p.id} style={{ marginBottom: 10 }}>
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <div><b style={{ color: T.text }}>{p.title}</b> <span style={{ fontSize: 12, color: T.textSec }}>v{p.version}{p.category ? ` · ${p.category}` : ''}{p.effectiveDate ? ` · effective ${fmtDate(p.effectiveDate)}` : ''}</span></div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {p.requiresAck && (p.acknowledgedAt ? <Pill tone="good">Acknowledged {fmtDate(p.acknowledgedAt)}</Pill> : <Pill tone="warn">Needs acknowledgement</Pill>)}
                <Btn small onClick={() => setOpen(open === p.id ? null : p.id)}>{open === p.id ? 'Hide' : 'Read'}</Btn>
              </div>
            </div>
            {open === p.id && (
              <div style={{ marginTop: 12 }}>
                {p.body && <div style={{ fontSize: 13, color: T.text, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{p.body}</div>}
                {p.fileUrl && <div style={{ marginTop: 8 }}><a href={p.fileUrl} target="_blank" rel="noreferrer" style={{ color: T.primary, fontWeight: 700 }}>Open the PDF</a></div>}
                {p.requiresAck && !p.acknowledgedAt && <div style={{ marginTop: 12 }}><Btn kind="primary" disabled={busy} onClick={() => ack(p.id)}>I have read and understood this policy</Btn></div>}
              </div>
            )}
          </Card>
        </div>
      ))}
    </div>
  );
}
