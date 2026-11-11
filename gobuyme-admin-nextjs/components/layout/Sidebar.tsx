'use client';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { useIsMobile } from '@/hooks/useIsMobile';


type NavItem = {
  href: string;
  label: string;
  icon: string;
  pendingKey: null | 'vendors' | 'riders' | 'errorLogs' | 'tickets' | 'tasks' | 'agents' | 'promotions';
  minRole?: 'OPERATIONS_ADMIN' | 'SUPER_ADMIN';
  /** Extra path prefixes that should highlight this item. */
  activePrefixes?: string[];
  /** Highlight only on this exact path (for parents like /crm). */
  exact?: boolean;
};

type NavSection = { key: string; title?: string; items: NavItem[] };

// Untitled sections (Overview) are always visible and never collapse.
const NAV_SECTIONS: NavSection[] = [
  { key: 'overview', items: [
    { href: '/dashboard',  label: 'Overview',     icon: '▦',  pendingKey: null },
  ] },
  { key: 'operations', title: 'Operations', items: [
    { href: '/agents',     label: 'Agents',       icon: '🤖', pendingKey: 'agents' },
    { href: '/ops-briefing', label: 'Ops Briefing', icon: '🗞️', pendingKey: null },
    { href: '/vendors',    label: 'Vendors',       icon: '🏪', pendingKey: 'vendors' },
    { href: '/promotions', label: 'Promotions',    icon: '🎯', pendingKey: 'promotions' },
    { href: '/riders',     label: 'Riders',        icon: '🏍️', pendingKey: 'riders' },
    { href: '/companies',  label: 'Logistics',     icon: '🚚', pendingKey: null },
    { href: '/orders',     label: 'Orders',        icon: '📦', pendingKey: null },
    { href: '/customers',  label: 'Customers',     icon: '👥', pendingKey: null },
  ] },
  { key: 'insights', title: 'Insights', items: [
    { href: '/analytics',  label: 'Analytics',     icon: '📈', pendingKey: null },
    { href: '/app-usage',  label: 'App Usage',     icon: '📊', pendingKey: null },
  ] },
  { key: 'crm', title: 'CRM & Marketing', items: [
    { href: '/crm',        label: 'CRM Overview',  icon: '🧩', pendingKey: null, exact: true },
    { href: '/crm/inbox',  label: 'Support Inbox', icon: '🎧', pendingKey: 'tickets' },
    { href: '/crm/tasks',  label: 'Tasks',         icon: '✅', pendingKey: 'tasks' },
    { href: '/crm/profiles', label: 'CRM Profiles', icon: '🧭', pendingKey: null },
    { href: '/crm/pipeline', label: 'Pipeline',   icon: '🤝', pendingKey: null, minRole: 'OPERATIONS_ADMIN' },
    { href: '/crm/campaigns', label: 'Marketing', icon: '📣', pendingKey: null, minRole: 'OPERATIONS_ADMIN', activePrefixes: ['/crm/segments', '/crm/automations'] },
    { href: '/broadcasts', label: 'Broadcasts',  icon: '📢', pendingKey: null },
  ] },
  { key: 'finance', title: 'Finance', items: [
    { href: '/pricing',    label: 'Pricing',       icon: '💰', pendingKey: null, minRole: 'OPERATIONS_ADMIN' },
    { href: '/payouts',    label: 'Payouts',       icon: '💳', pendingKey: null, minRole: 'OPERATIONS_ADMIN' },
  ] },
  { key: 'system', title: 'System', items: [
    { href: '/error-logs', label: 'Error Logs',    icon: '🐞', pendingKey: 'errorLogs' },
    { href: '/security',   label: 'Security',      icon: '🔒', pendingKey: null, minRole: 'OPERATIONS_ADMIN' },
    { href: '/audit',      label: 'Audit Logs',    icon: '📋', pendingKey: null },
    { href: '/server-logs', label: 'Server Logs',  icon: '📜', pendingKey: null, minRole: 'SUPER_ADMIN' },
    { href: '/admins',     label: 'Admin Users',   icon: '🔐', pendingKey: null, minRole: 'SUPER_ADMIN' },
    { href: '/settings',   label: 'Settings',      icon: '⚙️', pendingKey: null },
  ] },
];

/** One link as the renderer sees it, whichever list it came from. */
type RenderItem = { href: string; label: string; icon: string; active: boolean; badge: number; badgeKind?: 'error' };
type RenderSection = { key: string; title?: string; items: RenderItem[] };

