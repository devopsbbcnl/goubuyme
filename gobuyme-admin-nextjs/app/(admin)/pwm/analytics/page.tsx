'use client';
import { useState } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { Card, Empty, Notice, PageHeader, Stat, Tabs, useLoad } from '@/components/pwm/ui';

type Tab = 'scorecards' | 'workforce';
interface Card_ { id: string; name: string; headcount: number; openVacancies: number; turnoverPct: number | null; reviewCompletionPct: number | null; averageRating: number | null; absenteeismPct: number | null; latePct: number | null; trainingCompliancePct: number | null }
interface WF { series: { month: string; headcount: number; hires: number; leavers: number }[]; headcount: number; turnoverPct12m: number | null; retentionPct12m: number | null; averageTenureYears: number | null; tenureBands: { name: string; count: number }[]; byDepartment: { name: string; count: number }[]; byType: { name: string; count: number }[]; note: string }

export default function AnalyticsPage() {
  const [tab, setTab] = useState<Tab>('scorecards');
  return (
    <div>
      <PageHeader title="HR intelligence" sub="Department scorecards and workforce trends, built from the records." />
      <Tabs<Tab> value={tab} onChange={setTab} items={[{ id: 'scorecards', label: 'Department scorecards' }, { id: 'workforce', label: 'Workforce' }]} />
      {tab === 'scorecards' ? <Scorecards /> : <Workforce />}
    </div>
  );
}

