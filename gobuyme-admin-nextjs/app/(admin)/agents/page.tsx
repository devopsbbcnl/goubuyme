'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

type Mode = 'OFF' | 'SUGGEST' | 'AUTO';
type Status = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXECUTED' | 'FAILED' | 'EXPIRED';
type Theme = Record<string, string>;

interface Agent {
  key: string;
  name: string;
  description: string;
  actions: Array<{ type: string; label: string; autoAllowed: boolean }>;
  settingsSpec: Record<string, { label: string; min: number; max: number }>;
  config: { mode: Mode; autoActions: string[]; settings: Record<string, number>; updatedAt: string | null };
  pending: number;
  last24h: Partial<Record<Status, number>>;
}

interface Suggestion {
  id: string;
  agentKey: string;
  agentName: string;
  action: string;
  actionLabel: string;
  title: string;
  reason: string;
  orderId: string | null;
  ticketId: string | null;
  status: Status;
  autoExecuted: boolean;
  decidedByName: string | null;
  error: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

type Tab = 'inbox' | 'history' | 'settings';

const MODE_HELP: Record<Mode, string> = {
  OFF: 'Not running.',
  SUGGEST: 'Proposes every action; a person approves each one.',
  AUTO: 'Runs the actions ticked below on its own; everything else still waits for approval.',
};

const STATUS_STYLE = (T: Theme): Record<Status, { label: string; color: string }> => ({
  PENDING: { label: 'Waiting', color: T.warning },
  APPROVED: { label: 'Approved', color: T.textSec },
  EXECUTED: { label: 'Done', color: T.success },
  REJECTED: { label: 'Rejected', color: T.textMuted },
  FAILED: { label: 'Failed', color: T.error },
  EXPIRED: { label: 'Expired', color: T.textMuted },
});

const ago = (iso: string) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} hr ago` : `${Math.floor(h / 24)}d ago`;
};

const expiresIn = (iso: string) => {
  const m = Math.ceil((new Date(iso).getTime() - Date.now()) / 60_000);
  if (m <= 0) return 'expiring';
  return m < 60 ? `expires in ${m} min` : `expires in ${Math.round(m / 60)} hr`;
};

export default function AgentsPage() {
  const { theme: T } = useTheme();
  const { user } = useAuth();
  const canDecide = user?.role === 'SUPER_ADMIN' || user?.role === 'OPERATIONS_ADMIN';
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const [tab, setTab] = useState<Tab>('inbox');
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [items, setItems] = useState<Suggestion[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const loadAgents = useCallback(async () => {
    const res = await api.get<{ data: Agent[] }>('/admin/agents');
    setAgents(res.data);
  }, []);

  const loadItems = useCallback(async (view: 'pending' | 'history') => {
    const res = await api.get<{ data: Suggestion[] }>(`/admin/agents/suggestions?view=${view}&limit=50`);
    setItems(res.data);
  }, []);

  const refresh = useCallback(async (which: Tab) => {
    try {
      await loadAgents();
      if (which !== 'settings') await loadItems(which === 'inbox' ? 'pending' : 'history');
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : 'Failed to load agents.', ok: false });
    }
    window.dispatchEvent(new Event('gbm:pending-counts-updated'));
  }, [loadAgents, loadItems]);

  useEffect(() => {
    void refresh(tab);
    if (tab !== 'inbox') return;
    const poll = setInterval(() => { void refresh('inbox'); }, 30_000);
    return () => clearInterval(poll);
  }, [tab, refresh]);

  const decide = async (s: Suggestion, approve: boolean) => {
    setBusyId(s.id);
    setMessage(null);
    try {
      const res = await api.post<{ message: string; data: { status: Status } }>(
        `/admin/agents/suggestions/${s.id}/${approve ? 'approve' : 'reject'}`, {},
      );
      setMessage({ text: `${s.title}: ${res.message}`, ok: res.data.status !== 'FAILED' });
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : 'Action failed.', ok: false });
    } finally {
      setBusyId(null);
      void refresh('inbox');
    }
  };

  const tabBtn = (t: Tab, label: string) => (
    <button key={t} onClick={() => { if (t !== tab) setItems(null); setTab(t); setMessage(null); }} style={{
      padding: '7px 14px', borderRadius: 4, fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
      border: tab === t ? `1px solid ${T.primary}` : 'none', background: tab === t ? T.primaryTint : T.surface2,
      color: tab === t ? T.primary : T.textSec,
    }}>{label}</button>
  );

  const pendingTotal = agents?.reduce((n, a) => n + a.pending, 0) ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: 20, fontWeight: 800, color: T.text }}>Agents</div>
        <div style={{ fontSize: 13, color: T.textSec, maxWidth: 700, lineHeight: 1.5 }}>
          Ops agents watch the platform and propose actions. Anything that moves money or changes an order waits here for a person
          unless a super admin allows it to run on its own. Every action is recorded in the order timeline and the audit log.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {tabBtn('inbox', `Needs decision${pendingTotal ? ` (${pendingTotal})` : ''}`)}
        {tabBtn('history', 'History')}
        {tabBtn('settings', 'Settings')}
      </div>

      {message && (
        <div style={{ fontSize: 13, borderRadius: 4, padding: '8px 12px', color: message.ok ? T.success : T.error, background: message.ok ? T.successBg : T.errorBg }}>
          {message.text}
        </div>
      )}

      {tab !== 'settings' && (
        <SuggestionList
          items={items}
          T={T}
          inbox={tab === 'inbox'}
          canDecide={canDecide}
          busyId={busyId}
          onDecide={decide}
        />
      )}

      {tab === 'settings' && (agents === null
        ? <div style={{ fontSize: 13, color: T.textSec }}>Loading…</div>
        : agents.map(a => (
          <AgentSettings
            key={`${a.key}:${a.config.updatedAt ?? ''}`}
            agent={a}
            T={T}
            editable={isSuperAdmin}
            onSaved={(text, ok) => { setMessage({ text, ok }); if (ok) void loadAgents(); }}
          />
        )))}
    </div>
  );
}

function SuggestionList({ items, T, inbox, canDecide, busyId, onDecide }: {
  items: Suggestion[] | null;
  T: Theme;
  inbox: boolean;
  canDecide: boolean;
  busyId: string | null;
  onDecide: (s: Suggestion, approve: boolean) => void;
}) {
  if (items === null) return <div style={{ fontSize: 13, color: T.textSec }}>Loading…</div>;
  if (items.length === 0) {
    return (
      <div style={{ fontSize: 13, color: T.textSec, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, padding: 20 }}>
        {inbox ? 'Nothing needs a decision right now.' : 'No agent activity yet.'}
      </div>
    );
  }
  const statusStyle = STATUS_STYLE(T);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map(s => (
        <div key={s.id} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, padding: 14, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 320px', minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>{s.title}</div>
            <div style={{ fontSize: 13, color: T.textSec, marginTop: 4, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{s.reason}</div>
            <div style={{ fontSize: 12, color: T.textMuted, marginTop: 6 }}>
              {s.agentName} · {ago(s.createdAt)}
              {inbox && ` · ${expiresIn(s.expiresAt)}`}
              {s.orderId && <> · <Link href={`/orders?openOrderId=${s.orderId}`} style={{ color: T.primary, textDecoration: 'none', fontWeight: 700 }}>Open order</Link></>}
              {s.ticketId && <> · <Link href={`/crm/inbox?ticket=${s.ticketId}`} style={{ color: T.primary, textDecoration: 'none', fontWeight: 700 }}>Open ticket</Link></>}
            </div>
            {!inbox && (
              <div style={{ fontSize: 12, marginTop: 6, color: statusStyle[s.status].color, fontWeight: 700 }}>
                {statusStyle[s.status].label}
                {s.autoExecuted ? ' automatically' : s.decidedByName ? ` by ${s.decidedByName}` : ''}
                {s.error && <span style={{ fontWeight: 400, color: T.textSec }}> — {s.error}</span>}
              </div>
            )}
          </div>
          {inbox && canDecide && (
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button onClick={() => onDecide(s, false)} disabled={busyId !== null} style={{
                padding: '8px 14px', borderRadius: 4, border: `1px solid ${T.border}`, background: 'none', color: T.text,
                fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: busyId ? 'not-allowed' : 'pointer', opacity: busyId ? 0.5 : 1,
              }}>Reject</button>
              <button onClick={() => onDecide(s, true)} disabled={busyId !== null} style={{
                padding: '8px 14px', borderRadius: 4, border: 'none', background: s.action === 'CANCEL_ORDER' ? T.error : T.primary,
                color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: busyId ? 'not-allowed' : 'pointer', opacity: busyId ? 0.5 : 1,
              }}>{busyId === s.id ? 'Working…' : s.action === 'FOLLOW_UP' ? 'Mark done' : s.action === 'SEND_TICKET_REPLY' ? 'Send reply' : 'Approve'}</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function AgentSettings({ agent, T, editable, onSaved }: {
  agent: Agent;
  T: Theme;
  editable: boolean;
  onSaved: (message: string, ok: boolean) => void;
}) {
  const [mode, setMode] = useState<Mode>(agent.config.mode);
  const [autoActions, setAutoActions] = useState<string[]>(agent.config.autoActions);
  const [settings, setSettings] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(agent.config.settings).map(([k, v]) => [k, String(v)])),
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/admin/agents/${agent.key}`, {
        mode,
        autoActions,
        settings: Object.fromEntries(Object.entries(settings).map(([k, v]) => [k, Number(v)])),
      });
      onSaved(`${agent.name} settings saved.`, true);
    } catch (e) {
      onSaved(e instanceof Error ? e.message : 'Failed to save.', false);
    } finally {
      setSaving(false);
    }
  };

  const field: React.CSSProperties = {
    width: 90, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4, padding: '6px 8px',
    color: T.text, fontSize: 13, fontFamily: 'inherit',
  };
  const day = agent.last24h;

  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>{agent.name}</div>
        <div style={{ fontSize: 13, color: T.textSec, marginTop: 4, lineHeight: 1.5 }}>{agent.description}</div>
        <div style={{ fontSize: 12, color: T.textMuted, marginTop: 6 }}>
          Last 24h: {day.EXECUTED ?? 0} done · {agent.pending} waiting · {day.REJECTED ?? 0} rejected · {day.EXPIRED ?? 0} expired · {day.FAILED ?? 0} failed
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {(['OFF', 'SUGGEST', 'AUTO'] as Mode[]).map(m => (
          <button key={m} disabled={!editable} onClick={() => setMode(m)} style={{
            padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
            cursor: editable ? 'pointer' : 'default', border: `1px solid ${mode === m ? T.primary : T.border}`,
            background: mode === m ? T.primaryTint : 'none', color: mode === m ? T.primary : T.textSec,
          }}>{m === 'SUGGEST' ? 'Suggest only' : m === 'AUTO' ? 'Auto' : 'Off'}</button>
        ))}
        <span style={{ fontSize: 12, color: T.textSec }}>{MODE_HELP[mode]}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.textSec, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Runs without approval in Auto mode</div>
        {agent.actions.map(a => (
          <label key={a.type} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: a.autoAllowed ? T.text : T.textMuted }}>
            <input
              type="checkbox"
              disabled={!editable || !a.autoAllowed}
              checked={autoActions.includes(a.type)}
              onChange={e => setAutoActions(cur => e.target.checked ? [...cur, a.type] : cur.filter(x => x !== a.type))}
            />
            {a.label}{!a.autoAllowed && ' (always needs a person)'}
          </label>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
        {Object.entries(agent.settingsSpec).map(([k, spec]) => (
          <label key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 13, color: T.textSec }}>
            {spec.label}
            <input
              type="number" min={spec.min} max={spec.max} disabled={!editable} value={settings[k] ?? ''}
              onChange={e => setSettings(cur => ({ ...cur, [k]: e.target.value }))} style={field}
            />
          </label>
        ))}
      </div>

      {editable ? (
        <div>
          <button onClick={save} disabled={saving} style={{
            padding: '8px 16px', borderRadius: 4, border: 'none', background: T.primary, color: '#fff', fontSize: 13,
            fontWeight: 700, fontFamily: 'inherit', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.5 : 1,
          }}>{saving ? 'Saving…' : 'Save settings'}</button>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: T.textMuted }}>Only super admins can change agent settings.</div>
      )}
    </div>
  );
}
