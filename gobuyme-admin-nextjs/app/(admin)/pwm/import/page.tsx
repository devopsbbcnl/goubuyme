'use client';
import { useState } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { Btn, Card, Notice, PageHeader, Pill, Stat, TextArea, useAction } from '@/components/pwm/ui';

const COLUMNS = ['firstName', 'lastName', 'middleName', 'title', 'workEmail', 'personalEmail', 'phone', 'department', 'jobTitle', 'employmentType', 'hireDate', 'status', 'location', 'contractStart', 'contractExpiry', 'probationEndDate'];
const SAMPLE = `${COLUMNS.join(',')}\nAda,Obi,,Ms,ada@company.com,ada@example.com,08031234567,Operations,Analyst,Fixed-term,2025-03-01,Active,Lagos,2025-03-01,2026-02-28,`;

/** Minimal CSV reader: quoted fields, commas and doubled quotes. */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []; let row: string[] = []; let cur = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some((c) => c.trim())) rows.push(row); row = []; }
    else cur += ch;
  }
  row.push(cur); if (row.some((c) => c.trim())) rows.push(row);
  const [head, ...rest] = rows;
  if (!head) return [];
  const keys = head.map((h) => h.trim());
  return rest.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

interface Report { row: number; ok: boolean; errors: string[]; warnings: string[] }
interface Result { dryRun: boolean; summary: { total: number; valid: number; invalid: number; imported?: number; contractsExpiring30?: number; contractsExpired?: number }; report: Report[] }

export default function ImportPage() {
  const { theme: T } = useTheme();
  const [text, setText] = useState('');
  const [res, setRes] = useState<Result | null>(null);
  const [done, setDone] = useState('');
  const { busy, error, run } = useAction();
  const rows = parseCsv(text);
  const send = (dryRun: boolean) => run(async () => {
    const r = await api.post<{ message: string; data: Result }>('/admin/pwm/import/employees', { rows, dryRun, skipInvalid: true });
    setRes(r.data); if (!dryRun) setDone(r.message);
  });
  return (
    <div>
      <PageHeader title="Bulk import" sub="Bring existing staff and their current contracts in from a spreadsheet. Always run the check first: nothing is saved until you import." />
      {error && <Notice kind="error">{error}</Notice>}{done && <Notice kind="success">{done} Contracts are recorded as Active with an expiry date; attach the signed copies afterwards. One summary message is sent instead of an alert per contract.</Notice>}
      <Card title="1. Paste your CSV">
        <div style={{ fontSize: 12, color: T.textSec, marginBottom: 8 }}>First row must be the column names. Required: firstName, lastName, department (must already exist), jobTitle, employmentType, hireDate (YYYY-MM-DD). Fixed-term types also need contractExpiry. Departments and employment types are matched by name.</div>
        <TextArea rows={9} value={text} onChange={(e) => { setText(e.target.value); setRes(null); setDone(''); }} placeholder={SAMPLE} style={{ fontFamily: 'monospace', fontSize: 12 }} />
        <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
          <Btn disabled={busy || !rows.length} onClick={() => send(true)}>Check (nothing saved)</Btn>
          <Btn kind="primary" disabled={busy || !res || res.summary.valid === 0 || !res.dryRun} onClick={() => send(false)}>Import valid rows</Btn>
          <span style={{ fontSize: 12, color: T.textSec }}>{rows.length} rows read</span>
          <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(SAMPLE)}`} download="pwm-import-template.csv" style={{ fontSize: 12, color: T.primary, marginLeft: 'auto' }}>Download template</a>
        </div>
      </Card>
      {res && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 12 }}>
            <Stat label="Rows" value={res.summary.total} /><Stat label="Ready" value={res.summary.valid} /><Stat label="Problems" value={res.summary.invalid} />
            {res.summary.imported !== undefined && <Stat label="Imported" value={res.summary.imported} sub={`${res.summary.contractsExpiring30 ?? 0} expire in 30 days, ${res.summary.contractsExpired ?? 0} already expired`} />}
          </div>
          {res.report.filter((r) => !r.ok || r.warnings.length).length > 0 && (
            <Card title="Rows to look at">
              {res.report.filter((r) => !r.ok || r.warnings.length).map((r) => (
                <div key={r.row} style={{ padding: '6px 0', borderBottom: `1px solid ${T.border}`, fontSize: 13, color: T.text }}>
                  <Pill tone={r.ok ? 'warn' : 'bad'}>Row {r.row}</Pill> {[...r.errors, ...r.warnings].join(' ')}
                </div>
              ))}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
