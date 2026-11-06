'use client';
import { useState } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import { cloudinaryUpload } from '@/lib/cloudinaryUpload';
import { Btn, Card, Empty, Thumb, Field, Input, Notice, PageHeader, Pager, Pill, Select, TextArea, fmtDate, pretty, toLocalInput, useAction, useLoad, useSmois } from '@/components/smois/ui';

const CATEGORIES = ['LOGO', 'BRAND_GUIDELINES', 'COMPANY_PHOTO', 'EXECUTIVE_PHOTO', 'PRODUCT_PHOTO', 'MARKETING_DESIGN', 'VIDEO', 'TEMPLATE', 'CAMPAIGN_ASSET', 'EVENT_PHOTO', 'PRESS_MATERIAL', 'APPROVED_CAPTION', 'CORPORATE_DESCRIPTION', 'OTHER'];
const FILE_TYPES = ['IMAGE', 'VIDEO', 'DOCUMENT', 'AUDIO', 'TEXT', 'OTHER'];
interface Asset {
  id: string; name: string; description: string | null; category: string; fileType: string; fileSize: number | null; url: string; folder: string | null; tags: string[]; version: number;
  approvalStatus: 'DRAFT' | 'APPROVED' | 'REJECTED'; usageRestrictions: string | null; expiresAt: string | null; expiry: 'NONE' | 'OK' | 'EXPIRING_SOON' | 'EXPIRED'; usable: boolean;
  uploadedByName: string | null; approvedByName: string | null; archivedAt: string | null; createdAt: string;
}
interface Detail extends Asset { history: Asset[]; usage: { id: string; contentId: string; title: string; status: string }[] }
const size = (n: number | null) => (n === null ? '' : n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);

