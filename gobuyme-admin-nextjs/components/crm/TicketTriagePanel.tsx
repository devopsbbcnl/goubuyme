'use client';
import { useState } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { SectionLabel, fmtNaira } from '@/components/crm/shared';
import { CATEGORY_LABEL, PRIORITY_LABEL, TicketCategory, TicketPriority } from '@/components/crm/tickets';

export interface AiTriage {
  analyzedBy: 'llm' | 'failed';
  model?: string;
  at: string;
  summary?: string;
  facts?: string[];
  flags?: string[];
  suggestedReply?: string;
  suggestedCategory?: TicketCategory;
  suggestedPriority?: TicketPriority;
  credit?: { recommended: boolean; amount: number; reason: string };
  error?: string;
}

export interface TicketAgentSuggestion {
  id: string;
  action: 'TRIAGE_TICKET' | 'SEND_TICKET_REPLY' | 'ISSUE_TICKET_CREDIT' | string;
  title: string;
  reason: string;
  payload: { body?: string; amount?: number; reason?: string };
  expiresAt: string;
}

const FLAG_LABEL: Record<string, string> = {
  safety: 'Safety', fraud_risk: 'Fraud risk', abusive: 'Abusive', legal: 'Legal',
  repeat_complainant: 'Repeat complainant', needs_vendor: 'Needs vendor', needs_rider: 'Needs rider',
};

/** Ticket triager agent output for one ticket, with its pending reply / credit proposals. */
export function TicketTriagePanel({ ticketId, triage, suggestions, open, isOps, onUseDraft, onChanged }: {
  ticketId: string;
  triage: AiTriage | null;
  suggestions: TicketAgentSuggestion[];
  open: boolean;
  isOps: boolean;
  onUseDraft: (text: string) => void;
  onChanged: () => Promise<void>;
}) {
  const { theme: T } = useTheme();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const replyS = suggestions.find(s => s.action === 'SEND_TICKET_REPLY');
  const creditS = suggestions.find(s => s.action === 'ISSUE_TICKET_CREDIT');

  const call = async (key: string, path: string) => {
    setBusy(key);
    setError('');
    try {
      const res = await api.post<{ message: string; data?: { status?: string; error?: string | null } }>(path, {});
      if (res.data?.status === 'FAILED' || res.data?.status === 'EXPIRED') setError(res.message);
      await onChanged();
      window.dispatchEvent(new Event('gbm:pending-counts-updated'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed.');
    } finally {
      setBusy(null);
    }
  };

  const small = (primary: boolean, danger = false): React.CSSProperties => ({
    padding: '6px 10px', borderRadius: 4, fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: busy ? 'not-allowed' : 'pointer',
    border: primary ? 'none' : `1px solid ${T.border}`, background: primary ? (danger ? T.error : T.primary) : T.surface2,
    color: primary ? '#fff' : T.text, opacity: busy ? 0.6 : 1,
  });

  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <SectionLabel>🤖 Agent triage</SectionLabel>
        {open && (
          <button
            disabled={!!busy}
            onClick={() => call('rerun', `/admin/crm/tickets/${ticketId}/triage`)}
            title="Ask the ticket triager to look at this ticket again"
            style={{ background: 'none', border: 'none', color: T.primary, fontSize: 11, fontWeight: 700, fontFamily: 'inherit', cursor: busy ? 'not-allowed' : 'pointer', padding: 0 }}
          >{busy === 'rerun' ? 'Re-running…' : triage ? 'Re-run' : 'Run now'}</button>
        )}
      </div>

      {!triage ? (
        <div style={{ fontSize: 12, color: T.textSec }}>
          {open ? 'The ticket triager will look at this within a minute.' : 'Not triaged.'}
        </div>
      ) : triage.analyzedBy === 'failed' ? (
        <div style={{ fontSize: 12, color: T.error }}>Triage failed: {triage.error ?? 'unknown error'}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {triage.summary && <div style={{ fontSize: 13, color: T.text, fontWeight: 600, lineHeight: 1.5 }}>{triage.summary}</div>}

          {(triage.flags?.length ?? 0) > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {triage.flags!.map(f => (
                <span key={f} style={{ fontSize: 11, fontWeight: 700, color: T.error, background: T.errorBg, borderRadius: 999, padding: '2px 8px' }}>
                  {FLAG_LABEL[f] ?? f}
                </span>
              ))}
            </div>
          )}

          {(triage.facts?.length ?? 0) > 0 && (
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: T.textSec, lineHeight: 1.5 }}>
              {triage.facts!.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
          )}

          {triage.suggestedCategory && triage.suggestedPriority && (
            <div style={{ fontSize: 11, color: T.textMuted }}>
              Suggested: {CATEGORY_LABEL[triage.suggestedCategory]} · {PRIORITY_LABEL[triage.suggestedPriority]} priority
            </div>
          )}

          {triage.suggestedReply && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.textSec, marginBottom: 4 }}>Draft reply</div>
              <div style={{ fontSize: 12, color: T.text, background: T.surface2, borderRadius: 4, padding: '8px 10px', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                {triage.suggestedReply}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                {replyS && (
                  <button disabled={!!busy} onClick={() => call('reply', `/admin/agents/suggestions/${replyS.id}/approve`)} style={small(true)}>
                    {busy === 'reply' ? 'Sending…' : 'Send as is'}
                  </button>
                )}
                <button disabled={!!busy} onClick={() => onUseDraft(triage.suggestedReply!)} style={small(false)}>Edit in reply box</button>
              </div>
            </div>
          )}

          {creditS && (
            <div style={{ border: `1px solid ${T.border}`, borderRadius: 4, padding: 10 }}>
              <div style={{ fontSize: 12, color: T.text, fontWeight: 700 }}>Suggested credit: {fmtNaira(creditS.payload.amount ?? 0)}</div>
              <div style={{ fontSize: 12, color: T.textSec, marginTop: 2 }}>{creditS.payload.reason}</div>
              {isOps ? (
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <button disabled={!!busy} onClick={() => call('credit', `/admin/agents/suggestions/${creditS.id}/approve`)} style={small(true)}>
                    {busy === 'credit' ? 'Issuing…' : 'Approve credit'}
                  </button>
                  <button disabled={!!busy} onClick={() => call('dismiss', `/admin/agents/suggestions/${creditS.id}/reject`)} style={small(false)}>Dismiss</button>
                </div>
              ) : (
                <div style={{ fontSize: 11, color: T.textMuted, marginTop: 6 }}>An operations admin can approve this.</div>
              )}
            </div>
          )}
        </div>
      )}

      {error && <div style={{ fontSize: 12, color: T.error, marginTop: 8 }}>{error}</div>}
    </div>
  );
}
