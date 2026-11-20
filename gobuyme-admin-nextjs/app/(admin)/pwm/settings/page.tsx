'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Btn, Card, Empty, Field, Grid, Input, Notice, PageHeader, Table, Td, label, useAction, useLoad } from '@/components/pwm/ui';

interface Tier { key: string; offsetDays: number; severity: string; recipients: string[]; channels: string[]; digest?: boolean; repeat?: boolean; deptHeadOnlyIfRecommendationOutstanding?: boolean }
interface Cfg {
  tiers: Tier[]; sendHour: number; ackEscalationHours: number; repeatEveryWorkingDays: number; superAdminAfterWorkingDays: number; probationReminderDays: number; certificationReminderDays: number; documentReminderDays: number;
  perDiemRate: number; warningValidityMonths: number; surveyMinGroup: number; expenseCategories: { key: string; label: string; limit: number }[];
  holidays: string[]; employeeIdPrefix: string; contractRefPrefix: string; employeeRecipientOn: boolean; allowSelfApproval: boolean; minWorkingAge: number; approvalRequiredTypes: string[];
  contractTypes: { key: string; label: string; expiryRequired: boolean }[];
}
const ROLES = ['HR_OFFICER', 'HR_ADMIN', 'DEPT_HEAD', 'MANAGEMENT', 'MD', 'SUPER_ADMIN', 'EMPLOYEE'];
const SEV = ['EARLY', 'ACTION', 'URGENT', 'CRITICAL'];