const NAV_OPEN_KEY = 'gbm:nav-open';
const NAV_RAIL_KEY = 'gbm:nav-rail';
const RAIL_WIDTH = 64;

function readStorage<T>(key: string, fallback: T): T {
  try {
    if (typeof window === 'undefined') return fallback;
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}
function writeStorage(key: string, value: unknown) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable: nav still works */ }
}

type SmoisNavItem = { href: string; label: string; icon: string; cap?: string; badge?: 'approvals' | 'tasks' | 'inbox'; exact?: boolean };
const SMOIS_NAV: SmoisNavItem[] = [
  { href: '/smois',            label: 'Overview',     icon: '📱', exact: true },
  { href: '/smois/accounts',   label: 'Accounts',     icon: '🔗' },
  { href: '/smois/content',    label: 'Content',      icon: '✍️' },
  { href: '/smois/calendar',   label: 'Calendar',     icon: '🗓️' },
  { href: '/smois/approvals',  label: 'Approvals',    icon: '✔️', badge: 'approvals' },
  { href: '/smois/publishing', label: 'Publishing',   icon: '🚀' },
  { href: '/smois/inbox',      label: 'Social Inbox', icon: '💬', cap: 'handleInbox', badge: 'inbox' },
  { href: '/smois/contacts',   label: 'Contacts',     icon: '📇', cap: 'handleInbox' },
  { href: '/smois/campaigns',  label: 'Campaigns',    icon: '📣', cap: 'viewCampaigns' },
  { href: '/smois/media',      label: 'Media Library', icon: '🖼️' },
  { href: '/smois/listening',  label: 'Listening',    icon: '👂', cap: 'viewAnalytics' },
  { href: '/smois/competitors', label: 'Competitors', icon: '🔭', cap: 'viewAnalytics' },
  { href: '/smois/assistant',  label: 'Insights & AI', icon: '✨', cap: 'viewAnalytics' },
  { href: '/smois/tasks',      label: 'Social Tasks', icon: '📌', badge: 'tasks' },
  { href: '/smois/analytics',  label: 'Analytics',    icon: '📊', cap: 'viewAnalytics' },
  { href: '/smois/targets',    label: 'Targets',      icon: '🎯' },
  { href: '/smois/performance', label: 'Performance', icon: '🏅' },
  { href: '/smois/reports',    label: 'Reports',      icon: '🧾' },
  { href: '/smois/integrations', label: 'Integrations', icon: '🔌', cap: 'viewAll' },
  { href: '/smois/team',       label: 'Social Team',  icon: '🧑‍🤝‍🧑', cap: 'viewAll' },
  { href: '/smois/activity',   label: 'Activity Log', icon: '🕘', cap: 'viewActivity' },
  { href: '/smois/settings',   label: 'Social Settings', icon: '🎛️', cap: 'configure' },
];

const ROLE_RANK: Record<string, number> = {
  SUPPORT_ADMIN: 0,
  OPERATIONS_ADMIN: 1,
  SUPER_ADMIN: 2,
};

function canSeeItem(userRole: string, minRole?: string) {
  if (!minRole) return true;
  return (ROLE_RANK[userRole] ?? 0) >= (ROLE_RANK[minRole] ?? 0);
}

