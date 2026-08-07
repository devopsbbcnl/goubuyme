import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '@/services/api';
import { PrimaryButton } from '@/components/ui/PrimaryButton';

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

type Mode = 'AUTO' | 'FORCE_OPEN' | 'FORCE_CLOSED';
const MODES: { key: Mode; label: string }[] = [
  { key: 'AUTO', label: 'Auto' },
  { key: 'FORCE_OPEN', label: 'Always Open' },
  { key: 'FORCE_CLOSED', label: 'Always Closed' },
];

interface DayHours { enabled: boolean; openTime: string; closeTime: string; }
type BusinessHoursRow = { dayOfWeek: number; openTime: string; closeTime: string };
interface TemporaryClosure { id: string; startAt: string; endAt: string | null; reason: string | null; }

const emptyWeek = (): DayHours[] =>
  DAY_LABELS.map(() => ({ enabled: false, openTime: '08:00', closeTime: '22:00' }));

const isValidTime = (v: string) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(v.trim());

export default function VendorBusinessHoursScreen() {
  const { theme: T } = useTheme();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<Mode>('AUTO');
  const [switchingMode, setSwitchingMode] = useState(false);
  const [week, setWeek] = useState<DayHours[]>(emptyWeek());
  const [status, setStatus] = useState<{ isOpen: boolean; message: string } | null>(null);

  const [closures, setClosures] = useState<TemporaryClosure[]>([]);
  const [closureForm, setClosureForm] = useState(false);
  const [reason, setReason] = useState('');
  const [closing, setClosing] = useState(false);
  const [reopeningId, setReopeningId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [availRes, closuresRes] = await Promise.all([
        api.get('/vendors/me/availability'),
        api.get('/vendors/me/temporary-closures'),
      ]);
      const d = availRes.data.data;
      setMode(d.availabilityOverride ?? 'AUTO');
      setStatus(d.availability ? { isOpen: d.availability.isOpen, message: d.availability.message } : null);
      const next = emptyWeek();
      (d.businessHours as BusinessHoursRow[] ?? []).forEach(h => {
        if (h.dayOfWeek >= 0 && h.dayOfWeek < 7 && !next[h.dayOfWeek].enabled) {
          next[h.dayOfWeek] = { enabled: true, openTime: h.openTime, closeTime: h.closeTime };
        }
      });
      setWeek(next);
      setClosures(closuresRes.data.data ?? []);
    } catch {
      Alert.alert('Error', 'Could not load your business hours.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setDay = (i: number, patch: Partial<DayHours>) =>
    setWeek(w => w.map((d, idx) => idx === i ? { ...d, ...patch } : d));

  const changeMode = async (next: Mode) => {
    if (next === mode) return;
    setSwitchingMode(true);
    try {
      const { data } = await api.patch('/vendors/me/availability', { mode: next });
      setMode(next);
      if (data.data?.availability) setStatus({ isOpen: data.data.availability.isOpen, message: data.data.availability.message });
    } catch {
      Alert.alert('Error', 'Failed to update availability mode.');
    } finally {
      setSwitchingMode(false);
    }
  };

  const saveHours = async () => {
    const enabledDays = week.map((d, i) => ({ ...d, dayOfWeek: i })).filter(d => d.enabled);
    const invalid = enabledDays.find(d => !isValidTime(d.openTime) || !isValidTime(d.closeTime));
    if (invalid) {
      Alert.alert('Invalid time', 'Enter times as HH:MM, e.g. 08:00.');
      return;
    }
    setSaving(true);
    try {
      const hours = enabledDays.map(d => ({ dayOfWeek: d.dayOfWeek, openTime: d.openTime, closeTime: d.closeTime }));
      const { data } = await api.put('/vendors/me/business-hours', { hours });
      if (data.data?.availability) setStatus({ isOpen: data.data.availability.isOpen, message: data.data.availability.message });
      Alert.alert('Saved', 'Your business hours have been updated.');
    } catch {
      Alert.alert('Error', 'Failed to save business hours.');
    } finally {
      setSaving(false);
    }
  };

  const startClosure = async (durationMs: number | null) => {
    setClosing(true);
    try {
      const endAt = durationMs != null ? new Date(Date.now() + durationMs).toISOString() : undefined;
      await api.post('/vendors/me/temporary-closures', {
        ...(reason.trim() ? { reason: reason.trim() } : {}),
        ...(endAt ? { endAt } : {}),
      });
      setClosureForm(false);
      setReason('');
      load();
    } catch {
      Alert.alert('Error', 'Failed to close store.');
    } finally {
      setClosing(false);
    }
  };

  const endClosure = async (id: string) => {
    setReopeningId(id);
    try {
      await api.delete(`/vendors/me/temporary-closures/${id}`);
      load();
    } catch {
      Alert.alert('Error', 'Failed to reopen store.');
    } finally {
      setReopeningId(null);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: T.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={T.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      <View style={[styles.header, { borderBottomColor: T.border, paddingTop: insets.top + 16 }]}>
        <TouchableOpacity
          onPress={() => router.navigate('/(vendor)/settings' as any)}
          style={styles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="arrow-back" size={22} color={T.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: T.text }]}>Business Hours</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {status && (
          <View style={[styles.statusBanner, { backgroundColor: T.surface2 }]}>
            <Text style={{ fontSize: 15 }}>{status.isOpen ? '🟢' : '🔴'}</Text>
            <Text style={[styles.statusText, { color: T.text }]}>{status.message}</Text>
          </View>
        )}

        <Text style={[styles.sectionLabel, { color: T.textMuted }]}>MODE</Text>
        <View style={styles.modeRow}>
          {MODES.map(m => (
            <TouchableOpacity
              key={m.key}
              onPress={() => changeMode(m.key)}
              disabled={switchingMode}
              style={[
                styles.modeChip,
                {
                  backgroundColor: mode === m.key ? T.primary : T.surface,
                  borderColor: mode === m.key ? T.primary : T.border,
                },
              ]}
            >
              <Text style={{ color: mode === m.key ? '#fff' : T.text, fontSize: 12, fontWeight: '700' }}>
                {m.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.sectionLabel, { color: T.textMuted, marginTop: 22 }]}>WEEKLY SCHEDULE</Text>
        <Text style={[styles.hint, { color: T.textSec }]}>
          In Auto mode your store opens and closes itself based on this schedule.
        </Text>
        <View style={[styles.card, { backgroundColor: T.surface, borderColor: T.border }]}>
          {DAY_LABELS.map((label, i) => (
            <View
              key={label}
              style={[
                styles.dayRow,
                { borderBottomColor: T.border, borderBottomWidth: i < 6 ? 1 : 0 },
              ]}
            >
              <Switch
                value={week[i].enabled}
                onValueChange={v => setDay(i, { enabled: v })}
                trackColor={{ false: T.surface3, true: T.primary }}
                thumbColor="#fff"
              />
              <Text style={[styles.dayLabel, { color: T.text }]}>{label}</Text>
              {week[i].enabled ? (
                <View style={styles.timeRow}>
                  <TextInput
                    value={week[i].openTime}
                    onChangeText={v => setDay(i, { openTime: v })}
                    placeholder="08:00"
                    placeholderTextColor={T.textMuted}
                    style={[styles.timeInput, { backgroundColor: T.surface2, borderColor: T.border, color: T.text }]}
                  />
                  <Text style={{ color: T.textMuted, fontSize: 12 }}>to</Text>
                  <TextInput
                    value={week[i].closeTime}
                    onChangeText={v => setDay(i, { closeTime: v })}
                    placeholder="22:00"
                    placeholderTextColor={T.textMuted}
                    style={[styles.timeInput, { backgroundColor: T.surface2, borderColor: T.border, color: T.text }]}
                  />
                </View>
              ) : (
                <Text style={{ color: T.textMuted, fontSize: 13 }}>Closed</Text>
              )}
            </View>
          ))}
        </View>

        <View style={{ marginTop: 16 }}>
          <PrimaryButton onPress={saveHours} loading={saving} disabled={saving}>
            Save Hours
          </PrimaryButton>
        </View>

        <Text style={[styles.sectionLabel, { color: T.textMuted, marginTop: 28 }]}>TEMPORARY CLOSURE</Text>
        <Text style={[styles.hint, { color: T.textSec }]}>
          Close early for a holiday, restock, or emergency — overrides your schedule until you reopen.
        </Text>

        {closures.map(c => (
          <View key={c.id} style={[styles.closureCard, { backgroundColor: T.surface2 }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.closureReason, { color: T.text }]}>{c.reason || 'Temporarily closed'}</Text>
              <Text style={{ color: T.textSec, fontSize: 12, marginTop: 2 }}>
                {c.endAt ? `Reopens ${new Date(c.endAt).toLocaleString()}` : 'Closed until you reopen'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => endClosure(c.id)}
              disabled={reopeningId === c.id}
              style={[styles.reopenBtn, { borderColor: T.border }]}
            >
              <Text style={{ color: T.text, fontSize: 12, fontWeight: '700' }}>
                {reopeningId === c.id ? 'Reopening…' : 'Reopen Now'}
              </Text>
            </TouchableOpacity>
          </View>
        ))}

        {!closureForm ? (
          <TouchableOpacity onPress={() => setClosureForm(true)} style={{ marginTop: 8 }}>
            <Text style={{ color: T.primary, fontSize: 13, fontWeight: '700' }}>⏸ Close Temporarily</Text>
          </TouchableOpacity>
        ) : (
          <View style={[styles.card, { backgroundColor: T.surface, borderColor: T.border, padding: 16, marginTop: 8 }]}>
            <Text style={[styles.fieldLabel, { color: T.textSec }]}>Reason (optional)</Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="e.g. Restocking, Public holiday"
              placeholderTextColor={T.textMuted}
              style={[styles.reasonInput, { backgroundColor: T.surface2, borderColor: T.border, color: T.text }]}
            />
            <Text style={[styles.fieldLabel, { color: T.textSec, marginTop: 12 }]}>Reopen</Text>
            <View style={styles.durationRow}>
              {[
                { label: '1 hour', ms: 60 * 60 * 1000 },
                { label: '4 hours', ms: 4 * 60 * 60 * 1000 },
                { label: 'Tomorrow', ms: 24 * 60 * 60 * 1000 },
                { label: 'Manually', ms: null },
              ].map(o => (
                <TouchableOpacity
                  key={o.label}
                  onPress={() => startClosure(o.ms)}
                  disabled={closing}
                  style={[styles.durationChip, { backgroundColor: T.surface2, borderColor: T.border }]}
                >
                  <Text style={{ color: T.text, fontSize: 12, fontWeight: '600' }}>{o.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity onPress={() => { setClosureForm(false); setReason(''); }} style={{ marginTop: 12, alignSelf: 'flex-start' }}>
              <Text style={{ color: T.textMuted, fontSize: 13 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
  },
  backBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '700' },
  scroll: { padding: 20, paddingBottom: 40 },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 4,
    padding: 12,
    marginBottom: 20,
  },
  statusText: { fontSize: 13, fontWeight: '600' },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 8 },
  hint: { fontSize: 12, marginBottom: 12, lineHeight: 17 },
  modeRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  modeChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1.5 },
  card: { borderRadius: 4, borderWidth: 1, overflow: 'hidden' },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  dayLabel: { fontSize: 13, fontWeight: '600', width: 84 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  timeInput: { flex: 1, height: 36, borderRadius: 4, borderWidth: 1, paddingHorizontal: 10, fontSize: 13, textAlign: 'center' },
  closureCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 4, padding: 12, marginBottom: 8 },
  closureReason: { fontSize: 13, fontWeight: '700' },
  reopenBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 4, borderWidth: 1 },
  fieldLabel: { fontSize: 12, fontWeight: '600', marginBottom: 6 },
  reasonInput: { height: 44, borderRadius: 4, borderWidth: 1, paddingHorizontal: 12, fontSize: 13 },
  durationRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  durationChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 4, borderWidth: 1 },
});
