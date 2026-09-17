'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useIsMobile } from '@/hooks/useIsMobile';
import { Badge } from '@/components/ui/Badge';
import { api } from '@/lib/api';
import { Card, SectionLabel, fmtDateTime, fmtNaira } from '@/components/crm/shared';
import { LinkedTasks } from '@/components/crm/tasks';
import {
  Lead, LeadFormModal, LeadStage, LostReasonModal, SOURCE_LABEL, STAGES, STAGE_HINT, STAGE_LABEL, humanize, useStageColor,
} from '@/components/crm/leads';

type ActivityType = 'NOTE' | 'CALL' | 'VISIT' | 'EMAIL' | 'WHATSAPP' | 'STAGE_CHANGE' | 'CONVERTED';

interface LeadDetail extends Omit<Lead, 'openTasks'> {
  convertedUser: null | {
    id: string; name: string; email: string; role: string; createdAt: string;
    vendor: { businessName: string; approvalStatus: string } | null;
    rider: { approvalStatus: string } | null;
  };
  activities: Array<{ id: string; type: ActivityType; body: string; createdAt: string; author: { id: string; name: string } | null }>;
}

const ACTIVITY_ICON: Record<ActivityType, string> = {
  NOTE: '📝', CALL: '📞', VISIT: '🚶', EMAIL: '✉️', WHATSAPP: '💬', STAGE_CHANGE: '➡️', CONVERTED: '🎉',
};
const LOGGABLE: Array<{ type: ActivityType; label: string }> = [
  { type: 'CALL', label: 'Call' }, { type: 'VISIT', label: 'Visit' }, { type: 'WHATSAPP', label: 'WhatsApp' },
  { type: 'EMAIL', label: 'Email' }, { type: 'NOTE', label: 'Note' },
];

interface ProfileHit { id: string; displayName: string; email: string; phone: string | null }

