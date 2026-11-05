'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTheme } from '@/context/ThemeContext';
import { Modal } from '@/components/ui/Modal';
import { ContentDetail } from '@/components/smois/ContentDetail';
import { api } from '@/lib/api';
import {
  Btn, Empty, Field, FORMATS, Input, Notice, PageHeader, Pager, Pill, PlatformTag, Select, StatusPill, Table, Td, TextArea,
  fmtDate, fromLocalInput, pretty, useAction, useLoad, useSmois,
} from '@/components/smois/ui';

interface Row {
  id: string; number: number; title: string; format: string; creatorName: string | null; updatedAt: string;
  category: { name: string } | null; variants: { id: string; status: string; account: { id: string; name: string; platform: string } }[];
}
interface AccountOpt { id: string; name: string; platform: string; assignments: { member: { id: string } }[] }
interface Cat { id: string; name: string; isActive: boolean }

export default function ContentPage() {
  return <Suspense fallback={<Empty>Loading…</Empty>}><ContentInner /></Suspense>;
}

function ContentInner() {
  const { theme: T } = useTheme();
  const { me } = useSmois();
  const params = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<string | null>(params.get('open'));
  useEffect(() => { setOpen(params.get('open')); }, [params]);

  const qs = new URLSearchParams({ page: String(page), ...(q ? { q } : {}), ...(status ? { status } : {}), ...(mine ? { mine: '1' } : {}) });
  const { data, loading, error, reload } = useLoad(() => api.get<{ data: { items: Row[]; pagination: { pages: number; total: number } } }>(`/admin/smois/content?${qs}`).then((r) => r.data), [qs.toString()]);

  const close = () => { setOpen(null); if (params.get('open')) router.replace('/smois/content'); };

  return (
    <div>
      <PageHeader
        title="Content"
        sub="Each brief can have a version per platform account. Every version is reviewed, scheduled and published on its own."
        actions={me?.can.createContent ? <Btn kind="primary" onClick={() => setCreating(true)}>+ New content</Btn> : undefined}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 14, alignItems: 'end' }}>
        <Field label="Search"><Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Title or caption" /></Field>
        <Field label="Status"><Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">Any</option>{['IN_PRODUCTION', 'SUBMITTED', 'REVISION_REQUESTED', 'RESUBMITTED', 'APPROVED', 'SCHEDULED', 'PUBLISHED', 'PUBLISH_FAILED', 'REJECTED', 'CANCELLED'].map((s) => <option key={s} value={s}>{pretty(s)}</option>)}</Select></Field>
        <label style={{ fontSize: 12, color: T.textSec, display: 'flex', gap: 6, alignItems: 'center', paddingBottom: 14 }}><input type="checkbox" checked={mine} onChange={(e) => { setMine(e.target.checked); setPage(1); }} /> Only mine</label>
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      {loading && !data ? <Empty>Loading…</Empty> : data && data.items.length === 0 ? <Empty>No content found.</Empty> : data && (
        <>
          <Table head={['#', 'Title', 'Versions', 'Category', 'Author', 'Updated']}>
            {data.items.map((r) => (
              <tr key={r.id} onClick={() => setOpen(r.id)} style={{ cursor: 'pointer' }}>
                <Td style={{ color: T.textSec }}>{r.number}</Td>
                <Td><b>{r.title}</b><div style={{ fontSize: 11, color: T.textSec }}>{pretty(r.format)}</div></Td>
                <Td>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {r.variants.length === 0 ? <Pill>No versions</Pill> : r.variants.map((v) => (
                      <div key={v.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}><PlatformTag platform={v.account.platform} name={v.account.name} /><StatusPill status={v.status} /></div>
                    ))}
                  </div>
                </Td>
                <Td>{r.category?.name ?? '—'}</Td>
                <Td>{r.creatorName}</Td>
                <Td style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.updatedAt)}</Td>
              </tr>
            ))}
          </Table>
          <Pager page={page} pages={data.pagination.pages} onPage={setPage} />
        </>
      )}
      {creating && <NewContent onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); reload(); setOpen(id); }} />}
      {open && <ContentDetail id={open} onClose={close} onChanged={reload} />}
    </div>
  );
}

function NewContent({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { me } = useSmois();
  const accounts = useLoad(() => api.get<{ data: AccountOpt[] }>('/admin/smois/accounts').then((r) => r.data), []);
  const cats = useLoad(() => api.get<{ data: Cat[] }>('/admin/smois/categories').then((r) => r.data), []);
  const [f, setF] = useState({ title: '', objective: '', categoryId: '', format: 'TEXT', audience: '', description: '', caption: '', hashtags: '', planned: '' });
  const [picked, setPicked] = useState<string[]>([]);
  const { busy, error, run } = useAction();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  // Managers can only use accounts they are assigned to; management and super admins any.
  const usable = (accounts.data ?? []).filter((a) => me?.level !== 'MANAGER' || a.assignments.some((x) => x.member.id === me.memberId));

  const create = () => run(async () => {
    const r = await api.post<{ data: { id: string } }>('/admin/smois/content', {
      title: f.title, objective: f.objective, categoryId: f.categoryId || null, format: f.format, audience: f.audience, description: f.description,
      variants: picked.map((accountId) => ({ accountId, caption: f.caption, hashtags: f.hashtags.split(/[\s,]+/).filter(Boolean), plannedAt: f.planned ? fromLocalInput(f.planned) : null })),
    });
    onCreated(r.data.id);
  });

  return (
    <Modal open onClose={onClose} title="New content" width={640}>
      <div style={{ padding: 20 }}>
        {error && <Notice kind="error">{error}</Notice>}
        <Field label="Title"><Input value={f.title} onChange={set('title')} placeholder="Weekend promo" /></Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Category"><Select value={f.categoryId} onChange={set('categoryId')}><option value="">—</option>{cats.data?.filter((c) => c.isActive).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          <Field label="Format"><Select value={f.format} onChange={set('format')}>{FORMATS.map((x) => <option key={x} value={x}>{pretty(x)}</option>)}</Select></Field>
        </div>
        <Field label="Objective"><Input value={f.objective} onChange={set('objective')} placeholder="What should this achieve?" /></Field>
        <Field label="Target audience"><Input value={f.audience} onChange={set('audience')} /></Field>
        <Field label="Internal description"><TextArea rows={2} value={f.description} onChange={set('description')} /></Field>
        <Field label="Post on" hint="Each account gets its own version you can tailor afterwards. Leave empty to save just the brief.">
          {usable.length === 0 ? <div style={{ fontSize: 12 }}>{accounts.loading ? 'Loading…' : 'No accounts available to you yet.'}</div> : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {usable.map((a) => (
                <label key={a.id} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
                  <input type="checkbox" checked={picked.includes(a.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, a.id] : picked.filter((x) => x !== a.id))} />
                  <PlatformTag platform={a.platform} name={a.name} />
                </label>
              ))}
            </div>
          )}
        </Field>
        {picked.length > 0 && (
          <>
            <Field label="Starting caption"><TextArea rows={4} value={f.caption} onChange={set('caption')} /></Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Hashtags"><Input value={f.hashtags} onChange={set('hashtags')} placeholder="#GoBuyMe" /></Field>
              <Field label="Planned publish time"><Input type="datetime-local" value={f.planned} onChange={set('planned')} /></Field>
            </div>
          </>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy || !f.title.trim()} onClick={create}>{busy ? 'Creating…' : 'Create'}</Btn></div>
      </div>
    </Modal>
  );
}
