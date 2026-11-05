'use client';
import { useState } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import {
  Btn, Empty, Field, Input, Notice, PageHeader, Pager, Pill, PLATFORMS, PlatformTag, Select, Table, Td, TextArea,
  fmtDate, fmtDateTime, pretty, useAction, useLoad, useSmois,
} from '@/components/smois/ui';

const CATEGORIES = ['PROSPECT', 'EXISTING_CUSTOMER', 'POTENTIAL_CUSTOMER', 'PARTNER', 'INFLUENCER', 'MEDIA', 'JOB_APPLICANT', 'SUPPORT_CASE', 'OTHER'];
interface Contact {
  id: string; displayName: string; username: string | null; platform: string | null; profileUrl: string | null; email: string | null; phone: string | null; location: string | null;
  category: string; tags: string[]; notes: string | null; consentNote: string | null; consentAt: string | null; anonymizedAt: string | null; createdAt: string; _count: { conversations: number };
}
interface Profile extends Contact { conversations: { id: string; number: number; type: string; status: string; account: { name: string } }[]; timeline: { conversationId: string; number: number; account: string; direction: string; body: string; at: string }[] }

export default function ContactsPage() {
  const { me } = useSmois();
  const [q, setQ] = useState(''); const [category, setCategory] = useState(''); const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false); const [open, setOpen] = useState<string | null>(null);
  const qs = new URLSearchParams({ page: String(page), ...(q ? { q } : {}), ...(category ? { category } : {}) });
  const { data, loading, error, reload } = useLoad(() => api.get<{ data: { items: Contact[]; pagination: { pages: number } } }>(`/admin/smois/contacts?${qs}`).then((r) => r.data), [qs.toString()]);
  return (
    <div>
      <PageHeader title="Contacts and audience" sub="People who have written to the company accounts. Only what they chose to share is kept, with a note of how they agreed. Nothing is collected from their profiles." actions={me?.can.handleInbox ? <Btn kind="primary" onClick={() => setAdding(true)}>+ Add contact</Btn> : undefined} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 12 }}>
        <Field label="Search"><Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Name, handle or email" /></Field>
        <Field label="Category"><Select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}><option value="">Any</option>{CATEGORIES.map((c) => <option key={c} value={c}>{pretty(c)}</option>)}</Select></Field>
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      {loading && !data ? <Empty>Loading…</Empty> : data && data.items.length === 0 ? <Empty>No contacts yet. They are created when you log an interaction.</Empty> : data && (
        <>
          <Table head={['Name', 'Platform', 'Category', 'Contact details', 'Conversations', 'Added']}>
            {data.items.map((c) => (
              <tr key={c.id} onClick={() => setOpen(c.id)} style={{ cursor: 'pointer' }}>
                <Td><b>{c.displayName}</b>{c.username && <div style={{ fontSize: 11, opacity: 0.7 }}>@{c.username}</div>}</Td>
                <Td>{c.platform ? <PlatformTag platform={c.platform} /> : '—'}</Td><Td><Pill>{pretty(c.category)}</Pill></Td>
                <Td style={{ fontSize: 12 }}>{c.email ?? c.phone ?? <span style={{ opacity: 0.5 }}>None shared</span>}</Td><Td>{c._count.conversations}</Td><Td style={{ whiteSpace: 'nowrap' }}>{fmtDate(c.createdAt)}</Td>
              </tr>
            ))}
          </Table>
          <Pager page={page} pages={data.pagination.pages} onPage={setPage} />
        </>
      )}
      {adding && <ContactForm onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />}
      {open && <ContactView id={open} onClose={() => setOpen(null)} onChanged={reload} />}
    </div>
  );
}

function ContactForm({ initial, onClose, onSaved }: { initial?: Contact; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ displayName: initial?.displayName ?? '', username: initial?.username ?? '', platform: initial?.platform ?? '', email: initial?.email ?? '', phone: initial?.phone ?? '', location: initial?.location ?? '', category: initial?.category ?? 'OTHER', tags: (initial?.tags ?? []).join(', '), notes: initial?.notes ?? '', consentNote: initial?.consentNote ?? '' });
  const { busy, error, run } = useAction();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const needConsent = !!(f.email || f.phone);
  const save = () => run(async () => {
    const body = { ...f, platform: f.platform || null, tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean) };
    if (initial) await api.patch(`/admin/smois/contacts/${initial.id}`, body); else await api.post('/admin/smois/contacts', body);
    onSaved();
  });
  return (
    <Modal open onClose={onClose} title={initial ? 'Edit contact' : 'Add contact'} width={560}>
      <div style={{ padding: 20 }}>
        {error && <Notice kind="error">{error}</Notice>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Name"><Input value={f.displayName} onChange={set('displayName')} /></Field>
          <Field label="Handle"><Input value={f.username} onChange={set('username')} placeholder="@handle" /></Field>
          <Field label="Platform"><Select value={f.platform} onChange={set('platform')}><option value="">—</option>{PLATFORMS.map((p) => <option key={p} value={p}>{pretty(p)}</option>)}</Select></Field>
          <Field label="Category"><Select value={f.category} onChange={set('category')}>{CATEGORIES.map((c) => <option key={c} value={c}>{pretty(c)}</option>)}</Select></Field>
          <Field label="Email (only if they shared it)"><Input value={f.email} onChange={set('email')} /></Field>
          <Field label="Phone (only if they shared it)"><Input value={f.phone} onChange={set('phone')} /></Field>
          <Field label="Location (if shared)"><Input value={f.location} onChange={set('location')} /></Field>
          <Field label="Tags"><Input value={f.tags} onChange={set('tags')} placeholder="bulk, vip" /></Field>
        </div>
        {needConsent && <Field label="How did they agree to share this?" hint="Required. For example: asked us to call back in a DM on 5 Nov."><Input value={f.consentNote} onChange={set('consentNote')} /></Field>}
        <Field label="Notes"><TextArea rows={2} value={f.notes} onChange={set('notes')} /></Field>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy || !f.displayName.trim() || (needConsent && !f.consentNote.trim())} onClick={save}>{busy ? 'Saving…' : 'Save'}</Btn></div>
      </div>
    </Modal>
  );
}

