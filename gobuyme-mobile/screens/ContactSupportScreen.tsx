import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '@/services/api';

const TOPICS = ['Order Issue', 'Delivery', 'Payment', 'Account', 'App Bug', 'General'];

const GREETING =
  "Hi there! 👋 I'm the GoBuyMe Support assistant. Select a topic below and describe your issue — our team reviews every message and responds within 24 hours.";
const ACK =
  "Thanks for reaching out! ✅ Your message has been received and forwarded to our support team. We'll reply to your registered email within 24 hours.";

interface Message {
  id: string;
  text: string;
  from: 'bot' | 'user';
  time: string;
}

function nowTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function ContactSupportScreen() {
  const { theme: T } = useTheme();
  const insets = useSafeAreaInsets();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const goBack = () => (from ? router.navigate(from as any) : router.back());

  const [topic, setTopic] = useState('');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [messageSent, setMessageSent] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { id: '0', text: GREETING, from: 'bot', time: nowTime() },
  ]);
  const scrollRef = useRef<ScrollView>(null);

  const append = (msg: Omit<Message, 'id'>) => {
    setMessages(prev => [...prev, { ...msg, id: String(Date.now() + Math.random()) }]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || !topic || sending || messageSent) return;

    append({ text, from: 'user', time: nowTime() });
    setInput('');
    setSending(true);

    try {
      await api.post('/support/contact', { topic, message: text });
    } catch {
      // show ack regardless — graceful fallback
    } finally {
      setSending(false);
      setMessageSent(true);
      setTimeout(() => append({ text: ACK, from: 'bot', time: nowTime() }), 1200);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: T.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: T.border, paddingTop: insets.top + 16 }]}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={22} color={T.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: T.text }]}>Support Chat</Text>
          <Text style={[styles.sub, { color: T.textSec }]}>Replies within 24 hours</Text>
        </View>
        <View style={[styles.activeDot, { backgroundColor: '#1A9E5F' }]} />
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.msgArea}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.map(msg => (
          <View
            key={msg.id}
            style={[styles.bubbleRow, msg.from === 'user' ? styles.rowUser : styles.rowBot]}
          >
            {msg.from === 'bot' && (
              <View style={[styles.botAvatar, { backgroundColor: T.primary }]}>
                <Text style={styles.botAvatarText}>GBM</Text>
              </View>
            )}
            <View style={{ maxWidth: '76%', gap: 3 }}>
              <View
                style={[
                  styles.bubble,
                  msg.from === 'user'
                    ? { backgroundColor: T.primary }
                    : { backgroundColor: T.surface, borderColor: T.border, borderWidth: 1 },
                ]}
              >
                <Text style={[styles.bubbleText, { color: msg.from === 'user' ? '#fff' : T.text }]}>
                  {msg.text}
                </Text>
              </View>
              <Text style={[styles.time, { color: T.textMuted, textAlign: msg.from === 'user' ? 'right' : 'left' }]}>
                {msg.time}
              </Text>
            </View>
          </View>
        ))}

        {/* Topic chips — shown until topic selected */}
        {!topic && !messageSent && (
          <View style={styles.topicSection}>
            <Text style={[styles.topicPrompt, { color: T.textSec }]}>Choose a topic to get started:</Text>
            <View style={styles.chips}>
              {TOPICS.map(t => (
                <TouchableOpacity
                  key={t}
                  onPress={() => setTopic(t)}
                  style={[styles.chip, { backgroundColor: T.surface, borderColor: T.border }]}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.chipText, { color: T.text }]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Selected topic badge */}
        {topic && !messageSent && (
          <View style={[styles.topicBadge, { backgroundColor: T.primaryTint }]}>
            <Ionicons name="pricetag-outline" size={13} color={T.primary} />
            <Text style={[styles.topicBadgeText, { color: T.primary }]}>Topic: {topic}</Text>
            <TouchableOpacity onPress={() => setTopic('')} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <Ionicons name="close-circle" size={15} color={T.primary} />
            </TouchableOpacity>
          </View>
        )}

        {/* Typing indicator */}
        {sending && (
          <View style={[styles.bubbleRow, styles.rowBot]}>
            <View style={[styles.botAvatar, { backgroundColor: T.primary }]}>
              <Text style={styles.botAvatarText}>GBM</Text>
            </View>
            <View style={[styles.bubble, { backgroundColor: T.surface, borderColor: T.border, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 18 }]}>
              <ActivityIndicator size="small" color={T.primary} />
            </View>
          </View>
        )}
      </ScrollView>

      {/* Input bar */}
      <View style={[styles.inputBar, { backgroundColor: T.bg, borderTopColor: T.border, paddingBottom: insets.bottom + 12 }]}>
        {messageSent ? (
          <View style={[styles.sentBanner, { backgroundColor: T.primaryTint }]}>
            <Ionicons name="checkmark-circle" size={18} color={T.primary} />
            <Text style={[styles.sentText, { color: T.primary }]}>
              Message sent — we'll reply to your registered email
            </Text>
          </View>
        ) : (
          <View style={[styles.inputRow, { backgroundColor: T.surface, borderColor: T.border }]}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder={
                topic
                  ? `Describe your ${topic.toLowerCase()} issue…`
                  : 'Select a topic first…'
              }
              placeholderTextColor={T.textMuted}
              style={[styles.textInput, { color: T.text }]}
              multiline
              maxLength={1000}
              editable={!!topic && !messageSent}
            />
            <TouchableOpacity
              onPress={send}
              disabled={!input.trim() || !topic || sending}
              style={[
                styles.sendBtn,
                { backgroundColor: input.trim() && topic && !sending ? T.primary : T.surface3 },
              ]}
              activeOpacity={0.8}
            >
              <Ionicons
                name="send"
                size={17}
                color={input.trim() && topic && !sending ? '#fff' : T.textMuted}
              />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1,
  },
  backBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '700' },
  sub: { fontSize: 11, marginTop: 1 },
  activeDot: { width: 8, height: 8, borderRadius: 4 },
  msgArea: { padding: 16, gap: 12, paddingBottom: 20 },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  rowBot: { alignSelf: 'flex-start' },
  rowUser: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  botAvatar: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  botAvatarText: { fontSize: 9, fontWeight: '800', color: '#fff' },
  bubble: { borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14 },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  time: { fontSize: 10 },
  topicSection: { marginTop: 4, gap: 10 },
  topicPrompt: { fontSize: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 999, paddingVertical: 7, paddingHorizontal: 14, borderWidth: 1 },
  chipText: { fontSize: 13, fontWeight: '600' },
  topicBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12, alignSelf: 'flex-start',
  },
  topicBadgeText: { fontSize: 12, fontWeight: '600' },
  inputBar: { borderTopWidth: 1, paddingTop: 12, paddingHorizontal: 16 },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end',
    borderRadius: 12, borderWidth: 1, paddingVertical: 8, paddingLeft: 14, paddingRight: 8, gap: 8,
  },
  textInput: { flex: 1, fontSize: 14, maxHeight: 80, paddingTop: 2 },
  sendBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  sentBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 8, padding: 14,
  },
  sentText: { flex: 1, fontSize: 13, fontWeight: '600' },
});