export function Sidebar({ isOpen = false, onClose }: { isOpen?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const { theme: T, isDark, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const isMobile = useIsMobile();
  const [smois, setSmois] = useState<{ can: Record<string, boolean> } | null>(null);
  const [smoisCounts, setSmoisCounts] = useState({ approvals: 0, tasks: 0, inbox: 0 });
  const [pending, setPending] = useState<{ vendors: number; riders: number; errorLogs: number; tickets: number; tasks: number; agents: number; promotions: number }>({ vendors: 0, riders: 0, errorLogs: 0, tickets: 0, tasks: 0, agents: 0, promotions: 0 });
  // Sidebar only mounts after the client session is ready, so reading storage here cannot cause a hydration mismatch.
  const [openMap, setOpenMap] = useState<Record<string, boolean>>(() => readStorage(NAV_OPEN_KEY, {}));
  const [railPref, setRailPref] = useState<boolean>(() => readStorage(NAV_RAIL_KEY, false));
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => { setReduceMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches); }, []);

  // Probe SMOIS access quietly (a 403 just means this person has none) and keep its badges fresh.
  useEffect(() => {
    if (!user) return;
    let live = true;
    const get = (p: string) => fetch('/api/proxy/admin/smois' + p).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const load = async () => {
      const me = await get('/me');
      if (!live) return;
      if (!me?.data) { setSmois(null); return; }
      setSmois(me.data);
      const [ap, tk, ib] = await Promise.all([
        me.data.can.approve ? get('/approvals?view=queue') : null,
        get('/tasks?view=mine'),
        me.data.can.handleInbox ? get('/inbox/summary?period=today') : null,
      ]);
      if (live) setSmoisCounts({ approvals: ap?.data?.filter((v: { canReview: boolean }) => v.canReview).length ?? 0, tasks: tk?.data?.counts?.overdue ?? 0, inbox: ib?.data?.now?.overdue ?? 0 });
    };
    load();
    const t = setInterval(load, 60_000);
    window.addEventListener('gbm:pending-counts-updated', load);
    return () => { live = false; clearInterval(t); window.removeEventListener('gbm:pending-counts-updated', load); };
  }, [user]);

  useEffect(() => {
    if (user?.role === 'SOCIAL_MEDIA') return; // social media staff can't read these admin lists
    const loadPendingCounts = () => {
      Promise.allSettled([
        api.get<{ data: Array<{ approvalStatus: string }> }>('/admin/vendors?status=PENDING&limit=200'),
        api.get<{ data: Array<{ approvalStatus: string }> }>('/admin/riders?status=PENDING&limit=200'),
        api.get<{ pagination: { total: number } }>('/admin/error-logs?resolved=false&limit=1'),
        api.get<{ data: { unassigned: number; mine: number } }>('/admin/crm/tickets/summary'),
        api.get<{ data: { counts: { mineOverdue: number } } }>('/admin/crm/tasks?view=mine'),
        api.get<{ pagination: { total: number } }>('/admin/agents/suggestions?view=pending&limit=1'),
        api.get<{ pagination: { total: number } }>('/admin/promotions?status=PENDING&limit=1'),
      ]).then(([vRes, rRes, eRes, tRes, kRes, aRes, pRes]) => {
        setPending({
          vendors: vRes.status === 'fulfilled'
            ? vRes.value.data.filter(v => v.approvalStatus === 'PENDING').length
            : 0,
          riders: rRes.status === 'fulfilled'
            ? rRes.value.data.filter(r => r.approvalStatus === 'PENDING').length
            : 0,
          errorLogs: eRes.status === 'fulfilled' ? eRes.value.pagination.total : 0,
          // Work waiting for this admin: their own open tickets plus the unclaimed queue.
          tickets: tRes.status === 'fulfilled' ? tRes.value.data.unassigned + tRes.value.data.mine : 0,
          // Only overdue work, so the badge means "act now" rather than "you have a list".
          tasks: kRes.status === 'fulfilled' ? kRes.value.data.counts.mineOverdue : 0,
          // Agent suggestions waiting for a person to approve or reject.
          agents: aRes.status === 'fulfilled' ? aRes.value.pagination.total : 0,
          // Promo cards waiting for review before they can reach the carousel.
          promotions: pRes.status === 'fulfilled' ? pRes.value.pagination.total : 0,
        });
      });
    };

    loadPendingCounts();
    const poll = setInterval(loadPendingCounts, 60_000);
    // Pages that mutate one of these counts (e.g. resolving an error log) dispatch
    // this instead of forcing a full page reload just to refresh the sidebar badge.
    window.addEventListener('gbm:pending-counts-updated', loadPendingCounts);
    return () => {
      clearInterval(poll);
      window.removeEventListener('gbm:pending-counts-updated', loadPendingCounts);
    };
  }, [user?.role]);

  const userRole = user?.role ?? 'SUPPORT_ADMIN';

  // The rail is a desktop-only choice; the mobile drawer always shows full labels.
  const rail = railPref && !isMobile;

  const sections: RenderSection[] = [];
  if (userRole !== 'SOCIAL_MEDIA') {
    for (const sec of NAV_SECTIONS) {
      const items = sec.items.filter(i => canSeeItem(userRole, i.minRole)).map((i): RenderItem => ({
        href: i.href, label: i.label, icon: i.icon,
        active: i.exact ? pathname === i.href : [i.href, ...(i.activePrefixes ?? [])].some(p => pathname === p || pathname.startsWith(p + '/')),
        badge: i.pendingKey ? pending[i.pendingKey] : 0,
        badgeKind: i.pendingKey === 'errorLogs' ? 'error' : undefined,
      }));
      if (items.length) sections.push({ key: sec.key, title: sec.title, items });
    }
  }
  if (smois) {
    const items = SMOIS_NAV.filter(i => !i.cap || smois.can[i.cap]).map((i): RenderItem => ({
      href: i.href, label: i.label, icon: i.icon,
      active: i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(i.href + '/'),
      badge: i.badge ? smoisCounts[i.badge] : 0,
    }));
    if (items.length) sections.push({ key: 'social', title: 'Social Media', items });
  }

  // Landing on a page opens its section. Keyed on the section, not on every render,
  // so the operator can still collapse the section they are currently in.
  const activeSectionKey = sections.find(s => s.title && s.items.some(i => i.active))?.key;
  useEffect(() => {
    if (!activeSectionKey) return;
    setOpenMap(m => (m[activeSectionKey] ? m : { ...m, [activeSectionKey]: true }));
  }, [activeSectionKey]);

  useEffect(() => { writeStorage(NAV_OPEN_KEY, openMap); }, [openMap]);
  useEffect(() => { writeStorage(NAV_RAIL_KEY, railPref); }, [railPref]);

  const toggleSection = (key: string) => setOpenMap(m => ({ ...m, [key]: !m[key] }));
  const chevronTransition = reduceMotion ? 'none' : 'transform 150ms ease';

  const renderLink = (item: RenderItem) => {
    const badgeColor = item.badgeKind === 'error' ? T.error : T.warning;
    return (
      <Link
        key={item.href} href={item.href}
        title={rail ? item.label : undefined}
        aria-label={rail ? item.label : undefined}
        aria-current={item.active ? 'page' : undefined}
        style={{ textDecoration: 'none' }}
        onClick={() => { if (isMobile) onClose?.(); }}
      >
        <div style={{
          position: 'relative',
          display: 'flex', alignItems: 'center', justifyContent: rail ? 'center' : 'flex-start', gap: 10,
          padding: rail ? '10px 0' : '10px 12px', borderRadius: 4, marginBottom: 2,
          background: item.active ? T.primaryTint : 'transparent',
          border: item.active ? '1px solid rgba(255,82,27,0.2)' : '1px solid transparent',
          cursor: 'pointer',
        }}>
          <span style={{ fontSize: 16, opacity: item.active ? 1 : 0.7 }}>{item.icon}</span>
          {!rail && (
            <span style={{ fontSize: 13, fontWeight: item.active ? 700 : 500, color: item.active ? T.primary : T.textSec, flex: 1 }}>
              {item.label}
            </span>
          )}
          {item.badge > 0 && (rail ? (
            <span aria-label={`${item.badge} pending`} style={{ position: 'absolute', top: 5, right: 12, width: 8, height: 8, borderRadius: 999, background: badgeColor }} />
          ) : (
            <span style={{ background: badgeColor, color: '#fff', borderRadius: 999, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>{item.badge}</span>
          ))}
        </div>
      </Link>
    );
  };

  return (
    <>
      {isMobile && isOpen && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            zIndex: 90,
          }}
        />
      )}
      <aside style={{
        width: rail ? RAIL_WIDTH : 220, background: T.surface,
        borderRight: `1px solid ${T.border}`,
        display: 'flex', flexDirection: 'column',
        height: '100dvh', flexShrink: 0,
        ...(isMobile
          ? {
              position: 'fixed', top: 0, left: 0, zIndex: 100,
              transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
              transition: 'transform 220ms ease',
              boxShadow: isOpen ? '4px 0 24px rgba(0,0,0,0.25)' : 'none',
            }
          : { position: 'sticky', top: 0, transition: reduceMotion ? 'none' : 'width 160ms ease' }),
      }}>
      {/* Logo */}
      <div style={{
        padding: rail ? '14px 0' : '22px 20px 18px', borderBottom: `1px solid ${T.border}`,
        display: 'flex', flexDirection: rail ? 'column' : 'row', alignItems: 'center',
        justifyContent: rail ? 'center' : 'space-between', gap: rail ? 10 : 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Image src="/icon.png" alt="GoBuyMe" width={34} height={34} style={{ borderRadius: 9 }} />
          {!rail && (
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>GoBuyMe</div>
              <div style={{ fontSize: 10, color: T.textSec, fontWeight: 600 }}>Admin Console</div>
            </div>
          )}
        </div>
        {isMobile && (
          <button
            onClick={onClose}
            aria-label="Close menu"
            style={{
              width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4,
              fontSize: 16, color: T.textSec, cursor: 'pointer', flexShrink: 0,
            }}
          >✕</button>
        )}
        {!isMobile && (
          <button
            onClick={() => setRailPref(r => !r)}
            aria-label={rail ? 'Expand sidebar' : 'Collapse sidebar to icons'}
            aria-pressed={rail}
            title={rail ? 'Expand sidebar' : 'Collapse sidebar to icons'}
            style={{
              width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4,
              fontSize: 14, color: T.textSec, cursor: 'pointer', flexShrink: 0,
            }}
          >{rail ? '»' : '«'}</button>
        )}
      </div>

      {/* Nav */}
      <nav aria-label="Main" style={{ flex: 1, padding: rail ? '12px 8px' : '12px 10px', overflowY: 'auto' }}>
        {sections.map((sec, idx) => {
          // Rail: every icon shows (section collapse is ignored), with dividers between sections.
          if (rail) {
            return (
              <div key={sec.key} style={{ borderTop: idx > 0 ? `1px solid ${T.border}` : 'none', paddingTop: idx > 0 ? 8 : 0, marginTop: idx > 0 ? 6 : 0 }}>
                {sec.items.map(renderLink)}
              </div>
            );
          }
          // Untitled sections are never collapsible.
          if (!sec.title) return <div key={sec.key}>{sec.items.map(renderLink)}</div>;

          const open = !!openMap[sec.key];
          const rollup = sec.items.reduce((n, i) => n + i.badge, 0);
          const rollupIsError = sec.items.some(i => i.badge > 0 && i.badgeKind === 'error');
          const listId = `nav-sec-${sec.key}`;
          return (
            <div key={sec.key}>
              <button
                type="button"
                onClick={() => toggleSection(sec.key)}
                aria-expanded={open}
                aria-controls={listId}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 6,
                  padding: '14px 12px 6px', background: 'none', border: 'none', cursor: 'pointer',
                  fontFamily: 'inherit', textAlign: 'left',
                }}
              >
                <span aria-hidden="true" style={{
                  fontSize: 10, color: T.textMuted, display: 'inline-block',
                  transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: chevronTransition,
                }}>▸</span>
                <span style={{ flex: 1, fontSize: 10, fontWeight: 700, color: T.textMuted, letterSpacing: '0.6px', textTransform: 'uppercase' }}>{sec.title}</span>
                {!open && rollup > 0 && (
                  <span style={{
                    background: rollupIsError ? T.error : T.warning, color: '#fff',
                    borderRadius: 999, padding: '1px 7px', fontSize: 11, fontWeight: 700,
                  }}>{rollup}</span>
                )}
              </button>
              <div id={listId} hidden={!open}>
                {sec.items.map(renderLink)}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Theme toggle */}
      <div style={{ padding: rail ? '10px 8px' : '10px 12px', borderTop: `1px solid ${T.border}` }}>
        <button onClick={toggleTheme}
          title={rail ? (isDark ? 'Light mode' : 'Dark mode') : undefined}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: rail ? 'center' : 'flex-start', gap: 10,
          background: T.surface2, border: `1px solid ${T.border}`,
          borderRadius: 4, padding: rail ? '9px 0' : '9px 12px', cursor: 'pointer',
        }}>
          <span style={{ fontSize: 16 }}>{isDark ? '☀️' : '🌙'}</span>
          {!rail && (
            <span style={{ fontSize: 12, fontWeight: 600, color: T.textSec }}>
              {isDark ? 'Light mode' : 'Dark mode'}
            </span>
          )}
        </button>
      </div>

      {/* Sign out */}
      <div style={{ padding: rail ? '10px 8px 14px' : '10px 12px 14px', borderTop: `1px solid ${T.border}` }}>
        <button onClick={logout}
          title={rail ? 'Sign out' : undefined}
          aria-label="Sign out"
          style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: rail ? 'center' : 'flex-start', gap: 10,
          background: 'none', border: `1px solid ${T.border}`,
          borderRadius: 4, padding: rail ? '8px 0' : '8px 12px', cursor: 'pointer',
        }}>
          <span style={{ fontSize: 14 }}>↩</span>
          {!rail && <span style={{ fontSize: 12, fontWeight: 600, color: T.textSec }}>Sign out</span>}
        </button>
      </div>
      </aside>
    </>
  );
}
