'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTheme } from '@/context/ThemeContext';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import {
  Btn, Empty, Field, Input, Notice, PageHeader, Pager, Pill, PlatformTag, Select, StatusPill, Stat, Table, Tabs, Td, TextArea,
  fmtDateTime, pretty, toLocalInput, useAction, useLoad, useSmois,
} from '@/components/smois/ui';

type Sla = 'MET' | 'BREACHED' | 'DUE_SOON' | 'ON_TRACK' | 'NOT_APPLICABLE';
interface Row {
  id: string; number: number; type: string; subject: string | null; status: string; priority: string; sla: Sla; receivedAt: string; slaDueAt: string | null;
  assigneeName: string | null; firstResponseMinutes: number | null; account: { id: string; name: string; platform: string };
  contact: { id: string; displayName: string; username: string | null } | null; _count: { messages: number };
}
interface Message { id: string; direction: 'INBOUND' | 'OUTBOUND' | 'NOTE'; body: string; authorName: string | null; occurredAt: string }
interface Conv extends Row { messages: Message[]; firstResponderName: string | null; escalationType: string | null; escalationNote: string | null; externalUrl: string | null; resolvedAt: string | null; tags: string[] }
interface Summary {
  now: { new: number; open: number; unassigned: number; escalated: number; overdue: number; dueSoon: number; mine: number };
  period_: { received: number; resolved: number; answered: number; unanswered: number; avgFirstResponseMinutes: number | null; withinTargetPct: number | null };
  targets: { highMinutes: number; standardMinutes: number; generalMinutes: number; hours: { startHour: number; endHour: number; days: number[] } }; note: string;
}

const TYPES = ['DIRECT_MESSAGE', 'COMMENT', 'MENTION', 'REPLY', 'STORY_INTERACTION', 'ENQUIRY', 'REVIEW'];
const ESC = ['SERIOUS_COMPLAINT', 'LEGAL', 'SECURITY', 'PRODUCT_ISSUE', 'MEDIA_ENQUIRY', 'PARTNERSHIP', 'SENSITIVE_CUSTOMER'];
const SLA_TONE: Record<Sla, 'good' | 'bad' | 'warn' | 'neutral'> = { MET: 'good', BREACHED: 'bad', DUE_SOON: 'warn', ON_TRACK: 'neutral', NOT_APPLICABLE: 'neutral' };
const SLA_LABEL: Record<Sla, string> = { MET: 'Target met', BREACHED: 'Target missed', DUE_SOON: 'Due soon', ON_TRACK: 'On track', NOT_APPLICABLE: '' };
type View = 'queue' | 'mine' | 'unassigned' | 'overdue' | 'escalated' | 'resolved';

export default function InboxPage() {
  return <Suspense fallback={<Empty>Loading…</Empty>}><Inner /></Suspense>;
}

