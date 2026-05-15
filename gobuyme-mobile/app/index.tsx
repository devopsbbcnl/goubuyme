import { Redirect } from 'expo-router';
import { useAuth } from '@/context/AuthContext';

const ROLE_ROUTE = {
  customer: '/(customer)',
  vendor: '/(vendor)',
  rider: '/(rider)',
} as const;

export default function Index() {
  const { user, role, loading } = useAuth();

  if (loading) return null;
  if (user && role && ROLE_ROUTE[role]) {
    return <Redirect href={ROLE_ROUTE[role]} />;
  }

  return <Redirect href="/splash" />;
}
