import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ActivityIndicator, Pressable } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import api from '@/services/api';

type RoleKey = 'customer' | 'vendor' | 'rider';
type RoleRow = { role: RoleKey; status: string; canSwitch: boolean };

const META: Record<RoleKey, { icon: string; title: string; sub: string; join: string }> = {
  customer: { icon: '🛍️', title: 'Customer', sub: 'Shop, order and track deliveries', join: '' },
  vendor:   { icon: '🏪', title: 'Vendor',   sub: 'Manage your business and orders', join: 'Register your business' },
  rider:    { icon: '🏍️', title: 'Rider',    sub: 'Accept deliveries and earn',      join: 'Become a delivery partner' },
};

const statusText = (r: RoleRow, current: boolean): string => {
  if (current) return 'Current';
  switch (r.status) {
    case 'NOT_REGISTERED': return 'Not registered';
    case 'PENDING': return 'Pending approval';
    case 'APPROVED': return 'Approved';
    case 'REJECTED': return 'Not approved';
    case 'SUSPENDED': return 'Suspended';
    default: return r.status;
  }
};

// After switching into a vendor role, an unfinished business profile goes to setup first.
const vendorProfileIncomplete = async (): Promise<boolean> => {
  try {
    const res = await api.get('/vendors/me');
    const v = res.data?.data;
    return !v?.description || !v?.openingTime || !v?.closingTime;
  } catch {
    return false;
  }
};

export function RoleSwitcher({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { theme: T } = useTheme();
  const { user, role, switchRole } = useAuth();
  const [rows, setRows] = useState<RoleRow[] | null>(null);
  const [busy, setBusy] = useState<RoleKey | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setRows(null);
    setError('');
    api.get('/auth/roles')
      .then((res) => {
        const list = (res.data.data.roles as { role: string; status: string; canSwitch: boolean }[])
          .map((r) => ({ ...r, role: r.role.toLowerCase() as RoleKey }))
          .filter((r) => r.role in META);
        setRows(list);
      })
      .catch(() => setError('Could not load your roles. Check your connection and try again.'));
  }, [visible]);

  const choose = async (r: RoleRow) => {
    setError('');
    if (r.role === role) return onClose();

    if (r.status === 'NOT_REGISTERED') {
      onClose();
      router.push(`/become-role?role=${r.role}` as never);
      return;
    }
    if (!r.canSwitch) {
      setError(r.status === 'SUSPENDED'
        ? 'This role is suspended. Contact support for help.'
        : 'This role was not approved. Contact support for help.');
      return;
    }

    setBusy(r.role);
    try {
      await switchRole(r.role);
      onClose();
      if (r.role === 'vendor' && (await vendorProfileIncomplete())) {
        router.replace('/vendor-complete-profile' as never);
      } else {
        router.replace('/' as never);
      }
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Could not switch. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: T.bg, borderColor: T.border }]}>
        <Text style={[styles.title, { color: T.text }]}>Switch experience</Text>
        <Text style={[styles.account, { color: T.textSec }]}>{user?.email}</Text>

        {!rows && !error && <ActivityIndicator color={T.primary} style={{ marginVertical: 28 }} />}

        {rows?.map((r) => {
          const m = META[r.role];
          const current = r.role === role;
          return (
            <TouchableOpacity
              key={r.role}
              activeOpacity={0.8}
              disabled={busy !== null}
              onPress={() => choose(r)}
              style={[styles.row, {
                backgroundColor: current ? T.primaryTint : T.surface,
                borderColor: current ? T.primary : T.border,
              }]}
            >
              <Text style={styles.icon}>{m.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: T.text }]}>{m.title}</Text>
                <Text style={[styles.rowSub, { color: T.textSec }]}>
                  {r.status === 'NOT_REGISTERED' ? m.join : m.sub}
                </Text>
              </View>
              {busy === r.role
                ? <ActivityIndicator color={T.primary} />
                : <Text style={[styles.badge, { color: current ? T.primary : T.textSec }]}>{statusText(r, current)}</Text>}
            </TouchableOpacity>
          );
        })}

        {!!error && <Text style={styles.error}>{error}</Text>}

        <TouchableOpacity onPress={onClose} style={styles.close} activeOpacity={0.7}>
          <Text style={{ color: T.textSec, fontWeight: '600' }}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet:    { padding: 20, paddingBottom: 32, borderTopLeftRadius: 4, borderTopRightRadius: 4, borderTopWidth: 1 },
  title:    { fontSize: 18, fontWeight: '800' },
  account:  { fontSize: 12, marginTop: 2, marginBottom: 16 },
  row:      { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 4, borderWidth: 1, marginBottom: 10 },
  icon:     { fontSize: 22 },
  rowTitle: { fontSize: 14, fontWeight: '700' },
  rowSub:   { fontSize: 11, marginTop: 2 },
  badge:    { fontSize: 11, fontWeight: '700' },
  error:    { color: '#E53E3E', fontSize: 12, marginTop: 4 },
  close:    { alignItems: 'center', paddingTop: 14 },
});
