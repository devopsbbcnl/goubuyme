'use client';
// Public pre-boarding portal for new hires. No admin login: an expiring link plus a one-time code sent to their personal email.
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useTheme } from '@/context/ThemeContext';
import { Btn, Field, Grid, Input, Notice, uploadDocument } from '@/components/pwm/ui';

type Step = 'intro' | 'code' | 'form' | 'done';
interface Form { firstName: string; lastName: string; jobTitle: string; hireDate: string; phone: string | null; address: string | null; companyName: string; department: { name: string } | null }

async function call<T>(method: string, path: string, body?: unknown, session?: string): Promise<{ message: string; data: T }> {
  const res = await fetch(`/api/pwm-public/${path}`, { method, headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: `Bearer ${session}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await res.json().catch(() => ({ message: 'Network error' }));
  if (!res.ok) throw new Error(j.message ?? 'Something went wrong.');
  return j;
}

export default function Preboarding() {
  const { token } = useParams<{ token: string }>();
  const { theme: T } = useTheme();
  const [step, setStep] = useState<Step>('intro');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [session, setSession] = useState('');
  const [info, setInfo] = useState<Form | null>(null);
  const [f, setF] = useState({ phone: '', address: '', dateOfBirth: '', ecName: '', ecRel: '', ecPhone: '', nin: '', tin: '', rsaPin: '', pfaName: '', nhfNo: '', bankName: '', bankAccountNo: '', bankAccountName: '', consent: false });
  const [files, setFiles] = useState<{ name: string; category: string; file: File | null }[]>([{ name: 'Means of identification', category: 'Identification', file: null }, { name: 'Highest qualification', category: 'Qualification', file: null }]);

  const run = async (fn: () => Promise<void>) => { setBusy(true); setErr(''); try { await fn(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const send = () => run(async () => { const r = await call('POST', 'preboarding/start', { token }); setMsg(r.message); setStep('code'); });
  const verify = () => run(async () => {
    const r = await call<{ session: string }>('POST', 'preboarding/verify', { token, code });
    setSession(r.data.session);
    const form = await call<Form>('GET', 'preboarding/form', undefined, r.data.session);
    setInfo(form.data); setF((x) => ({ ...x, phone: form.data.phone ?? '', address: form.data.address ?? '' })); setStep('form');
  });
  const submit = () => run(async () => {
    const documents: { name: string; category: string; url: string; checksum: string }[] = [];
    for (const d of files) if (d.file) { const up = await uploadDocument(d.file); documents.push({ name: d.name, category: d.category, url: up.url, checksum: up.checksum }); }
    await call('POST', 'preboarding/submit', { consent: f.consent, phone: f.phone, address: f.address, dateOfBirth: f.dateOfBirth || undefined, emergencyContacts: f.ecName ? [{ name: f.ecName, relationship: f.ecRel, phone: f.ecPhone }] : [], nin: f.nin, tin: f.tin, rsaPin: f.rsaPin, pfaName: f.pfaName, nhfNo: f.nhfNo, bankName: f.bankName, bankAccountNo: f.bankAccountNo, bankAccountName: f.bankAccountName, documents }, session);
    setStep('done');
  });

  return (
    <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', justifyContent: 'center', padding: '32px 16px' }}>
      <div style={{ width: '100%', maxWidth: 720 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: T.text, marginBottom: 4 }}>{info?.companyName ?? 'Welcome'}: before your first day</div>
        <div style={{ fontSize: 13, color: T.textSec, marginBottom: 18 }}>A few details help HR have everything ready for you. This page is private to you and works only with the link you were sent.</div>
        {err && <Notice kind="error">{err}</Notice>}{msg && step === 'code' && <Notice kind="info">{msg}</Notice>}
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, padding: 20 }}>
          {step === 'intro' && (<><div style={{ fontSize: 14, color: T.text, marginBottom: 14 }}>To keep your details safe we first send a 6-digit code to your personal email.</div><Btn kind="primary" disabled={busy} onClick={send}>{busy ? 'Sending…' : 'Email me the code'}</Btn></>)}
          {step === 'code' && (<><Field label="6-digit code"><Input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></Field><div style={{ display: 'flex', gap: 8 }}><Btn kind="primary" disabled={busy || code.length !== 6} onClick={verify}>Continue</Btn><Btn disabled={busy} onClick={send}>Send a new code</Btn></div></>)}
          {step === 'form' && info && (
            <>
              <div style={{ fontSize: 14, color: T.text, marginBottom: 12 }}>Hello {info.firstName}. You are joining as <b>{info.jobTitle}</b>{info.department ? ` in ${info.department.name}` : ''}.</div>
              <div style={{ fontSize: 12, fontWeight: 800, color: T.textSec, textTransform: 'uppercase', margin: '10px 0' }}>About you</div>
              <Grid><Field label="Phone"><Input value={f.phone} onChange={set('phone')} /></Field><Field label="Date of birth"><Input type="date" value={f.dateOfBirth} onChange={set('dateOfBirth')} /></Field><Field label="Home address"><Input value={f.address} onChange={set('address')} /></Field></Grid>
              <div style={{ fontSize: 12, fontWeight: 800, color: T.textSec, textTransform: 'uppercase', margin: '10px 0' }}>Emergency contact</div>
              <Grid cols={3}><Field label="Name"><Input value={f.ecName} onChange={set('ecName')} /></Field><Field label="Relationship"><Input value={f.ecRel} onChange={set('ecRel')} /></Field><Field label="Phone"><Input value={f.ecPhone} onChange={set('ecPhone')} /></Field></Grid>
              <div style={{ fontSize: 12, fontWeight: 800, color: T.textSec, textTransform: 'uppercase', margin: '10px 0' }}>Statutory and bank (stored encrypted)</div>
              <Grid cols={3}><Field label="NIN (11 digits)"><Input inputMode="numeric" value={f.nin} onChange={set('nin')} /></Field><Field label="Tax ID"><Input value={f.tin} onChange={set('tin')} /></Field><Field label="Pension administrator"><Input value={f.pfaName} onChange={set('pfaName')} /></Field><Field label="RSA PIN"><Input value={f.rsaPin} onChange={set('rsaPin')} /></Field><Field label="NHF number"><Input value={f.nhfNo} onChange={set('nhfNo')} /></Field>
                <Field label="Bank"><Input value={f.bankName} onChange={set('bankName')} /></Field><Field label="Account number (10 digits)"><Input inputMode="numeric" value={f.bankAccountNo} onChange={set('bankAccountNo')} /></Field><Field label="Account name"><Input value={f.bankAccountName} onChange={set('bankAccountName')} /></Field></Grid>
              <div style={{ fontSize: 12, fontWeight: 800, color: T.textSec, textTransform: 'uppercase', margin: '10px 0' }}>Documents (PDF or image, up to 10 MB each)</div>
              {files.map((d, i) => <Field key={i} label={d.name}><input type="file" accept=".pdf,image/*" onChange={(e) => setFiles(files.map((x, j) => (j === i ? { ...x, file: e.target.files?.[0] ?? null } : x)))} /></Field>)}
              <label style={{ display: 'flex', gap: 8, fontSize: 13, color: T.text, margin: '12px 0' }}><input type="checkbox" checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} />These details are correct, and I agree that HR may keep and use them to employ me, in line with the Nigeria Data Protection Act.</label>
              <Btn kind="primary" disabled={busy || !f.consent} onClick={submit}>{busy ? 'Sending…' : 'Send to HR'}</Btn>
            </>
          )}
          {step === 'done' && <Notice kind="success">Thank you. Your details have been sent to HR. You can close this page. If anything needs changing, tell HR directly.</Notice>}
        </div>
      </div>
    </div>
  );
}
