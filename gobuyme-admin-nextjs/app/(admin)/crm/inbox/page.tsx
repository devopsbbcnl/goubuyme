'use client';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useIsMobile } from '@/hooks/useIsMobile';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import {
  CrmRole, CrmTag, LifecycleStage, RoleBadge, SectionLabel, StageBadge, TagChip, fmtDateTime, fmtNaira, fmtRelative,
} from '@/components/crm/shared';
import {
  CATEGORY_LABEL, PRIORITY_LABEL, PriorityBadge, STATUS_LABEL, SlaChip, TICKET_CATEGORIES, TICKET_PRIORITIES,
  TICKET_STATUSES, TicketCategory, TicketPriority, TicketStatus, TicketStatusBadge, useNow,
} from '@/components/crm/tickets';
import { LinkedTasks } from '@/components/crm/tasks';

// ─── Types ───────────────────────────────────────────────────────────────────

interface TicketRow {
  id: string; number: number; subject: string; category: TicketCategory; priority: TicketPriority;
  status: TicketStatus; channel: string; slaDueAt: string; firstResponseAt: string | null;
  lastMessageAt: string; createdAt: string; csatScore: number | null; requesterRole: CrmRole;
  requester: { id: string; name: string; email: string };
  assignee: { id: string; name: string } | null;
  order: { id: string; orderNumber: string } | null;
  breached: boolean; preview: string; awaitingStaff: boolean;
}

interface Summary {
  open: number; mine: number; unassigned: number; breached: number;
  csatAverage30d: number | null; csatResponses30d: number;
}

interface TicketMessage {
  id: string; body: string; isInternal: boolean; createdAt: string;
  author: { id: string; name: string; role: string };
}

interface TicketDetail {
  id: string; number: number; subject: string; category: TicketCategory; priority: TicketPriority;
  status: TicketStatus; channel: string; slaDueAt: string; firstResponseAt: string | null;
  resolvedAt: string | null; createdAt: string; csatScore: number | null; csatComment: string | null;
  breached: boolean;
  assignee: { id: string; name: string } | null;
  messages: TicketMessage[];
  requester: {
    id: string; name: string; displayName: string; email: string; phone: string | null; role: CrmRole;
    isActive: boolean; createdAt: string; storeCreditBalance: number; tags: CrmTag[]; stage: LifecycleStage; ticketCount: number;
  };
  order: null | {
    id: string; orderNumber: string; status: string; paymentStatus: string; paymentMethod: string;
    totalAmount: number; deliveryFee: number; createdAt: string; cancelReason: string | null; creditIssued: number;
    vendor: { businessName: string; user: { id: string; phone: string | null } };
    customer: { user: { id: string; name: string; phone: string | null } };
    rider: { user: { id: string; name: string; phone: string | null } } | null;
    items: Array<{ id: string; name: string; quantity: number; price: number }>;
  };
}

interface Agent { id: string; name: string; role: string }
interface CannedReply { id: string; title: string; body: string; category: TicketCategory | null }

type View = 'open' | 'mine' | 'unassigned' | 'breached' | 'resolved' | 'all';
const POLL_MS = 30_000;

// ─── Page ────────────────────────────────────────────────────────────────────

export default function InboxPage() {
  return (
    <Suspense fallback={null}>
      <Inbox />
    </Suspense>
  );
}