export default function LeadPage() {
  const { leadId } = useParams<{ leadId: string }>();
  const router = useRouter();
  const { theme: T } = useTheme();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const stageColor = useStageColor();
  const canEdit = user?.role === 'SUPER_ADMIN' || user?.role === 'OPERATIONS_ADMIN';
  const isSuper = user?.role === 'SUPER_ADMIN';

  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [pendingLost, setPendingLost] = useState(false);
  const [activityType, setActivityType] = useState<ActivityType>('CALL');
  const [activityBody, setActivityBody] = useState('');
  const [logging, setLogging] = useState(false);

  const load = useCallback(() =>
    api.get<{ data: LeadDetail }>(`/admin/crm/leads/${leadId}`).then(res => { setLead(res.data); setError(''); }).catch(err => setError(err.message)),
  [leadId]);
  useEffect(() => { load(); }, [load]);

  const setStage = async (stage: LeadStage, lostReason?: string) => {
    if (!lead || stage === lead.stage) return;
    if (stage === 'LOST' && !lostReason) { setPendingLost(true); return; }
    setError('');
    try { await api.patch(`/admin/crm/leads/${lead.id}`, { stage, lostReason }); await load(); } catch (err) { setError((err as Error).message); }
  };

  const logActivity = async () => {
    if (!activityBody.trim()) return;
    setLogging(true);
    setError('');
    try {
      await api.post(`/admin/crm/leads/${leadId}/activities`, { type: activityType, body: activityBody });
      setActivityBody('');
      await load();
    } catch (err) { setError((err as Error).message); } finally { setLogging(false); }
  };

  const remove = async () => {
    try { await api.del(`/admin/crm/leads/${leadId}`); router.replace('/crm/pipeline'); } catch (err) { setError((err as Error).message); }
  };

  if (!lead) {
    return error
      ? <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}><Link href="/crm/pipeline" style={{ color: T.primary, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>← Pipeline</Link><div style={{ color: T.error, fontSize: 13 }}>{error}</div></div>
      : <div style={{ fontSize: 13, color: T.textSec }}>Loading lead…</div>;
  }

  const isVendor = lead.type === 'VENDOR';
  const account = lead.convertedUser;
  const accountStatus = account?.vendor?.approvalStatus ?? account?.rider?.approvalStatus ?? null;
  const field: React.CSSProperties = {
    background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4, padding: '9px 11px', color: T.text, fontSize: 13, fontFamily: 'inherit', outline: 'none',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Link href="/crm/pipeline" style={{ color: T.primary, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>← Pipeline</Link>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 20, fontWeight: 800, color: T.text }}>{lead.name}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: stageColor(lead.stage), background: T.surface2, borderRadius: 4, padding: '3px 9px' }}>
                {isVendor ? 'Vendor' : 'Rider'} · {STAGE_LABEL[lead.stage]}
              </span>
            </div>
            <div style={{ fontSize: 13, color: T.textSec, marginTop: 4 }}>
              {[lead.contactName, lead.phone, lead.email].filter(Boolean).join(' · ') || 'No contact details yet'}
            </div>
            <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>
              {[lead.area, lead.city].filter(Boolean).join(', ') || 'Location unknown'} · {SOURCE_LABEL[lead.source]} · added {fmtDateTime(lead.createdAt)}
              {lead.owner ? ` · owner ${lead.owner.name}` : ' · no owner'}
            </div>
            {lead.stage === 'LOST' && lead.lostReason && <div style={{ fontSize: 13, color: T.error, marginTop: 6 }}>Lost: {lead.lostReason}</div>}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {lead.phone && <a href={`tel:${lead.phone}`} style={{ ...field, textDecoration: 'none', fontWeight: 700 }}>Call</a>}
            {lead.phone && <a href={`https://wa.me/${lead.phone.replace(/\D/g, '').replace(/^0/, '234')}`} target="_blank" rel="noreferrer" style={{ ...field, textDecoration: 'none', fontWeight: 700 }}>WhatsApp</a>}
            {canEdit && <button onClick={() => setEditing(true)} style={{ ...field, fontWeight: 700, cursor: 'pointer' }}>Edit</button>}
            {isSuper && <button onClick={remove} style={{ ...field, fontWeight: 700, cursor: 'pointer', color: T.error, borderColor: T.error, background: 'transparent' }}>Delete</button>}
          </div>
        </div>

        {/* Stage stepper */}
        <div style={{ display: 'flex', gap: 4, marginTop: 16, flexWrap: 'wrap' }}>
          {STAGES.map(s => {
            const active = s === lead.stage;
            return (
              <button key={s} disabled={!canEdit} onClick={() => setStage(s)} title={STAGE_HINT[s]} style={{
                flex: isMobile ? '1 1 30%' : 1, padding: '8px 6px', borderRadius: 4, fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
                cursor: canEdit ? 'pointer' : 'default',
                border: `1px solid ${active ? stageColor(s) : T.border}`,
                background: active ? stageColor(s) : T.surface2, color: active ? '#fff' : T.textSec,
              }}>{STAGE_LABEL[s]}</button>
            );
          })}
        </div>
        {error && <div style={{ fontSize: 12, color: T.error, marginTop: 8 }}>{error}</div>}
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.4fr 1fr', gap: 16, alignItems: 'start' }}>
        <Card>
          <SectionLabel>Activity</SectionLabel>
          {canEdit && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
                {LOGGABLE.map(a => (
                  <button key={a.type} onClick={() => setActivityType(a.type)} style={{
                    padding: '5px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
                    border: `1px solid ${activityType === a.type ? T.primary : T.border}`,
                    background: activityType === a.type ? T.primaryTint : T.surface2, color: activityType === a.type ? T.primary : T.textSec,
                  }}>{ACTIVITY_ICON[a.type]} {a.label}</button>
                ))}
              </div>
              <textarea value={activityBody} onChange={e => setActivityBody(e.target.value)} rows={2} maxLength={2000}
                placeholder={activityType === 'CALL' ? 'Spoke to owner, wants pricing sent over WhatsApp' : 'What happened?'}
                style={{ ...field, width: '100%', boxSizing: 'border-box', resize: 'vertical' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, gap: 8 }}>
                <span style={{ fontSize: 11, color: T.textMuted }}>{lead.stage === 'NEW' && activityType !== 'NOTE' ? 'Logging this moves the lead to Contacted.' : ''}</span>
                <button onClick={logActivity} disabled={logging || !activityBody.trim()} style={{
                  padding: '7px 14px', borderRadius: 4, border: 'none', background: T.primary, color: '#fff', fontSize: 12, fontWeight: 700,
                  fontFamily: 'inherit', cursor: 'pointer', opacity: logging || !activityBody.trim() ? 0.6 : 1,
                }}>{logging ? 'Saving…' : 'Log'}</button>
              </div>
            </div>
          )}
          {lead.activities.map(a => (
            <div key={a.id} style={{ display: 'flex', gap: 10, padding: '10px 0', borderTop: `1px solid ${T.border}` }}>
              <span style={{ fontSize: 16 }} aria-hidden>{ACTIVITY_ICON[a.type]}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, color: T.text, whiteSpace: 'pre-wrap' }}>{a.body}</div>
                <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>{fmtDateTime(a.createdAt)}{a.author ? ` · ${a.author.name}` : ' · automatic'}</div>
              </div>
            </div>
          ))}
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card><LinkedTasks links={{ leadId: lead.id }} defaultTitle={`Follow up with ${lead.name}`} /></Card>

          <Card>
            <SectionLabel>GoBuyMe account</SectionLabel>
            {account ? (
              <div>
                <Link href={`/crm/profiles/${account.id}`} style={{ fontSize: 14, fontWeight: 800, color: T.text, textDecoration: 'none' }}>
                  {account.vendor?.businessName ?? account.name} ↗
                </Link>
                <div style={{ fontSize: 12, color: T.textSec, marginTop: 2 }}>{account.email} · joined {fmtDateTime(account.createdAt)}</div>
                {accountStatus && <div style={{ marginTop: 8 }}><Badge status={accountStatus as 'APPROVED'} /></div>}
              </div>
            ) : (
              <>
                <div style={{ fontSize: 12, color: T.textSec, marginBottom: 8 }}>
                  Not signed up yet. When they register with {lead.phone || lead.email ? 'this phone or email' : 'a matching phone or email'}, this lead links automatically.
                </div>
                {canEdit && <LinkAccount lead={lead} onLinked={load} />}
              </>
            )}
          </Card>

          <Card>
            <SectionLabel>Details</SectionLabel>
            {([
              ['Category', lead.category ? humanize(lead.category) : '—'],
              ...(isVendor ? [['Est. monthly sales', lead.estimatedMonthlyGmv != null ? fmtNaira(lead.estimatedMonthlyGmv) : '—']] : []),
              ['In this stage since', fmtDateTime(lead.stageChangedAt)],
            ] as Array<[string, string]>).map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, padding: '7px 0', borderBottom: `1px solid ${T.border}` }}>
                <span style={{ color: T.textSec }}>{k}</span><span style={{ color: T.text, fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </Card>
        </div>
      </div>

      {editing && <LeadFormModal lead={{ ...lead, openTasks: 0 }} defaultType={lead.type} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load(); }} />}
      {pendingLost && <LostReasonModal leadName={lead.name} onCancel={() => setPendingLost(false)} onConfirm={reason => { setPendingLost(false); setStage('LOST', reason); }} />}
    </div>
  );
}

