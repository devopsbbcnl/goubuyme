import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import api from '@/services/api';
import { CATEGORY_LABEL, STATUS_LABEL, TicketThread, errorMessage, timeAgo } from './helpShared';

const POLL_MS = 20_000;

export default function TicketDetailScreen() {
  const { theme: T } = useTheme();
  const insets = useSafeAreaInsets();
  const { ticketId } = useLocalSearchParams<{ ticketId: string }>();
  const scrollRef = useRef<ScrollView>(null);

  const [ticket, setTicket] = useState<TicketThread | null>(null);
  const [loadError, setLoadError] = useState('');
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState('');
  const [rating, setRating] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/support/tickets/${ticketId}`);
      setTicket(data.data);
      setLoadError('');
    } catch (err) {
      setLoadError(errorMessage(err, 'Couldn\'t load this request.'));
    }
  }, [ticketId]);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const send = async () => {
    const body = reply.trim();
    if (!body || sending) return;
    setSending(true);
    setSendError('');
    try {
      await api.post(`/support/tickets/${ticketId}/messages`, { body });
      setReply('');
      await load();
    } catch (err) {
      setSendError(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const rate = async () => {
    if (!score || rating) return;
    setRating(true);
    try {
      await api.post(`/support/tickets/${ticketId}/rating`, { score, comment: comment.trim() || undefined });
      await load();
    } catch (err) {
      setSendError(errorMessage(err));
    } finally {
      setRating(false);
    }
  };

  const header = (
    <View style={[styles.header, { borderBottomColor: T.border, paddingTop: insets.top + 16 }]}>
      <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Go back">
        <Ionicons name="arrow-back" size={22} color={T.text} />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={[styles.title, { color: T.text }]}>{ticket ? ticket.subject : 'Support request'}</Text>
        {ticket && (
          <Text style={{ color: T.textSec, fontSize: 12, marginTop: 1 }}>
            #{ticket.number} · {STATUS_LABEL[ticket.status]}
          </Text>
        )}
      </View>
    </View>
  );

  if (!ticket) {
    return (
      <View style={{ flex: 1, backgroundColor: T.bg }}>
        {header}
        <View style={styles.center}>
          {loadError
            ? <TouchableOpacity onPress={load}><Text style={{ color: T.textSec }}>{loadError} Tap to retry.</Text></TouchableOpacity>
            : <ActivityIndicator color={T.primary} />}
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: T.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {header}
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 24 }}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.meta, { backgroundColor: T.surface, borderColor: T.border }]}>
          <Text style={{ color: T.textSec, fontSize: 12 }}>
            {CATEGORY_LABEL[ticket.category]}{ticket.order ? ` · Order #${ticket.order.orderNumber}` : ''} · opened {timeAgo(ticket.createdAt)}
          </Text>
        </View>

        {ticket.messages.map(m => {
          const mine = m.from === 'you';
          return (
            <View key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '84%', gap: 3 }}>
              {!mine && <Text style={{ color: T.textMuted, fontSize: 11, fontWeight: '700' }}>GoBuyMe Support</Text>}
              <View style={[
                styles.bubble,
                mine ? { backgroundColor: T.primary } : { backgroundColor: T.surface, borderColor: T.border, borderWidth: 1 },
              ]}>
                <Text style={{ color: mine ? '#fff' : T.text, fontSize: 14, lineHeight: 20 }}>{m.body}</Text>
              </View>
              <Text style={{ color: T.textMuted, fontSize: 10, textAlign: mine ? 'right' : 'left' }}>{timeAgo(m.createdAt)}</Text>
            </View>
          );
        })}

        {ticket.status === 'OPEN' && ticket.messages.length === 1 && (
          <Text style={{ color: T.textSec, fontSize: 13, textAlign: 'center', marginTop: 4 }}>
            Thanks, we&apos;ve got your request and will reply here soon.
          </Text>
        )}

        {ticket.canRate && (
          <View style={[styles.meta, { backgroundColor: T.surface, borderColor: T.border, gap: 10 }]}>
            <Text style={{ color: T.text, fontWeight: '700', fontSize: 14 }}>How did we do?</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {[1, 2, 3, 4, 5].map(n => (
                <TouchableOpacity key={n} onPress={() => setScore(n)} accessibilityLabel={`${n} stars`}>
                  <Ionicons name={n <= score ? 'star' : 'star-outline'} size={30} color={T.star} />
                </TouchableOpacity>
              ))}
            </View>
            {score > 0 && (
              <>
                <TextInput
                  value={comment}
                  onChangeText={setComment}
                  placeholder="Anything else to tell us? (optional)"
                  placeholderTextColor={T.textMuted}
                  maxLength={1000}
                  style={[styles.rateInput, { color: T.text, borderColor: T.border, backgroundColor: T.bg }]}
                />
                <TouchableOpacity onPress={rate} disabled={rating} style={[styles.rateBtn, { backgroundColor: T.primary }]}>
                  {rating ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800' }}>Submit rating</Text>}
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
        {ticket.csatScore !== null && (
          <Text style={{ color: T.textSec, fontSize: 13, textAlign: 'center' }}>
            You rated this {ticket.csatScore}/5. Thank you!
          </Text>
        )}
      </ScrollView>

      <View style={[styles.inputBar, { borderTopColor: T.border, paddingBottom: insets.bottom + 12, backgroundColor: T.bg }]}>
        {sendError ? <Text style={{ color: T.error, fontSize: 12, marginBottom: 6 }}>{sendError}</Text> : null}
        {ticket.canReply ? (
          <View style={[styles.inputRow, { backgroundColor: T.surface, borderColor: T.border }]}>
            <TextInput
              value={reply}
              onChangeText={setReply}
              placeholder={ticket.status === 'RESOLVED' ? 'Still need help? Reply to reopen' : 'Write a reply…'}
              placeholderTextColor={T.textMuted}
              style={[styles.textInput, { color: T.text }]}
              multiline
              maxLength={4000}
            />
            <TouchableOpacity
              onPress={send}
              disabled={!reply.trim() || sending}
              accessibilityLabel="Send reply"
              style={[styles.sendBtn, { backgroundColor: reply.trim() && !sending ? T.primary : T.surface3 }]}
            >
              {sending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={17} color={reply.trim() ? '#fff' : T.textMuted} />}
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity onPress={() => router.replace('/help/new')} style={[styles.closedBanner, { backgroundColor: T.surface2 }]}>
            <Text style={{ color: T.textSec, fontSize: 13, flex: 1 }}>This request is closed.</Text>
            <Text style={{ color: T.primary, fontWeight: '700', fontSize: 13 }}>Start a new one</Text>
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  title: { fontSize: 16, fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  meta: { borderWidth: 1, borderRadius: 4, padding: 12 },
  bubble: { borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14 },
  inputBar: { borderTopWidth: 1, paddingTop: 10, paddingHorizontal: 16 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', borderRadius: 12, borderWidth: 1, paddingVertical: 8, paddingLeft: 14, paddingRight: 8, gap: 8 },
  textInput: { flex: 1, fontSize: 14, maxHeight: 100, paddingTop: 2 },
  sendBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  closedBanner: { flexDirection: 'row', alignItems: 'center', borderRadius: 4, padding: 14 },
  rateInput: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  rateBtn: { height: 44, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
});