function Scorecards() {
  const { theme: T } = useTheme();
  const { data, loading, error } = useLoad(() => api.get<{ data: { cycle: string | null; note: string; departments: Card_[] } }>('/admin/pwm/analytics/scorecards').then((r) => r.data), []);
  if (loading && !data) return <Empty>Loading…</Empty>;
  if (error || !data) return <Notice kind="error">{error || 'Not available.'}</Notice>;
  // Higher is better for the first set, lower is better for the second.
  const heat = (v: number | null, goodHigh: boolean, good: number, bad: number): React.CSSProperties => {
    if (v === null) return { color: T.textMuted };
    const ok = goodHigh ? v >= good : v <= good; const poor = goodHigh ? v < bad : v > bad;
    return { background: ok ? T.successBg : poor ? T.errorBg : T.warningBg, color: ok ? T.success : poor ? T.error : T.warning, fontWeight: 700, borderRadius: 4, padding: '3px 8px', display: 'inline-block' };
  };
  const pct = (v: number | null) => (v === null ? '—' : `${v}%`);
  return (
    <div>
      <Notice kind="info">{data.note}{data.cycle ? ` Reviews are from the latest cycle: ${data.cycle}.` : ''}</Notice>
      {data.departments.length === 0 ? <Empty>No departments.</Empty> : (
        <div style={{ overflowX: 'auto', border: `1px solid ${T.border}`, borderRadius: 4, background: T.surface }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr>{['Department', 'People', 'Open roles', 'Turnover (12m)', 'Reviews done', 'Avg rating', 'Absence (30d)', 'Late (30d)', 'Mandatory training'].map((h) => <th key={h} style={{ textAlign: 'left', padding: '10px 12px', fontSize: 11, textTransform: 'uppercase', color: T.textSec, borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' }}>{h}</th>)}</tr></thead>
            <tbody>{data.departments.map((d) => (
              <tr key={d.id}><td style={{ padding: '10px 12px', fontWeight: 700, color: T.text }}>{d.name}</td><td style={{ padding: '10px 12px', color: T.text }}>{d.headcount}</td><td style={{ padding: '10px 12px', color: T.text }}>{d.openVacancies}</td>
                <td style={{ padding: '10px 12px' }}><span style={heat(d.turnoverPct, false, 10, 20)}>{pct(d.turnoverPct)}</span></td><td style={{ padding: '10px 12px' }}><span style={heat(d.reviewCompletionPct, true, 90, 60)}>{pct(d.reviewCompletionPct)}</span></td>
                <td style={{ padding: '10px 12px', color: T.text }}>{d.averageRating ?? '—'}</td><td style={{ padding: '10px 12px' }}><span style={heat(d.absenteeismPct, false, 2, 5)}>{pct(d.absenteeismPct)}</span></td><td style={{ padding: '10px 12px' }}><span style={heat(d.latePct, false, 5, 15)}>{pct(d.latePct)}</span></td><td style={{ padding: '10px 12px' }}><span style={heat(d.trainingCompliancePct, true, 95, 70)}>{pct(d.trainingCompliancePct)}</span></td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Workforce() {
  const { theme: T } = useTheme();
  const [months, setMonths] = useState(12);
  const { data, loading, error } = useLoad(() => api.get<{ data: WF }>(`/admin/pwm/analytics/workforce?months=${months}`).then((r) => r.data), [months]);
  if (loading && !data) return <Empty>Loading…</Empty>;
  if (error || !data) return <Notice kind="error">{error || 'Not available.'}</Notice>;
  const maxHc = Math.max(1, ...data.series.map((s) => s.headcount));
  const maxMove = Math.max(1, ...data.series.flatMap((s) => [s.hires, s.leavers]));
  const bars = (rows: { name: string; count: number }[]) => { const max = Math.max(1, ...rows.map((r) => r.count)); return rows.map((r) => <div key={r.name} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 30px', gap: 8, alignItems: 'center', padding: '3px 0', fontSize: 12 }}><span style={{ color: T.textSec, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name.replace(/_/g, ' ')}</span><div style={{ background: T.surface2, borderRadius: 4, height: 10 }}><div style={{ width: `${(r.count / max) * 100}%`, background: T.primary, height: 10, borderRadius: 4 }} /></div><b style={{ color: T.text }}>{r.count}</b></div>); };
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 14 }}>
        <Stat label="Current headcount" value={data.headcount} /><Stat label="Turnover (12 months)" value={data.turnoverPct12m === null ? 'n/a' : `${data.turnoverPct12m}%`} /><Stat label="Retention" value={data.retentionPct12m === null ? 'n/a' : `${data.retentionPct12m}%`} /><Stat label="Average tenure" value={data.averageTenureYears === null ? 'n/a' : `${data.averageTenureYears} yrs`} />
      </div>
      <div style={{ maxWidth: 160, marginBottom: 10 }}><select value={months} onChange={(e) => setMonths(Number(e.target.value))}>{[6, 12, 24, 36].map((m) => <option key={m} value={m}>Last {m} months</option>)}</select></div>
      <Card title="Headcount, hires and leavers by month">
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 170, overflowX: 'auto' }}>
          {data.series.map((s) => (
            <div key={s.month} style={{ flex: '1 0 38px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: T.textSec }}>{s.headcount}</div>
              <div style={{ height: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}><div title={`${s.headcount} people`} style={{ width: 22, height: `${(s.headcount / maxHc) * 100}%`, background: T.primary, borderRadius: '4px 4px 0 0' }} /></div>
              <div style={{ display: 'flex', gap: 2, justifyContent: 'center', alignItems: 'flex-end', height: 28 }}><div title={`${s.hires} hired`} style={{ width: 8, height: `${(s.hires / maxMove) * 100}%`, minHeight: s.hires ? 3 : 0, background: T.success }} /><div title={`${s.leavers} left`} style={{ width: 8, height: `${(s.leavers / maxMove) * 100}%`, minHeight: s.leavers ? 3 : 0, background: T.error }} /></div>
              <div style={{ fontSize: 9, color: T.textMuted }}>{s.month.slice(2)}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: T.textSec, marginTop: 6 }}>Orange: headcount at month end · green: hires · red: leavers</div>
      </Card>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12, marginTop: 12 }}>
        <Card title="Tenure">{bars(data.tenureBands)}</Card><Card title="By department">{bars(data.byDepartment)}</Card><Card title="By employment type">{bars(data.byType)}</Card>
      </div>
      <div style={{ fontSize: 11, color: T.textMuted, marginTop: 10 }}>{data.note}</div>
    </div>
  );
}
