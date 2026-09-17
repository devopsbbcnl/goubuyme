'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useIsMobile } from '@/hooks/useIsMobile';
import { api } from '@/lib/api';
import { fmtNaira } from '@/components/crm/shared';
import {
  ImportLeadsModal, Lead, LeadFormModal, LeadStage, LeadType, LostReasonModal, SOURCE_LABEL, STAGES, STAGE_HINT, STAGE_LABEL,
  humanize, useStageColor,
} from '@/components/crm/leads';

interface Summary {
  periodDays: number; stages: Record<LeadStage, number>; createdInPeriod: number; liveInPeriod: number;
  conversionRate: number; avgDaysToLive: number | null; avgDaysInStage: Partial<Record<LeadStage, number | null>>;
  lostReasons: Array<{ reason: string; count: number }>;
  liveByOwner: Array<{ ownerId: string | null; name: string; count: number }>;
}

interface Agent { id: string; name: string }

const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

export default function PipelinePage() {
  const { theme: T } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const isMobile = useIsMobile();
  const stageColor = useStageColor();
  const canEdit = user?.role === 'SUPER_ADMIN' || user?.role === 'OPERATIONS_ADMIN';

  const [type, setType] = useState<LeadType>('VENDOR');
  const [ownerId, setOwnerId] = useState('');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropStage, setDropStage] = useState<LeadStage | null>(null);
  const [pendingLost, setPendingLost] = useState<Lead | null>(null);
  const [mobileStage, setMobileStage] = useState<LeadStage>('NEW');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(() => {
    const params = new URLSearchParams({ type });
    if (ownerId) params.set('ownerId', ownerId);
    if (debounced) params.set('search', debounced);
    return Promise.all([
      api.get<{ data: Lead[] }>(`/admin/crm/leads?${params}`).then(res => { setLeads(res.data); setError(''); }),
      api.get<{ data: Summary }>(`/admin/crm/leads/summary?type=${type}&days=90`).then(res => setSummary(res.data)),
    ]).catch(err => setError(err.message)).finally(() => setLoading(false));
  }, [type, ownerId, debounced]);

  useEffect(() => { setLoading(true); load(); }, [load]);
  useEffect(() => {
    api.get<{ data: Agent[] }>('/admin/crm/tickets/agents').then(res => setAgents(res.data)).catch(() => {});
  }, []);

  const moveLead = async (lead: Lead, stage: LeadStage, lostReason?: string) => {
    if (lead.stage === stage) return;
    if (stage === 'LOST' && !lostReason) { setPendingLost(lead); return; }
    const previous = leads;
    setLeads(ls => ls.map(l => (l.id === lead.id ? { ...l, stage, stageChangedAt: new Date().toISOString() } : l)));
    try {
      await api.patch(`/admin/crm/leads/${lead.id}`, { stage, lostReason });
      load();
    } catch (err) {
      setLeads(previous);
      setError((err as Error).message);
    }
  };

  const onDrop = (stage: LeadStage) => {
    const lead = leads.find(l => l.id === dragId);
    setDragId(null);
    setDropStage(null);
    if (lead && canEdit) moveLead(lead, stage);
  };

  const field: React.CSSProperties = {
    background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4, padding: '8px 10px', color: T.text, fontSize: 13, fontFamily: 'inherit', outline: 'none',
  };

  const Stat = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, padding: '12px 14px', minWidth: 150, flex: '1 1 150px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.textSec, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: T.text, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>{sub}</div>}
    </div>
  );

  const card = (lead: Lead) => {
    const age = daysSince(lead.stageChangedAt);
    const stale = (lead.stage === 'NEW' && age >= 3) || (lead.stage !== 'LIVE' && lead.stage !== 'LOST' && age >= 14);
    return (
      <div
        key={lead.id}
        draggable={canEdit && !isMobile}
        onDragStart={e => { setDragId(lead.id); e.dataTransfer.effectAllowed = 'move'; }}
        onDragEnd={() => { setDragId(null); setDropStage(null); }}
        onClick={() => router.push(`/crm/pipeline/${lead.id}`)}
        style={{
          background: T.surface, border: `1px solid ${stale ? T.warning : T.border}`, borderRadius: 4, padding: 10,
          cursor: 'pointer', opacity: dragId === lead.id ? 0.5 : 1,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{lead.name}</div>
        <div style={{ fontSize: 11, color: T.textSec, marginTop: 2 }}>
          {[lead.contactName, lead.area || lead.city, lead.category ? humanize(lead.category) : null].filter(Boolean).join(' · ') || SOURCE_LABEL[lead.source]}
        </div>
        {lead.stage === 'LOST' && lead.lostReason && <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>{lead.lostReason}</div>}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, marginTop: 8, fontSize: 11 }}>
          <span style={{ color: stale ? T.warning : T.textMuted, fontWeight: stale ? 700 : 400 }}>{age === 0 ? 'Today' : `${age}d in stage`}</span>
          <span style={{ color: T.textMuted }}>
            {lead.openTasks > 0 && <span style={{ color: T.primary, fontWeight: 700 }}>{lead.openTasks} task{lead.openTasks > 1 ? 's' : ''} · </span>}
            {lead.owner ? lead.owner.name.split(' ')[0] : 'No owner'}
          </span>
        </div>
      </div>
    );
  };

  const byStage = (stage: LeadStage) => leads.filter(l => l.stage === stage);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.text }}>Pipeline</div>
          <div style={{ fontSize: 13, color: T.textSec }}>Sign up new {type === 'VENDOR' ? 'vendors' : 'riders'}. Leads move to Onboarding when they sign up and Live when approved.</div>
        </div>
        {canEdit && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setImporting(true)} style={{ ...field, fontWeight: 700, cursor: 'pointer', padding: '9px 14px' }}>Import CSV</button>
            <button onClick={() => setAdding(true)} style={{ padding: '9px 16px', borderRadius: 4, border: 'none', background: T.primary, color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>Add lead</button>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {(['VENDOR', 'RIDER'] as LeadType[]).map(t => (
          <button key={t} onClick={() => setType(t)} style={{
            padding: '7px 14px', borderRadius: 4, fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
            border: type === t ? `1px solid ${T.primary}` : 'none', background: type === t ? T.primaryTint : T.surface2, color: type === t ? T.primary : T.textSec,
          }}>{t === 'VENDOR' ? 'Vendors' : 'Riders'}</button>
        ))}
        <select aria-label="Owner" value={ownerId} onChange={e => setOwnerId(e.target.value)} style={field}>
          <option value="">Everyone&apos;s leads</option>
          {user && <option value={user.id}>My leads</option>}
          <option value="unassigned">No owner</option>
          {agents.filter(a => a.id !== user?.id).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search all leads, including old ones…" style={{ ...field, flex: '1 1 200px', maxWidth: 280 }} />
      </div>

      {summary && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Stat label="New leads · 90d" value={summary.createdInPeriod.toLocaleString()} />
          <Stat label="Went live · 90d" value={summary.liveInPeriod.toLocaleString()} sub={`${summary.conversionRate}% conversion`} />
          <Stat label="Avg time to live" value={summary.avgDaysToLive !== null ? `${summary.avgDaysToLive} days` : '—'} />
          <Stat label="Open pipeline" value={(summary.stages.NEW + summary.stages.CONTACTED + summary.stages.INTERESTED + summary.stages.ONBOARDING).toLocaleString()}
            sub={type === 'VENDOR' ? `est. ${fmtNaira(leads.filter(l => !['LIVE', 'LOST'].includes(l.stage)).reduce((s, l) => s + (l.estimatedMonthlyGmv ?? 0), 0))}/mo sales` : undefined} />
          {summary.lostReasons[0] && <Stat label="Top lost reason" value={summary.lostReasons[0].reason} sub={`${summary.lostReasons[0].count} in 90 days`} />}
        </div>
      )}
      {error && <div style={{ fontSize: 13, color: T.error }}>{error}</div>}

      {isMobile ? (
        <>
          <select value={mobileStage} onChange={e => setMobileStage(e.target.value as LeadStage)} style={field}>
            {STAGES.map(s => <option key={s} value={s}>{STAGE_LABEL[s]} ({byStage(s).length})</option>)}
          </select>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {byStage(mobileStage).map(card)}
            {byStage(mobileStage).length === 0 && <div style={{ fontSize: 13, color: T.textSec }}>No leads in this stage.</div>}
          </div>
        </>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${STAGES.length}, minmax(190px, 1fr))`, gap: 10, overflowX: 'auto', alignItems: 'start' }}>
          {STAGES.map(stage => {
            const items = byStage(stage);
            const avg = summary?.avgDaysInStage[stage];
            return (
              <div
                key={stage}
                onDragOver={e => { if (dragId) { e.preventDefault(); setDropStage(stage); } }}
                onDragLeave={() => setDropStage(s => (s === stage ? null : s))}
                onDrop={() => onDrop(stage)}
                style={{
                  background: dropStage === stage ? T.primaryTint : T.surface2, borderRadius: 4, padding: 8, minHeight: 240,
                  border: `1px dashed ${dropStage === stage ? T.primary : 'transparent'}`,
                }}
              >
                <div style={{ padding: '4px 4px 8px' }} title={STAGE_HINT[stage]}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: T.text }}>
                      <span style={{ width: 8, height: 8, borderRadius: 9999, background: stageColor(stage) }} />{STAGE_LABEL[stage]}
                    </span>
                    <span style={{ fontSize: 12, color: T.textSec, fontWeight: 700 }}>{items.length}</span>
                  </div>
                  <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>
                    {stage === 'LIVE' || stage === 'LOST' ? 'Last 30 days' : avg != null ? `Avg ${avg}d here` : STAGE_HINT[stage]}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {loading && leads.length === 0 ? null : items.map(card)}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {!canEdit && <div style={{ fontSize: 12, color: T.textMuted }}>View only. Operations admins manage the pipeline.</div>}

      {adding && <LeadFormModal defaultType={type} onClose={() => setAdding(false)} onSaved={l => { setAdding(false); router.push(`/crm/pipeline/${l.id}`); }} />}
      {importing && <ImportLeadsModal type={type} onClose={() => setImporting(false)} onDone={load} />}
      {pendingLost && (
        <LostReasonModal leadName={pendingLost.name} onCancel={() => setPendingLost(null)}
          onConfirm={reason => { const lead = pendingLost; setPendingLost(null); moveLead(lead, 'LOST', reason); }} />
      )}
    </div>
  );
}
