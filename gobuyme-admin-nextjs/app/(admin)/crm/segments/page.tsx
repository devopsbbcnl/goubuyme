'use client';
import { useEffect, useState } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { Card, CrmRole, CrmTag, ROLE_LABEL, RoleBadge, SectionLabel, fmtRelative } from '@/components/crm/shared';
import { FieldLabel, MarketingTabs, useFieldStyle } from '@/components/crm/marketing';

type Op = 'withinDays' | 'olderThanDays' | 'in' | 'has' | 'notHas' | 'is' | 'gte' | 'lte';
type Kind = 'days' | 'number' | 'strings' | 'string' | 'boolean';
interface FieldDef { label: string; roles: CrmRole[]; ops: Op[]; kind: Kind; options?: string[] }
interface Condition { field: string; op: Op; value: unknown }
interface Rules { match: 'all' | 'any'; conditions: Condition[] }

interface Segment {
  id: string; name: string; description: string | null; role: CrmRole; rules: Rules;
  cachedCount: number | null; lastComputedAt: string | null; updatedAt: string;
  createdBy: { name: string }; _count: { campaigns: number };
}

interface Preview {
  matched: number; optedIn: number; withPushDevice: number;
  reach: { PUSH: number; EMAIL: number; SMS: number };
  sample: Array<{ id: string; name: string; email: string }>;
}

const OP_LABEL: Record<Op, string> = {
  withinDays: 'in the last (days)', olderThanDays: 'more than (days) ago', in: 'is any of', has: 'has', notHas: "doesn't have",
  is: 'is', gte: 'at least', lte: 'at most',
};

const humanize = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase());

const defaultValue = (def: FieldDef): unknown => {
  if (def.kind === 'boolean') return true;
  if (def.kind === 'days' || def.kind === 'number') return 30;
  if (def.kind === 'strings') return def.options ? [def.options[0]] : [];
  return def.options ? def.options[0] : '';
};

