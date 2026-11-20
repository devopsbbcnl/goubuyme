'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Btn, Card, Empty, Field, Grid, Input, Notice, PageHeader, useAction, useLoad } from '@/components/pwm/ui';

interface Me { profile: { fullName: string; phone: string | null; personalEmail: string | null; address: string | null; knownAs: string | null; emergencyContacts: { name?: string; relationship?: string; phone?: string }[] | null; workEmail: string | null } }

export default function MyProfile() {
  const me = useLoad(() => api.get<{ data: Me }>('/my-hr/me').then((r) => r.data), []);
  const [f, setF] = useState({ phone: '', personalEmail: '', address: '', knownAs: '', ecName: '', ecRel: '', ecPhone: '' });
  const [bank, setBank] = useState({ bankName: '', bankAccountNo: '', bankAccountName: '' });
  const [msg, setMsg] = useState('');
  const { busy, error, run } = useAction();
  useEffect(() => {
    const p = me.data?.profile;
    if (p) setF({ phone: p.phone ?? '', personalEmail: p.personalEmail ?? '', address: p.address ?? '', knownAs: p.knownAs ?? '', ecName: p.emergencyContacts?.[0]?.name ?? '', ecRel: p.emergencyContacts?.[0]?.relationship ?? '', ecPhone: p.emergencyContacts?.[0]?.phone ?? '' });
  }, [me.data]);
  if (me.loading && !me.data) return <Empty>Loading…</Empty>;
  const save = () => run(async () => {
    await api.patch('/my-hr/profile', { phone: f.phone, personalEmail: f.personalEmail || null, address: f.address, knownAs: f.knownAs, emergencyContacts: f.ecName ? [{ name: f.ecName, relationship: f.ecRel, phone: f.ecPhone }] : [] });
    setMsg('Saved.');
  });
  const sendBank = () => run(async () => { const r = await api.post<{ message: string }>('/my-hr/bank-change', bank); setMsg(r.message); setBank({ bankName: '', bankAccountNo: '', bankAccountName: '' }); });
  return (
    <div>
      <PageHeader title="My profile" sub="Keep your contact details and emergency contact up to date. Your name, job title and department are changed by HR." />
      {error && <Notice kind="error">{error}</Notice>}{msg && <Notice kind="success">{msg}</Notice>}
      <Card title="Contact details">
        <Grid>
          <Field label="Known as"><Input value={f.knownAs} onChange={(e) => setF({ ...f, knownAs: e.target.value })} /></Field>
          <Field label="Phone"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <Field label="Personal email"><Input type="email" value={f.personalEmail} onChange={(e) => setF({ ...f, personalEmail: e.target.value })} /></Field>
          <Field label="Address"><Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
          <Field label="Emergency contact"><Input value={f.ecName} onChange={(e) => setF({ ...f, ecName: e.target.value })} /></Field>
          <Field label="Relationship"><Input value={f.ecRel} onChange={(e) => setF({ ...f, ecRel: e.target.value })} /></Field>
          <Field label="Emergency phone"><Input value={f.ecPhone} onChange={(e) => setF({ ...f, ecPhone: e.target.value })} /></Field>
        </Grid>
        <Btn kind="primary" disabled={busy} onClick={save}>Save</Btn>
      </Card>
      <div style={{ marginTop: 14 }}>
        <Card title="Change my bank details">
          <Notice kind="info">For your protection HR checks bank changes with you before they take effect. Your current details stay in place until then. They are never shown on this page.</Notice>
          <Grid cols={3}>
            <Field label="Bank"><Input value={bank.bankName} onChange={(e) => setBank({ ...bank, bankName: e.target.value })} /></Field>
            <Field label="Account number (10 digits)"><Input inputMode="numeric" value={bank.bankAccountNo} onChange={(e) => setBank({ ...bank, bankAccountNo: e.target.value })} /></Field>
            <Field label="Account name"><Input value={bank.bankAccountName} onChange={(e) => setBank({ ...bank, bankAccountName: e.target.value })} /></Field>
          </Grid>
          <Btn disabled={busy || !bank.bankName || !bank.bankAccountNo || !bank.bankAccountName} onClick={sendBank}>Send to HR</Btn>
        </Card>
      </div>
    </div>
  );
}