function Inner() {
  const params = useSearchParams();
  const router = useRouter();
  const [view, setView] = useState<View>('queue');
  const [priority, setPriority] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(params.get('open'));
  const [logging, setLogging] = useState(false);
  useEffect(() => { setOpen(params.get('open')); }, [params]);

  const qs = new URLSearchParams({ view, page: String(page), ...(priority ? { priority } : {}), ...(q ? { q } : {}) });
  const list = useLoad(() => api.get<{ data: { items: Row[]; pagination: { pages: number; total: number } } }>(`/admin/smois/inbox?${qs}`).then((r) => r.data), [qs.toString()]);
  const summary = useLoad(() => api.get<{ data: Summary }>('/admin/smois/inbox/summary?period=month').then((r) => r.data), []);
  const refresh = () => { list.reload(); summary.reload(); window.dispatchEvent(new Event('gbm:pending-counts-updated')); };
  const close = () => { setOpen(null); if (params.get('open')) router.replace('/smois/inbox'); };
  const s = summary.data;

  return (
    <div>
      <PageHeader
        title="Shared inbox"
        sub="Messages, comments and mentions that reached the company accounts. Log each one here, work it as a team, and the system tracks who answered and how fast."
        actions={<Btn kind="primary" onClick={() => setLogging(true)}>+ Log an interaction</Btn>}
      />
      <Notice kind="info">Nothing arrives here by itself yet. Someone logs what they see on the platform, and the time it <b>reached the platform</b> starts the response clock. Reply on the platform, then record the reply here.</Notice>

      {s && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
          <Stat label="Open now" value={s.now.open} sub={`${s.now.new} new`} />
          <Stat label="Unassigned" value={s.now.unassigned} />
          <Stat label="Past target" value={s.now.overdue} sub={s.now.dueSoon ? `${s.now.dueSoon} due soon` : undefined} />
          <Stat label="Escalated" value={s.now.escalated} />
          <Stat label="Avg first response" value={s.period_.avgFirstResponseMinutes === null ? 'No replies yet' : `${s.period_.avgFirstResponseMinutes} min`} sub="this month" />
          <Stat label="Within target" value={s.period_.withinTargetPct === null ? '—' : `${s.period_.withinTargetPct}%`} sub={`${s.period_.answered} answered`} />
        </div>
      )}

      <Tabs value={view} onChange={(v) => { setView(v); setPage(1); }} items={[
        { id: 'queue', label: 'Open' }, { id: 'mine', label: 'Mine', badge: s?.now.mine }, { id: 'unassigned', label: 'Unassigned' },
        { id: 'overdue', label: 'Past target', badge: s?.now.overdue }, { id: 'escalated', label: 'Escalated' }, { id: 'resolved', label: 'Resolved' },
      ]} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 12 }}>
        <Field label="Search"><Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Name, subject or message" /></Field>
        <Field label="Priority"><Select value={priority} onChange={(e) => { setPriority(e.target.value); setPage(1); }}><option value="">Any</option><option value="HIGH">High</option><option value="STANDARD">Standard</option><option value="GENERAL">General</option></Select></Field>
      </div>
      {list.error && <Notice kind="error">{list.error}</Notice>}
      {list.loading && !list.data ? <Empty>Loading…</Empty> : list.data && list.data.items.length === 0 ? <Empty>Nothing here.</Empty> : list.data && (
        <>
          <Table head={['#', 'From', 'Account', 'Priority', 'Received', 'Target', 'Owner', 'Status']}>
            {list.data.items.map((r) => (
              <tr key={r.id} onClick={() => setOpen(r.id)} style={{ cursor: 'pointer' }}>
                <Td style={{ opacity: 0.6 }}>{r.number}</Td>
                <Td><b>{r.contact?.displayName ?? 'Unknown'}</b><div style={{ fontSize: 11, opacity: 0.7 }}>{pretty(r.type)}{r.subject ? ` · ${r.subject}` : ''}</div></Td>
                <Td><PlatformTag platform={r.account.platform} name={r.account.name} /></Td>
                <Td><Pill tone={r.priority === 'HIGH' ? 'bad' : r.priority === 'STANDARD' ? 'info' : 'neutral'}>{pretty(r.priority)}</Pill></Td>
                <Td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{fmtDateTime(r.receivedAt)}</Td>
                <Td>{SLA_LABEL[r.sla] && <Pill tone={SLA_TONE[r.sla]}>{SLA_LABEL[r.sla]}</Pill>}{r.firstResponseMinutes !== null && <div style={{ fontSize: 11, opacity: 0.7 }}>replied in {r.firstResponseMinutes} min</div>}</Td>
                <Td>{r.assigneeName ?? <Pill tone="warn">Unassigned</Pill>}</Td>
                <Td><StatusPill status={r.status} /></Td>
              </tr>
            ))}
          </Table>
          <Pager page={page} pages={list.data.pagination.pages} onPage={setPage} />
        </>
      )}
      {s && <div style={{ fontSize: 11, opacity: 0.6, marginTop: 10 }}>Targets: high {s.targets.highMinutes} min, standard {s.targets.standardMinutes} min (counted during business hours, {s.targets.hours.startHour}:00 to {s.targets.hours.endHour}:00), general comments {s.targets.generalMinutes / 60} hours. {s.note}</div>}
      {logging && <LogForm onClose={() => setLogging(false)} onSaved={(id) => { setLogging(false); refresh(); setOpen(id); }} />}
      {open && <ConversationView id={open} onClose={close} onChanged={refresh} />}
    </div>
  );
}