export default function SegmentsPage() {
  const { theme: T } = useTheme();
  const { user } = useAuth();
  const canEdit = user?.role === 'SUPER_ADMIN' || user?.role === 'OPERATIONS_ADMIN';
  const field = useFieldStyle();

  const [segments, setSegments] = useState<Segment[]>([]);
  const [fields, setFields] = useState<Record<string, FieldDef>>({});
  const [tags, setTags] = useState<CrmTag[]>([]);
  const [loading, setLoading] = useState(true);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [role, setRole] = useState<CrmRole>('CUSTOMER');
  const [rules, setRules] = useState<Rules>({ match: 'all', conditions: [] });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () =>
    api.get<{ data: Segment[] }>('/admin/crm/segments').then(res => setSegments(res.data)).catch(() => {}).finally(() => setLoading(false));

  useEffect(() => {
    load();
    api.get<{ data: { fields: Record<string, FieldDef> } }>('/admin/crm/segments/fields').then(res => setFields(res.data.fields)).catch(() => {});
    api.get<{ data: CrmTag[] }>('/admin/crm/tags').then(res => setTags(res.data)).catch(() => {});
  }, []);

  const startNew = () => {
    setEditingId(null); setName(''); setDescription(''); setRole('CUSTOMER');
    setRules({ match: 'all', conditions: [] }); setPreview(null); setError(''); setOpen(true);
  };
  const startEdit = (s: Segment) => {
    setEditingId(s.id); setName(s.name); setDescription(s.description ?? ''); setRole(s.role);
    setRules(s.rules); setPreview(null); setError(''); setOpen(true);
  };

  const fieldsForRole = Object.entries(fields).filter(([, d]) => d.roles.includes(role));

  const updateCondition = (i: number, patch: Partial<Condition>) => {
    setPreview(null);
    setRules(r => ({ ...r, conditions: r.conditions.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));
  };
  const changeField = (i: number, key: string) => {
    const def = fields[key];
    updateCondition(i, { field: key, op: def.ops[0], value: defaultValue(def) });
  };
  const addCondition = () => {
    const [key, def] = fieldsForRole[0] ?? [];
    if (!key || !def) return;
    setPreview(null);
    setRules(r => ({ ...r, conditions: [...r.conditions, { field: key, op: def.ops[0], value: defaultValue(def) }] }));
  };
  const removeCondition = (i: number) => {
    setPreview(null);
    setRules(r => ({ ...r, conditions: r.conditions.filter((_, j) => j !== i) }));
  };

  const runPreview = async () => {
    setPreviewing(true);
    setError('');
    try {
      const res = await api.post<{ data: Preview }>('/admin/crm/segments/preview', { role, rules });
      setPreview(res.data);
    } catch (err) { setError((err as Error).message); } finally { setPreviewing(false); }
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = { name, description, role, rules };
      if (editingId) await api.patch(`/admin/crm/segments/${editingId}`, payload);
      else await api.post('/admin/crm/segments', payload);
      setOpen(false);
      load();
    } catch (err) { setError((err as Error).message); } finally { setSaving(false); }
  };

  const remove = async (s: Segment) => {
    setError('');
    try { await api.del(`/admin/crm/segments/${s.id}`); load(); } catch (err) { setError((err as Error).message); }
  };

  const valueInput = (c: Condition, i: number, def: FieldDef) => {
    if (c.field === 'tag') {
      return (
        <select value={String(c.value)} onChange={e => updateCondition(i, { value: e.target.value })} style={field}>
          <option value="">Choose a tag…</option>
          {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      );
    }
    if (def.kind === 'boolean') {
      return (
        <select value={String(c.value)} onChange={e => updateCondition(i, { value: e.target.value === 'true' })} style={field}>
          <option value="true">Yes</option><option value="false">No</option>
        </select>
      );
    }
    if (def.kind === 'days' || def.kind === 'number') {
      return <input type="number" min={0} value={String(c.value)} onChange={e => updateCondition(i, { value: e.target.value === '' ? '' : Number(e.target.value) })} style={field} />;
    }
    if (def.kind === 'string' && def.options) {
      return (
        <select value={String(c.value)} onChange={e => updateCondition(i, { value: e.target.value })} style={field}>
          {def.options.map(o => <option key={o} value={o}>{humanize(o)}</option>)}
        </select>
      );
    }
    if (def.kind === 'strings' && def.options) {
      const selected = (c.value as string[]) ?? [];
      return (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {def.options.map(o => {
            const on = selected.includes(o);
            return (
              <button key={o} type="button" onClick={() => updateCondition(i, { value: on ? selected.filter(x => x !== o) : [...selected, o] })} style={{
                padding: '5px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
                border: `1px solid ${on ? T.primary : T.border}`, background: on ? T.primaryTint : T.surface2, color: on ? T.primary : T.textSec,
              }}>{humanize(o)}</button>
            );
          })}
        </div>
      );
    }
    // Free-text list (city): comma separated.
    return (
      <input
        value={Array.isArray(c.value) ? (c.value as string[]).join(', ') : ''}
        onChange={e => updateCondition(i, { value: e.target.value.split(',').map(s => s.trimStart()) })}
        placeholder="Port Harcourt, Lagos"
        style={field}
      />
    );
  };

  const describe = (s: Segment) => {
    if (s.rules.conditions.length === 0) return `All ${ROLE_LABEL[s.role].toLowerCase()}s`;
    return s.rules.conditions.map(c => {
      const def = fields[c.field];
      const v = c.field === 'tag' ? (tags.find(t => t.id === c.value)?.name ?? 'tag')
        : Array.isArray(c.value) ? (c.value as string[]).map(humanize).join(' / ')
        : typeof c.value === 'boolean' ? (c.value ? 'yes' : 'no') : String(c.value);
      return `${def?.label ?? c.field} ${OP_LABEL[c.op]} ${v}`;
    }).join(s.rules.match === 'all' ? ' AND ' : ' OR ');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.text }}>Segments</div>
          <div style={{ fontSize: 13, color: T.textSec }}>Saved audiences for campaigns. Counts only include people who accept promotions.</div>
        </div>
        {canEdit && !open && (
          <button onClick={startNew} style={{ padding: '10px 18px', borderRadius: 4, border: 'none', background: T.primary, color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
            New segment
          </button>
        )}
      </div>
      <MarketingTabs />

      {open && (
        <Card>
          <SectionLabel>{editingId ? 'Edit segment' : 'New segment'}</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <div><FieldLabel>Name</FieldLabel><input value={name} maxLength={80} onChange={e => setName(e.target.value)} placeholder="Lapsed PH customers" style={field} /></div>
            <div><FieldLabel>Audience</FieldLabel>
              <select value={role} onChange={e => { setRole(e.target.value as CrmRole); setRules({ match: rules.match, conditions: [] }); setPreview(null); }} style={field}>
                <option value="CUSTOMER">Customers</option><option value="VENDOR">Vendors</option><option value="RIDER">Riders</option>
              </select>
            </div>
            <div><FieldLabel hint="Optional">Description</FieldLabel><input value={description} maxLength={300} onChange={e => setDescription(e.target.value)} style={field} /></div>
          </div>

          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: T.text }}>
            Include {ROLE_LABEL[role].toLowerCase()}s matching
            <select value={rules.match} onChange={e => { setRules(r => ({ ...r, match: e.target.value as 'all' | 'any' })); setPreview(null); }} style={{ ...field, width: 'auto', padding: '6px 8px' }}>
              <option value="all">all</option><option value="any">any</option>
            </select>
            of these conditions:
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
            {rules.conditions.length === 0 && <div style={{ fontSize: 12, color: T.textSec }}>No conditions: everyone of this type.</div>}
            {rules.conditions.map((c, i) => {
              const def = fields[c.field];
              if (!def) return null;
              return (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(160px,1.2fr) minmax(130px,1fr) minmax(180px,2fr) auto', gap: 8, alignItems: 'center' }}>
                  <select value={c.field} onChange={e => changeField(i, e.target.value)} style={field}>
                    {fieldsForRole.map(([key, d]) => <option key={key} value={key}>{d.label}</option>)}
                  </select>
                  <select value={c.op} onChange={e => updateCondition(i, { op: e.target.value as Op })} style={field}>
                    {def.ops.map(op => <option key={op} value={op}>{OP_LABEL[op]}</option>)}
                  </select>
                  {valueInput(c, i, def)}
                  <button onClick={() => removeCondition(i)} aria-label="Remove condition" style={{ background: 'none', border: 'none', color: T.error, fontSize: 18, cursor: 'pointer' }}>×</button>
                </div>
              );
            })}
            <button onClick={addCondition} style={{ alignSelf: 'flex-start', background: 'none', border: `1px dashed ${T.border}`, borderRadius: 4, padding: '7px 12px', color: T.textSec, fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
              + Add condition
            </button>
          </div>

          {preview && (
            <div style={{ marginTop: 16, padding: 14, background: T.surface2, borderRadius: 4 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: T.text }}>{preview.optedIn.toLocaleString()} <span style={{ fontSize: 13, color: T.textSec, fontWeight: 600 }}>reachable people</span></div>
              <div style={{ fontSize: 12, color: T.textSec, marginTop: 4 }}>
                {preview.matched.toLocaleString()} match · {(preview.matched - preview.optedIn).toLocaleString()} opted out · SMS reach {preview.reach.SMS.toLocaleString()} · {preview.withPushDevice.toLocaleString()} have push enabled
              </div>
              {preview.sample.length > 0 && (
                <div style={{ fontSize: 12, color: T.textSec, marginTop: 8 }}>
                  e.g. {preview.sample.slice(0, 6).map(s => s.name).join(', ')}{preview.optedIn > 6 ? '…' : ''}
                </div>
              )}
            </div>
          )}
          {error && <div style={{ fontSize: 12, color: T.error, marginTop: 10 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16, flexWrap: 'wrap' }}>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: T.textSec, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
            <button onClick={runPreview} disabled={previewing} style={{ padding: '9px 16px', borderRadius: 4, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
              {previewing ? 'Counting…' : 'Preview audience'}
            </button>
            <button onClick={save} disabled={saving || !name.trim()} style={{ padding: '9px 16px', borderRadius: 4, border: 'none', background: T.primary, color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', opacity: saving || !name.trim() ? 0.6 : 1 }}>
              {saving ? 'Saving…' : 'Save segment'}
            </button>
          </div>
        </Card>
      )}

      {!open && error && <div style={{ fontSize: 12, color: T.error }}>{error}</div>}

      {loading ? (
        <div style={{ fontSize: 13, color: T.textSec }}>Loading segments…</div>
      ) : segments.length === 0 ? (
        <Card><div style={{ fontSize: 13, color: T.textSec }}>No segments yet. Create one to target a campaign, e.g. customers who haven&apos;t ordered in 30 days.</div></Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
          {segments.map(s => (
            <Card key={s.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>{s.name}</div>
                <RoleBadge role={s.role} />
              </div>
              {s.description && <div style={{ fontSize: 12, color: T.textSec, marginTop: 4 }}>{s.description}</div>}
              <div style={{ fontSize: 12, color: T.textSec, marginTop: 8, lineHeight: 1.5 }}>{describe(s)}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 12 }}>
                <span style={{ fontSize: 20, fontWeight: 800, color: T.text }}>{s.cachedCount?.toLocaleString() ?? '—'}<span style={{ fontSize: 11, color: T.textMuted, fontWeight: 600 }}> reachable · {fmtRelative(s.lastComputedAt)}</span></span>
                <span style={{ fontSize: 11, color: T.textMuted }}>{s._count.campaigns} campaign{s._count.campaigns === 1 ? '' : 's'}</span>
              </div>
              {canEdit && (
                <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
                  <button onClick={() => startEdit(s)} style={{ background: 'none', border: 'none', color: T.primary, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>Edit</button>
                  <button onClick={() => remove(s)} style={{ background: 'none', border: 'none', color: T.error, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>Delete</button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
