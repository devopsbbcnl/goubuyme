import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { radius } from '@/theme';

type Status =
  | 'approved' | 'pending' | 'rejected' | 'suspended'
  | 'delivered' | 'in_transit' | 'preparing' | 'cancelled'
  | 'online' | 'offline' | 'new' | 'ready';

const LABELS: Record<Status, string> = {
  approved: 'Approved', pending: 'Pending', rejected: 'Rejected', suspended: 'Suspended',
  delivered: 'Delivered', in_transit: 'In Transit', preparing: 'Preparing', cancelled: 'Cancelled',
  online: 'Online', offline: 'Offline', new: 'New Order', ready: 'Ready',
};

export function Badge({ status }: { status: Status }) {
  const { theme: T } = useTheme();

  const map: Record<Status, { color: string; bg: string }> = {
    approved:   { color: T.success, bg: T.successBg },
    new:        { color: T.warning, bg: T.warningBg },
    pending:    { color: T.warning, bg: T.warningBg },
    rejected:   { color: T.error,   bg: T.errorBg },
    suspended:  { color: T.error,   bg: T.errorBg },
    delivered:  { color: T.success, bg: T.successBg },
    in_transit: { color: T.info,    bg: T.infoBg },
    preparing:  { color: T.info,    bg: T.infoBg },
    cancelled:  { color: T.error,   bg: T.errorBg },
    online:     { color: T.success, bg: T.successBg },
    offline:    { color: T.textSec, bg: T.surface3 },
    ready:      { color: T.success, bg: T.successBg },
  };

  const cfg = map[status] ?? map.pending;

  return (
    <View style={[styles.pill, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.text, { color: cfg.color }]}>{LABELS[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: radius.sm,
    paddingVertical: 3,
    paddingHorizontal: 9,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'PlusJakartaSans_700Bold',
  },
});
