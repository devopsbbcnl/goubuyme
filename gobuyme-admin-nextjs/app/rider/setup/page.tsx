'use client';
import { useState, useRef, CSSProperties, FormEvent, ReactNode } from 'react';
import Image from 'next/image';
import { useTheme } from '@/context/ThemeContext';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api/v1';
const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? '';
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? '';

type Step = 'login' | 'form' | 'done';

async function cloudinaryUpload(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  form.append('upload_preset', UPLOAD_PRESET);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: 'POST', body: form });
  if (!res.ok) throw new Error('Upload failed');
  return ((await res.json()) as { secure_url: string }).secure_url;
}

async function apiCall(path: string, method: string, token: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { message?: string }).message ?? 'Request failed');
  return json;
}

export default function RiderSetupPage() {
  const { theme: T } = useTheme();

  const [step, setStep] = useState<Step>('login');
  const [token, setToken] = useState('');

  // Login
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Identity
  const [ninNumber, setNinNumber] = useState('');
  const [ninImgUrl, setNinImgUrl] = useState('');
  const [ninImgPreview, setNinImgPreview] = useState('');
  const [selfieUrl, setSelfieUrl] = useState('');
  const [selfiePreview, setSelfiePreview] = useState('');
  const [uploadingNin, setUploadingNin] = useState(false);
  const [uploadingSelfie, setUploadingSelfie] = useState(false);

  // Vehicle
  const [vehicleImgUrl, setVehicleImgUrl] = useState('');
  const [vehicleImgPreview, setVehicleImgPreview] = useState('');
  const [uploadingVehicle, setUploadingVehicle] = useState(false);

  // Guarantor
  const [guarantorName, setGuarantorName] = useState('');
  const [guarantorPhone, setGuarantorPhone] = useState('');
  const [guarantorAddress, setGuarantorAddress] = useState('');

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const ninRef = useRef<HTMLInputElement>(null);
  const selfieRef = useRef<HTMLInputElement>(null);
  const vehicleRef = useRef<HTMLInputElement>(null);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    try {
      const res = await fetch(`${BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error((json as { message?: string }).message ?? 'Login failed');
      const { accessToken, user } = (json as { data: { accessToken: string; user: { role: string } } }).data;
      if (user.role !== 'RIDER') throw new Error('This page is only for rider accounts.');
      sessionStorage.setItem('rider_setup_token', accessToken);
      setToken(accessToken);
      setStep('form');
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleFileUpload = async (
    file: File,
    setPreview: (url: string) => void,
    setUrl: (url: string) => void,
    setUploading: (v: boolean) => void,
  ) => {
    setPreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      const url = await cloudinaryUpload(file);
      setUrl(url);
    } catch {
      setPreview('');
      alert('Image upload failed. Please check your connection and try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!ninNumber.trim()) { setSaveError('Please enter your NIN.'); return; }
    setSaveError('');
    setSaving(true);
    try {
      await apiCall('/riders/me/document', 'POST', token, {
        ninNumber: ninNumber.trim(),
        ninImageUrl: ninImgUrl || null,
        selfieUrl: selfieUrl || null,
        vehicleImageUrl: vehicleImgUrl || null,
        guarantorName: guarantorName.trim() || null,
        guarantorPhone: guarantorPhone.trim() || null,
        guarantorAddress: guarantorAddress.trim() || null,
      });
      setStep('done');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Submit failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const anyUploading = uploadingNin || uploadingSelfie || uploadingVehicle;

  // ── LOGIN ──────────────────────────────────────────────────────────────────
  if (step === 'login') {
    return (
      <PageShell T={T}>
        <div style={{ width: '100%', maxWidth: 440 }}>
          <PageBrand title="Complete your rider profile" sub="Sign in to your GoBuyMe rider account" T={T} />
          <div style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 4, padding: 28 }}>
            <form onSubmit={handleLogin}>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle(T)}>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" required
                  style={inputStyle(T)} />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle(T)}>Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required
                  style={inputStyle(T)} />
              </div>
              {loginError && <ErrorBanner msg={loginError} />}
              <button type="submit" disabled={loginLoading}
                style={{ width: '100%', padding: '12px', borderRadius: 4, background: loginLoading ? '#e8e4de' : '#FF521B', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', cursor: loginLoading ? 'not-allowed' : 'pointer' }}>
                {loginLoading ? 'Signing in…' : 'Continue'}
              </button>
            </form>
          </div>
        </div>
      </PageShell>
    );
  }

  // ── DONE ───────────────────────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <PageShell T={T}>
        <div style={{ textAlign: 'center', maxWidth: 440 }}>
          <Image src="/icon.png" alt="GoBuyMe" width={160} height={160} style={{ objectFit: 'contain', marginBottom: 20 }} />
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#1A9E5F20', border: '2px solid #1A9E5F40', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 28, color: '#1A9E5F' }}>
            &#10003;
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#111', marginBottom: 10 }}>Documents submitted!</div>
          <div style={{ fontSize: 15, color: '#444', lineHeight: 1.7, marginBottom: 24 }}>
            Our team will review your documents and activate your account within 1–2 business days. You&apos;ll receive an email once you&apos;re approved and ready to go.
          </div>
          <div style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 4, padding: 16, fontSize: 13, color: '#444' }}>
            Download the GoBuyMe app and stay ready to go online once your account is activated.
          </div>
        </div>
      </PageShell>
    );
  }

  // ── FORM ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#fbfbf2', fontFamily: 'var(--font-jakarta), sans-serif' }}>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '40px 24px 100px' }}>

        {/* Header */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <Image src="/icon.png" alt="GoBuyMe" width={40} height={40} style={{ objectFit: 'contain' }} />
            <span style={{ fontSize: 13, color: '#444' }}>GoBuyMe Rider Setup</span>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#111', letterSpacing: '-0.5px', marginBottom: 6 }}>
            Identity Documents
          </div>
          <div style={{ fontSize: 14, color: '#444', lineHeight: 1.6 }}>
            Your NIN, a selfie, and vehicle or guarantor details are required before your account can be activated.
          </div>
        </div>

        {/* ── IDENTITY ── */}
        <SectionLabel label="IDENTITY" T={T} />

        <label style={labelStyle(T)}>NIN (National ID Number) *</label>
        <input
          value={ninNumber} onChange={e => setNinNumber(e.target.value.replace(/\D/g, '').slice(0, 11))}
          placeholder="11-digit NIN"
          style={{ ...inputStyle(T), marginBottom: 18 }}
        />

        <label style={labelStyle(T)}>NIN Slip / ID Card Image</label>
        <ImgBox
          preview={ninImgPreview} uploading={uploadingNin}
          hint="Click to upload NIN slip" onClick={() => ninRef.current?.click()} T={T}
        />
        <input ref={ninRef} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f, setNinImgPreview, setNinImgUrl, setUploadingNin); e.target.value = ''; }} />

        <label style={{ ...labelStyle(T), marginTop: 18 }}>Selfie / Liveness Photo</label>
        <ImgBox
          preview={selfiePreview} uploading={uploadingSelfie}
          hint="Click to upload a clear selfie" onClick={() => selfieRef.current?.click()} T={T}
        />
        <input ref={selfieRef} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f, setSelfiePreview, setSelfieUrl, setUploadingSelfie); e.target.value = ''; }} />

        {/* ── VEHICLE ── */}
        <SectionLabel label="VEHICLE" T={T} mt={32} />

        <label style={labelStyle(T)}>Vehicle Photo</label>
        <ImgBox
          preview={vehicleImgPreview} uploading={uploadingVehicle}
          hint="Click to upload your vehicle photo" onClick={() => vehicleRef.current?.click()} T={T}
        />
        <input ref={vehicleRef} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f, setVehicleImgPreview, setVehicleImgUrl, setUploadingVehicle); e.target.value = ''; }} />

        {/* ── GUARANTOR ── */}
        <SectionLabel label="GUARANTOR" T={T} mt={32} />
        <div style={{ fontSize: 13, color: '#444', marginBottom: 18, lineHeight: 1.5 }}>
          A guarantor vouches for your reliability. Providing one is strongly recommended for faster approval.
        </div>

        <label style={labelStyle(T)}>Guarantor Full Name</label>
        <input
          value={guarantorName} onChange={e => setGuarantorName(e.target.value)}
          placeholder="e.g. Chukwudi Okafor"
          style={{ ...inputStyle(T), marginBottom: 18 }}
        />

        <label style={labelStyle(T)}>Guarantor Phone Number</label>
        <input
          value={guarantorPhone} onChange={e => setGuarantorPhone(e.target.value)}
          placeholder="e.g. 08012345678" type="tel"
          style={{ ...inputStyle(T), marginBottom: 18 }}
        />

        <label style={labelStyle(T)}>Guarantor Address</label>
        <textarea
          value={guarantorAddress} onChange={e => setGuarantorAddress(e.target.value)}
          placeholder="Street address"
          rows={3}
          style={{ width: '100%', boxSizing: 'border-box', background: '#fff', border: `1px solid ${T.border}`, borderRadius: 4, padding: '10px 14px', color: '#111', fontSize: 14, outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
        />

        {/* Privacy */}
        <div style={{ display: 'flex', gap: 8, background: '#f0ede6', borderRadius: 4, padding: 12, marginTop: 20, marginBottom: 32 }}>
          <span style={{ color: '#888', flexShrink: 0 }}>&#128274;</span>
          <span style={{ fontSize: 12, color: '#888', lineHeight: 1.6 }}>
            Your documents are encrypted and used only for identity verification. They are never shared with third parties.
          </span>
        </div>

        {saveError && <ErrorBanner msg={saveError} />}

        <button
          onClick={handleSubmit} disabled={saving || anyUploading}
          style={{ width: '100%', padding: '14px', borderRadius: 4, border: 'none', background: (saving || anyUploading) ? '#e8e4de' : '#FF521B', color: '#fff', fontSize: 15, fontWeight: 700, fontFamily: 'inherit', cursor: (saving || anyUploading) ? 'not-allowed' : 'pointer' }}>
          {saving ? 'Submitting…' : anyUploading ? 'Waiting for uploads…' : 'Submit Documents'}
        </button>
      </div>
    </div>
  );
}

// ── Shared sub-components ──────────────────────────────────────────────────

function PageShell({ children, T }: { children: ReactNode; T: Record<string, string> }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fbfbf2', fontFamily: 'var(--font-jakarta), sans-serif', padding: '20px' }}>
      {children}
    </div>
  );
}

function PageBrand({ title, sub, T }: { title: string; sub: string; T: Record<string, string> }) {
  return (
    <div style={{ textAlign: 'center', marginBottom: 28 }}>
      <Image src="/icon.png" alt="GoBuyMe" width={120} height={120} style={{ objectFit: 'contain', marginBottom: 12 }} />
      <div style={{ fontSize: 22, fontWeight: 800, color: '#111' }}>{title}</div>
      <div style={{ fontSize: 14, color: '#444', marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function SectionLabel({ label, T, mt }: { label: string; T: Record<string, string>; mt?: number }) {
  return (
    <div style={{ marginTop: mt ?? 0, marginBottom: 10 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: '#444', letterSpacing: '0.5px' }}>{label}</span>
    </div>
  );
}

function labelStyle(T: Record<string, string>): CSSProperties {
  return { display: 'block', fontSize: 12, fontWeight: 600, color: '#444', marginBottom: 6 };
}

function inputStyle(T: Record<string, string>): CSSProperties {
  return { width: '100%', boxSizing: 'border-box', background: '#fff', border: `1px solid ${T.border}`, borderRadius: 4, padding: '10px 14px', color: '#111', fontSize: 14, outline: 'none', fontFamily: 'inherit' };
}

function ImgBox({ preview, uploading, hint, onClick, T }: {
  preview: string; uploading: boolean; hint: string; onClick: () => void; T: Record<string, string>;
}) {
  return (
    <div
      onClick={onClick}
      style={{ height: 110, borderRadius: 4, border: `1px dashed ${T.border}`, background: '#fff', cursor: 'pointer', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 6 }}
    >
      {preview
        ? <img src={preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        : <div style={{ textAlign: 'center', color: '#888' }}>
            <div style={{ fontSize: 22, marginBottom: 6 }}>&#128247;</div>
            <div style={{ fontSize: 12 }}>{hint}</div>
          </div>
      }
      {uploading && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>Uploading…</div>
        </div>
      )}
      {preview && !uploading && (
        <div style={{ position: 'absolute', bottom: 8, right: 8, background: '#FF521B', borderRadius: 4, padding: '3px 9px', fontSize: 11, fontWeight: 700, color: '#fff' }}>
          Change
        </div>
      )}
    </div>
  );
}

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div style={{ background: '#E23B3B15', border: '1px solid #E23B3B40', borderRadius: 4, padding: '12px 16px', fontSize: 13, color: '#E23B3B', marginBottom: 16 }}>
      {msg}
    </div>
  );
}