export default function SettingsPage() {
  const { data, loading, error, reload } = useLoad(() => api.get<{ data: Cfg }>('/admin/pwm/settings').then((r) => r.data), []);
  const [c, setC] = useState<Cfg | null>(null);
  const [saved, setSaved] = useState('');
  const { busy, error: actionError, run } = useAction();
  useEffect(() => { if (data) setC(data); }, [data]);
  if (loading && !c) return <Empty>Loading…</Empty>;
  if (!c) return <Notice kind="error">{error || 'Settings are not available to you.'}</Notice>;
  const num = (k: keyof Cfg) => (e: React.ChangeEvent<HTMLInputElement>) => setC({ ...c, [k]: Number(e.target.value) });
  const tier = (i: number, patch: Partial<Tier>) => setC({ ...c, tiers: c.tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const save = () => run(async () => {
    await api.patch('/admin/pwm/settings', { tiers: c.tiers, sendHour: c.sendHour, ackEscalationHours: c.ackEscalationHours, repeatEveryWorkingDays: c.repeatEveryWorkingDays, superAdminAfterWorkingDays: c.superAdminAfterWorkingDays,
      probationReminderDays: c.probationReminderDays, certificationReminderDays: c.certificationReminderDays, documentReminderDays: c.documentReminderDays, holidays: c.holidays, employeeRecipientOn: c.employeeRecipientOn,
      allowSelfApproval: c.allowSelfApproval, approvalRequiredTypes: c.approvalRequiredTypes, perDiemRate: c.perDiemRate, warningValidityMonths: c.warningValidityMonths, surveyMinGroup: c.surveyMinGroup, expenseCategories: c.expenseCategories, employeeIdPrefix: c.employeeIdPrefix, contractRefPrefix: c.contractRefPrefix });
    setSaved('Saved. The change is in the audit log and applies to the next reminder run.'); reload();
  });
  return (
    <div>
      <PageHeader title="Settings" sub="Reminder schedules, recipients and rules live here as data. Changes need no code and are recorded in the activity log." actions={<Btn kind="primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save changes'}</Btn>} />
      {(actionError) && <Notice kind="error">{actionError}</Notice>}{saved && <Notice kind="success">{saved}</Notice>}
      <Card title="Contract expiry reminder tiers">
        <Table head={['Tier', 'Days before expiry', 'Severity', 'Recipients', 'Channels']}>
          {c.tiers.map((t, i) => (
            <tr key={t.key}>
              <Td><b>{t.key}</b>{t.repeat && <div style={{ fontSize: 11 }}>repeats</div>}{t.digest && <div style={{ fontSize: 11 }}>management digest</div>}</Td>
              <Td><Input type="number" style={{ width: 80 }} value={t.offsetDays} disabled={t.repeat} onChange={(e) => tier(i, { offsetDays: Number(e.target.value) })} /></Td>
              <Td><select value={t.severity} onChange={(e) => tier(i, { severity: e.target.value })}>{SEV.map((s) => <option key={s}>{s}</option>)}</select></Td>
              <Td><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>{ROLES.map((r) => <label key={r}><input type="checkbox" checked={t.recipients.includes(r)} onChange={() => tier(i, { recipients: toggle(t.recipients, r) })} /> {label(r)}</label>)}</div></Td>
              <Td><div style={{ display: 'flex', gap: 8, fontSize: 12 }}>{['IN_APP', 'EMAIL'].map((ch) => <label key={ch}><input type="checkbox" checked={t.channels.includes(ch)} onChange={() => tier(i, { channels: toggle(t.channels, ch) })} /> {label(ch)}</label>)}</div></Td>
            </tr>
          ))}
        </Table>
        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 8 }}>SMS and WhatsApp are not connected yet. Days after expiry (T0, T+1) use 0 and -1. A role with nobody in it falls back to the HR administrators and raises a configuration alert.</div>
      </Card>
      <div style={{ marginTop: 14 }}><Card title="Timing">
        <Grid cols={3}>
          <Field label="Daily send hour (Lagos)"><Input type="number" value={c.sendHour} onChange={num('sendHour')} /></Field>
          <Field label="Acknowledge within (hours)" hint="Then it escalates"><Input type="number" value={c.ackEscalationHours} onChange={num('ackEscalationHours')} /></Field>
          <Field label="Repeat after expiry every (working days)"><Input type="number" value={c.repeatEveryWorkingDays} onChange={num('repeatEveryWorkingDays')} /></Field>
          <Field label="Escalate to super admin after (working days)"><Input type="number" value={c.superAdminAfterWorkingDays} onChange={num('superAdminAfterWorkingDays')} /></Field>
          <Field label="Probation reminder (days before)"><Input type="number" value={c.probationReminderDays} onChange={num('probationReminderDays')} /></Field>
          <Field label="Certification reminder (days)"><Input type="number" value={c.certificationReminderDays} onChange={num('certificationReminderDays')} /></Field>
          <Field label="Document expiry reminder (days)"><Input type="number" value={c.documentReminderDays} onChange={num('documentReminderDays')} /></Field>
        </Grid>
        <Field label="Public holidays (YYYY-MM-DD, comma separated)" hint="Skipped when counting working days."><Input value={c.holidays.join(', ')} onChange={(e) => setC({ ...c, holidays: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} /></Field>
      </Card></div>
      <div style={{ marginTop: 14 }}><Card title="Expenses, warnings and surveys">
        <Grid cols={3}><Field label="Per diem per travel day (₦)"><Input type="number" value={c.perDiemRate} onChange={num('perDiemRate')} /></Field><Field label="Warnings stay valid (months)" hint="Then marked spent"><Input type="number" value={c.warningValidityMonths} onChange={num('warningValidityMonths')} /></Field><Field label="Smallest survey group shown"><Input type="number" value={c.surveyMinGroup} onChange={num('surveyMinGroup')} /></Field></Grid>
        <Field label="Expense categories and the most one item may claim without an explanation (0 = no limit)">{c.expenseCategories.map((x, i) => <div key={x.key} style={{ display: 'flex', gap: 8, marginBottom: 6 }}><Input value={x.label} onChange={(e) => setC({ ...c, expenseCategories: c.expenseCategories.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)) })} /><Input type="number" value={x.limit} onChange={(e) => setC({ ...c, expenseCategories: c.expenseCategories.map((y, j) => (j === i ? { ...y, limit: Number(e.target.value) } : y)) })} style={{ maxWidth: 140 }} /></div>)}</Field>
      </Card></div>
      <div style={{ marginTop: 14 }}><Card title="Rules">
        <Grid cols={3}><Field label="Employee ID prefix"><Input value={c.employeeIdPrefix} onChange={(e) => setC({ ...c, employeeIdPrefix: e.target.value })} /></Field><Field label="Contract reference prefix"><Input value={c.contractRefPrefix} onChange={(e) => setC({ ...c, contractRefPrefix: e.target.value })} /></Field></Grid>
        <label style={{ display: 'flex', gap: 8, fontSize: 13, margin: '6px 0' }}><input type="checkbox" checked={c.employeeRecipientOn} onChange={(e) => setC({ ...c, employeeRecipientOn: e.target.checked })} />Also remind the employee about their own contract expiry</label>
        <label style={{ display: 'flex', gap: 8, fontSize: 13, margin: '6px 0' }}><input type="checkbox" checked={c.allowSelfApproval} onChange={(e) => setC({ ...c, allowSelfApproval: e.target.checked })} />Allow one person to start and approve a suspension or termination (turn on only for very small teams)</label>
        <Field label="Contract types that need management approval before issue">
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 13 }}>{c.contractTypes.map((t) => <label key={t.key}><input type="checkbox" checked={c.approvalRequiredTypes.includes(t.key)} onChange={() => setC({ ...c, approvalRequiredTypes: toggle(c.approvalRequiredTypes, t.key) })} /> {t.label}</label>)}</div>
        </Field>
      </Card></div>
    </div>
  );
}
