'use client';
import { useState } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import {
  Btn, Empty, Field, Input, Notice, PageHeader, Pager, Pill, Select, fmtDateTime, pretty, useAction, useLoad, useSmois,
} from '@/components/smois/ui';

interface Item {
  id: string; action: string; entity: string; entityId: string; ip: string | null; createdAt: string; actorType: string;
  meta: { success?: boolean; before?: unknown; after?: unknown; device?: string; [k: string]: unknown } | null;
  user: { id: string; name: string; role: string } | null;
}

const ENTITIES = ['SmoisContent', 'SmoisTask', 'SmoisAccount', 'SmoisConversation', 'SmoisCampaign', 'SmoisAsset', 'SmoisMention', 'SmoisMember', 'SmoisAuth', 'SmoisSettings', 'SmoisCategory', 'SmoisActivity'];

export default function ActivityPage() {
  const { theme: T } = useTheme();
  const { me, people } = useSmois();
  const [f, setF] = useState({ q: '', userId: '', entity: '', action: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const { run, error: exportError } = useAction();
  const all = !!me?.can.viewAll && me.level !== 'VIEWER';

  const qs = new URLSearchParams({
    page: String(page), ...(f.q ? { q: f.q } : {}), ...(f.userId ? { userId: f.userId } : {}), ...(f.entity ? { entity: f.entity } : {}), ...(f.action ? { action: f.action } : {}),
    ...(f.from ? { from: new Date(f.from).toISOString() } : {}), ...(f.to ? { to: new Date(`${f.to}T23:59:59`).toISOString() } : {}),
  });
  const { data, loading, error } = useLoad(() => api.get<{ data: { items: Item[]; pagination: { pages: number; total: number }; actions: string[] } }>(`/admin/smois/activity?${qs}`).then((r) => r.data), [qs.toString()]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { setF({ ...f, [k]: e.target.value }); setPage(1); };

  const exportCsv = () => run(async () => {
    const q2 = new URLSearchParams(qs); q2.delete('page');
    const res = await fetch(`/api/proxy/admin/smois/activity/export?${q2}`);
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? 'Export failed');
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a'); a.href = url; a.download = `smois-activity-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  });

  return (
    <div>
      <PageHeader
        title="Activity log"
        sub={all ? 'Every significant action, who did it and when. Records cannot be edited or deleted by anyone, including through the database.' : 'Your own activity in the workspace.'}
        actions={all ? <Btn onClick={exportCsv}>Export CSV</Btn> : undefined}
      />
      {(error || exportError) && <Notice kind="error">{error || exportError}</Notice>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 12 }}>
        <Field label="Search"><Input value={f.q} onChange={set('q')} placeholder="Action, person or ID" /></Field>
        {all && <Field label="Person"><Select value={f.userId} onChange={set('userId')}><option value="">Everyone</option>{people.map((p) => <option key={p.userId} value={p.userId}>{p.name}</option>)}</Select></Field>}
        <Field label="Resource"><Select value={f.entity} onChange={set('entity')}><option value="">Any</option>{ENTITIES.map((e) => <option key={e} value={e}>{e.replace('Smois', '')}</option>)}</Select></Field>
        <Field label="Action"><Select value={f.action} onChange={set('action')}><option value="">Any</option>{data?.actions.map((a) => <option key={a} value={a}>{pretty(a)}</option>)}</Select></Field>
        <Field label="From"><Input type="date" value={f.from} onChange={set('from')} /></Field>
        <Field label="To"><Input type="date" value={f.to} onChange={set('to')} /></Field>
      </div>
      {loading && !data ? <Empty>Loading…</Empty> : data && data.items.length === 0 ? <Empty>No activity matches.</Empty> : data && (
        <>
          <div style={{ border: `1px solid ${T.border}`, borderRadius: 4, background: T.surface }}>
            {data.items.map((i) => {
              const m = i.meta ?? {};
              const hasDetail = m.before !== undefined || m.after !== undefined || Object.keys(m).some((k) => !['success', 'before', 'after', 'device'].includes(k));
              const { success, before, after, device, ...rest } = m;
              return (
                <div key={i.id} style={{ padding: '10px 14px', borderBottom: `1px solid ${T.border}` }}>
                  <div onClick={() => hasDetail && setExpanded(expanded === i.id ? null : i.id)} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', cursor: hasDetail ? 'pointer' : 'default' }}>
                    <span style={{ fontSize: 11, color: T.textMuted, minWidth: 140 }}>{fmtDateTime(i.createdAt)}</span>
                    <Pill tone={success === false ? 'bad' : 'neutral'}>{pretty(i.action)}</Pill>
                    <span style={{ fontSize: 12, color: T.text, fontWeight: 600 }}>{i.user?.name ?? (i.actorType === 'SYSTEM' ? 'System' : 'Unknown')}</span>
                    <span style={{ fontSize: 11, color: T.textSec }}>{i.entity.replace('Smois', '')} · {i.entityId.slice(0, 8)}</span>
                    {hasDetail && <span style={{ fontSize: 11, color: T.primary, marginLeft: 'auto' }}>{expanded === i.id ? 'Hide' : 'Details'}</span>}
                  </div>
                  {expanded === i.id && (
                    <pre style={{ margin: '8px 0 0', padding: 10, background: T.surface2, borderRadius: 4, fontSize: 11, color: T.textSec, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {JSON.stringify({ before, after, ...rest, ip: i.ip, device }, null, 2)}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>
          <Pager page={page} pages={data.pagination.pages} onPage={setPage} />
        </>
      )}
    </div>
  );
}
