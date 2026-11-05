'use client';
import { useEffect, useState } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { Btn, Card, Empty, Field, Input, Notice, PageHeader, Pill, useAction, useLoad } from '@/components/smois/ui';

interface Settings { requireApproval: boolean; allowSelfApproval: boolean; minPostGapMinutes: number; approvalReminderHours: number }
interface Cat { id: string; name: string; isActive: boolean }

export default function SmoisSettingsPage() {
  const { theme: T } = useTheme();
  const settings = useLoad(() => api.get<{ data: Settings }>('/admin/smois/settings').then((r) => r.data), []);
  const cats = useLoad(() => api.get<{ data: Cat[] }>('/admin/smois/categories').then((r) => r.data), []);
  const [s, setS] = useState<Settings | null>(null);
  const [newCat, setNewCat] = useState('');
  const { busy, error, run } = useAction();
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (settings.data) setS(settings.data); }, [settings.data]);

  const save = () => run(async () => {
    await api.patch('/admin/smois/settings', s);
    setSaved(true); setTimeout(() => setSaved(false), 2500); settings.reload();
  });

  return (
    <div>
      <PageHeader title="Social media settings" sub="Workflow rules and content categories. Every change is recorded in the activity log." />
      {error && <Notice kind="error">{error}</Notice>}
      {!s ? <Empty>Loading…</Empty> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, alignItems: 'start' }}>
          <Card title="Approval and scheduling">
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, marginBottom: 14 }}>
              <input type="checkbox" checked={s.requireApproval} onChange={(e) => setS({ ...s, requireApproval: e.target.checked })} style={{ marginTop: 3 }} />
              <span><b>Approval is mandatory</b><br /><span style={{ color: T.textSec, fontSize: 12 }}>Only approved content can be scheduled or recorded as published. Emergency bypass stays available to people granted it.</span></span>
            </label>
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, marginBottom: 14 }}>
              <input type="checkbox" checked={s.allowSelfApproval} onChange={(e) => setS({ ...s, allowSelfApproval: e.target.checked })} style={{ marginTop: 3 }} />
              <span><b>Allow approving your own submissions</b><br /><span style={{ color: T.textSec, fontSize: 12 }}>Off by default. Turn on only for a team too small to have a second reviewer.</span></span>
            </label>
            <Field label="Minimum gap between posts on one account (minutes)"><Input type="number" min={0} max={1440} value={s.minPostGapMinutes} onChange={(e) => setS({ ...s, minPostGapMinutes: Number(e.target.value) })} /></Field>
            <Field label="Remind reviewers after (hours waiting)"><Input type="number" min={1} max={168} value={s.approvalReminderHours} onChange={(e) => setS({ ...s, approvalReminderHours: Number(e.target.value) })} /></Field>
            <Btn kind="primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : saved ? 'Saved ✓' : 'Save settings'}</Btn>
          </Card>

          <Card title="Content categories">
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <Input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="New category" />
              <Btn kind="primary" disabled={busy || !newCat.trim()} onClick={() => run(async () => { await api.post('/admin/smois/categories', { name: newCat }); setNewCat(''); cats.reload(); })}>Add</Btn>
            </div>
            {cats.data?.map((c) => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderTop: `1px solid ${T.border}`, fontSize: 13, opacity: c.isActive ? 1 : 0.5 }}>
                <span>{c.name} {!c.isActive && <Pill>Hidden</Pill>}</span>
                <Btn small kind="ghost" onClick={() => run(async () => { await api.patch(`/admin/smois/categories/${c.id}`, { isActive: !c.isActive }); cats.reload(); })}>{c.isActive ? 'Hide' : 'Show'}</Btn>
              </div>
            ))}
          </Card>
        </div>
      )}
    </div>
  );
}
