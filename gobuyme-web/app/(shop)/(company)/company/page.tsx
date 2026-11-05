'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/services/api';

interface Overview {
  companyName: string;
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
  stats: { riders: number; online: number; openInvites: number; delivered: number; capacity: number };
}

const STATUS_COPY: Record<Overview['approvalStatus'], string> = {
  PENDING: 'Your company is being reviewed. You can invite riders as soon as it is approved.',
  APPROVED: 'Your company is approved. Riders you invite join your fleet automatically.',
  REJECTED: 'Your company could not be approved. Contact support to appeal.',
  SUSPENDED: 'Your company is suspended, so your riders cannot take deliveries. Contact support.',
};

export default function CompanyOverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api.get('/company/me')
      .then(r => setData(r.data.data))
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="sk" style={{ height: 160 }} />;
  if (failed || !data) return <div className="card card-pad muted">We could not load your company. Refresh to try again.</div>;

  const tiles = [
    { label: 'Riders in fleet', value: data.stats.riders },
    { label: 'Online now', value: data.stats.online },
    { label: 'Open invites', value: data.stats.openInvites },
    { label: 'Deliveries done', value: data.stats.delivered },
  ];

  return (
    <div>
      <h1 className="t-page" style={{ marginBottom: 6 }}>{data.companyName}</h1>
      <p className="muted" style={{ marginBottom: 24, fontSize: 14 }}>{STATUS_COPY[data.approvalStatus]}</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        {tiles.map(t => (
          <div key={t.label} className="card card-pad">
            <div style={{ fontSize: 30, fontWeight: 800 }}>{t.value}</div>
            <div className="muted" style={{ fontSize: 13 }}>{t.label}</div>
          </div>
        ))}
      </div>

      <Link href="/company/fleet" className="btn btn-primary">Invite a rider</Link>
      <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
        Your fleet can hold up to {data.stats.capacity} riders and open invites.
      </p>
    </div>
  );
}
