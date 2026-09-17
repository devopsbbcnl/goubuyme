'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import api from '@/services/api';
import { FAQS, STATUS_BADGE, STATUS_LABEL, TicketSummary, timeAgo } from './helpShared';

export default function HelpCenterPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    api.get('/support/tickets')
      .then(r => { setTickets(r.data.data ?? []); setFailed(false); })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [user]);

  if (authLoading || !user) return null;

  return (
    <div className="page-body">
      <div className="inner" style={{ maxWidth: 860, margin: '0 auto', paddingTop: 28 }}>
        <div className="between" style={{ marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 className="t-page">Help & Support</h1>
            <p className="muted" style={{ fontSize: 14, marginTop: 4 }}>We usually reply within a few hours.</p>
          </div>
          <Link href="/help/new" className="btn btn-primary">Contact support</Link>
        </div>

        <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>My requests</h2>
        {loading ? (
          <div className="sk" style={{ height: 120, borderRadius: 8, marginBottom: 28 }} />
        ) : failed ? (
          <div className="card card-pad muted" style={{ marginBottom: 28 }}>Couldn&apos;t load your requests. Please refresh the page.</div>
        ) : tickets.length === 0 ? (
          <div className="card card-pad muted" style={{ marginBottom: 28 }}>You haven&apos;t contacted support yet.</div>
        ) : (
          <div className="card" style={{ overflow: 'hidden', marginBottom: 28 }}>
            {tickets.map(t => (
              <Link key={t.id} href={`/help/${t.id}`} className="between" style={{ padding: '14px 20px', borderBottom: '1px solid var(--line)', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: t.requesterUnread ? 800 : 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.requesterUnread && <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--brand)', marginRight: 8 }} />}
                    {t.subject}
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>
                    #{t.number} · {timeAgo(t.lastMessageAt)}{t.requesterUnread ? ' · New reply' : ''}
                  </div>
                </div>
                <span className={`badge ${STATUS_BADGE[t.status]}`}>{STATUS_LABEL[t.status]}</span>
              </Link>
            ))}
          </div>
        )}

        <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>Common questions</h2>
        <div className="card" style={{ overflow: 'hidden' }}>
          {FAQS.map((f, i) => (
            <div key={f.q} style={{ borderBottom: i < FAQS.length - 1 ? '1px solid var(--line)' : undefined }}>
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                aria-expanded={openFaq === i}
                className="between"
                style={{ width: '100%', padding: '16px 20px', textAlign: 'left', fontWeight: 700, fontSize: 14, cursor: 'pointer', gap: 12 }}
              >
                {f.q}
                <span className="muted" aria-hidden>{openFaq === i ? '−' : '+'}</span>
              </button>
              {openFaq === i && <p className="muted" style={{ padding: '0 20px 16px', fontSize: 14, lineHeight: 1.6 }}>{f.a}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
