import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Linking, ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import api from '@/services/api';

const SUPPORT_EMAIL = 'support@gobuyme.com';

const ROLE_LABELS: Record<string, string> = {
  vendor: 'vendor',
  rider: 'rider',
};

export default function AccountNotActiveScreen() {
  const { theme: T } = useTheme();
  const { logout, updateApprovalStatus } = useAuth();
  const params = useLocalSearchParams<{ role?: string }>();
  const role = params.role ?? 'vendor';
  const roleLabel = ROLE_LABELS[role] ?? role;

  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      setMessage('');
      const res = await api.get('/auth/activation-status');
      const { approvalStatus } = res.data.data;
      updateApprovalStatus(approvalStatus);

      if (approvalStatus === 'APPROVED') {
        router.replace((role === 'rider' ? '/(rider)' : '/(vendor)') as never);
      } else {
        setMessage('Account is still pending approval. We\'ll notify you when it\'s ready.');
      }
    } catch {
      setMessage('Could not check status. Please try again.');
    } finally {
      setRefreshing(false);
    }
  };

  const handleContactSupport = () => {
    Linking.openURL(
      `mailto:${SUPPORT_EMAIL}?subject=Account Activation – ${roleLabel}&body=Hi, my ${roleLabel} account is pending approval. Please assist.`,
    );
  };

  const handleSignOut = async () => {
    await logout();
    router.replace('/login' as never);
  };

  return (
    <View style={[styles.container, { backgroundColor: T.bg }]}>
      <View style={styles.inner}>
        <View style={[styles.iconCircle, { backgroundColor: T.surface2 }]}>
          <Ionicons name="lock-closed-outline" size={40} color={T.textSec} />
        </View>

        <Text style={[styles.title, { color: T.text }]}>Account Not Active</Text>

        <Text style={[styles.body, { color: T.textSec }]}>
          Your GoBuyMe {roleLabel} account is currently being set up or awaiting approval.{'\n'}
          You'll be notified once it's ready.
        </Text>

        {!!message && (
          <Text style={[styles.feedback, { color: T.textSec, backgroundColor: T.surface2 }]}>
            {message}
          </Text>
        )}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          onPress={handleRefresh}
          disabled={refreshing}
          style={[styles.primaryBtn, { backgroundColor: T.primary, opacity: refreshing ? 0.7 : 1 }]}
        >
          {refreshing
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.primaryBtnText}>Refresh Status</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleContactSupport}
          style={[styles.outlineBtn, { borderColor: T.border }]}
        >
          <Ionicons name="mail-outline" size={18} color={T.text} style={{ marginRight: 8 }} />
          <Text style={[styles.outlineBtnText, { color: T.text }]}>Contact Support</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={handleSignOut} style={styles.signOutBtn}>
          <Text style={[styles.signOutText, { color: T.textMuted }]}>Sign out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingBottom: 48 },
  inner: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  iconCircle: {
    width: 96, height: 96, borderRadius: 48,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 28,
  },
  title: {
    fontSize: 24, fontWeight: '800', letterSpacing: -0.5, textAlign: 'center',
    fontFamily: 'PlusJakartaSans_800ExtraBold', marginBottom: 14,
  },
  body: {
    fontSize: 15, lineHeight: 24, textAlign: 'center',
    fontFamily: 'PlusJakartaSans_400Regular',
  },
  feedback: {
    marginTop: 20, fontSize: 13, textAlign: 'center', lineHeight: 20,
    fontFamily: 'PlusJakartaSans_400Regular',
    padding: 12, borderRadius: 4, width: '100%',
  },
  actions: { gap: 12 },
  primaryBtn: {
    borderRadius: 4, paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#fff', fontSize: 16, fontWeight: '700',
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  outlineBtn: {
    borderRadius: 4, borderWidth: 1, paddingVertical: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
  },
  outlineBtnText: {
    fontSize: 15, fontWeight: '600',
    fontFamily: 'PlusJakartaSans_600SemiBold',
  },
  signOutBtn: { alignItems: 'center', paddingVertical: 8 },
  signOutText: { fontSize: 14, fontFamily: 'PlusJakartaSans_400Regular' },
});
