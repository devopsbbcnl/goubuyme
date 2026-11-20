'use client';
import { useState } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';
import { Btn, Card, ContractStatusPill, Empty, Field, Grid, Input, Notice, PageHeader, Select, Table, Td, fmtDate, label, uploadDocument, useAction, useLoad } from '@/components/pwm/ui';

interface C { id: string; reference: string; contractType: string; status: string; commencementDate: string; expiryDate: string | null; signedDate: string | null; documentUrl: string | null }
interface D { id: string; name: string; category: string; version: number; expiryDate: string | null; url: string; createdAt: string }

export default function MyDocuments() {
  const { theme: T } = useTheme();
  const contracts = useLoad(() => api.get<{ data: C[] }>('/my-hr/contracts').then((r) => r.data), []);
  const docs = useLoad(() => api.get<{ data: D[] }>('/my-hr/documents').then((r) => r.data), []);
  const [f, setF] = useState({ name: '', category: 'Qualification', expiryDate: '' });
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState('');
  const { busy, error, run } = useAction();
  const send = () => run(async () => {
    if (!file) throw new Error('Choose a file first.');
    const up = await uploadDocument(file);
    const r = await api.post<{ message: string }>('/my-hr/documents', { ...f, expiryDate: f.expiryDate || undefined, url: up.url, checksum: up.checksum });
    setMsg(r.message); setFile(null); setF({ name: '', category: 'Qualification', expiryDate: '' }); docs.reload();
  });
  return (
    <div>
      <PageHeader title="My documents" sub="Your contracts and the documents HR holds for you. Send HR a new certificate or ID when you have one." />
      {(error || contracts.error) && <Notice kind="error">{error || contracts.error}</Notice>}{msg && <Notice kind="success">{msg}</Notice>}
      <Card title="Contracts">
        {!contracts.data?.length ? <Empty>No contracts to show.</Empty> : (
          <Table head={['Reference', 'Type', 'Status', 'Start', 'End', 'Signed copy']}>
            {contracts.data.map((c) => <tr key={c.id}><Td><b>{c.reference}</b></Td><Td>{label(c.contractType)}</Td><Td><ContractStatusPill status={c.status} /></Td><Td>{fmtDate(c.commencementDate)}</Td><Td>{c.expiryDate ? fmtDate(c.expiryDate) : 'No end date'}</Td><Td>{c.documentUrl ? <a href={c.documentUrl} target="_blank" rel="noreferrer" style={{ color: T.primary, fontWeight: 700 }}>Open</a> : '—'}</Td></tr>)}
          </Table>
        )}
      </Card>
      <div style={{ marginTop: 14 }}>
        <Card title="Documents on file">
          {!docs.data?.length ? <Empty>Nothing yet.</Empty> : (
            <Table head={['Name', 'Category', 'Version', 'Expires', 'Added', '']}>
              {docs.data.map((d) => <tr key={d.id}><Td><b>{d.name}</b></Td><Td>{d.category}</Td><Td>v{d.version}</Td><Td>{d.expiryDate ? fmtDate(d.expiryDate) : '—'}</Td><Td>{fmtDate(d.createdAt)}</Td><Td><a href={d.url} target="_blank" rel="noreferrer" style={{ color: T.primary, fontWeight: 700 }}>Open</a></Td></tr>)}
            </Table>
          )}
        </Card>
      </div>
      <div style={{ marginTop: 14 }}>
        <Card title="Send HR a document">
          <Grid cols={3}>
            <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. HND certificate" /></Field>
            <Field label="Type"><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{['Identification', 'Qualification', 'Certification', 'Guarantor', 'Other'].map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <Field label="Expiry date (if any)"><Input type="date" value={f.expiryDate} onChange={(e) => setF({ ...f, expiryDate: e.target.value })} /></Field>
          </Grid>
          <Field label="File (PDF or image, up to 10 MB)"><input type="file" accept=".pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
          <Btn kind="primary" disabled={busy || !f.name || !file} onClick={send}>{busy ? 'Uploading…' : 'Send'}</Btn>
        </Card>
      </div>
    </div>
  );
}
