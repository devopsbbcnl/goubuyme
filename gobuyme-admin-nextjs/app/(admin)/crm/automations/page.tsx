'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import { Card, fmtDateTime } from '@/components/crm/shared';
import {
  CHANNEL_LABEL, CampaignChannel, EMPTY_MESSAGE, FieldLabel, MarketingTabs, MessageContent, MessageEditor,
  toContentPayload, useFieldStyle,
} from '@/components/crm/marketing';

type Trigger = 'WIN_BACK' | 'FIRST_ORDER_NUDGE' | 'VENDOR_INACTIVE';

interface Automation {
  id: string; name: string; trigger: Trigger; days: number; cooldownDays: number; enabled: boolean;
  channels: CampaignChannel[]; title: string; body: string; emailSubject: string | null; ctaUrl: string | null;
  lastRunAt: string | null; description: string; runs: number;
  lastCampaign: { id: string; createdAt: string; audienceSize: number | null; status: string } | null;
  createdBy: { name: string };
}

interface TriggerMeta { label: string; role: 'CUSTOMER' | 'VENDOR' }

const TRIGGER_DEFAULTS: Record<Trigger, { days: number; name: string; title: string; body: string }> = {
  WIN_BACK: { days: 30, name: 'Win back lapsed customers', title: 'We miss you, {{name}}', body: 'It\'s been a while! Your favourite spots are open. Order today and get your food delivered fast.' },
  FIRST_ORDER_NUDGE: { days: 3, name: 'First order nudge', title: 'Ready for your first order, {{name}}?', body: 'Restaurants, groceries and pharmacy near you, delivered in minutes. Place your first order today.' },
  VENDOR_INACTIVE: { days: 7, name: 'Quiet vendor check-in', title: 'Let\'s get orders coming in, {{name}}', body: 'You haven\'t had orders in a while. Check your store is open, your menu is up to date and your prices are current.' },
};

