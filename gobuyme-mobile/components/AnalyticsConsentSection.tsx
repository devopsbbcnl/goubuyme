import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import api from '@/services/api';
import { isAnalyticsOptedOut, setAnalyticsOptOut } from '@/services/analytics';

/**
 * "Privacy → Usage analytics" switch, shared by the customer, vendor and rider settings
 * screens. The server flag (User.analyticsOptIn) is the source of truth — the backend drops
 * events for opted-out users — and the local flag stops this device queueing them at all.
 */
export function AnalyticsConsentSection() {
  const { theme: T } = useTheme();
  const [enabled, setEnabled] = useState<boolean>(!isAnalyticsOptedOut());
  const [error, setError] = useState(false);

  useEffect(() => {
    api.get('/notifications/preferences')
      .then(({ data }) => {
        const serverValue = data.data?.analyticsOptIn;
        if (typeof serverValue !== 'boolean') return;
        setEnabled(serverValue);
        void setAnalyticsOptOut(!serverValue);
      })
      .catch(() => { /* keep the local value */ });
  }, []);

  const toggle = async (next: boolean) => {
    const previous = enabled;
    setEnabled(next);
    setError(false);
    void setAnalyticsOptOut(!next);
    try {
      await api.patch('/notifications/preferences', { analyticsOptIn: next });
    } catch {
      setEnabled(previous);
      void setAnalyticsOptOut(!previous);
      setError(true);
    }
  };

  return (
    <View style={{ gap: 8 }}>
      <Text style={[styles.sectionLabel, { color: T.textMuted }]}>PRIVACY</Text>
      <View style={[styles.sectionCard, { backgroundColor: T.surface, borderColor: T.border }]}>
        <View style={styles.row}>
          <View style={[styles.rowIcon, { backgroundColor: T.primaryTint }]}>
            <Ionicons name="analytics-outline" size={18} color={T.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowLabel, { color: T.text }]}>Usage analytics</Text>
            <Text style={[styles.rowSub, { color: error ? T.error : T.textSec }]}>
              {error
                ? "Couldn't update. Check your connection and try again."
                : 'Share which screens and features you use so we can improve GoBuyMe. Never your messages, address or payment details.'}
            </Text>
          </View>
          <Switch
            value={enabled}
            onValueChange={toggle}
            trackColor={{ false: T.surface3, true: T.primary }}
            thumbColor="#fff"
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  sectionCard:  { borderRadius: 4, borderWidth: 1, overflow: 'hidden' },
  row:          { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14 },
  rowIcon:      { width: 34, height: 34, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  rowLabel:     { fontSize: 14, fontWeight: '600' },
  rowSub:       { fontSize: 12, marginTop: 1 },
});
