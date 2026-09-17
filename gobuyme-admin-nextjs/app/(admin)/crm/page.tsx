'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { Card, fmtNaira } from '@/components/crm/shared';
import { CATEGORY_LABEL, TicketCategory } from '@/components/crm/tickets';

interface Overview {
  support: {
    open: number; overdue: number; unassigned: number; csatAverage30d: number | null; csatResponses30d: number;
    topCategories30d: Array<{ category: TicketCategory; count: number }>;
  };
  customers: { active: number; atRisk: number; churned: number; optedOutOfMarketing: number };
  marketing: { campaignsSent30d: number; attributedRevenue30d: number; buyers30d: number };
  pipeline: { open: number; new30d: number; live30d: number };
  tasks: { myDueToday: number; myOverdue: number; teamOverdue: number };
}

export default function CrmOverviewPage() {
  const { theme: T } = useTheme();
  const { user } = useAuth();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = () => api.get<{ data: Overview }>('/admin/crm/overview').then(res => { setData(res.data); setError(''); }).catch(err => setError(err.message));
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  const Tile = ({ label, value, sub, href, tone }: { label: string; value: string; sub?: string; href: string; tone?: 'bad' | 'warn' | 'good' }) => (
    <Link href={href} style={{ textDecoration: 'none' }}>
      <Card style={{ padding: 16, height: '100%', boxSizing: 'border-box' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.textSec, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</div>
        <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6, color: tone === 'bad' ? T.error : tone === 'warn' ? T.warning : tone === 'good' ? T.success : T.text }}>{value}</div>
        {sub && <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>{sub}</div>}
      </Card>
    </Link>
  );

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div>
      <div style={{ fontSize: 13, fontWeight: 800, color: T.text, marginBottom: 8 }}>{title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>{children}</div>
    </div>
  );

  if (error) return <div style={{ color: T.error, fontSize: 13 }}>{error}</div>;
  if (!data) return <div style={{ color: T.textSec, fontSize: 13 }}>Loading CRM overview…</div>;

  const isOps = user?.role === 'SUPER_ADMIN' || user?.role === 'OPERATIONS_ADMIN';
  const d = data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div>
        <div style={{ fontSize: 20, fontWeight: 800, color: T.text }}>CRM Overview</div>
        <div style={{ fontSize: 13, color: T.textSec }}>What needs attention today across support, customers, marketing and growth.</div>
      </div>

      <Section title="Your day">
        <Tile label="Your tasks due today" value={String(d.tasks.myDueToday)} sub={d.tasks.myOverdue ? `${d.tasks.myOverdue} overdue` : 'Nothing overdue'} href="/crm/tasks" tone={d.tasks.myOverdue ? 'bad' : undefined} />
        <Tile label="Overdue team tasks" value={String(d.tasks.teamOverdue)} href="/crm/tasks" tone={d.tasks.teamOverdue ? 'warn' : 'good'} />
      </Section>

      <Section title="Support">
        <Tile label="Open tickets" value={String(d.support.open)} sub={`${d.support.unassigned} unassigned`} href="/crm/inbox" />
        <Tile label="Overdue replies" value={String(d.support.overdue)} sub="Past response deadline" href="/crm/inbox" tone={d.support.overdue ? 'bad' : 'good'} />
        <Tile label="Satisfaction · 30d" value={d.support.csatAverage30d !== null ? `${d.support.csatAverage30d}/5` : '—'} sub={`${d.support.csatResponses30d} ratings`} href="/crm/inbox"
          tone={d.support.csatAverage30d === null ? undefined : d.support.csatAverage30d >= 4 ? 'good' : d.support.csatAverage30d >= 3 ? 'warn' : 'bad'} />
        <Card style={{ padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.textSec, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 }}>Top issues · 30d</div>
          {d.support.topCategories30d.length === 0
            ? <div style={{ fontSize: 13, color: T.textSec }}>No tickets.</div>
            : d.support.topCategories30d.map(c => (
              <div key={c.category} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: T.text, padding: '2px 0' }}>
                <span>{CATEGORY_LABEL[c.category]}</span><strong>{c.count}</strong>
              </div>
            ))}
        </Card>
      </Section>

      <Section title="Customers">
        <Tile label="Active customers" value={d.customers.active.toLocaleString()} sub="Ordered in the last 21 days" href="/crm/profiles" tone="good" />
        <Tile label="At risk" value={d.customers.atRisk.toLocaleString()} sub="No order in 21–60 days" href="/crm/profiles" tone={d.customers.atRisk ? 'warn' : undefined} />
        <Tile label="Churned" value={d.customers.churned.toLocaleString()} sub="No order in 60+ days" href="/crm/profiles" />
        <Tile label="Opted out of promotions" value={d.customers.optedOutOfMarketing.toLocaleString()} href="/crm/profiles" />
      </Section>

      {isOps && (
        <Section title="Marketing · last 30 days">
          <Tile label="Campaigns sent" value={String(d.marketing.campaignsSent30d)} href="/crm/campaigns" />
          <Tile label="Customers who ordered after a message" value={d.marketing.buyers30d.toLocaleString()} sub="Within 72 hours" href="/crm/campaigns" />
          <Tile label="Attributed order value" value={fmtNaira(d.marketing.attributedRevenue30d)} href="/crm/campaigns" tone={d.marketing.attributedRevenue30d ? 'good' : undefined} />
        </Section>
      )}

      <Section title="Growth pipeline">
        <Tile label="Open leads" value={d.pipeline.open.toLocaleString()} href="/crm/pipeline" />
        <Tile label="New leads · 30d" value={d.pipeline.new30d.toLocaleString()} href="/crm/pipeline" />
        <Tile label="Went live · 30d" value={d.pipeline.live30d.toLocaleString()} sub="Vendors and riders approved" href="/crm/pipeline" tone={d.pipeline.live30d ? 'good' : undefined} />
      </Section>
    </div>
  );
}