export default function AutomationsPage() {
  const { theme: T } = useTheme();
  const { user } = useAuth();
  const isSuper = user?.role === 'SUPER_ADMIN';

  const [automations, setAutomations] = useState<Automation[]>([]);
  const [triggers, setTriggers] = useState<Record<Trigger, TriggerMeta> | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Automation | 'new' | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = () =>
    api.get<{ data: { automations: Automation[]; triggers: Record<Trigger, TriggerMeta> } }>('/admin/crm/automations')
      .then(res => { setAutomations(res.data.automations); setTriggers(res.data.triggers); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const act = async (fn: () => Promise<string | void>) => {
    setError(''); setNotice('');
    try { const msg = await fn(); if (msg) setNotice(msg); await load(); } catch (err) { setError((err as Error).message); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.text }}>Automations</div>
          <div style={{ fontSize: 13, color: T.textSec }}>Checked every day at 10:00. Each person gets a message once per cooldown period.</div>
        </div>
        {isSuper && (
          <button onClick={() => setEditing('new')} style={{ padding: '10px 18px', borderRadius: 4, border: 'none', background: T.primary, color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
            New automation
          </button>
        )}
      </div>
      <MarketingTabs />
      {notice && <div style={{ fontSize: 13, color: T.success }}>{notice}</div>}
      {error && <div style={{ fontSize: 13, color: T.error }}>{error}</div>}

      {loading ? (
        <div style={{ fontSize: 13, color: T.textSec }}>Loading automations…</div>
      ) : automations.length === 0 ? (
        <Card><div style={{ fontSize: 13, color: T.textSec }}>No automations yet. Start with a win-back message for customers who haven&apos;t ordered in 30 days.</div></Card>
      ) : automations.map(a => (
        <Card key={a.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ minWidth: 0, flex: '1 1 320px' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: T.text }}>{a.name}</span>
                <span style={{
                  fontSize: 11, fontWeight: 700, borderRadius: 4, padding: '3px 9px',
                  color: a.enabled ? T.success : T.textSec, background: a.enabled ? T.successBg : T.surface3,
                }}>{a.enabled ? 'On' : 'Off'}</span>
              </div>
              <div style={{ fontSize: 12, color: T.textSec, marginTop: 4 }}>
                {a.description} · once every {a.cooldownDays} days per person · {a.channels.map(c => CHANNEL_LABEL[c]).join(', ')}
              </div>
              <div style={{ fontSize: 13, color: T.text, marginTop: 8 }}><strong>{a.title}</strong> — {a.body}</div>
              <div style={{ fontSize: 11, color: T.textMuted, marginTop: 8 }}>
                {a.lastRunAt ? `Last checked ${fmtDateTime(a.lastRunAt)}` : 'Never run'}
                {a.lastCampaign && <> · last send to {a.lastCampaign.audienceSize ?? 0} people (<Link href={`/crm/campaigns/${a.lastCampaign.id}`} style={{ color: T.primary }}>results</Link>)</>}
                {` · ${a.runs} sends total`}
              </div>
            </div>
            {isSuper && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={() => act(async () => { await api.patch(`/admin/crm/automations/${a.id}`, { enabled: !a.enabled }); return a.enabled ? 'Automation paused.' : 'Automation turned on. It runs at 10:00 daily.'; })}
                  style={smallBtn(T, !a.enabled)}>{a.enabled ? 'Pause' : 'Turn on'}</button>
                <button onClick={() => act(async () => (await api.post<{ message: string }>(`/admin/crm/automations/${a.id}/run`, {})).message)}
                  style={smallBtn(T, false)}>Run now</button>
                <button onClick={() => setEditing(a)} style={smallBtn(T, false)}>Edit</button>
                <button onClick={() => act(async () => { await api.del(`/admin/crm/automations/${a.id}`); return 'Automation deleted.'; })}
                  style={{ ...smallBtn(T, false), color: T.error, borderColor: T.error, background: 'transparent' }}>Delete</button>
              </div>
            )}
          </div>
        </Card>
      ))}

      {editing && triggers && (
        <AutomationModal automation={editing === 'new' ? null : editing} triggers={triggers}
          onClose={() => setEditing(null)} onSaved={msg => { setEditing(null); setNotice(msg); load(); }} />
      )}
    </div>
  );
}

const smallBtn = (T: ReturnType<typeof useTheme>['theme'], primary: boolean): React.CSSProperties => ({
  padding: '7px 12px', borderRadius: 4, fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
  border: primary ? 'none' : `1px solid ${T.border}`, background: primary ? T.primary : T.surface2, color: primary ? '#fff' : T.text,
});

function AutomationModal({ automation, triggers, onClose, onSaved }: {
  automation: Automation | null; triggers: Record<Trigger, TriggerMeta>; onClose: () => void; onSaved: (msg: string) => void;
}) {
  const { theme: T } = useTheme();
  const field = useFieldStyle();
  const initialTrigger: Trigger = automation?.trigger ?? 'WIN_BACK';
  const [trigger, setTrigger] = useState<Trigger>(initialTrigger);
  const [name, setName] = useState(automation?.name ?? TRIGGER_DEFAULTS[initialTrigger].name);
  const [days, setDays] = useState(automation?.days ?? TRIGGER_DEFAULTS[initialTrigger].days);
  const [cooldownDays, setCooldownDays] = useState(automation?.cooldownDays ?? 30);
  const [enabled, setEnabled] = useState(automation?.enabled ?? false);
  const [message, setMessage] = useState<MessageContent>(automation
    ? { channels: automation.channels, title: automation.title, body: automation.body, emailSubject: automation.emailSubject ?? '', ctaUrl: automation.ctaUrl ?? '' }
    : { ...EMPTY_MESSAGE, title: TRIGGER_DEFAULTS.WIN_BACK.title, body: TRIGGER_DEFAULTS.WIN_BACK.body });
  const [preview, setPreview] = useState<{ count: number; description: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const changeTrigger = (t: Trigger) => {
    setTrigger(t);
    if (!automation) {
      const d = TRIGGER_DEFAULTS[t];
      setName(d.name); setDays(d.days); setMessage(m => ({ ...m, title: d.title, body: d.body }));
    }
  };

  useEffect(() => {
    setPreview(null);
    if (!days || days < 1) return;
    const t = setTimeout(() => {
      api.post<{ data: { count: number; description: string } }>('/admin/crm/automations/preview', { trigger, days, cooldownDays, id: automation?.id })
        .then(res => setPreview(res.data)).catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [trigger, days, cooldownDays, automation?.id]);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = { name, trigger, days, cooldownDays, enabled, ...toContentPayload(message) };
      if (automation) await api.patch(`/admin/crm/automations/${automation.id}`, payload);
      else await api.post('/admin/crm/automations', payload);
      onSaved(enabled ? 'Saved. It runs daily at 10:00.' : 'Saved (off). Turn it on when you\'re ready.');
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={automation ? 'Edit automation' : 'New automation'} width={860}>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <div>
            <FieldLabel>When</FieldLabel>
            <select value={trigger} onChange={e => changeTrigger(e.target.value as Trigger)} style={field}>
              {(Object.keys(triggers) as Trigger[]).map(t => <option key={t} value={t}>{triggers[t].label}</option>)}
            </select>
          </div>
          <div><FieldLabel>Days</FieldLabel><input type="number" min={1} max={365} value={days} onChange={e => setDays(Number(e.target.value))} style={field} /></div>
          <div><FieldLabel hint="per person">Repeat at most every (days)</FieldLabel><input type="number" min={1} max={365} value={cooldownDays} onChange={e => setCooldownDays(Number(e.target.value))} style={field} /></div>
          <div><FieldLabel>Name</FieldLabel><input value={name} maxLength={80} onChange={e => setName(e.target.value)} style={field} /></div>
        </div>
        <div style={{ fontSize: 13, color: T.textSec, background: T.surface2, borderRadius: 4, padding: 12 }}>
          {preview ? <><strong style={{ color: T.text }}>{preview.count.toLocaleString()}</strong> would get this today · {preview.description}</> : 'Counting…'}
        </div>
        <MessageEditor value={message} onChange={setMessage} />
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: T.text }}>
          <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} /> Turn on (runs daily at 10:00)
        </label>
        {error && <div style={{ fontSize: 12, color: T.error }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: T.textSec, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ padding: '9px 16px', borderRadius: 4, border: 'none', background: T.primary, color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Save automation'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