function LogForm({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => void }) {
  const accounts = useLoad(() => api.get<{ data: { id: string; name: string; platform: string }[] }>('/admin/smois/accounts').then((r) => r.data), []);
  const { me } = useSmois();
  const mine = useLoad(() => api.get<{ data: { accounts: { accountId: string }[] } }>('/admin/smois/analytics/overview?period=month').then((r) => r.data.accounts.map((a) => a.accountId)), []);
  const usable = (accounts.data ?? []).filter((a) => me?.level !== 'MANAGER' || mine.data?.includes(a.id));
  const [f, setF] = useState({ accountId: '', type: 'DIRECT_MESSAGE', priority: '', subject: '', body: '', receivedAt: toLocalInput(), contactName: '', username: '', externalUrl: '' });
  const { busy, error, run } = useAction();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const save = () => run(async () => {
    const r = await api.post<{ data: { id: string } }>('/admin/smois/inbox', {
      accountId: f.accountId, type: f.type, ...(f.priority ? { priority: f.priority } : {}), subject: f.subject, body: f.body, receivedAt: new Date(f.receivedAt).toISOString(), externalUrl: f.externalUrl || undefined,
      ...(f.contactName || f.username ? { contact: { displayName: f.contactName, username: f.username } } : {}),
    });
    onSaved(r.data.id);
  });
  return (
    <Modal open onClose={onClose} title="Log an interaction" width={600}>
      <div style={{ padding: 20 }}>
        {error && <Notice kind="error">{error}</Notice>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Account"><Select value={f.accountId} onChange={set('accountId')}><option value="">Choose…</option>{usable.map((a) => <option key={a.id} value={a.id}>{a.name} ({pretty(a.platform)})</option>)}</Select></Field>
          <Field label="Type"><Select value={f.type} onChange={set('type')}>{TYPES.map((t) => <option key={t} value={t}>{pretty(t)}</option>)}</Select></Field>
          <Field label="Who wrote"><Input value={f.contactName} onChange={set('contactName')} placeholder="Display name" /></Field>
          <Field label="Their handle"><Input value={f.username} onChange={set('username')} placeholder="@handle" /></Field>
          <Field label="Reached the platform at" hint="Starts the response clock"><Input type="datetime-local" value={f.receivedAt} onChange={set('receivedAt')} /></Field>
          <Field label="Priority" hint="Leave on auto unless it is urgent"><Select value={f.priority} onChange={set('priority')}><option value="">Auto</option><option value="HIGH">High (30 min)</option><option value="STANDARD">Standard (2 h)</option><option value="GENERAL">General (24 h)</option></Select></Field>
        </div>
        <Field label="Subject (optional)"><Input value={f.subject} onChange={set('subject')} /></Field>
        <Field label="What they wrote"><TextArea rows={4} value={f.body} onChange={set('body')} /></Field>
        <Field label="Link to the message (optional)"><Input value={f.externalUrl} onChange={set('externalUrl')} placeholder="https://" /></Field>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy || !f.accountId || !f.body.trim()} onClick={save}>{busy ? 'Logging…' : 'Log it'}</Btn></div>
      </div>
    </Modal>
  );
}

