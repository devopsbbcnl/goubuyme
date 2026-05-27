import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { connectSockets } from '@/services/socketService';
import api from '@/services/api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Message {
  id: string;
  senderId: string;
  content: string;
  isRead: boolean;
  createdAt: string;
}

interface Conversation {
  id: string;
  orderId: string;
  customerId: string;
  riderId: string;
  messages: Message[];
  customer: {
    user: {
      name: string;
      avatar: string | null;
    };
  };
  rider: {
    user: {
      name: string;
      avatar: string | null;
    };
  };
}

export default function ChatScreen() {
  const { theme: T } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ orderId: string }>();
  const orderId = params.orderId;

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    loadConversation();
  }, [orderId]);

  useEffect(() => {
    if (!conversation) return;

    const { ordersSocket } = connectSockets(user?.token ?? undefined);
    
    ordersSocket.emit('user:join', { userId: user?.id });
    ordersSocket.emit('order:join', { orderId });

    const onMessageReceive = ({ message }: { message: Message }) => {
      setMessages((prev) => {
        // Prevent duplicate messages by checking if message already exists
        if (prev.some((msg) => msg.id === message.id)) {
          return prev;
        }
        return [...prev, message];
      });
    };

    const onMessageRead = () => {
      setMessages((prev) => prev.map((msg) => ({ ...msg, isRead: true })));
    };

    ordersSocket.on('message:receive', onMessageReceive);
    ordersSocket.on('message:read', onMessageRead);

    return () => {
      ordersSocket.off('message:receive', onMessageReceive);
      ordersSocket.off('message:read', onMessageRead);
    };
  }, [conversation, user?.token, user?.id, orderId]);

  useEffect(() => {
    if (messages.length > 0) {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages]);

  const loadConversation = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/messages/conversations/order/${orderId}`);
      const conv = res.data.data;
      setConversation(conv);
      setMessages(conv.messages || []);
    } catch (error) {
      console.error('Failed to load conversation:', error);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!inputText.trim() || !conversation || sending) return;

    try {
      setSending(true);
      const res = await api.post('/messages/send', {
        conversationId: conversation.id,
        content: inputText.trim(),
      });
      const newMessage = res.data.data;
      setMessages((prev) => {
        // Prevent duplicate messages by checking if message already exists
        if (prev.some((msg) => msg.id === newMessage.id)) {
          return prev;
        }
        return [...prev, newMessage];
      });
      setInputText('');
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setSending(false);
    }
  };

  const markAsRead = async () => {
    if (!conversation) return;
    try {
      await api.put(`/messages/conversations/${conversation.id}/read`);
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  useEffect(() => {
    if (conversation && messages.length > 0) {
      markAsRead();
    }
  }, [conversation, messages]);

  const getOtherUserName = () => {
    if (!conversation) return '';
    const isCustomer = conversation.customerId === user?.id;
    return isCustomer 
      ? conversation.rider.user.name 
      : conversation.customer.user.name;
  };

  const isMyMessage = (message: Message) => {
    return message.senderId === user?.id;
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: T.bg }]}>
        <View style={[styles.header, { borderBottomColor: T.border, paddingTop: insets.top + 16 }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="arrow-back" size={24} color={T.text} />
          </TouchableOpacity>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={T.primary} />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: T.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={[styles.header, { borderBottomColor: T.border, paddingTop: insets.top + 16 }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={24} color={T.text} />
        </TouchableOpacity>
        <View style={styles.headerTitle}>
          <Text style={[styles.title, { color: T.text }]}>{getOtherUserName()}</Text>
          <Text style={[styles.subtitle, { color: T.textSec }]}>Order #{orderId?.slice(0, 8)}</Text>
        </View>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
        showsVerticalScrollIndicator={false}
      >
        {messages.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="chatbubble-outline" size={48} color={T.textSec} />
            <Text style={[styles.emptyText, { color: T.textSec }]}>
              No messages yet. Start the conversation!
            </Text>
          </View>
        ) : (
          messages.map((message) => (
            <View
              key={message.id}
              style={[
                styles.messageBubble,
                isMyMessage(message)
                  ? [styles.myMessage, { backgroundColor: T.primary }]
                  : [styles.otherMessage, { backgroundColor: T.surface3 }],
              ]}
            >
              <Text
                style={[
                  styles.messageText,
                  { color: isMyMessage(message) ? '#fff' : T.text },
                ]}
              >
                {message.content}
              </Text>
              <Text
                style={[
                  styles.messageTime,
                  { color: isMyMessage(message) ? '#fff' : T.textSec },
                ]}
              >
                {new Date(message.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                {message.isRead && isMyMessage(message) && ' ✓'}
              </Text>
            </View>
          ))
        )}
      </ScrollView>

      <View style={[styles.inputContainer, { borderTopColor: T.border, backgroundColor: T.surface }]}>
        <TextInput
          style={[styles.input, { backgroundColor: T.surface3, color: T.text }]}
          placeholder="Type a message..."
          placeholderTextColor={T.textSec}
          value={inputText}
          onChangeText={setInputText}
          multiline
          maxLength={500}
        />
        <TouchableOpacity
          style={[styles.sendButton, { backgroundColor: T.primary }]}
          onPress={sendMessage}
          disabled={!inputText.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="send" size={20} color="#fff" />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerTitle: {
    flex: 1,
    marginLeft: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 14,
    marginTop: 12,
    textAlign: 'center',
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
    marginBottom: 8,
  },
  myMessage: {
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  otherMessage: {
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  messageTime: {
    fontSize: 11,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    fontSize: 15,
    maxHeight: 100,
    marginRight: 8,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