function ContactView({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { theme: T } = useTheme();
  const { me } = useSmois();
  const { data, reload } = useLoad(() => api.get<{ data: Profile }>(`/admin/smois/contacts/${id}`).then((r) => r.data), [id]);
  const { busy, error, run } = useAction();
  const [editing, setEditing] = useState(false);
  const [erasing, setErasing] = useState(false);
  const [redact, setRedact] = useState(true);
  const [reason, setReason] = useState('');
  if (!data) return <Modal open onClose={onClose} title="Contact"><Empty>Loading…</Empty></Modal>;
  return (
    <Modal open onClose={onClose} title={data.displayName} width={760}>
      <div style={{ padding: 20 }}>
        {error && <Notice kind="error">{error}</Notice>}
        {data.anonymizedAt && <Notice kind="warn">Personal details were removed on {fmtDate(data.anonymizedAt)}. Conversation counts and response times are kept.</Notice>}
        <div style={{ fontSize: 13, color: T.textSec, lineHeight: 1.8, marginBottom: 12 }}>
          <div>{data.platform && <PlatformTag platform={data.platform} />} {data.username && `@${data.username}`} {data.profileUrl && <a href={data.profileUrl} target="_blank" rel="noreferrer" style={{ color: T.primary }}>profile ↗</a>} · <Pill>{pretty(data.category)}</Pill></div>
          {(data.email || data.phone || data.location) && <div>{[data.email, data.phone, data.location].filter(Boolean).join(' · ')}</div>}
          {data.consentNote && <div style={{ fontSize: 12 }}>Consent: {data.consentNote} ({data.consentAt ? fmtDate(data.consentAt) : ''})</div>}
          {data.tags.length > 0 && <div>{data.tags.map((t) => <Pill key={t}>{t}</Pill>)}</div>}
          {data.notes && <div>{data.notes}</div>}
        </div>
        {!data.anonymizedAt && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            {me?.can.handleInbox && <Btn small onClick={() => setEditing(true)}>Edit</Btn>}
            {me?.can.manageListening && <Btn small kind="danger" onClick={() => setErasing(true)}>Remove personal details…</Btn>}
          </div>
        )}
        {erasing && (
          <div style={{ background: T.errorBg, border: `1px solid ${T.error}`, borderRadius: 4, padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 13, color: T.text, marginBottom: 8 }}>For a data access, correction or deletion request. Name, handle, contact details and notes are erased. This cannot be undone.</div>
            <label style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}><input type="checkbox" checked={redact} onChange={(e) => setRedact(e.target.checked)} /> Also remove the text of what they wrote</label>
            <Field label="Reason (kept in the activity log)"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. NDPA deletion request, 5 Nov" /></Field>
            <div style={{ display: 'flex', gap: 8 }}><Btn kind="danger" disabled={busy} onClick={() => run(async () => { await api.post(`/admin/smois/contacts/${id}/anonymize`, { redactMessages: redact, reason }); setErasing(false); reload(); onChanged(); })}>Erase details</Btn><Btn onClick={() => setErasing(false)}>Cancel</Btn></div>
          </div>
        )}
        <div style={{ fontSize: 12, fontWeight: 800, color: T.textSec, textTransform: 'uppercase', margin: '10px 0 6px' }}>Conversations ({data.conversations.length})</div>
        {data.conversations.map((c) => <a key={c.id} href={`/smois/inbox?open=${c.id}`} style={{ display: 'block', fontSize: 13, padding: '5px 0', color: T.text, textDecoration: 'none' }}>#{c.number} · {pretty(c.type)} on {c.account.name} · {pretty(c.status)}</a>)}
        <div style={{ fontSize: 12, fontWeight: 800, color: T.textSec, textTransform: 'uppercase', margin: '14px 0 6px' }}>Timeline</div>
        {data.timeline.length === 0 ? <Empty>No interactions on accounts you can see.</Empty> : data.timeline.map((t, i) => (
          <div key={i} style={{ padding: '7px 0', borderTop: `1px solid ${T.border}`, fontSize: 12 }}>
            <b style={{ color: T.text }}>{t.direction === 'INBOUND' ? data.displayName : 'Us'}</b> <span style={{ color: T.textMuted }}>on {t.account} · {fmtDateTime(t.at)}</span>
            <div style={{ color: T.textSec, whiteSpace: 'pre-wrap' }}>{t.body}</div>
          </div>
        ))}
      </div>
      {editing && <ContactForm initial={data} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); reload(); onChanged(); }} />}
    </Modal>
  );
}
