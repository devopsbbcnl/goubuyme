'use client';
import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';

export default function LoginPage() {
  const { theme: T } = useTheme();
  const { login, user, loading } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace('/dashboard');
  }, [loading, user, router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return null;

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: T.bg, fontFamily: 'var(--font-jakarta), sans-serif',
    }}>
      <div style={{ width: '100%', maxWidth: 400, padding: '0 20px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 48, height: 48, borderRadius: 4, background: T.primary, marginBottom: 16,
          }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>G</span>
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.text }}>GoBuyMe Admin</div>
          <div style={{ fontSize: 13, color: T.textSec, marginTop: 4 }}>Sign in to your admin account</div>
        </div>

        {/* Card */}
        <div style={{
          background: T.surface, border: `1px solid ${T.border}`,
          borderRadius: 4, padding: 28,
        }}>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.textSec, marginBottom: 6 }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="admin@gobuyme.shop"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: T.surface2, border: `1px solid ${T.border}`,
                  borderRadius: 4, padding: '10px 14px',
                  color: T.text, fontSize: 14, outline: 'none',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.textSec, marginBottom: 6 }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: T.surface2, border: `1px solid ${T.border}`,
                  borderRadius: 4, padding: '10px 14px',
                  color: T.text, fontSize: 14, outline: 'none',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            {error && (
              <div style={{
                background: `${T.error}15`, border: `1px solid ${T.error}40`,
                borderRadius: 4, padding: '10px 14px',
                fontSize: 13, color: T.error, marginBottom: 16,
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              style={{
                width: '100%', padding: '11px', borderRadius: 4,
                background: submitting ? T.surface3 : T.primary,
                border: 'none', color: '#fff', fontSize: 14, fontWeight: 700,
                fontFamily: 'inherit', cursor: submitting ? 'not-allowed' : 'pointer',
              }}
            >
              {submitting ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