export default function MediaPage() {
  const { theme: T } = useTheme();
  const { me } = useSmois();
  const [category, setCategory] = useState(''); const [status, setStatus] = useState(''); const [expiry, setExpiry] = useState(''); const [q, setQ] = useState(''); const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false); const [open, setOpen] = useState<string | null>(null);
  const qs = new URLSearchParams({ page: String(page), ...(category ? { category } : {}), ...(status ? { status } : {}), ...(expiry ? { expiry } : {}), ...(q ? { q } : {}) });
  const { data, loading, error, reload } = useLoad(() => api.get<{ data: { items: Asset[]; pagination: { pages: number } } }>(`/admin/smois/assets?${qs}`).then((r) => r.data), [qs.toString()]);
  const tone = (a: Asset) => (a.expiry === 'EXPIRED' ? 'bad' : a.approvalStatus === 'REJECTED' ? 'bad' : a.approvalStatus === 'APPROVED' ? (a.expiry === 'EXPIRING_SOON' ? 'warn' : 'good') : 'neutral') as 'bad' | 'good' | 'warn' | 'neutral';
  const label = (a: Asset) => (a.expiry === 'EXPIRED' ? 'Expired' : a.approvalStatus === 'APPROVED' ? (a.expiry === 'EXPIRING_SOON' ? 'Expiring soon' : 'Approved') : pretty(a.approvalStatus));
  return (
    <div>
      <PageHeader title="Media and brand library" sub="Official logos, photos, templates and approved copy. Assets must be approved before they can go into content, and expired or rejected ones are blocked." actions={me?.can.createContent ? <Btn kind="primary" onClick={() => setAdding(true)}>+ Add asset</Btn> : undefined} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 12 }}>
        <Field label="Search"><Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Name or tag" /></Field>
        <Field label="Category"><Select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}><option value="">All</option>{CATEGORIES.map((c) => <option key={c} value={c}>{pretty(c)}</option>)}</Select></Field>
        <Field label="Approval"><Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">Any</option><option value="DRAFT">Awaiting approval</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option></Select></Field>
        <Field label="Expiry"><Select value={expiry} onChange={(e) => { setExpiry(e.target.value); setPage(1); }}><option value="">Any</option><option value="soon">Expiring in 14 days</option><option value="expired">Expired</option></Select></Field>
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      {loading && !data ? <Empty>Loading…</Empty> : data && data.items.length === 0 ? <Empty>No assets match.</Empty> : data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 14 }}>
            {data.items.map((a) => (
              <div key={a.id} onClick={() => setOpen(a.id)} style={{ cursor: 'pointer', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: 130, background: T.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {a.fileType === 'IMAGE'
                    ? <Thumb src={a.url} alt={a.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                    : <span style={{ fontSize: 32 }}>{a.fileType === 'VIDEO' ? '🎬' : a.fileType === 'DOCUMENT' ? '📄' : a.fileType === 'AUDIO' ? '🎵' : '📎'}</span>}
                </div>
                <div style={{ padding: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
                  <div style={{ fontSize: 11, color: T.textSec, margin: '2px 0 6px' }}>{pretty(a.category)} · v{a.version}{a.fileSize ? ` · ${size(a.fileSize)}` : ''}</div>
                  <Pill tone={tone(a)}>{label(a)}</Pill>
                </div>
              </div>
            ))}
          </div>
          <Pager page={page} pages={data.pagination.pages} onPage={setPage} />
        </>
      )}
      {adding && <AssetForm onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />}
      {open && <AssetView id={open} onClose={() => setOpen(null)} onChanged={reload} />}
    </div>
  );
}

function AssetForm({ onClose, onSaved, versionOf }: { onClose: () => void; onSaved: () => void; versionOf?: Detail }) {
  const [f, setF] = useState({ name: versionOf?.name ?? '', url: '', category: versionOf?.category ?? 'OTHER', fileType: versionOf?.fileType ?? 'IMAGE', folder: versionOf?.folder ?? '', tags: (versionOf?.tags ?? []).join(', '), description: versionOf?.description ?? '', usageRestrictions: versionOf?.usageRestrictions ?? '', expiresAt: versionOf?.expiresAt ? toLocalInput(versionOf.expiresAt) : '', note: '' });
  const { busy, error, setError, run } = useAction();
  const [up, setUp] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const upload = async (file?: File) => {
    if (!file) return;
    setUp(true); setError('');
    try { const url = await cloudinaryUpload(file); setF((x) => ({ ...x, url, fileType: 'IMAGE', name: x.name || file.name.replace(/\.[^.]+$/, '') })); } catch (e) { setError((e as Error).message); } finally { setUp(false); }
  };
  const save = () => run(async () => {
    if (versionOf) await api.post(`/admin/smois/assets/${versionOf.id}/version`, { url: f.url, note: f.note });
    else await api.post('/admin/smois/assets', { ...f, tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean), folder: f.folder || null, expiresAt: f.expiresAt ? new Date(f.expiresAt).toISOString() : null });
    onSaved();
  });
  return (
    <Modal open onClose={onClose} title={versionOf ? `New version of ${versionOf.name}` : 'Add asset'} width={560}>
      <div style={{ padding: 20 }}>
        {error && <Notice kind="error">{error}</Notice>}
        <Field label="File" hint="Upload an image, or paste a link to a file stored elsewhere (video, document, shared drive).">
          <input type="file" accept="image/*" onChange={(e) => upload(e.target.files?.[0])} style={{ fontSize: 12, marginBottom: 6 }} />{up && <span style={{ fontSize: 12 }}> Uploading…</span>}
          <Input value={f.url} onChange={set('url')} placeholder="https://…" />
        </Field>
        {!versionOf && (
          <>
            <Field label="Name"><Input value={f.name} onChange={set('name')} /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Category"><Select value={f.category} onChange={set('category')}>{CATEGORIES.map((c) => <option key={c} value={c}>{pretty(c)}</option>)}</Select></Field>
              <Field label="File type"><Select value={f.fileType} onChange={set('fileType')}>{FILE_TYPES.map((c) => <option key={c} value={c}>{pretty(c)}</option>)}</Select></Field>
              <Field label="Folder"><Input value={f.folder} onChange={set('folder')} placeholder="e.g. 2026 Promos" /></Field>
              <Field label="Tags"><Input value={f.tags} onChange={set('tags')} placeholder="promo, banner" /></Field>
              <Field label="Rights end on (if any)"><Input type="datetime-local" value={f.expiresAt} onChange={set('expiresAt')} /></Field>
              <Field label="Usage restrictions"><Input value={f.usageRestrictions} onChange={set('usageRestrictions')} placeholder="e.g. not for paid ads" /></Field>
            </div>
            <Field label="Description"><TextArea rows={2} value={f.description} onChange={set('description')} /></Field>
          </>
        )}
        {versionOf && <Field label="What changed"><Input value={f.note} onChange={set('note')} /></Field>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy || up || !f.url.trim() || (!versionOf && !f.name.trim())} onClick={save}>{busy ? 'Saving…' : versionOf ? 'Add version' : 'Add to library'}</Btn></div>
      </div>
    </Modal>
  );
}

