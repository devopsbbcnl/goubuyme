import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import api from '@/services/api';
import { CATEGORIES_FOR_ROLE, CATEGORY_LABEL, TicketCategory, errorMessage } from './helpShared';

export default function NewTicketScreen() {
  const { theme: T } = useTheme();
  const { role } = useAuth();
  const insets = useSafeAreaInsets();
  const { orderId, orderNumber } = useLocalSearchParams<{ orderId?: string; orderNumber?: string }>();

  const categories = CATEGORIES_FOR_ROLE[role ?? 'customer'];
  const [category, setCategory] = useState<TicketCategory | null>(orderId ? categories[0] : null);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const canSend = !!category && body.trim().length >= 10 && !sending;

  const submit = async () => {
    if (!canSend) return;
    setSending(true);
    setError('');
    try {
      const { data } = await api.post('/support/tickets', {
        category, body: body.trim(), orderId: orderId || undefined, channel: 'APP',
      });
      router.replace(`/help/${data.data.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: T.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { borderBottomColor: T.border, paddingTop: insets.top + 16 }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={22} color={T.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: T.text }]}>Contact support</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
        {orderId ? (
          <View style={[styles.orderPill, { backgroundColor: T.primaryTint }]}>
            <Ionicons name="receipt-outline" size={16} color={T.primary} />
            <Text style={{ color: T.primary, fontWeight: '700', fontSize: 13 }}>
              About order {orderNumber ? `#${orderNumber.replace(/^#/, '')}` : ''}
            </Text>
          </View>
        ) : null}

        <View>
          <Text style={[styles.label, { color: T.textSec }]}>What do you need help with?</Text>
          <View style={styles.chips}>
            {categories.map(c => {
              const active = category === c;
              return (
                <TouchableOpacity
                  key={c}
                  onPress={() => setCategory(c)}
                  activeOpacity={0.75}
                  style={[styles.chip, { borderColor: active ? T.primary : T.border, backgroundColor: active ? T.primaryTint : T.surface }]}
                >
                  <Text style={{ color: active ? T.primary : T.text, fontSize: 13, fontWeight: '600' }}>{CATEGORY_LABEL[c]}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View>
          <Text style={[styles.label, { color: T.textSec }]}>Tell us what happened</Text>
          <TextInput
            value={body}
            onChangeText={setBody}
            multiline
            maxLength={4000}
            placeholder="Include as much detail as you can, e.g. which item was missing."
            placeholderTextColor={T.textMuted}
            style={[styles.input, { color: T.text, backgroundColor: T.surface, borderColor: T.border }]}
            textAlignVertical="top"
          />
          {body.trim().length > 0 && body.trim().length < 10 && (
            <Text style={{ color: T.textMuted, fontSize: 12, marginTop: 6 }}>A little more detail helps us sort it faster.</Text>
          )}
        </View>

        {error ? <Text style={{ color: T.error, fontSize: 13 }}>{error}</Text> : null}

        <TouchableOpacity
          onPress={submit}
          disabled={!canSend}
          activeOpacity={0.85}
          style={[styles.submit, { backgroundColor: canSend ? T.primary : T.surface3 }]}
        >
          {sending
            ? <ActivityIndicator color="#fff" />
            : <Text style={{ color: canSend ? '#fff' : T.textMuted, fontWeight: '800', fontSize: 15 }}>Send to support</Text>}
        </TouchableOpacity>
        <Text style={{ color: T.textMuted, fontSize: 12, textAlign: 'center' }}>
          You&apos;ll get a notification when we reply.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
  title: { fontSize: 18, fontWeight: '800' },
  orderPill: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', borderRadius: 999, paddingVertical: 7, paddingHorizontal: 14 },
  label: { fontSize: 13, fontWeight: '700', marginBottom: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14 },
  input: { borderWidth: 1, borderRadius: 4, minHeight: 140, padding: 12, fontSize: 14, lineHeight: 20 },
  submit: { height: 50, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
});