function ConversationView({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { theme: T } = useTheme();
  const { people } = useSmois();
  const { data, reload } = useLoad(() => api.get<{ data: Conv }>(`/admin/smois/inbox/${id}`).then((r) => r.data), [id]);
  const replies = useLoad(() => api.get<{ data: { id: string; title: string; body: string }[] }>('/admin/smois/saved-replies').then((r) => r.data), []);
  const { busy, error, setError, run } = useAction();
  const [mode, setMode] = useState<'OUTBOUND' | 'NOTE' | 'INBOUND'>('OUTBOUND');
  const [body, setBody] = useState('');
  const [waiting, setWaiting] = useState(false);
  const [needForce, setNeedForce] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const [esc, setEsc] = useState({ type: 'SERIOUS_COMPLAINT', note: '' });
  const done = () => { reload(); onChanged(); };
  if (!data) return <Modal open onClose={onClose} title="Conversation"><Empty>Loading…</Empty></Modal>;

  const send = (force = false) => run(async () => {
    try {
      await api.post(`/admin/smois/inbox/${id}/messages`, { direction: mode, body, waiting: mode === 'OUTBOUND' && waiting, force });
      setBody(''); setNeedForce(false); done();
    } catch (e) {
      if (/replied to this a few minutes ago/.test((e as Error).message)) setNeedForce(true);
      throw e;
    }
  });
  const move = (status: string) => run(async () => { await api.post(`/admin/smois/inbox/${id}/status`, { status }); done(); });
  const assign = (memberId: string) => run(async () => { await api.post(`/admin/smois/inbox/${id}/assign`, { memberId: memberId || null }); done(); });
  const doers = people.filter((p) => p.memberId && (p.role === 'MANAGER' || p.role === 'MANAGEMENT'));
  const closed = data.status === 'CLOSED';

  return (
    <Modal open onClose={onClose} title={`#${data.number} · ${data.contact?.displayName ?? 'Unknown'}`} width={820}>
      <div style={{ padding: 20 }}>
        {error && <Notice kind="error">{error}</Notice>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <StatusPill status={data.status} /><Pill tone={data.priority === 'HIGH' ? 'bad' : 'info'}>{pretty(data.priority)}</Pill>
          {SLA_LABEL[data.sla] && <Pill tone={SLA_TONE[data.sla]}>{SLA_LABEL[data.sla]}</Pill>}
          <PlatformTag platform={data.account.platform} name={data.account.name} />
          <span style={{ fontSize: 12, color: T.textSec }}>{pretty(data.type)} · received {fmtDateTime(data.receivedAt)}{data.slaDueAt && ` · reply due ${fmtDateTime(data.slaDueAt)}`}</span>
          {data.externalUrl && <a href={data.externalUrl} target="_blank" rel="noreferrer" style={{ color: T.primary, fontSize: 12, fontWeight: 700 }}>Open on platform ↗</a>}
        </div>
        {data.firstResponseMinutes !== null && <div style={{ fontSize: 12, color: T.textSec, marginBottom: 8 }}>First response by <b style={{ color: T.text }}>{data.firstResponderName}</b> after {data.firstResponseMinutes} min (counted on the target&apos;s clock).</div>}
        {data.status === 'ESCALATED' && <Notice kind="warn">Escalated ({pretty(data.escalationType ?? '')}): {data.escalationNote}</Notice>}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14, alignItems: 'end' }}>
          <div style={{ width: 220 }}><Field label="Owner"><Select value={doers.find((p) => p.name === data.assigneeName)?.memberId ?? ''} onChange={(e) => assign(e.target.value)} disabled={busy}><option value="">Unassigned</option>{doers.map((p) => <option key={p.memberId!} value={p.memberId!}>{p.name}</option>)}</Select></Field></div>
          <div style={{ display: 'flex', gap: 8, paddingBottom: 12, flexWrap: 'wrap' }}>
            {data.status !== 'RESOLVED' && !closed && <Btn onClick={() => move('RESOLVED')} disabled={busy}>Mark resolved</Btn>}
            {(data.status === 'RESOLVED' || closed) && <Btn onClick={() => move('OPEN')} disabled={busy}>Reopen</Btn>}
            {data.status === 'RESOLVED' && <Btn onClick={() => move('CLOSED')} disabled={busy}>Close</Btn>}
            {!['RESOLVED', 'CLOSED', 'ESCALATED'].includes(data.status) && <Btn kind="danger" onClick={() => setEscalating(true)}>Escalate…</Btn>}
          </div>
        </div>

        {escalating && (
          <div style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4, padding: 14, marginBottom: 14 }}>
            <Field label="Escalate as"><Select value={esc.type} onChange={(e) => setEsc({ ...esc, type: e.target.value })}>{ESC.map((t) => <option key={t} value={t}>{pretty(t)}</option>)}</Select></Field>
            <Field label="Why"><Input value={esc.note} onChange={(e) => setEsc({ ...esc, note: e.target.value })} /></Field>
            <div style={{ display: 'flex', gap: 8 }}><Btn kind="danger" disabled={busy || !esc.note.trim()} onClick={() => run(async () => { await api.post(`/admin/smois/inbox/${id}/escalate`, esc); setEscalating(false); done(); })}>Escalate to management</Btn><Btn onClick={() => setEscalating(false)}>Cancel</Btn></div>
          </div>
        )}

        <div style={{ border: `1px solid ${T.border}`, borderRadius: 4, marginBottom: 14, maxHeight: 340, overflowY: 'auto' }}>
          {data.messages.map((m) => (
            <div key={m.id} style={{ padding: '10px 14px', borderBottom: `1px solid ${T.border}`, background: m.direction === 'NOTE' ? T.warningBg : m.direction === 'OUTBOUND' ? T.primaryTint : 'transparent' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.textSec, marginBottom: 3 }}>
                {m.direction === 'INBOUND' ? (data.contact?.displayName ?? 'Customer') : m.direction === 'OUTBOUND' ? `Reply · ${m.authorName}` : `Internal note · ${m.authorName}`} <span style={{ fontWeight: 500, color: T.textMuted }}>{fmtDateTime(m.occurredAt)}</span>
              </div>
              <div style={{ fontSize: 13, color: T.text, whiteSpace: 'pre-wrap' }}>{m.body}</div>
            </div>
          ))}
        </div>

        {!closed && (
          <div>
            <Tabs value={mode} onChange={(m) => { setMode(m); setNeedForce(false); setError(''); }} items={[{ id: 'OUTBOUND', label: 'Record my reply' }, { id: 'NOTE', label: 'Internal note' }, { id: 'INBOUND', label: 'Customer wrote again' }]} />
            {mode === 'OUTBOUND' && <div style={{ fontSize: 12, color: T.textSec, marginBottom: 8 }}>Send the reply on the platform first, then record exactly what you sent. The first reply stops the response clock.</div>}
            {mode === 'OUTBOUND' && replies.data && replies.data.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>{replies.data.map((r) => <Btn key={r.id} small onClick={() => setBody(r.body)}>{r.title}</Btn>)}</div>
            )}
            <TextArea rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
              {needForce ? <Btn kind="danger" onClick={() => send(true)} disabled={busy}>Reply anyway</Btn> : <Btn kind="primary" onClick={() => send(false)} disabled={busy || !body.trim()}>{mode === 'OUTBOUND' ? 'Record reply' : mode === 'NOTE' ? 'Add note' : 'Add customer message'}</Btn>}
              {mode === 'OUTBOUND' && <label style={{ fontSize: 12, color: T.textSec, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={waiting} onChange={(e) => setWaiting(e.target.checked)} /> Waiting for the customer</label>}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
