import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Modal, Platform, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useTheme } from '@/context/ThemeContext';
import { fetchVersionPolicy, installedVersion, updateState, type VersionPolicy } from '@/services/appVersion';

// Asks the API at launch and whenever the app comes back to the front. Too old
// (below `min`) and nothing else can be used until the user updates; merely
// behind (below `latest`) and it asks once per version, then lets them carry on.
// A failed check lets the app run: being offline must never lock anyone out.
export function UpdateGate() {
  const { theme: T } = useTheme();
  const [policy, setPolicy] = useState<VersionPolicy | null>(null);
  // Kept in memory: "Not now" lasts until the app is next opened.
  const [dismissed, setDismissed] = useState<string | null>(null);

  const check = useCallback(() => {
    fetchVersionPolicy().then(setPolicy).catch(() => {});
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    check();
    const sub = AppState.addEventListener('change', s => { if (s === 'active') check(); });
    return () => sub.remove();
  }, [check]);

  if (!policy) return null;
  const state = updateState(policy);
  if (state === 'ok' || (state === 'available' && dismissed === policy.latest)) return null;
  const required = state === 'required';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => { if (!required) setDismissed(policy.latest); }}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: T.surface, borderColor: T.border }]}>
          <Text style={[styles.title, { color: T.text }]}>
            {required ? 'Please update GoBuyMe' : 'A new version is out'}
          </Text>
          <Text style={[styles.body, { color: T.textSec }]}>
            {required
              ? `This version (${installedVersion}) is too old to keep working. Update to ${policy.latest} to carry on.`
              : `Version ${policy.latest} is ready. You have ${installedVersion}.`}
          </Text>
          <View style={styles.footer}>
            {policy.storeUrl ? (
              <PrimaryButton onPress={() => { void Linking.openURL(policy.storeUrl!); }}>Update</PrimaryButton>
            ) : null}
            {!required && (
              <PrimaryButton variant="ghost" onPress={() => setDismissed(policy.latest)}>Not now</PrimaryButton>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: { width: '100%', maxWidth: 420, borderWidth: 1, borderRadius: 4, padding: 24, gap: 8 },
  title: { fontSize: 18, fontFamily: 'PlusJakartaSans_700Bold' },
  body: { fontSize: 14, lineHeight: 20, fontFamily: 'PlusJakartaSans_400Regular' },
  footer: { marginTop: 16, gap: 8 },
});
