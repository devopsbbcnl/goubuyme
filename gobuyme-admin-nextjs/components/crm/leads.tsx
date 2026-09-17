'use client';
import { useEffect, useState } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';

export type LeadType = 'VENDOR' | 'RIDER';
export type LeadStage = 'NEW' | 'CONTACTED' | 'INTERESTED' | 'ONBOARDING' | 'LIVE' | 'LOST';
export type LeadSource = 'FIELD' | 'REFERRAL' | 'INBOUND_WEB' | 'SOCIAL' | 'IMPORT' | 'OTHER';

export interface Lead {
  id: string; type: LeadType; name: string; contactName: string | null; phone: string | null; email: string | null;
  city: string | null; area: string | null; category: string | null; source: LeadSource; stage: LeadStage;
  lostReason: string | null; estimatedMonthlyGmv: number | null; stageChangedAt: string; createdAt: string;
  convertedUserId: string | null; owner: { id: string; name: string } | null; openTasks: number;
}

export const STAGES: LeadStage[] = ['NEW', 'CONTACTED', 'INTERESTED', 'ONBOARDING', 'LIVE', 'LOST'];

export const STAGE_LABEL: Record<LeadStage, string> = {
  NEW: 'New', CONTACTED: 'Contacted', INTERESTED: 'Interested', ONBOARDING: 'Onboarding', LIVE: 'Live', LOST: 'Lost',
};

export const STAGE_HINT: Record<LeadStage, string> = {
  NEW: 'Not reached yet',
  CONTACTED: 'Spoken to at least once',
  INTERESTED: 'Wants to join',
  ONBOARDING: 'Signed up, awaiting approval',
  LIVE: 'Approved and trading',
  LOST: 'Not joining',
};

export const SOURCE_LABEL: Record<LeadSource, string> = {
  FIELD: 'Field visit', REFERRAL: 'Referral', INBOUND_WEB: 'Website', SOCIAL: 'Social media', IMPORT: 'Import', OTHER: 'Other',
};

export const VENDOR_CATEGORIES = ['RESTAURANT', 'EMART', 'PHARMACY', 'BAKERY', 'DRINKS', 'BUTCHER', 'GAS'];

export const humanize = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase());

export function useStageColor() {
  const { theme: T } = useTheme();
  return (stage: LeadStage) => ({
    NEW: T.info, CONTACTED: T.primary, INTERESTED: T.warning, ONBOARDING: '#8B5CF6', LIVE: T.success, LOST: T.textMuted,
  })[stage];
}

const useField = () => {
  const { theme: T } = useTheme();
  return {
    width: '100%', boxSizing: 'border-box', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4,
    padding: '10px 12px', color: T.text, fontSize: 13, fontFamily: 'inherit', outline: 'none', marginTop: 6,
  } as React.CSSProperties;
};

interface Agent { id: string; name: string }

