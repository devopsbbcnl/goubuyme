'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import api from '@/services/api';

interface Notification {
  id: string;
  title: string;
  body: string;
  type: string;
  isRead: boolean;
  createdAt: string;
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function NotificationsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) {
      api.get('/notifications').then(r => setNotifications(r.data.data ?? [])).catch(() => {}).finally(() => setLoading(false));
    }
  }, [user]);

  const markRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    api.patch(`/notifications/${id}/read`).catch(() => {});
  };

  const markAllRead = async () => {
    setMarkingAll(true);
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    try {
      await api.patch('/notifications/read-all');
    } catch {
      // best-effort — local state already updated optimistically
    } finally {
      setMarkingAll(false);
    }
  };

  if (authLoading || !user) return null;

  const hasUnread = notifications.some(n => !n.isRead);

  return (
    <div className="page-body">
      <div className="inner">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <h1 className="t-page">Notifications</h1>
          {hasUnread && (
            <button className="btn btn-ghost" onClick={markAllRead} disabled={markingAll}>
              {markingAll ? 'Marking...' : 'Mark all as read'}
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[...Array(4)].map((_, i) => <div key={i} className="sk" style={{ height: 72, borderRadius: 8 }} />)}
          </div>
        ) : notifications.length === 0 ? (
          <div className="empty">
            <div className="emoji">🔔</div>
            <h3>No notifications yet</h3>
            <p>Order updates and account alerts will appear here.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {notifications.map(n => (
              <button
                key={n.id}
                onClick={() => !n.isRead && markRead(n.id)}
                className="card"
                style={{
                  display: 'flex', gap: 14, padding: 18, alignItems: 'flex-start',
                  textAlign: 'left', width: '100%', cursor: n.isRead ? 'default' : 'pointer',
                  background: n.isRead ? undefined : 'var(--surface2)',
                }}
              >
                <div
                  style={{
                    width: 8, height: 8, borderRadius: '50%', marginTop: 6, flexShrink: 0,
                    background: n.isRead ? 'transparent' : 'var(--brand)',
                  }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{n.title}</div>
                  <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{n.body}</div>
                  <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>{timeAgo(n.createdAt)}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
