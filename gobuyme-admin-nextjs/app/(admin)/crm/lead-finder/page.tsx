'use client';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useIsMobile } from '@/hooks/useIsMobile';
import { api } from '@/lib/api';
import { Card, SectionLabel, fmtRelative } from '@/components/crm/shared';
import { VENDOR_CATEGORIES, humanize } from '@/components/crm/leads';
import { FitBadge, FitReasons, OutreachPanel, Prospect, ProspectLinks } from '@/components/crm/prospecting';

type Schedule = 'NONE' | 'DAILY' | 'WEEKLY';
type View = 'NEW' | 'ADDED' | 'DISMISSED' | 'WITH_US';

interface Status { provider: 'google' | 'stub' | null; requestsUsed: number; requestCap: number; maxResults: number; aiDrafts: boolean }
interface Criteria { category: string | null; city: string | null; area: string | null; minRating: number | null; minReviews: number | null }
interface Run {
  id: string; searchId: string; status: 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED'; scheduled: boolean; found: number; added: number;
  alreadyKnown: number; withUs: number; belowBar: number; sitesRead: number; autoAdded: number; error: string | null; createdAt: string;
}
interface Search extends Criteria {
  id: string; query: string; maxResults: number; schedule: Schedule; autoAddMinScore: number | null; nextRunAt: string | null;
  lastRunAt: string | null; lastRun: Run | null; newProspects: number;
}
interface ProspectPage { items: Prospect[]; total: number; page: number; pageSize: number }

const VIEW_LABEL: Record<View, string> = { NEW: 'To review', ADDED: 'In pipeline', DISMISSED: 'Dismissed', WITH_US: 'Already with us' };
const SCHEDULE_LABEL: Record<Schedule, string> = { NONE: 'Run once', DAILY: 'Every day', WEEKLY: 'Every week' };
const EXAMPLES = ['Restaurants in GRA Phase 2, Port Harcourt with 50+ reviews', 'Pharmacies in Wuse 2 Abuja', 'Supermarkets in Lekki Lagos rated 4+'];

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

const runSummary = (r: Run) => {
  if (r.status === 'FAILED') return r.error ?? 'The search failed.';
  if (r.status !== 'DONE') return 'Searching and reading websites…';
  if (r.found === 0) return 'No businesses matched that search.';
  const parts = [
    `${r.added} new to review`,
    r.autoAdded ? `${r.autoAdded} added to the pipeline automatically` : null,
    r.alreadyKnown ? `${r.alreadyKnown} already found or in the pipeline` : null,
    r.withUs ? `${r.withUs} already on GoBuyMe` : null,
    r.belowBar ? `${r.belowBar} closed or below your rating/review bar` : null,
  ].filter(Boolean).join(', ');
  return `Found ${plural(r.found, 'business', 'businesses')}: ${parts}. Read ${plural(r.sitesRead, 'website')}.`;
};

