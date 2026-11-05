'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTheme } from '@/context/ThemeContext';
import { ContentDetail } from '@/components/smois/ContentDetail';
import { api } from '@/lib/api';
import {
  Empty, Field, Input, Notice, PageHeader, Pager, Pill, PLATFORMS, PlatformTag, Select, StatusPill, Table, Tabs, Td,
  fmtDateTime, pretty, useLoad, useSmois,
} from '@/components/smois/ui';

interface Row {
  id: string; status: string; caption: string; publishedAt: string | null; scheduledAt: string | null; publishedUrl: string | null; emergencyBypass: boolean; publishMechanism: string | null;
  creatorName: string | null; approvedByName: string | null; publishedByName: string | null;
  account: { id: string; name: string; platform: string }; content: { id: string; title: string; category: { name: string } | null };
  lastFailure: { errorMessage: string | null; errorCode: string | null } | null;
}
type View = 'PUBLISHED' | 'PUBLISH_FAILED' | 'SCHEDULED';

export default function PublishingPage() {
  return <Suspense fallback={<Empty>Loading…</Empty>}><Inner /></Suspense>;
}

function Inner() {
  const { theme: T } = useTheme();
  const params = useSearchParams();
  const { people } = useSmois();
  const [view, setView] = useState<View>((params.get('status') as View) || 'PUBLISHED');
  const [q, setQ] = useState('');
  const [platform, setPlatform] = useState('');
  const [creatorId, setCreatorId] = useState('');
  const [from, setFrom] = useState(params.get('from') ? params.get('from')!.slice(0, 10) : '');
  const [to, setTo] = useState(params.get('to') ? params.get('to')!.slice(0, 10) : '');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);

  const qs = new URLSearchParams({
    status: view, page: String(page), ...(q ? { q } : {}), ...(platform ? { platform } : {}), ...(creatorId ? { creatorId } : {}),
    ...(from ? { from: new Date(from).toISOString() } : {}), ...(to ? { to: new Date(`${to}T23:59:59`).toISOString() } : {}),
  });
  const { data, loading, error, reload } = useLoad(() => api.get<{ data: { items: Row[]; pagination: { pages: number; total: number } } }>(`/admin/smois/publishing?${qs}`).then((r) => r.data), [qs.toString()]);

  return (
    <div>
      <PageHeader title="Publishing records" sub="The permanent record of what went out, who wrote, approved and posted it, and what failed. Records stay even if the post is later deleted on the platform." />
      <Notice kind="info">Posting is manual for now: publish on the platform, then record it here from the content screen. Entries are marked “manual” so nobody is credited for an automatic post.</Notice>
      <Tabs value={view} onChange={(v) => { setView(v); setPage(1); }} items={[{ id: 'PUBLISHED', label: 'Published' }, { id: 'SCHEDULED', label: 'Scheduled' }, { id: 'PUBLISH_FAILED', label: 'Failed' }]} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 12 }}>
        <Field label="Search"><Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Title or caption" /></Field>
        <Field label="Platform"><Select value={platform} onChange={(e) => { setPlatform(e.target.value); setPage(1); }}><option value="">All</option>{PLATFORMS.map((p) => <option key={p} value={p}>{pretty(p)}</option>)}</Select></Field>
        <Field label="Author"><Select value={creatorId} onChange={(e) => { setCreatorId(e.target.value); setPage(1); }}><option value="">Anyone</option>{people.map((p) => <option key={p.userId} value={p.userId}>{p.name}</option>)}</Select></Field>
        <Field label="From"><Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} /></Field>
        <Field label="To"><Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} /></Field>
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      {loading && !data ? <Empty>Loading…</Empty> : data && data.items.length === 0 ? <Empty>No records.</Empty> : data && (
        <>
          <Table head={[view === 'SCHEDULED' ? 'Due' : 'When', 'Post', 'Account', 'Written', 'Approved', 'Posted by', 'Status']}>
            {data.items.map((r) => {
              const overdue = view === 'SCHEDULED' && r.scheduledAt && new Date(r.scheduledAt).getTime() < Date.now();
              return (
                <tr key={r.id} onClick={() => setOpen(r.content.id)} style={{ cursor: 'pointer' }}>
                  <Td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(view === 'SCHEDULED' ? r.scheduledAt : r.publishedAt)} {overdue && <Pill tone="bad">Due</Pill>}</Td>
                  <Td>
                    <b>{r.content.title}</b>
                    <div style={{ fontSize: 11, opacity: 0.7, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.caption}</div>
                    {r.lastFailure && view === 'PUBLISH_FAILED' && <div style={{ fontSize: 11, color: T.error }}>{r.lastFailure.errorMessage}</div>}
                  </Td>
                  <Td><PlatformTag platform={r.account.platform} name={r.account.name} /></Td>
                  <Td>{r.creatorName}</Td>
                  <Td>{r.approvedByName ?? (r.emergencyBypass ? <Pill tone="bad">Bypassed</Pill> : '—')}</Td>
                  <Td>{r.publishedByName ?? '—'}{r.publishMechanism && <div style={{ fontSize: 11, opacity: 0.7 }}>{r.publishMechanism.toLowerCase()}</div>}</Td>
                  <Td>
                    <StatusPill status={r.status} />
                    {r.publishedUrl && <div><a href={r.publishedUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ fontSize: 11, color: T.primary }}>View post ↗</a></div>}
                  </Td>
                </tr>
              );
            })}
          </Table>
          <Pager page={page} pages={data.pagination.pages} onPage={setPage} />
        </>
      )}
      {open && <ContentDetail id={open} onClose={() => setOpen(null)} onChanged={reload} />}
    </div>
  );
}