export function LeadFormModal({ lead, defaultType, onClose, onSaved }: {
  lead?: Lead; defaultType: LeadType; onClose: () => void; onSaved: (lead: { id: string }) => void;
}) {
  const { theme: T } = useTheme();
  const field = useField();
  const label: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: T.textSec, display: 'block' };
  const [agents, setAgents] = useState<Agent[]>([]);
  const [form, setForm] = useState({
    type: lead?.type ?? defaultType,
    name: lead?.name ?? '', contactName: lead?.contactName ?? '', phone: lead?.phone ?? '', email: lead?.email ?? '',
    city: lead?.city ?? '', area: lead?.area ?? '', category: lead?.category ?? '', source: lead?.source ?? 'FIELD',
    estimatedMonthlyGmv: lead?.estimatedMonthlyGmv != null ? String(lead.estimatedMonthlyGmv) : '',
    ownerId: lead?.owner?.id ?? '', note: '',
  });
  const [duplicateWarning, setDuplicateWarning] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<{ data: Agent[] }>('/admin/crm/tickets/agents').then(res => setAgents(res.data)).catch(() => {});
  }, []);

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));
  const isVendor = form.type === 'VENDOR';

  const save = async (allowDuplicate = false) => {
    setSaving(true);
    setError('');
    try {
      const payload = {
        type: form.type, name: form.name, contactName: form.contactName, phone: form.phone, email: form.email,
        city: form.city, area: form.area, category: isVendor ? (form.category || null) : null, source: form.source,
        estimatedMonthlyGmv: form.estimatedMonthlyGmv === '' ? null : Number(form.estimatedMonthlyGmv),
        ...(form.ownerId ? { ownerId: form.ownerId } : lead ? { ownerId: null } : {}),
      };
      const res = lead
        ? await api.patch<{ data: { id: string } }>(`/admin/crm/leads/${lead.id}`, payload)
        : await api.post<{ data: { id: string } }>('/admin/crm/leads', { ...payload, note: form.note, allowDuplicate });
      onSaved(res.data);
    } catch (err) {
      const message = (err as Error).message;
      if (!lead && message.startsWith('A lead with this phone or email already exists')) setDuplicateWarning(message);
      else setError(message);
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={lead ? 'Edit lead' : `Add ${isVendor ? 'vendor' : 'rider'} lead`} width={560}>
      <div style={{ padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {!lead && (
          <label style={{ ...label, gridColumn: '1 / -1' }}>Type
            <select value={form.type} onChange={e => set('type', e.target.value)} style={field}>
              <option value="VENDOR">Vendor</option><option value="RIDER">Rider</option>
            </select>
          </label>
        )}
        <label style={{ ...label, gridColumn: '1 / -1' }}>{isVendor ? 'Business name' : 'Rider name'}
          <input value={form.name} onChange={e => set('name', e.target.value)} maxLength={120} style={field} autoFocus />
        </label>
        {isVendor && <label style={label}>Contact person<input value={form.contactName} onChange={e => set('contactName', e.target.value)} style={field} /></label>}
        <label style={label}>Phone<input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="0803…" style={field} /></label>
        <label style={label}>Email<input value={form.email} onChange={e => set('email', e.target.value)} style={field} /></label>
        <label style={label}>City<input value={form.city} onChange={e => set('city', e.target.value)} placeholder="Port Harcourt" style={field} /></label>
        <label style={label}>Area<input value={form.area} onChange={e => set('area', e.target.value)} placeholder="GRA Phase 2" style={field} /></label>
        {isVendor && (
          <label style={label}>Category
            <select value={form.category} onChange={e => set('category', e.target.value)} style={field}>
              <option value="">Not sure yet</option>
              {VENDOR_CATEGORIES.map(c => <option key={c} value={c}>{humanize(c)}</option>)}
            </select>
          </label>
        )}
        <label style={label}>Source
          <select value={form.source} onChange={e => set('source', e.target.value)} style={field}>
            {(Object.keys(SOURCE_LABEL) as LeadSource[]).map(s => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
          </select>
        </label>
        {isVendor && <label style={label}>Est. monthly sales (₦)<input type="number" min={0} value={form.estimatedMonthlyGmv} onChange={e => set('estimatedMonthlyGmv', e.target.value)} style={field} /></label>}
        <label style={label}>Owner
          <select value={form.ownerId} onChange={e => set('ownerId', e.target.value)} style={field}>
            <option value="">{lead ? 'Unassigned' : 'Me'}</option>
            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        {!lead && (
          <label style={{ ...label, gridColumn: '1 / -1' }}>First note (optional)
            <textarea value={form.note} onChange={e => set('note', e.target.value)} rows={2} maxLength={2000} placeholder="Met owner at shop, interested in delivery for lunch rush" style={{ ...field, resize: 'vertical' }} />
          </label>
        )}
        {duplicateWarning && (
          <div style={{ gridColumn: '1 / -1', fontSize: 12, color: T.warning, background: T.warningBg, padding: 10, borderRadius: 4 }}>
            {duplicateWarning}{' '}
            <button onClick={() => save(true)} style={{ background: 'none', border: 'none', color: T.primary, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>Add anyway</button>
          </div>
        )}
        {error && <div style={{ gridColumn: '1 / -1', fontSize: 12, color: T.error }}>{error}</div>}
        <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={() => save()} disabled={saving || !form.name.trim()} style={{
            padding: '9px 16px', borderRadius: 4, border: 'none', background: T.primary, color: '#fff', fontSize: 13, fontWeight: 700,
            fontFamily: 'inherit', cursor: 'pointer', opacity: saving || !form.name.trim() ? 0.6 : 1,
          }}>{saving ? 'Saving…' : lead ? 'Save' : 'Add lead'}</button>
        </div>
      </div>
    </Modal>
  );
}

export function ImportLeadsModal({ type, onClose, onDone }: { type: LeadType; onClose: () => void; onDone: () => void }) {
  const { theme: T } = useTheme();
  const field = useField();
  const [csv, setCsv] = useState('');
  const [importType, setImportType] = useState<LeadType>(type);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ created: number; duplicates: string[]; errors: Array<{ line: number; message: string }> } | null>(null);

  const readFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 1_000_000) { setError('File is too large (max 1 MB).'); return; }
    file.text().then(setCsv).catch(() => setError('Could not read that file.'));
  };

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await api.post<{ data: NonNullable<typeof result> }>('/admin/crm/leads/import', { type: importType, csv });
      setResult(res.data);
      onDone();
    } catch (err) { setError((err as Error).message); } finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title="Import leads from CSV" width={560}>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {result ? (
          <>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>Imported {result.created} lead{result.created === 1 ? '' : 's'}.</div>
            {result.duplicates.length > 0 && <div style={{ fontSize: 12, color: T.textSec }}>Skipped {result.duplicates.length} already in the pipeline: {result.duplicates.slice(0, 10).join(', ')}{result.duplicates.length > 10 ? '…' : ''}</div>}
            {result.errors.length > 0 && (
              <div style={{ fontSize: 12, color: T.error }}>
                {result.errors.length} row{result.errors.length === 1 ? '' : 's'} had problems:
                {result.errors.slice(0, 10).map(e => <div key={e.line}>Line {e.line}: {e.message}</div>)}
              </div>
            )}
            <button onClick={onClose} style={{ alignSelf: 'flex-end', padding: '9px 16px', borderRadius: 4, border: 'none', background: T.primary, color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>Done</button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 12, color: T.textSec, lineHeight: 1.6 }}>
              First row must be headers. Recognised columns: <code>name</code> (required), <code>contact</code>, <code>phone</code>, <code>email</code>, <code>city</code>, <code>area</code>, <code>category</code>, <code>notes</code>. Leads that are already in the pipeline (same phone or email) are skipped. Max 1,000 rows.
            </div>
            <select value={importType} onChange={e => setImportType(e.target.value as LeadType)} style={{ ...field, marginTop: 0 }}>
              <option value="VENDOR">Vendor leads</option><option value="RIDER">Rider leads</option>
            </select>
            <input type="file" accept=".csv,text/csv" onChange={e => readFile(e.target.files?.[0])} style={{ fontSize: 13, color: T.text }} />
            <textarea value={csv} onChange={e => setCsv(e.target.value)} rows={8} placeholder={'name,contact,phone,city,category\nChicken Hub,Ada,08031234567,Port Harcourt,restaurant'}
              style={{ ...field, marginTop: 0, fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }} />
            {error && <div style={{ fontSize: 12, color: T.error }}>{error}</div>}
            <button onClick={submit} disabled={saving || !csv.trim()} style={{
              alignSelf: 'flex-end', padding: '9px 16px', borderRadius: 4, border: 'none', background: T.primary, color: '#fff', fontSize: 13,
              fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', opacity: saving || !csv.trim() ? 0.6 : 1,
            }}>{saving ? 'Importing…' : 'Import'}</button>
          </>
        )}
      </div>
    </Modal>
  );
}

export function LostReasonModal({ leadName, onCancel, onConfirm }: { leadName: string; onCancel: () => void; onConfirm: (reason: string) => void }) {
  const { theme: T } = useTheme();
  const field = useField();
  const REASONS = ['Not interested', 'Commission too high', 'Already on another platform', 'Outside delivery area', 'Could not reach', 'Failed verification'];
  const [reason, setReason] = useState('');
  return (
    <Modal open onClose={onCancel} title={`Why was ${leadName} lost?`} width={440}>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {REASONS.map(r => (
            <button key={r} onClick={() => setReason(r)} style={{
              padding: '6px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
              border: `1px solid ${reason === r ? T.primary : T.border}`, background: reason === r ? T.primaryTint : T.surface2, color: reason === r ? T.primary : T.textSec,
            }}>{r}</button>
          ))}
        </div>
        <input value={reason} onChange={e => setReason(e.target.value)} maxLength={200} placeholder="Or type a reason" style={field} />
        <button onClick={() => onConfirm(reason.trim())} disabled={!reason.trim()} style={{
          alignSelf: 'flex-end', padding: '9px 16px', borderRadius: 4, border: 'none', background: T.error, color: '#fff', fontSize: 13, fontWeight: 700,
          fontFamily: 'inherit', cursor: 'pointer', opacity: reason.trim() ? 1 : 0.6,
        }}>Mark as lost</button>
      </div>
    </Modal>
  );
}
