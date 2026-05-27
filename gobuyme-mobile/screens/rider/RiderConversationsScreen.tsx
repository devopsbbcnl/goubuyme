import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '@/services/api';

interface Conversation {
  id: string;
  orderId: string;
  updatedAt: string;
  order: {
    orderNumber: string;
    status: string;
  };
  customer: {
    user: {
      name: string;
      avatar: string | null;
      phone: string | null;
    };
  };
  messages: Array<{
    id: string;
    content: string;
    createdAt: string;
  }>;
}

export default function RiderConversationsScreen() {
  const { theme: T } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    try {
      setLoading(true);
      const res = await api.get('/messages/conversations');
      setConversations(res.data.data || []);
    } catch (error) {
      console.error('Failed to load conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCall = (phone: string | null) => {
    if (!phone) return;
    Linking.openURL(`tel:${phone}`).catch(() => {
      Alert.alert('Error', 'Unable to make a call. Please check your phone settings.');
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: T.bg }]}>
        <View style={[styles.header, { borderBottomColor: T.border, paddingTop: insets.top + 16 }]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="arrow-back" size={24} color={T.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: T.text }]}>Messages</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={T.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: T.bg }]}>
      <View style={[styles.header, { borderBottomColor: T.border, paddingTop: insets.top + 16 }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={24} color={T.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: T.text }]}>Messages</Text>
        <View style={{ width: 24 }} />
      </View>

      {conversations.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="chatbubble-outline" size={48} color={T.textSec} />
          <Text style={[styles.emptyText, { color: T.textSec }]}>
            No messages yet
          </Text>
          <Text style={[styles.emptySub, { color: T.textMuted }]}>
            Your conversations with customers will appear here
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {conversations.map((conv) => (
            <TouchableOpacity
              key={conv.id}
              style={[styles.conversationItem, { backgroundColor: T.surface, borderColor: T.border }]}
              onPress={() => router.push(`/chat?orderId=${conv.orderId}` as any)}
              activeOpacity={0.7}
            >
              <View style={[styles.avatar, { backgroundColor: T.surface3 }]}>
                <Ionicons name="person" size={20} color={T.textSec} />
              </View>
              <View style={styles.conversationContent}>
                <View style={styles.conversationHeader}>
                  <Text style={[styles.customerName, { color: T.text }]}>
                    {conv.customer.user.name}
                  </Text>
                  <Text style={[styles.time, { color: T.textSec }]}>
                    {formatTime(conv.updatedAt)}
                  </Text>
                </View>
                <Text style={[styles.lastMessage, { color: T.textSec }]} numberOfLines={1}>
                  {conv.messages[0]?.content || 'No messages yet'}
                </Text>
                <View style={styles.metaRow}>
                  <Text style={[styles.orderNumber, { color: T.textMuted }]}>
                    Order #{conv.order.orderNumber}
                  </Text>
                  {conv.customer.user.phone && (
                    <TouchableOpacity
                      style={[styles.callMiniBtn, { backgroundColor: T.primaryTint }]}
                      onPress={() => handleCall(conv.customer.user.phone)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="call-outline" size={14} color={T.primary} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '800',
    marginLeft: 12,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
  },
  emptySub: {
    fontSize: 13,
    marginTop: 4,
    textAlign: 'center',
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  conversationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 4,
    borderWidth: 1,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  conversationContent: {
    flex: 1,
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  customerName: {
    fontSize: 15,
    fontWeight: '700',
  },
  time: {
    fontSize: 12,
  },
  lastMessage: {
    fontSize: 13,
    marginBottom: 6,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderNumber: {
    fontSize: 11,
  },
  callMiniBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