function Inbox() {
  const { theme: T } = useTheme();
  const { user } = useAuth();
  const isMobile = useIsMobile(1100);
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get('ticket');
  const now = useNow();
  const isOps = user?.role === 'SUPER_ADMIN' || user?.role === 'OPERATIONS_ADMIN';

  const [view, setView] = useState<View>(user?.role === 'SUPPORT_ADMIN' ? 'mine' : 'open');
  const [priority, setPriority] = useState<'' | TicketPriority>('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [rows, setRows] = useState<TicketRow[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [canned, setCanned] = useState<CannedReply[]>([]);
  const [newOpen, setNewOpen] = useState(false);
  const [cannedOpen, setCannedOpen] = useState(false);

  const select = (id: string | null) => router.replace(id ? `/crm/inbox?ticket=${id}` : '/crm/inbox', { scroll: false });

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const loadList = useCallback(() => {
    const params = new URLSearchParams({ view, limit: '50' });
    if (priority) params.set('priority', priority);
    if (debouncedSearch) params.set('search', debouncedSearch);
    return Promise.all([
      api.get<{ data: TicketRow[]; pagination: { total: number } }>(`/admin/crm/tickets?${params}`)
        .then(res => { setRows(res.data); setTotal(res.pagination.total); setListError(''); })
        .catch(err => setListError(err.message)),
      api.get<{ data: Summary }>('/admin/crm/tickets/summary').then(res => setSummary(res.data)).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [view, priority, debouncedSearch]);

  useEffect(() => {
    setLoading(true);
    loadList();
    const t = setInterval(loadList, POLL_MS);
    return () => clearInterval(t);
  }, [loadList]);

  const loadCanned = () => api.get<{ data: CannedReply[] }>('/admin/crm/canned-replies').then(res => setCanned(res.data)).catch(() => {});
  useEffect(() => {
    api.get<{ data: Agent[] }>('/admin/crm/tickets/agents').then(res => setAgents(res.data)).catch(() => {});
    loadCanned();
  }, []);

  const afterTicketChange = () => {
    loadList();
    window.dispatchEvent(new Event('gbm:pending-counts-updated'));
  };

  const tabs: Array<{ key: View; label: string; count?: number }> = [
    { key: 'mine', label: 'Mine', count: summary?.mine },
    { key: 'unassigned', label: 'Unassigned', count: summary?.unassigned },
    { key: 'open', label: 'All open', count: summary?.open },
    { key: 'breached', label: 'Overdue', count: summary?.breached },
    { key: 'resolved', label: 'Resolved' },
    { key: 'all', label: 'Everything' },
  ];

  const field: React.CSSProperties = {
    background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4,
    padding: '8px 10px', color: T.text, fontSize: 13, fontFamily: 'inherit', outline: 'none',
  };

  const showList = !isMobile || !selectedId;
  const showDetail = !isMobile || !!selectedId;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, height: isMobile ? 'auto' : 'calc(100dvh - 130px)', minHeight: 0 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.text }}>Support Inbox</div>
          <div style={{ fontSize: 13, color: T.textSec }}>
            {summary
              ? `${summary.open} open · ${summary.breached} overdue · CSAT ${summary.csatAverage30d ?? '—'}/5 (30d, ${summary.csatResponses30d} ratings)`
              : 'Loading…'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setCannedOpen(true)} style={{ ...field, fontWeight: 700, cursor: 'pointer', padding: '9px 14px' }}>Saved replies</button>
          <button onClick={() => setNewOpen(true)} style={{ padding: '9px 16px', borderRadius: 4, border: 'none', background: T.primary, color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
            Log a ticket
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 14, flex: 1, minHeight: 0 }}>
        {/* Queue */}
        {showList && (
          <div style={{
            width: isMobile ? '100%' : 360, flexShrink: 0, display: 'flex', flexDirection: 'column',
            background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, minHeight: 0,
          }}>
            <div style={{ padding: 12, borderBottom: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {tabs.map(t => (
                  <button key={t.key} onClick={() => setView(t.key)} style={{
                    padding: '5px 9px', borderRadius: 4, fontSize: 11, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
                    border: view === t.key ? `1px solid ${T.primary}` : `1px solid transparent`,
                    background: view === t.key ? T.primaryTint : T.surface2,
                    color: view === t.key ? T.primary : t.key === 'breached' && (t.count ?? 0) > 0 ? T.error : T.textSec,
                  }}>
                    {t.label}{t.count !== undefined ? ` ${t.count}` : ''}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="#123, name, email, order…" style={{ ...field, flex: 1, minWidth: 0 }} />
                <select aria-label="Priority" value={priority} onChange={e => setPriority(e.target.value as '' | TicketPriority)} style={field}>
                  <option value="">Any priority</option>
                  {TICKET_PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
                </select>
              </div>
            </div>

            <div style={{ overflowY: 'auto', flex: 1, maxHeight: isMobile ? 'none' : undefined }}>
              {loading && rows.length === 0 ? (
                <div style={{ padding: 20, fontSize: 13, color: T.textSec }}>Loading tickets…</div>
              ) : listError ? (
                <div style={{ padding: 20, fontSize: 13, color: T.error }}>{listError}</div>
              ) : rows.length === 0 ? (
                <div style={{ padding: 28, fontSize: 13, color: T.textSec, textAlign: 'center' }}>
                  {view === 'mine' ? 'Nothing assigned to you. Check Unassigned.' : 'No tickets here. 🎉'}
                </div>
              ) : rows.map(r => {
                const active = r.id === selectedId;
                return (
                  <button key={r.id} onClick={() => select(r.id)} style={{
                    display: 'block', width: '100%', textAlign: 'left', padding: '12px 14px', fontFamily: 'inherit', cursor: 'pointer',
                    border: 'none', borderBottom: `1px solid ${T.border}`,
                    borderLeft: `3px solid ${active ? T.primary : r.breached ? T.error : 'transparent'}`,
                    background: active ? T.surface2 : 'transparent',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: T.textMuted, fontWeight: 700 }}>#{r.number} · {r.requesterRole.toLowerCase()}</span>
                      <span style={{ fontSize: 11, color: T.textMuted }}>{fmtRelative(r.lastMessageAt)}</span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: r.awaitingStaff ? 800 : 600, color: T.text, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.awaitingStaff && <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 9999, background: T.primary, marginRight: 6, verticalAlign: 'middle' }} />}
                      {r.subject}
                    </div>
                    <div style={{ fontSize: 12, color: T.textSec, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.requester.name} — {r.preview}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 7, flexWrap: 'wrap' }}>
                      <PriorityBadge priority={r.priority} />
                      <TicketStatusBadge status={r.status} />
                      <SlaChip status={r.status} slaDueAt={r.slaDueAt} firstResponseAt={r.firstResponseAt} now={now} />
                      <span style={{ fontSize: 11, color: T.textMuted, marginLeft: 'auto' }}>{r.assignee ? r.assignee.name.split(' ')[0] : 'Unassigned'}</span>
                    </div>
                  </button>
                );
              })}
              {total > rows.length && (
                <div style={{ padding: 12, fontSize: 12, color: T.textSec, textAlign: 'center' }}>
                  Showing {rows.length} of {total}. Narrow with search or filters.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Ticket */}
        {showDetail && (
          selectedId ? (
            <TicketPane
              key={selectedId}
              ticketId={selectedId}
              agents={agents}
              canned={canned}
              isOps={isOps}
              isMobile={isMobile}
              now={now}
              onBack={() => select(null)}
              onChanged={afterTicketChange}
            />
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, color: T.textSec, fontSize: 13 }}>
              Select a ticket to start working on it.
            </div>
          )
        )}
      </div>

      <NewTicketModal open={newOpen} onClose={() => setNewOpen(false)} onCreated={id => { setNewOpen(false); afterTicketChange(); select(id); }} />
      <CannedRepliesModal open={cannedOpen} onClose={() => setCannedOpen(false)} replies={canned} canEdit={isOps} onChanged={loadCanned} />
    </div>
  );
}

// ─── Ticket pane ─────────────────────────────────────────────────────────────

function TicketPane({ ticketId, agents, canned, isOps, isMobile, now, onBack, onChanged }: {
  ticketId: string; agents: Agent[]; canned: CannedReply[]; isOps: boolean; isMobile: boolean; now: number;
  onBack: () => void; onChanged: () => void;
}) {
  const { theme: T } = useTheme();
  const { user } = useAuth();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [creditOpen, setCreditOpen] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() =>
    api.get<{ data: TicketDetail }>(`/admin/crm/tickets/${ticketId}`)
      .then(res => { setTicket(res.data); setError(''); })
      .catch(err => setError(err.message)),
  [ticketId]);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const messageCount = ticket?.messages.length ?? 0;
  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [messageCount]);

  const patch = async (body: Record<string, unknown>) => {
    setActionError('');
    try {
      await api.patch(`/admin/crm/tickets/${ticketId}`, body);
      await load();
      onChanged();
    } catch (err) { setActionError((err as Error).message); }
  };

  if (error) return <div style={{ flex: 1, padding: 20, color: T.error, fontSize: 13 }}>{error}</div>;
  if (!ticket) return <div style={{ flex: 1, padding: 20, color: T.textSec, fontSize: 13 }}>Loading ticket…</div>;

  const panel: React.CSSProperties = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4 };
  const selectStyle: React.CSSProperties = {
    width: '100%', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4,
    padding: '7px 8px', color: T.text, fontSize: 12, fontFamily: 'inherit', outline: 'none',
  };
  const r = ticket.requester;
  // Support agents may only take or drop tickets themselves; ops can assign anyone.
  const assignable = isOps ? agents : agents.filter(a => a.id === user?.id);

  return (
    <div style={{ flex: 1, display: 'flex', gap: 14, minWidth: 0, minHeight: 0, flexDirection: isMobile ? 'column' : 'row' }}>
      {/* Conversation */}
      <div style={{ ...panel, flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: isMobile ? 480 : 0 }}>
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${T.border}` }}>
          {isMobile && (
            <button onClick={onBack} style={{ background: 'none', border: 'none', color: T.primary, fontWeight: 700, fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 6, fontFamily: 'inherit' }}>← Queue</button>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: T.textMuted, fontWeight: 700 }}>#{ticket.number}</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: T.text }}>{ticket.subject}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 }}>
            <PriorityBadge priority={ticket.priority} />
            <TicketStatusBadge status={ticket.status} />
            <SlaChip status={ticket.status} slaDueAt={ticket.slaDueAt} firstResponseAt={ticket.firstResponseAt} now={now} />
            <span style={{ fontSize: 11, color: T.textMuted }}>
              {CATEGORY_LABEL[ticket.category]} · via {ticket.channel.toLowerCase()} · opened {fmtDateTime(ticket.createdAt)}
            </span>
          </div>
        </div>

        <div ref={threadRef} style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {ticket.messages.map(m => {
            const fromRequester = m.author.id === r.id;
            return (
              <div key={m.id} style={{ alignSelf: fromRequester ? 'flex-start' : 'flex-end', maxWidth: '82%' }}>
                <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 3, textAlign: fromRequester ? 'left' : 'right' }}>
                  {m.isInternal ? '🔒 Internal note · ' : ''}{fromRequester ? r.displayName : m.author.name} · {fmtDateTime(m.createdAt)}
                </div>
                <div style={{
                  padding: '10px 13px', borderRadius: 4, fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  color: T.text,
                  background: m.isInternal ? T.warningBg : fromRequester ? T.surface2 : T.primaryTint,
                  border: `1px solid ${m.isInternal ? T.warning : fromRequester ? T.border : 'transparent'}`,
                }}>{m.body}</div>
              </div>
            );
          })}
          {ticket.csatScore !== null && (
            <div style={{ alignSelf: 'center', fontSize: 12, color: T.textSec, background: T.surface2, borderRadius: 999, padding: '5px 12px' }}>
              Rated {'★'.repeat(ticket.csatScore)}{'☆'.repeat(5 - ticket.csatScore)}{ticket.csatComment ? ` — "${ticket.csatComment}"` : ''}
            </div>
          )}
        </div>

        <Composer ticket={ticket} canned={canned} onSent={async () => { await load(); onChanged(); }} />
      </div>

      {/* Details */}
      <div style={{ width: isMobile ? '100%' : 300, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
        <div style={{ ...panel, padding: 14 }}>
          <SectionLabel>Ticket</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label style={{ fontSize: 11, color: T.textSec, fontWeight: 700 }}>Status
              <select value={ticket.status} onChange={e => patch({ status: e.target.value })} style={{ ...selectStyle, marginTop: 4 }}>
                {TICKET_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 11, color: T.textSec, fontWeight: 700 }}>Priority
              <select value={ticket.priority} onChange={e => patch({ priority: e.target.value })} style={{ ...selectStyle, marginTop: 4 }}>
                {TICKET_PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 11, color: T.textSec, fontWeight: 700, gridColumn: '1 / -1' }}>Category
              <select value={ticket.category} onChange={e => patch({ category: e.target.value })} style={{ ...selectStyle, marginTop: 4 }}>
                {TICKET_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 11, color: T.textSec, fontWeight: 700, gridColumn: '1 / -1' }}>Assignee
              <select value={ticket.assignee?.id ?? ''} onChange={e => patch({ assigneeId: e.target.value || null })} style={{ ...selectStyle, marginTop: 4 }}>
                <option value="">Unassigned</option>
                {ticket.assignee && !assignable.some(a => a.id === ticket.assignee!.id) && (
                  <option value={ticket.assignee.id}>{ticket.assignee.name}</option>
                )}
                {assignable.map(a => <option key={a.id} value={a.id}>{a.id === user?.id ? `${a.name} (me)` : a.name}</option>)}
              </select>
            </label>
          </div>
          {actionError && <div style={{ fontSize: 12, color: T.error, marginTop: 8 }}>{actionError}</div>}
          {isOps && (
            <button onClick={() => setCreditOpen(true)} style={{
              marginTop: 10, width: '100%', padding: '8px 12px', borderRadius: 4, border: `1px solid ${T.border}`, background: T.surface2,
              color: T.text, fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
            }}>Compensate with store credit</button>
          )}
        </div>

        <div style={{ ...panel, padding: 14 }}>
          <SectionLabel>Requester</SectionLabel>
          <Link href={`/crm/profiles/${r.id}`} style={{ fontSize: 14, fontWeight: 800, color: T.text, textDecoration: 'none' }}>{r.displayName} ↗</Link>
          <div style={{ fontSize: 12, color: T.textSec, marginTop: 2, wordBreak: 'break-word' }}>{r.email}{r.phone ? ` · ${r.phone}` : ''}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            <RoleBadge role={r.role} />
            <StageBadge stage={r.stage} />
            {!r.isActive && <span style={{ fontSize: 11, fontWeight: 700, color: T.error, background: T.errorBg, borderRadius: 4, padding: '3px 9px' }}>Suspended</span>}
          </div>
          {r.tags.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>{r.tags.map(t => <TagChip key={t.id} tag={t} />)}</div>
          )}
          <div style={{ fontSize: 12, color: T.textSec, marginTop: 8 }}>
            {r.ticketCount} ticket{r.ticketCount === 1 ? '' : 's'} total · {fmtNaira(r.storeCreditBalance)} credit
          </div>
        </div>

        <div style={{ ...panel, padding: 14 }}>
          <LinkedTasks links={{ ticketId: ticket.id, relatedUserId: r.id }} defaultTitle={`Follow up on ticket #${ticket.number}`} />
        </div>

        {ticket.order && (
          <div style={{ ...panel, padding: 14 }}>
            <SectionLabel>Order #{ticket.order.orderNumber}</SectionLabel>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              <Badge status={ticket.order.status as 'DELIVERED'} />
              <Badge status={ticket.order.paymentStatus as 'PAID'} />
            </div>
            {[
              ['Total', fmtNaira(ticket.order.totalAmount)],
              ['Payment', ticket.order.paymentMethod.replace(/_/g, ' ').toLowerCase()],
              ['Placed', fmtDateTime(ticket.order.createdAt)],
              ['Vendor', `${ticket.order.vendor.businessName}${ticket.order.vendor.user.phone ? ` · ${ticket.order.vendor.user.phone}` : ''}`],
              ['Customer', `${ticket.order.customer.user.name}${ticket.order.customer.user.phone ? ` · ${ticket.order.customer.user.phone}` : ''}`],
              ['Rider', ticket.order.rider ? `${ticket.order.rider.user.name}${ticket.order.rider.user.phone ? ` · ${ticket.order.rider.user.phone}` : ''}` : 'Not assigned'],
              ...(ticket.order.cancelReason ? [['Cancelled', ticket.order.cancelReason]] : []),
              ...(ticket.order.creditIssued ? [['Credit issued', fmtNaira(ticket.order.creditIssued)]] : []),
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, padding: '5px 0', borderBottom: `1px solid ${T.border}` }}>
                <span style={{ color: T.textSec }}>{label}</span>
                <span style={{ color: T.text, fontWeight: 600, textAlign: 'right' }}>{value}</span>
              </div>
            ))}
            <div style={{ marginTop: 8 }}>
              {ticket.order.items.map(i => (
                <div key={i.id} style={{ fontSize: 12, color: T.textSec, padding: '2px 0' }}>{i.quantity}× {i.name}</div>
              ))}
            </div>
          </div>
        )}
      </div>

      <TicketCreditModal open={creditOpen} onClose={() => setCreditOpen(false)} ticket={ticket} onDone={async () => { await load(); onChanged(); }} />
    </div>
  );
}