function AssetView({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { theme: T } = useTheme();
  const { me } = useSmois();
  const { data, reload } = useLoad(() => api.get<{ data: Detail }>(`/admin/smois/assets/${id}`).then((r) => r.data), [id]);
  const { busy, error, run } = useAction();
  const [versioning, setVersioning] = useState(false);
  if (!data) return <Modal open onClose={onClose} title="Asset"><Empty>Loading…</Empty></Modal>;
  const done = () => { reload(); onChanged(); };
  const decide = (decision: string) => run(async () => { await api.post(`/admin/smois/assets/${id}/approve`, { decision }); done(); });
  return (
    <Modal open onClose={onClose} title={`${data.name} · version ${data.version}`} width={720}>
      <div style={{ padding: 20 }}>
        {error && <Notice kind="error">{error}</Notice>}
        {data.archivedAt && <Notice kind="warn">This version was replaced or archived on {fmtDate(data.archivedAt)}.</Notice>}
        {data.expiry === 'EXPIRED' && <Notice kind="error">Usage rights ended {fmtDate(data.expiresAt)}. This cannot be attached to content.</Notice>}
        {data.expiry === 'EXPIRING_SOON' && <Notice kind="warn">Rights end {fmtDate(data.expiresAt)}.</Notice>}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
          <div style={{ width: 240, height: 170, background: T.surface2, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {data.fileType === 'IMAGE'
              ? <Thumb src={data.url} alt={data.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
              : <a href={data.url} target="_blank" rel="noreferrer" style={{ color: T.primary, fontWeight: 700 }}>Open file ↗</a>}
          </div>
          <div style={{ flex: 1, minWidth: 240, fontSize: 13, color: T.textSec, lineHeight: 1.8 }}>
            <div><Pill>{pretty(data.category)}</Pill> <Pill tone={data.approvalStatus === 'APPROVED' ? 'good' : data.approvalStatus === 'REJECTED' ? 'bad' : 'neutral'}>{pretty(data.approvalStatus)}</Pill> {data.usable && <Pill tone="good">Usable in content</Pill>}</div>
            {data.description && <div>{data.description}</div>}
            {data.usageRestrictions && <div>Restrictions: <b style={{ color: T.text }}>{data.usageRestrictions}</b></div>}
            {data.folder && <div>Folder: {data.folder}</div>}
            {data.tags.length > 0 && <div>{data.tags.map((t) => <Pill key={t}>{t}</Pill>)}</div>}
            <div>Uploaded by {data.uploadedByName}{data.approvedByName ? ` · reviewed by ${data.approvedByName}` : ''}{data.fileSize ? ` · ${size(data.fileSize)}` : ''}</div>
            <div style={{ wordBreak: 'break-all' }}><a href={data.url} target="_blank" rel="noreferrer" style={{ color: T.primary, fontSize: 12 }}>{data.url}</a></div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {me?.can.approve && data.approvalStatus !== 'APPROVED' && !data.archivedAt && <Btn kind="primary" disabled={busy} onClick={() => decide('APPROVED')}>Approve</Btn>}
          {me?.can.approve && data.approvalStatus === 'DRAFT' && !data.archivedAt && <Btn kind="danger" disabled={busy} onClick={() => decide('REJECTED')}>Reject</Btn>}
          {me?.can.createContent && !data.archivedAt && <Btn onClick={() => setVersioning(true)}>Replace with a new version</Btn>}
          {me?.can.createContent && <Btn kind="ghost" disabled={busy} onClick={() => run(async () => { await api.post(`/admin/smois/assets/${id}/archive`, { restore: !!data.archivedAt }); done(); })}>{data.archivedAt ? 'Restore' : 'Archive'}</Btn>}
        </div>
        <div style={{ fontSize: 12, fontWeight: 800, color: T.textSec, textTransform: 'uppercase', margin: '8px 0' }}>Where it is used ({data.usage.length})</div>
        {data.usage.length === 0 ? <Empty>Not used in any content yet.</Empty> : data.usage.map((u) => <a key={u.id} href={`/smois/content?open=${u.contentId}`} style={{ display: 'block', fontSize: 13, color: T.text, padding: '4px 0', textDecoration: 'none' }}>{u.title} <span style={{ color: T.textMuted }}>· {pretty(u.status)}</span></a>)}
        {data.history.length > 0 && (<><div style={{ fontSize: 12, fontWeight: 800, color: T.textSec, textTransform: 'uppercase', margin: '14px 0 8px' }}>Earlier versions</div>
          {data.history.map((h) => <div key={h.id} style={{ fontSize: 12, padding: '4px 0', color: T.textSec }}>v{h.version} · {fmtDate(h.createdAt)} · {h.uploadedByName} · <a href={h.url} target="_blank" rel="noreferrer" style={{ color: T.primary }}>open ↗</a></div>)}</>)}
      </div>
      {versioning && <AssetForm versionOf={data} onClose={() => setVersioning(false)} onSaved={() => { setVersioning(false); done(); onClose(); }} />}
    </Modal>
  );
}
