'use client';
import { useState } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { Empty, Input, Notice, PageHeader, useDebounced, useLoad } from '@/components/pwm/ui';

interface P { id: string; firstName: string; lastName: string; jobTitle: string; managerId: string | null; department: { name: string } | null }

export default function Directory() {
  const { theme: T } = useTheme();
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const { data, loading, error } = useLoad(() => api.get<{ data: P[] }>(`/my-hr/directory${dq ? `?q=${encodeURIComponent(dq)}` : ''}`).then((r) => r.data), [dq]);
  const byId = new Map((data ?? []).map((p) => [p.id, p]));
  return (
    <div>
      <PageHeader title="Staff directory" sub="Find a colleague by name or job title. Only names, titles and departments are shown." />
      {error && <Notice kind="error">{error}</Notice>}
      <div style={{ maxWidth: 360, marginBottom: 14 }}><Input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {loading && !data ? <Empty>Loading…</Empty> : !data?.length ? <Empty>No one matches.</Empty> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 10 }}>
          {data.map((p) => (
            <div key={p.id} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, padding: 12 }}>
              <div style={{ fontWeight: 700, color: T.text, fontSize: 14 }}>{p.firstName} {p.lastName}</div>
              <div style={{ fontSize: 12, color: T.textSec }}>{p.jobTitle}</div>
              <div style={{ fontSize: 12, color: T.textMuted }}>{p.department?.name ?? ''}{p.managerId && byId.get(p.managerId) ? ` · reports to ${byId.get(p.managerId)?.firstName} ${byId.get(p.managerId)?.lastName}` : ''}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