// ─── Composer ────────────────────────────────────────────────────────────────

function Composer({ ticket, canned, onSent }: { ticket: TicketDetail; canned: CannedReply[]; onSent: () => Promise<void> }) {
  const { theme: T } = useTheme();
  const [mode, setMode] = useState<'reply' | 'note'>('reply');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const closed = ticket.status === 'CLOSED';
  const effectiveMode = closed ? 'note' : mode;

  const firstName = ticket.requester.name.split(' ')[0];
  const insertCanned = (id: string) => {
    const reply = canned.find(c => c.id === id);
    if (!reply) return;
    const text = reply.body.replace(/\{\{\s*name\s*\}\}/gi, firstName).replace(/\{\{\s*order\s*\}\}/gi, ticket.order ? `#${ticket.order.orderNumber}` : 'your order');
    setBody(b => (b.trim() ? `${b.trim()}\n\n${text}` : text));
  };

  const send = async (status?: TicketStatus) => {
    if (!body.trim()) return;
    setSending(true);
    setError('');
    try {
      await api.post(`/admin/crm/tickets/${ticket.id}/messages`, { body, isInternal: effectiveMode === 'note', status });
      setBody('');
      await onSent();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  const suggested = canned.filter(c => !c.category || c.category === ticket.category);
  const btn = (primary: boolean): React.CSSProperties => ({
    padding: '8px 14px', borderRadius: 4, fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
    border: primary ? 'none' : `1px solid ${T.border}`, background: primary ? T.primary : T.surface2, color: primary ? '#fff' : T.text,
    opacity: sending || !body.trim() ? 0.6 : 1,
  });

  return (
    <div style={{ borderTop: `1px solid ${T.border}`, padding: 12, background: effectiveMode === 'note' ? T.warningBg : 'transparent' }}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
        {(['reply', 'note'] as const).map(m => (
          <button key={m} disabled={closed && m === 'reply'} onClick={() => setMode(m)} style={{
            padding: '5px 10px', borderRadius: 4, fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
            border: 'none', background: effectiveMode === m ? T.surface3 : 'transparent',
            color: effectiveMode === m ? T.text : T.textSec, opacity: closed && m === 'reply' ? 0.4 : 1,
          }}>{m === 'reply' ? `Reply to ${firstName}` : '🔒 Internal note'}</button>
        ))}
        {suggested.length > 0 && (
          <select aria-label="Insert saved reply" value="" onChange={e => insertCanned(e.target.value)} style={{
            marginLeft: 'auto', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4,
            padding: '5px 8px', color: T.textSec, fontSize: 12, fontFamily: 'inherit',
          }}>
            <option value="">Insert saved reply…</option>
            {suggested.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        )}
      </div>
      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(); }}
        rows={4}
        maxLength={4000}
        placeholder={effectiveMode === 'note' ? 'Only staff will see this.' : `Write to ${firstName}. They get a push notification and an email.`}
        style={{ width: '100%', boxSizing: 'border-box', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, padding: 10, color: T.text, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', outline: 'none' }}
      />
      {error && <div style={{ fontSize: 12, color: T.error, marginTop: 6 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8, flexWrap: 'wrap' }}>
        {closed && <span style={{ fontSize: 12, color: T.textSec, marginRight: 'auto', alignSelf: 'center' }}>Closed. Only internal notes can be added.</span>}
        {effectiveMode === 'reply' ? (
          <>
            <button disabled={sending || !body.trim()} onClick={() => send('RESOLVED')} style={btn(false)}>Send & resolve</button>
            <button disabled={sending || !body.trim()} onClick={() => send()} style={btn(true)}>{sending ? 'Sending…' : 'Send reply'}</button>
          </>
        ) : (
          <button disabled={sending || !body.trim()} onClick={() => send()} style={btn(true)}>{sending ? 'Saving…' : 'Add note'}</button>
        )}
      </div>
    </div>
  );
}

// ─── Modals ──────────────────────────────────────────────────────────────────

function useField() {
  const { theme: T } = useTheme();
  return {
    width: '100%', boxSizing: 'border-box', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4,
    padding: '10px 12px', color: T.text, fontSize: 13, fontFamily: 'inherit', outline: 'none',
  } as React.CSSProperties;
}

function Label({ children }: { children: React.ReactNode }) {
  const { theme: T } = useTheme();
  return <div style={{ fontSize: 12, fontWeight: 700, color: T.textSec, marginBottom: -6 }}>{children}</div>;
}

function SubmitButton({ onClick, saving, label, disabled }: { onClick: () => void; saving: boolean; label: string; disabled?: boolean }) {
  const { theme: T } = useTheme();
  return (
    <button onClick={onClick} disabled={saving || disabled} style={{
      padding: '10px 16px', borderRadius: 4, border: 'none', background: T.primary, color: '#fff',
      fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', opacity: saving || disabled ? 0.6 : 1,
    }}>{saving ? 'Working…' : label}</button>
  );
}

function TicketCreditModal({ open, onClose, ticket, onDone }: { open: boolean; onClose: () => void; ticket: TicketDetail; onDone: () => Promise<void> }) {
  const { theme: T } = useTheme();
  const field = useField();
  const [amount, setAmount] = useState(ticket.order ? String(Math.min(ticket.order.deliveryFee, 50_000)) : '');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      await api.post(`/admin/crm/tickets/${ticket.id}/credit`, { amount: Number(amount), reason });
      onClose();
      await onDone();
    } catch (err) { setError((err as Error).message); } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Store credit for ticket #${ticket.number}`} width={440}>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 12, color: T.textSec, lineHeight: 1.5 }}>
          Credit goes to {ticket.requester.displayName}&apos;s wallet for their next order. It&apos;s limited to one credit per ticket (max ₦50,000) and is logged as an internal note.
        </div>
        <Label>Amount (₦)</Label>
        <input type="number" min={1} max={50000} value={amount} onChange={e => setAmount(e.target.value)} style={field} />
        <Label>Reason</Label>
        <input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Missing item refund" style={field} />
        {error && <div style={{ fontSize: 12, color: T.error }}>{error}</div>}
        <SubmitButton onClick={submit} saving={saving} label="Issue credit" />
      </div>
    </Modal>
  );
}

interface ProfileHit { id: string; displayName: string; email: string; role: CrmRole }

function NewTicketModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const { theme: T } = useTheme();
  const field = useField();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<ProfileHit[]>([]);
  const [requester, setRequester] = useState<ProfileHit | null>(null);
  const [category, setCategory] = useState<TicketCategory>('ORDER_ISSUE');
  const [channel, setChannel] = useState<'PHONE' | 'EMAIL' | 'ADMIN'>('PHONE');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (requester || query.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(() => {
      api.get<{ data: ProfileHit[] }>(`/admin/crm/profiles?limit=6&search=${encodeURIComponent(query.trim())}`)
        .then(res => setHits(res.data)).catch(() => setHits([]));
    }, 300);
    return () => clearTimeout(t);
  }, [query, requester]);

  const reset = () => { setQuery(''); setRequester(null); setSubject(''); setBody(''); setError(''); };

  const submit = async () => {
    if (!requester) return;
    setSaving(true);
    setError('');
    try {
      const res = await api.post<{ data: { id: string } }>('/admin/crm/tickets', { requesterId: requester.id, category, channel, subject, body });
      reset();
      onCreated(res.data.id);
    } catch (err) { setError((err as Error).message); } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Log a ticket" width={520}>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 12, color: T.textSec }}>For a problem reported by phone, email or in person. The ticket is assigned to you.</div>
        <Label>Customer, vendor or rider</Label>
        {requester ? (
          <div style={{ ...field, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span><strong>{requester.displayName}</strong> · {requester.email}</span>
            <button onClick={() => setRequester(null)} style={{ background: 'none', border: 'none', color: T.primary, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Change</button>
          </div>
        ) : (
          <div>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name, email, phone…" style={field} />
            {hits.length > 0 && (
              <div style={{ border: `1px solid ${T.border}`, borderTop: 'none', borderRadius: '0 0 4px 4px' }}>
                {hits.map(h => (
                  <button key={h.id} onClick={() => setRequester(h)} style={{
                    display: 'flex', justifyContent: 'space-between', width: '100%', padding: '9px 12px', background: T.surface,
                    border: 'none', borderBottom: `1px solid ${T.border}`, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                  }}>
                    <span style={{ fontSize: 13, color: T.text }}><strong>{h.displayName}</strong> · {h.email}</span>
                    <RoleBadge role={h.role} />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: T.textSec }}>Category
            <select value={category} onChange={e => setCategory(e.target.value as TicketCategory)} style={{ ...field, marginTop: 6 }}>
              {TICKET_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 12, fontWeight: 700, color: T.textSec }}>Reported via
            <select value={channel} onChange={e => setChannel(e.target.value as 'PHONE' | 'EMAIL' | 'ADMIN')} style={{ ...field, marginTop: 6 }}>
              <option value="PHONE">Phone</option>
              <option value="EMAIL">Email</option>
              <option value="ADMIN">Other</option>
            </select>
          </label>
        </div>
        <Label>Subject (optional)</Label>
        <input value={subject} onChange={e => setSubject(e.target.value)} maxLength={140} style={field} />
        <Label>What did they report?</Label>
        <textarea value={body} onChange={e => setBody(e.target.value)} rows={5} maxLength={4000} style={{ ...field, resize: 'vertical' }} />
        {error && <div style={{ fontSize: 12, color: T.error }}>{error}</div>}
        <SubmitButton onClick={submit} saving={saving} label="Create ticket" disabled={!requester || !body.trim()} />
      </div>
    </Modal>
  );
}

function CannedRepliesModal({ open, onClose, replies, canEdit, onChanged }: {
  open: boolean; onClose: () => void; replies: CannedReply[]; canEdit: boolean; onChanged: () => void;
}) {
  const { theme: T } = useTheme();
  const field = useField();
  const [editing, setEditing] = useState<CannedReply | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<'' | TicketCategory>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const startEdit = (r: CannedReply | null) => {
    setEditing(r);
    setTitle(r?.title ?? '');
    setBody(r?.body ?? '');
    setCategory(r?.category ?? '');
    setError('');
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = { title, body, category: category || null };
      if (editing) await api.patch(`/admin/crm/canned-replies/${editing.id}`, payload);
      else await api.post('/admin/crm/canned-replies', payload);
      startEdit(null);
      onChanged();
    } catch (err) { setError((err as Error).message); } finally { setSaving(false); }
  };

  const remove = async (r: CannedReply) => {
    try {
      await api.del(`/admin/crm/canned-replies/${r.id}`);
      if (editing?.id === r.id) startEdit(null);
      onChanged();
    } catch (err) { setError((err as Error).message); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Saved replies" width={620}>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {canEdit && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14, background: T.surface2, borderRadius: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>{editing ? `Edit "${editing.title}"` : 'New saved reply'}</div>
            <input value={title} onChange={e => setTitle(e.target.value)} maxLength={80} placeholder="Title, e.g. Missing item apology" style={{ ...field, background: T.surface }} />
            <select value={category} onChange={e => setCategory(e.target.value as '' | TicketCategory)} style={{ ...field, background: T.surface }}>
              <option value="">Suggest for every category</option>
              {TICKET_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
            </select>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={4} maxLength={4000} placeholder="Hi {{name}}, sorry about {{order}}…" style={{ ...field, background: T.surface, resize: 'vertical' }} />
            <div style={{ fontSize: 11, color: T.textSec }}>{'{{name}}'} becomes the requester&apos;s first name and {'{{order}}'} the order number.</div>
            {error && <div style={{ fontSize: 12, color: T.error }}>{error}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              {editing && <button onClick={() => startEdit(null)} style={{ background: 'none', border: 'none', color: T.textSec, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>}
              <SubmitButton onClick={save} saving={saving} label={editing ? 'Save changes' : 'Add reply'} disabled={!title.trim() || !body.trim()} />
            </div>
          </div>
        )}
        {replies.length === 0 ? (
          <div style={{ fontSize: 13, color: T.textSec }}>No saved replies yet.</div>
        ) : replies.map(r => (
          <div key={r.id} style={{ borderBottom: `1px solid ${T.border}`, paddingBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>
                {r.title} <span style={{ fontSize: 11, color: T.textMuted, fontWeight: 600 }}>{r.category ? CATEGORY_LABEL[r.category] : 'All categories'}</span>
              </div>
              {canEdit && (
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => startEdit(r)} style={{ background: 'none', border: 'none', color: T.primary, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Edit</button>
                  <button onClick={() => remove(r)} style={{ background: 'none', border: 'none', color: T.error, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
                </div>
              )}
            </div>
            <div style={{ fontSize: 12, color: T.textSec, marginTop: 4, whiteSpace: 'pre-wrap' }}>{r.body}</div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