function LinkAccount({ lead, onLinked }: { lead: LeadDetail; onLinked: () => void }) {
  const { theme: T } = useTheme();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<ProfileHit[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (query.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(() => {
      api.get<{ data: ProfileHit[] }>(`/admin/crm/profiles?role=${lead.type}&limit=5&search=${encodeURIComponent(query.trim())}`)
        .then(res => setHits(res.data)).catch(() => setHits([]));
    }, 300);
    return () => clearTimeout(t);
  }, [query, lead.type]);

  const link = async (userId: string) => {
    setError('');
    try { await api.post(`/admin/crm/leads/${lead.id}/link`, { userId }); onLinked(); } catch (err) { setError((err as Error).message); }
  };

  return (
    <div>
      <input value={query} onChange={e => setQuery(e.target.value)} placeholder={`Link an existing ${lead.type.toLowerCase()} account…`} style={{
        width: '100%', boxSizing: 'border-box', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4,
        padding: '9px 11px', color: T.text, fontSize: 13, fontFamily: 'inherit', outline: 'none',
      }} />
      {hits.map(h => (
        <button key={h.id} onClick={() => link(h.id)} style={{
          display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', background: T.surface, border: 'none',
          borderBottom: `1px solid ${T.border}`, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, color: T.text,
        }}><strong>{h.displayName}</strong> · {h.phone ?? h.email}</button>
      ))}
      {error && <div style={{ fontSize: 12, color: T.error, marginTop: 6 }}>{error}</div>}
    </div>
  );
}
