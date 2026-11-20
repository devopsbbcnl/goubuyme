'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { Empty, Input, Notice, PageHeader, Pill, Select, useLoad } from '@/components/pwm/ui';

interface N { id: string; firstName: string; lastName: string; jobTitle: string; managerId: string | null; status: string; department: { id: string; name: string } | null }

export default function OrgChartPage() {
  const { theme: T } = useTheme();
  const { data, loading, error } = useLoad(() => api.get<{ data: N[] }>('/admin/pwm/org-chart').then((r) => r.data), []);
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const { roots, kids, depts } = useMemo(() => {
    const byId = new Map((data ?? []).map((n) => [n.id, n]));
    const kids = new Map<string, N[]>();
    const roots: N[] = [];
    for (const n of data ?? []) {
      if (n.managerId && byId.has(n.managerId)) kids.set(n.managerId, [...(kids.get(n.managerId) ?? []), n]);
      else roots.push(n);
    }
    return { roots, kids, depts: [...new Set((data ?? []).map((n) => n.department?.name).filter(Boolean) as string[])].sort() };
  }, [data]);
  const match = (n: N) => (!q || `${n.firstName} ${n.lastName} ${n.jobTitle}`.toLowerCase().includes(q.toLowerCase())) && (!dept || n.department?.name === dept);
  const anyMatch = (n: N): boolean => match(n) || (kids.get(n.id) ?? []).some(anyMatch);
  const render = (n: N, depth: number): React.ReactNode => {
    if (!anyMatch(n)) return null;
    const ch = kids.get(n.id) ?? [];
    const open = !collapsed[n.id];
    return (
      <div key={n.id} style={{ marginLeft: depth ? 22 : 0, borderLeft: depth ? `2px solid ${T.border}` : 'none', paddingLeft: depth ? 12 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
          {ch.length > 0 ? <button onClick={() => setCollapsed({ ...collapsed, [n.id]: open })} style={{ all: 'unset', cursor: 'pointer', width: 18, color: T.textSec }}>{open ? '▾' : '▸'}</button> : <span style={{ width: 18 }} />}
          <div style={{ background: T.surface, border: `1px solid ${match(n) && (q || dept) ? T.primary : T.border}`, borderRadius: 4, padding: '8px 12px', minWidth: 260 }}>
            <Link href={`/pwm/employees/${n.id}`} style={{ fontWeight: 700, color: T.text, textDecoration: 'none', fontSize: 13 }}>{n.firstName} {n.lastName}</Link>
            <div style={{ fontSize: 11, color: T.textSec }}>{n.jobTitle}{n.department ? ` · ${n.department.name}` : ''}</div>
          </div>
          {ch.length > 0 && <Pill>{ch.length} report{ch.length === 1 ? '' : 's'}</Pill>}
        </div>
        {open && ch.map((c) => render(c, depth + 1))}
      </div>
    );
  };
  return (
    <div>
      <PageHeader title="Organisation chart" sub="Who reports to whom, built from each person's reporting manager. People with no manager set appear at the top." />
      {error && <Notice kind="error">{error}</Notice>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, maxWidth: 560, marginBottom: 14 }}>
        <Input placeholder="Find a person or title" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={dept} onChange={(e) => setDept(e.target.value)}><option value="">All departments</option>{depts.map((d) => <option key={d}>{d}</option>)}</Select>
      </div>
      {loading && !data ? <Empty>Loading…</Empty> : roots.length === 0 ? <Empty>No employees yet.</Empty> : <div>{roots.map((r) => render(r, 0))}</div>}
    </div>
  );
}