export default function LeadFinderPage() {
  const { theme: T } = useTheme();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const canEdit = user?.role === 'SUPER_ADMIN' || user?.role === 'OPERATIONS_ADMIN';

  const [status, setStatus] = useState<Status | null>(null);
  const [query, setQuery] = useState('');
  const [understood, setUnderstood] = useState<Criteria | null>(null);
  const [category, setCategory] = useState('');
  const [maxResults, setMaxResults] = useState(20);
  const [schedule, setSchedule] = useState<Schedule>('NONE');
  const [autoAdd, setAutoAdd] = useState('');
  const [starting, setStarting] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const [searches, setSearches] = useState<Search[]>([]);
  const [view, setView] = useState<View>('NEW');
  const [searchId, setSearchId] = useState('');
  const [minScore, setMinScore] = useState('0');
  const [filter, setFilter] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ProspectPage | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadStatus = useCallback(() => api.get<{ data: Status }>('/admin/crm/prospecting/status').then(res => setStatus(res.data)).catch(() => {}), []);
  const loadSearches = useCallback(() => api.get<{ data: Search[] }>('/admin/crm/prospecting/searches').then(res => setSearches(res.data)).catch(() => {}), []);
  const loadProspects = useCallback(() => {
    const params = new URLSearchParams({ view, page: String(page) });
    if (searchId) params.set('searchId', searchId);
    if (minScore !== '0') params.set('minScore', minScore);
    if (debounced) params.set('search', debounced);
    return api.get<{ data: ProspectPage }>(`/admin/crm/prospecting/prospects?${params}`)
      .then(res => { setData(res.data); setError(''); }).catch(err => setError(err.message));
  }, [view, page, searchId, minScore, debounced]);

  useEffect(() => { loadStatus(); loadSearches(); }, [loadStatus, loadSearches]);
  useEffect(() => { loadProspects(); }, [loadProspects]);
  useEffect(() => { const t = setTimeout(() => { setDebounced(filter); setPage(1); }, 350); return () => clearTimeout(t); }, [filter]);
  useEffect(() => { setSelected(new Set()); setOpenId(null); }, [view, searchId, page, minScore, debounced]);

  // Show what the request was understood to mean before any money is spent on it.
  useEffect(() => {
    if (query.trim().length < 3) { setUnderstood(null); return; }
    const t = setTimeout(() => {
      api.post<{ data: Criteria }>('/admin/crm/prospecting/interpret', { query }).then(res => setUnderstood(res.data)).catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [query]);

  const watch = useCallback((runId: string) => {
    const tick = () => {
      api.get<{ data: Run }>(`/admin/crm/prospecting/runs/${runId}`).then(res => {
        setRun(res.data);
        if (res.data.status === 'DONE' || res.data.status === 'FAILED') { loadProspects(); loadSearches(); loadStatus(); return; }
        pollRef.current = setTimeout(tick, 2000);
      }).catch(() => { pollRef.current = setTimeout(tick, 4000); });
    };
    if (pollRef.current) clearTimeout(pollRef.current);
    tick();
  }, [loadProspects, loadSearches, loadStatus]);
  useEffect(() => () => { if (pollRef.current) clearTimeout(pollRef.current); }, []);

  const start = async () => {
    setStarting(true);
    setError('');
    setNotice('');
    try {
      const res = await api.post<{ data: { search: Search; run: Run } }>('/admin/crm/prospecting/searches', {
        query, maxResults, schedule, ...(category ? { category } : {}),
        ...(schedule !== 'NONE' && autoAdd ? { autoAddMinScore: Number(autoAdd) } : {}),
      });
      setRun(res.data.run);
      setView('NEW');
      setSearchId(res.data.search.id);
      setPage(1);
      loadSearches();
      watch(res.data.run.id);
    } catch (err) { setError((err as Error).message); } finally { setStarting(false); }
  };

  const rerun = async (s: Search) => {
    setError('');
    setNotice('');
    try {
      const res = await api.post<{ data: Run }>(`/admin/crm/prospecting/searches/${s.id}/run`, {});
      setRun(res.data);
      setView('NEW');
      setSearchId(s.id);
      watch(res.data.id);
    } catch (err) { setError((err as Error).message); }
  };

  const patchSearch = async (s: Search, body: Record<string, unknown>) => {
    setError('');
    try { await api.patch(`/admin/crm/prospecting/searches/${s.id}`, body); await loadSearches(); } catch (err) { setError((err as Error).message); }
  };

  const removeSearch = async (s: Search) => {
    setError('');
    try {
      await api.del(`/admin/crm/prospecting/searches/${s.id}`);
      if (searchId === s.id) setSearchId('');
      await loadSearches();
    } catch (err) { setError((err as Error).message); }
  };

  const addToPipeline = async (ids: string[]) => {
    if (!ids.length) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.post<{ data: { added: number; skipped: Array<{ name: string; reason: string }> } }>('/admin/crm/prospecting/prospects/add', { ids });
      const { added, skipped } = res.data;
      setNotice(`Added ${added} to the pipeline.${skipped.length ? ` Skipped ${skipped.length}: ${skipped.slice(0, 3).map(s => `${s.name} (${s.reason.toLowerCase()})`).join('; ')}${skipped.length > 3 ? '…' : ''}` : ''}`);
      setSelected(new Set());
      await Promise.all([loadProspects(), loadSearches()]);
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };

  const setProspectStatus = async (p: Prospect, next: 'DISMISSED' | 'NEW') => {
    setError('');
    try { await api.patch(`/admin/crm/prospecting/prospects/${p.id}`, { status: next }); await Promise.all([loadProspects(), loadSearches()]); } catch (err) { setError((err as Error).message); }
  };

  const field: React.CSSProperties = {
    background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4, padding: '8px 10px', color: T.text, fontSize: 13, fontFamily: 'inherit', outline: 'none',
  };
  const primaryBtn = (disabled: boolean): React.CSSProperties => ({
    padding: '9px 16px', borderRadius: 4, border: 'none', background: T.primary, color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1, whiteSpace: 'nowrap',
  });
  const linkBtn: React.CSSProperties = { background: 'none', border: 'none', padding: 0, color: T.primary, fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' };
  const chip: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: T.textSec, background: T.surface2, borderRadius: 999, padding: '3px 9px' };

  const running = run?.status === 'QUEUED' || run?.status === 'RUNNING';
  const calls = Math.ceil(maxResults / 20);
  const overCap = status ? status.requestsUsed + calls > status.requestCap : false;
  const canStart = canEdit && Boolean(status?.provider) && query.trim().length >= 3 && !starting && !running && !overCap;
  const items = data?.items ?? [];
  const selectable = view === 'NEW' ? items : [];
  const allSelected = selectable.length > 0 && selectable.every(p => selected.has(p.id));
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const understoodChips = understood ? [
    understood.category ? humanize(understood.category) : null,
    understood.area, understood.city,
    understood.minRating !== null ? `Rated ${understood.minRating}+` : null,
    understood.minReviews !== null ? `${understood.minReviews}+ reviews` : null,
  ].filter(Boolean) as string[] : [];

  const contactCell = (p: Prospect) => {
    const bits = [p.phone, p.email].filter(Boolean);
    if (bits.length) return <>{bits.map((b, i) => <div key={i} style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{b}</div>)}</>;
    if (p.instagram || p.facebook) return <span style={{ color: T.textSec }}>Social profile only</span>;
    return <span style={{ color: T.textMuted }}>No contact found</span>;
  };

  const detail = (p: Prospect) => (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.4fr', gap: 16, padding: 14, background: T.bg, borderTop: `1px solid ${T.border}` }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <SectionLabel>Why this score</SectionLabel>
        <FitReasons reasons={p.fitReasons} />
        <div style={{ fontSize: 12, color: T.textSec }}>{p.address ?? 'Address not recorded'}</div>
        {p.whatsapp && p.whatsapp !== p.phone && <div style={{ fontSize: 12, color: T.textSec }}>WhatsApp: {p.whatsapp}</div>}
        <ProspectLinks p={p} />
        {p.signals && !p.signals.websiteRead && p.website && <div style={{ fontSize: 11, color: T.textMuted }}>Their website could not be read, so only map details were used.</div>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <SectionLabel>Suggested first message</SectionLabel>
        <OutreachPanel prospectId={p.id} phone={p.whatsapp ?? p.phone} email={p.email} canEdit={canEdit} />
      </div>
    </div>
  );

  const rowActions = (p: Prospect) => (
    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
      {p.leadId && <Link href={`/crm/pipeline/${p.leadId}`} style={{ ...linkBtn, textDecoration: 'none' }}>Open lead</Link>}
      {canEdit && view === 'NEW' && <button disabled={busy} onClick={() => addToPipeline([p.id])} style={linkBtn}>Add to pipeline</button>}
      {canEdit && view === 'NEW' && <button onClick={() => setProspectStatus(p, 'DISMISSED')} style={{ ...linkBtn, color: T.textSec }}>Dismiss</button>}
      {canEdit && view === 'DISMISSED' && <button onClick={() => setProspectStatus(p, 'NEW')} style={linkBtn}>Restore</button>}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div style={{ fontSize: 20, fontWeight: 800, color: T.text }}>Lead Finder</div>
        <div style={{ fontSize: 13, color: T.textSec }}>
          Describe the vendors you want. We search Google Maps, read each business&apos;s own website for contacts, score the fit and skip anyone already with us.
        </div>
      </div>

      {status && !status.provider && (
        <div style={{ fontSize: 13, color: T.warning, background: T.warningBg, borderRadius: 4, padding: 12 }}>
          Searching is not set up yet. Add <code>GOOGLE_PLACES_API_KEY</code> to the backend environment (Google Cloud, Places API (New) enabled) and restart it.
        </div>
      )}
      {status?.provider === 'stub' && (
        <div style={{ fontSize: 13, color: T.warning, background: T.warningBg, borderRadius: 4, padding: 12 }}>
          Test mode: results are made-up businesses marked TEST, not real ones.
        </div>
      )}

      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              value={query} onChange={e => setQuery(e.target.value)} maxLength={200} disabled={!canEdit}
              onKeyDown={e => { if (e.key === 'Enter' && canStart) start(); }}
              placeholder="e.g. Restaurants in GRA Phase 2, Port Harcourt with 50+ reviews"
              aria-label="Describe the vendors you want" style={{ ...field, flex: '1 1 320px', padding: '11px 12px', fontSize: 14 }}
            />
            <button onClick={start} disabled={!canStart} style={primaryBtn(!canStart)}>{starting || running ? 'Searching…' : 'Find vendors'}</button>
          </div>
          {understoodChips.length > 0 ? (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: T.textMuted }}>Understood as</span>
              {understoodChips.map(c => <span key={c} style={chip}>{c}</span>)}
            </div>
          ) : !query && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: T.textMuted }}>Try</span>
              {EXAMPLES.map(e => <button key={e} onClick={() => setQuery(e)} disabled={!canEdit} style={{ ...chip, border: 'none', cursor: canEdit ? 'pointer' : 'default', fontFamily: 'inherit' }}>{e}</button>)}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select aria-label="Category" value={category} onChange={e => setCategory(e.target.value)} disabled={!canEdit} style={field}>
              <option value="">Category: from the request</option>
              {VENDOR_CATEGORIES.map(c => <option key={c} value={c}>{humanize(c)}</option>)}
            </select>
            <select aria-label="How many results" value={maxResults} onChange={e => setMaxResults(Number(e.target.value))} disabled={!canEdit} style={field}>
              {[20, 40, 60].map(n => <option key={n} value={n}>Up to {n} businesses</option>)}
            </select>
            <select aria-label="Repeat" value={schedule} onChange={e => setSchedule(e.target.value as Schedule)} disabled={!canEdit} style={field}>
              {(Object.keys(SCHEDULE_LABEL) as Schedule[]).map(s => <option key={s} value={s}>{SCHEDULE_LABEL[s]}</option>)}
            </select>
            {schedule !== 'NONE' && (
              <select aria-label="Add strong matches automatically" value={autoAdd} onChange={e => setAutoAdd(e.target.value)} disabled={!canEdit} style={field}>
                <option value="">Repeat runs: I review everything</option>
                {[60, 70, 80].map(n => <option key={n} value={n}>Repeat runs: auto-add score {n}+</option>)}
              </select>
            )}
          </div>
          {status?.provider && (
            <div style={{ fontSize: 11, color: overCap ? T.error : T.textMuted }}>
              This search uses up to {plural(calls, 'Google request')}. {status.requestsUsed} of {status.requestCap} used in the last 24 hours.
              {overCap ? ' Not enough left for this search today.' : ''}
            </div>
          )}
          {!canEdit && <div style={{ fontSize: 12, color: T.textMuted }}>View only. Operations admins run searches.</div>}
        </div>
      </Card>

      {run && (
        <div role="status" style={{
          fontSize: 13, borderRadius: 4, padding: 12,
          color: run.status === 'FAILED' ? T.error : running ? T.info : T.text,
          background: run.status === 'FAILED' ? T.errorBg : running ? T.infoBg : T.surface, border: `1px solid ${T.border}`,
        }}>{runSummary(run)}</div>
      )}
      {notice && <div style={{ fontSize: 13, color: T.success, background: T.successBg, borderRadius: 4, padding: 12 }}>{notice}</div>}
      {error && <div style={{ fontSize: 13, color: T.error }}>{error}</div>}

      {searches.length > 0 && (
        <Card>
          <SectionLabel>Saved searches</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {searches.map(s => (
              <div key={s.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '9px 0', borderTop: `1px solid ${T.border}` }}>
                <button onClick={() => { setSearchId(searchId === s.id ? '' : s.id); setView('NEW'); setPage(1); }} style={{
                  flex: '1 1 240px', textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', minWidth: 0,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: searchId === s.id ? T.primary : T.text }}>{s.query}</div>
                  <div style={{ fontSize: 11, color: s.lastRun?.status === 'FAILED' ? T.error : T.textMuted, marginTop: 2 }}>
                    {s.lastRun ? `Last run ${fmtRelative(s.lastRun.createdAt).toLowerCase()}${s.lastRun.status === 'FAILED' ? ' (failed)' : ''}` : 'Not run yet'}
                    {' · '}{s.newProspects} to review
                    {s.schedule !== 'NONE' && s.autoAddMinScore ? ` · auto-adds score ${s.autoAddMinScore}+` : ''}
                  </div>
                </button>
                <select aria-label={`Repeat ${s.query}`} value={s.schedule} disabled={!canEdit} onChange={e => patchSearch(s, { schedule: e.target.value })} style={{ ...field, padding: '6px 8px', fontSize: 12 }}>
                  {(Object.keys(SCHEDULE_LABEL) as Schedule[]).map(k => <option key={k} value={k}>{k === 'NONE' ? 'No repeat' : SCHEDULE_LABEL[k]}</option>)}
                </select>
                {canEdit && <button onClick={() => rerun(s)} disabled={running || !status?.provider} style={{ ...linkBtn, opacity: running || !status?.provider ? 0.5 : 1 }}>Run now</button>}
                {canEdit && <button onClick={() => removeSearch(s)} style={{ ...linkBtn, color: T.textSec }}>Remove</button>}
              </div>
            ))}
          </div>
        </Card>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {(Object.keys(VIEW_LABEL) as View[]).map(v => (
          <button key={v} onClick={() => { setView(v); setPage(1); }} style={{
            padding: '7px 14px', borderRadius: 4, fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
            border: view === v ? `1px solid ${T.primary}` : 'none', background: view === v ? T.primaryTint : T.surface2, color: view === v ? T.primary : T.textSec,
          }}>{VIEW_LABEL[v]}</button>
        ))}
        <select aria-label="Minimum fit score" value={minScore} onChange={e => { setMinScore(e.target.value); setPage(1); }} style={field}>
          <option value="0">Any score</option>
          {[45, 60, 70, 80].map(n => <option key={n} value={n}>Score {n}+</option>)}
        </select>
        <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter by name, area or phone…" style={{ ...field, flex: '1 1 180px', maxWidth: 260 }} />
        {searchId && <button onClick={() => { setSearchId(''); setPage(1); }} style={linkBtn}>Show all searches</button>}
        {canEdit && selected.size > 0 && (
          <button onClick={() => addToPipeline([...selected])} disabled={busy} style={{ ...primaryBtn(busy), marginLeft: 'auto' }}>
            {busy ? 'Adding…' : `Add ${selected.size} to pipeline`}
          </button>
        )}
      </div>

      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, overflow: 'hidden' }}>
        {!isMobile && items.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '32px 2.2fr 60px 1fr 1.6fr 1.3fr', gap: 10, padding: '10px 14px', fontSize: 11, fontWeight: 700, color: T.textSec, textTransform: 'uppercase', letterSpacing: '0.4px', borderBottom: `1px solid ${T.border}` }}>
            <span>
              {canEdit && view === 'NEW' && (
                <input type="checkbox" aria-label="Select all on this page" checked={allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(selectable.map(p => p.id)))} />
              )}
            </span>
            <span>Business</span><span>Fit</span><span>Google rating</span><span>Contact</span><span />
          </div>
        )}
        {items.map(p => {
          const open = openId === p.id;
          const where = [p.category ? humanize(p.category) : 'Category unclear', p.area, p.city].filter(Boolean).join(' · ');
          const rating = p.rating !== null ? `${p.rating.toFixed(1)} · ${p.reviewCount !== null ? plural(p.reviewCount, 'review') : 'reviews not recorded'}` : 'Not recorded';
          const tags = [
            p.signals?.offersDelivery || p.signals?.mentionsDelivery ? 'Delivers' : null,
            ...(p.signals?.competitors ?? []),
            p.signals?.ordersViaChat ? 'Orders on WhatsApp' : null,
          ].filter(Boolean) as string[];
          return (
            <Fragment key={p.id}>
              <div onClick={() => setOpenId(open ? null : p.id)} style={{
                display: isMobile ? 'flex' : 'grid', flexDirection: 'column', gridTemplateColumns: '32px 2.2fr 60px 1fr 1.6fr 1.3fr', gap: isMobile ? 6 : 10,
                padding: '11px 14px', alignItems: isMobile ? 'stretch' : 'center', cursor: 'pointer', borderTop: `1px solid ${T.border}`, background: open ? T.surface2 : 'transparent',
              }}>
                {!isMobile && (
                  <span onClick={e => e.stopPropagation()}>
                    {canEdit && view === 'NEW' && (
                      <input type="checkbox" aria-label={`Select ${p.name}`} checked={selected.has(p.id)} onChange={() => setSelected(prev => {
                        const next = new Set(prev);
                        if (next.has(p.id)) next.delete(p.id); else next.add(p.id);
                        return next;
                      })} />
                    )}
                  </span>
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{p.name} {isMobile && <FitBadge score={p.fitScore} />}</div>
                  <div style={{ fontSize: 11, color: T.textSec, marginTop: 2 }}>{where}</div>
                  {tags.length > 0 && <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 5 }}>{tags.map(t => <span key={t} style={{ ...chip, fontSize: 10, padding: '2px 7px' }}>{t}</span>)}</div>}
                </div>
                {!isMobile && <span><FitBadge score={p.fitScore} /></span>}
                <div style={{ fontSize: 12, color: p.rating !== null ? T.text : T.textMuted }}>{rating}</div>
                <div style={{ fontSize: 12, color: T.text, minWidth: 0 }}>{contactCell(p)}</div>
                {rowActions(p)}
              </div>
              {open && detail(p)}
            </Fragment>
          );
        })}
        {data && items.length === 0 && (
          <div style={{ padding: 28, textAlign: 'center', fontSize: 13, color: T.textSec }}>
            {view === 'NEW'
              ? (searches.length === 0 ? 'No businesses yet. Describe the vendors you want above and run your first search.' : 'Nothing left to review here. Run a search or change the filters.')
              : view === 'ADDED' ? 'Nothing from the lead finder is in the pipeline yet.'
              : view === 'DISMISSED' ? 'No dismissed businesses.'
              : 'No found business has matched an existing GoBuyMe vendor.'}
          </div>
        )}
        {!data && !error && <div style={{ padding: 28, textAlign: 'center', fontSize: 13, color: T.textSec }}>Loading…</div>}
      </div>

      {data && data.total > data.pageSize && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'flex-end', fontSize: 12, color: T.textSec }}>
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={{ ...linkBtn, opacity: page <= 1 ? 0.4 : 1 }}>← Previous</button>
          <span>Page {page} of {pages} · {plural(data.total, 'business', 'businesses')}</span>
          <button disabled={page >= pages} onClick={() => setPage(p => p + 1)} style={{ ...linkBtn, opacity: page >= pages ? 0.4 : 1 }}>Next →</button>
        </div>
      )}
      <div style={{ fontSize: 11, color: T.textMuted, lineHeight: 1.6 }}>
        Contact details come from public business listings and the business&apos;s own website. Nothing is sent automatically. Businesses nobody acts on are deleted after 180 days.
      </div>
    </div>
  );
}
