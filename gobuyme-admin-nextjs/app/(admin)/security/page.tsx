'use client';
import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';

interface BlockedIp {
  ip: string;
  reason: string;
  blockedAt: string;
}

function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function SecurityPage() {
  const { theme: T } = useTheme();
  const [blockedIps, setBlockedIps] = useState<BlockedIp[]>([]);
  const [loading, setLoading] = useState(true);
  const [manualIp, setManualIp] = useState('');
  const [manualReason, setManualReason] = useState('');
  const [blocking, setBlocking] = useState(false);
  const [blockingError, setBlockingError] = useState('');
  const [blockingSuccess, setBlockingSuccess] = useState('');
  const [unblocking, setUnblocking] = useState<string | null>(null);

  const fetchBlockedIps = useCallback(() => {
    setLoading(true);
    api.get<{ data: BlockedIp[] }>('/admin/security/blocked-ips')
      .then(res => setBlockedIps(res.data))
      .catch(() => setBlockedIps([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchBlockedIps();
    const interval = setInterval(fetchBlockedIps, 30000);
    return () => clearInterval(interval);
  }, [fetchBlockedIps]);

  const handleBlockIp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualIp || !manualReason) return;

    setBlocking(true);
    setBlockingError('');
    setBlockingSuccess('');

    try {
      await api.post('/admin/security/block-ip', {
        ip: manualIp,
        reason: manualReason,
      });
      setBlockingSuccess(`✓ ${manualIp} blocked successfully`);
      setManualIp('');
      setManualReason('');
      setTimeout(() => setBlockingSuccess(''), 3000);
      fetchBlockedIps();
    } catch (err: any) {
      setBlockingError(err?.message || 'Failed to block IP');
    } finally {
      setBlocking(false);
    }
  };

  const handleUnblockIp = async (ip: string) => {
    setUnblocking(ip);
    try {
      await api.del(`/admin/security/unblock-ip/${ip}`);
      fetchBlockedIps();
    } finally {
      setUnblocking(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <div style={{ fontSize: 20, fontWeight: 800, color: T.text }}>Security</div>
        <div style={{ fontSize: 13, color: T.textSec, marginTop: 2 }}>
          Manage blocked IP addresses and view attack logs
        </div>
      </div>

      {/* Manual Block Form */}
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, padding: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 16 }}>
          Manually Block IP Address
        </div>
        <form onSubmit={handleBlockIp} style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="IP address (e.g., 192.0.2.1)"
            value={manualIp}
            onChange={e => setManualIp(e.target.value)}
            style={{
              background: T.surface2, color: T.text, border: `1px solid ${T.border}`,
              borderRadius: 4, padding: '8px 12px', fontSize: 13, flex: 1, minWidth: 200,
            }}
          />
          <input
            type="text"
            placeholder="Reason (e.g., Suspicious activity)"
            value={manualReason}
            onChange={e => setManualReason(e.target.value)}
            style={{
              background: T.surface2, color: T.text, border: `1px solid ${T.border}`,
              borderRadius: 4, padding: '8px 12px', fontSize: 13, flex: 1, minWidth: 200,
            }}
          />
          <button
            type="submit"
            disabled={blocking || !manualIp || !manualReason}
            style={{
              background: T.primary, color: '#fff', border: 'none',
              borderRadius: 4, padding: '8px 16px', fontSize: 13, fontWeight: 700,
              cursor: blocking || !manualIp || !manualReason ? 'default' : 'pointer',
              opacity: blocking || !manualIp || !manualReason ? 0.6 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            {blocking ? 'Blocking…' : 'Block IP'}
          </button>
        </form>
        {blockingError && (
          <div style={{ color: T.error, fontSize: 12, marginTop: 8 }}>
            ✗ {blockingError}
          </div>
        )}
        {blockingSuccess && (
          <div style={{ color: T.success, fontSize: 12, marginTop: 8, fontWeight: 700 }}>
            {blockingSuccess}
          </div>
        )}
      </div>

      {/* Blocked IPs List */}
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ padding: '20px', borderBottom: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>
            Blocked IP Addresses ({blockedIps.length})
          </div>
          <div style={{ fontSize: 12, color: T.textSec, marginTop: 4 }}>
            IPs are auto-blocked when CRITICAL attacks are detected. Blocks stay in place until an admin removes them here.
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '32px 20px', textAlign: 'center', fontSize: 13, color: T.textSec }}>
            Loading…
          </div>
        ) : blockedIps.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center', fontSize: 13, color: T.textSec }}>
            No blocked IPs. All clear! 🎉
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: T.surface2, borderBottom: `1px solid ${T.border}` }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: T.textSec }}>IP Address</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: T.textSec }}>Reason</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: T.textSec }}>Blocked At</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, color: T.textSec }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {blockedIps.map((item, i) => (
                  <tr key={item.ip} style={{ borderTop: i > 0 ? `1px solid ${T.border}` : 'none' }}>
                    <td style={{
                      padding: '14px 16px', color: T.error, fontWeight: 700,
                      fontFamily: 'monospace', fontSize: 12,
                    }}>
                      {item.ip}
                    </td>
                    <td style={{
                      padding: '14px 16px', color: T.text, maxWidth: 400,
                      whiteSpace: 'normal', wordBreak: 'break-word',
                    }}>
                      {item.reason}
                    </td>
                    <td style={{
                      padding: '14px 16px', color: T.textSec, whiteSpace: 'nowrap',
                    }}>
                      {timeAgo(item.blockedAt)}
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                      <button
                        onClick={() => handleUnblockIp(item.ip)}
                        disabled={unblocking === item.ip}
                        style={{
                          background: 'transparent', color: T.textSec, border: `1px solid ${T.border}`,
                          borderRadius: 4, padding: '4px 12px', fontSize: 12, fontWeight: 700,
                          cursor: unblocking === item.ip ? 'default' : 'pointer',
                          opacity: unblocking === item.ip ? 0.5 : 1,
                        }}
                      >
                        {unblocking === item.ip ? 'Removing…' : 'Remove'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Info Box */}
      <div style={{
        background: T.primaryTint, border: `1px solid ${T.primary}`,
        borderRadius: 4, padding: 16,
      }}>
        <div style={{ fontSize: 13, color: T.primary, lineHeight: 1.6 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>ℹ️ How automated IP blocking works:</div>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li>When an attack is classified as <strong>CRITICAL</strong>, the source IP is automatically added to Cloudflare's blocklist</li>
            <li>Blocked IPs are filtered at the edge (Cloudflare WAF) before reaching your backend</li>
            <li>Auto-blocks are permanent — they stay blocked until an admin removes them manually</li>
            <li>You can manually block/unblock IPs for immediate protection or recovery</li>
            <li>All IP blocking actions are logged in the Audit Logs</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
