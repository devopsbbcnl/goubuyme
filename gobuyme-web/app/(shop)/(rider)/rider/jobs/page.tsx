'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';
import Image from 'next/image';
import api from '@/services/api';

// Flat shape returned by GET /riders/me/available-jobs (see rider.controller.ts getAvailableJobs)
interface Job {
  orderId: string; orderNumber: string;
  vendor: string; vendorAddress?: string | null; vendorImg?: string | null;
  customer: string; customerPhone?: string | null; customerAddress: string;
  itemCount: number; fee: number;
  distanceKm: number | null; eta: string | null;
}

export default function RiderJobsPage() {
  const router = useRouter();
  const toast = useToast();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState<string | null>(null);

  const load = () => {
    api.get('/riders/me/available-jobs').then(r => setJobs(r.data.data ?? [])).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); const id = setInterval(load, 15000); return () => clearInterval(id); }, []);

  const accept = async (orderId: string) => {
    setAccepting(orderId);
    try {
      await api.post(`/riders/me/accept/${orderId}`);
      toast('Job accepted!', 'success');
      router.push('/rider/active');
    } catch (e: any) {
      toast(e?.response?.data?.message ?? 'Failed to accept job', 'error');
      setAccepting(null);
    }
  };

  return (
    <div>
      <div className="between" style={{ marginBottom: 24 }}>
        <div>
          <h1 className="t-page">Available Jobs</h1>
          <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>Refreshes every 15 seconds</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={load}>↻ Refresh</button>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {[1,2,3].map(i => <div key={i} className="sk" style={{ height: 200 }} />)}
        </div>
      ) : jobs.length === 0 ? (
        <div className="empty"><div className="emoji">🏍️</div><h3>No jobs right now</h3><p>Stay online and we'll notify you when a job comes in.</p></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {jobs.map(job => (
            <div key={job.orderId} className="card" style={{ overflow: 'hidden' }}>
              <div className="between" style={{ padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  {job.vendorImg ? <Image src={job.vendorImg} alt="" width={44} height={44} style={{ borderRadius: 6, objectFit: 'cover' }} /> : <div style={{ width: 44, height: 44, borderRadius: 6, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🏪</div>}
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{job.vendor}</div>
                    <div className="muted" style={{ fontSize: 12 }}>#{job.orderNumber}</div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--rider)' }}>+₦{job.fee?.toLocaleString()}</div>
                  <div className="muted" style={{ fontSize: 11 }}>delivery fee</div>
                </div>
              </div>

              <div className="route" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
                <div className="pt pick"><div className="gnode"><div className="o" /><div className="ln" /></div><div className="ad"><div className="lab">Pick up</div><div className="val">{job.vendor}</div>{job.vendorAddress && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{job.vendorAddress}</div>}</div></div>
                <div className="pt drop"><div className="gnode"><div className="o" /></div><div className="ad"><div className="lab">Deliver to</div><div className="val">{job.customer}{job.customerPhone && ` · ${job.customerPhone}`}</div><div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{job.customerAddress}</div></div></div>
              </div>

              <div style={{ padding: '10px 16px' }}>
                <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
                  {job.itemCount} item{job.itemCount === 1 ? '' : 's'}
                  {job.distanceKm != null && <span> · 📍 {job.distanceKm.toFixed(1)} km{job.eta ? ` · ⏱ ${job.eta}` : ''}</span>}
                </div>
                <button className="btn btn-rider btn-block" onClick={() => accept(job.orderId)} disabled={accepting === job.orderId}>
                  {accepting === job.orderId ? <><span className="spin" />Accepting…</> : '🏍️ Accept Job'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
