import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Linking, Modal, TextInput,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '@/services/api';

type RawStatus =
  | 'PENDING' | 'ACCEPTED' | 'PREPARING' | 'READY'
  | 'PICKED_UP' | 'DELIVERED' | 'CANCELLED';

interface OrderDetail {
  id: string;
  orderNumber: string;
  status: RawStatus;
  paymentMethod: string;
  paymentStatus: string;
  customer: string;
  customerPhone: string | null;
  deliveryAddress: string;
  items: { id: string; name: string; quantity: number; unitPrice: number; lineTotal: number }[];
  subtotal: number;
  deliveryFee: number;
  totalAmount: number;
  commissionTier: 'TIER_1' | 'TIER_2';
  note: string | null;
  estimatedTime: number | null;
  cancelReason: string | null;
  createdAt: string;
}

const STATUS_META: Record<RawStatus, { label: string; color: string; bg: string }> = {
  PENDING:   { label: 'New Order',  color: '#F5A623', bg: 'rgba(245,166,35,0.12)' },
  ACCEPTED:  { label: 'Accepted',   color: '#1A6EFF', bg: 'rgba(26,110,255,0.12)' },
  PREPARING: { label: 'Preparing',  color: '#1A6EFF', bg: 'rgba(26,110,255,0.12)' },
  READY:     { label: 'Ready',      color: '#1A9E5F', bg: 'rgba(26,158,95,0.12)'  },
  PICKED_UP: { label: 'On the Way', color: '#7C3AED', bg: 'rgba(124,58,237,0.12)' },
  DELIVERED: { label: 'Delivered',  color: '#1A9E5F', bg: 'rgba(26,158,95,0.12)'  },
  CANCELLED: { label: 'Cancelled',  color: '#E23B3B', bg: 'rgba(226,59,59,0.12)'  },
};

export default function VendorOrderDetailScreen() {
  const { theme: T } = useTheme();
  const insets = useSafeAreaInsets();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [rejectModal, setRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectSubmitting, setRejectSubmitting] = useState(false);

  const fetchOrder = useCallback(async () => {
    try {
      const res = await api.get(`/vendors/me/orders/${orderId}`);
      setOrder(res.data.data);
    } catch {
      Alert.alert('Error', 'Could not load order details.');
      router.back();
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { fetchOrder(); }, [fetchOrder]);

  const handleAction = async (action: 'accept' | 'ready') => {
    if (!order) return;
    setActing(true);
    try {
      await api.patch(`/vendors/me/orders/${order.id}/status`, { action });
      const nextStatus: RawStatus = action === 'accept' ? 'PREPARING' : 'READY';
      setOrder(prev => prev ? { ...prev, status: nextStatus } : prev);
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message ?? 'Failed to update order.');
    } finally {
      setActing(false);
    }
  };

  const submitReject = async () => {
    if (!order) return;
    setRejectSubmitting(true);
    try {
      await api.patch(`/vendors/me/orders/${order.id}/status`, {
        action: 'reject',
        ...(rejectReason.trim() ? { reason: rejectReason.trim() } : {}),
      });
      setOrder(prev => prev ? { ...prev, status: 'CANCELLED' } : prev);
      setRejectModal(false);
      setRejectReason('');
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message ?? 'Failed to reject order.');
    } finally {
      setRejectSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: T.bg }}>
        <ActivityIndicator size="large" color={T.primary} />
      </View>
    );
  }

  if (!order) return null;

  const meta = STATUS_META[order.status];
  const isPending   = order.status === 'PENDING';
  const isPreparing = order.status === 'ACCEPTED' || order.status === 'PREPARING';
  const isTerminal  = order.status === 'DELIVERED' || order.status === 'CANCELLED';
  const vendorRate  = order.commissionTier === 'TIER_1' ? 0.97 : 0.925;
  const netEarnings = Math.round(order.subtotal * vendorRate);
  const commission  = order.subtotal - netEarnings;

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: T.border, paddingTop: insets.top + 16 }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={22} color={T.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[styles.headerTitle, { color: T.text }]}>{order.orderNumber}</Text>
          <Text style={[styles.headerSub, { color: T.textSec }]}>
            {new Date(order.createdAt).toLocaleString('en-NG', {
              month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
            })}
          </Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
          <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Customer */}
        <View style={[styles.card, { backgroundColor: T.surface, borderColor: T.border }]}>
          <Text style={[styles.sectionLabel, { color: T.textSec }]}>Customer</Text>
          <View style={styles.row}>
            <Ionicons name="person-circle-outline" size={20} color={T.textSec} style={{ marginTop: 1 }} />
            <Text style={[styles.customerName, { color: T.text }]}>{order.customer}</Text>
          </View>
          <View style={[styles.row, { marginTop: 6 }]}>
            <Ionicons name="location-outline" size={16} color={T.textSec} />
            <Text style={[styles.addressText, { color: T.textSec }]}>{order.deliveryAddress}</Text>
          </View>
          {order.customerPhone && (
            <TouchableOpacity
              style={[styles.callBtn, { borderColor: T.border }]}
              onPress={() => Linking.openURL(`tel:${order.customerPhone}`)}
            >
              <Ionicons name="call-outline" size={15} color={T.primary} />
              <Text style={[styles.callBtnText, { color: T.primary }]}>{order.customerPhone}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Items */}
        <View style={[styles.card, { backgroundColor: T.surface, borderColor: T.border }]}>
          <Text style={[styles.sectionLabel, { color: T.textSec }]}>Order Items</Text>
          {order.items.map((item, i) => (
            <View
              key={item.id}
              style={[
                styles.itemRow,
                i < order.items.length - 1 && { borderBottomWidth: 1, borderBottomColor: T.border },
              ]}
            >
              <View style={styles.itemLeft}>
                <View style={[styles.qtyBadge, { backgroundColor: T.primaryTint }]}>
                  <Text style={[styles.qtyText, { color: T.primary }]}>{item.quantity}×</Text>
                </View>
                <Text style={[styles.itemName, { color: T.text }]}>{item.name}</Text>
              </View>
              <Text style={[styles.itemPrice, { color: T.text }]}>
                ₦{item.lineTotal.toLocaleString()}
              </Text>
            </View>
          ))}
          {order.note && (
            <View style={[styles.noteBox, { backgroundColor: T.surface2, borderColor: T.border }]}>
              <Ionicons name="chatbubble-ellipses-outline" size={13} color={T.textSec} />
              <Text style={[styles.noteText, { color: T.textSec }]}>{order.note}</Text>
            </View>
          )}
        </View>

        {/* Earnings */}
        <View style={[styles.card, { backgroundColor: T.surface, borderColor: T.border }]}>
          <Text style={[styles.sectionLabel, { color: T.textSec }]}>Your Earnings</Text>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryKey, { color: T.textSec }]}>Order subtotal</Text>
            <Text style={[styles.summaryVal, { color: T.text }]}>₦{order.subtotal.toLocaleString()}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryKey, { color: T.textSec }]}>
              Platform commission ({order.commissionTier === 'TIER_1' ? '3%' : '7.5%'})
            </Text>
            <Text style={[styles.summaryVal, { color: '#E23B3B' }]}>−₦{commission.toLocaleString()}</Text>
          </View>
          <View style={[styles.summaryRow, styles.totalRow, { borderTopColor: T.border }]}>
            <Text style={[styles.totalKey, { color: T.text }]}>You receive</Text>
            <Text style={[styles.totalVal, { color: '#1A9E5F' }]}>₦{netEarnings.toLocaleString()}</Text>
          </View>
        </View>

        {/* Cancel reason */}
        {order.cancelReason && (
          <View style={[styles.card, { backgroundColor: 'rgba(226,59,59,0.06)', borderColor: 'rgba(226,59,59,0.2)' }]}>
            <View style={styles.row}>
              <Ionicons name="close-circle-outline" size={16} color="#E23B3B" />
              <Text style={[styles.sectionLabel, { color: '#E23B3B', marginBottom: 0, marginLeft: 6 }]}>Cancellation reason</Text>
            </View>
            <Text style={[styles.addressText, { color: '#E23B3B', marginTop: 6 }]}>{order.cancelReason}</Text>
          </View>
        )}
      </ScrollView>

      {/* Action buttons */}
      {!isTerminal && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12, borderTopColor: T.border, backgroundColor: T.surface }]}>
          {isPending && (
            <View style={styles.footerRow}>
              <TouchableOpacity
                onPress={() => setRejectModal(true)}
                disabled={acting}
                style={[styles.footerOutlineBtn, { borderColor: T.border, opacity: acting ? 0.5 : 1 }]}
              >
                <Text style={[styles.footerOutlineBtnText, { color: T.error }]}>Reject</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleAction('accept')}
                disabled={acting}
                style={[styles.footerPrimaryBtn, { backgroundColor: T.primary, opacity: acting ? 0.6 : 1 }]}
              >
                {acting
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.footerPrimaryBtnText}>Accept Order</Text>
                }
              </TouchableOpacity>
            </View>
          )}
          {isPreparing && (
            <TouchableOpacity
              onPress={() => handleAction('ready')}
              disabled={acting}
              style={[styles.footerPrimaryBtn, { backgroundColor: '#1A6EFF', opacity: acting ? 0.6 : 1 }]}
            >
              {acting
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.footerPrimaryBtnText}>Mark as Ready</Text>
              }
            </TouchableOpacity>
          )}
          {(order.status === 'READY' || order.status === 'PICKED_UP') && (
            <View style={[styles.statusBanner, { backgroundColor: order.status === 'PICKED_UP' ? 'rgba(124,58,237,0.1)' : 'rgba(26,158,95,0.1)' }]}>
              <Ionicons name={order.status === 'PICKED_UP' ? 'bicycle-outline' : 'time-outline'} size={18} color={order.status === 'PICKED_UP' ? '#7C3AED' : '#1A9E5F'} />
              <Text style={[styles.statusBannerText, { color: order.status === 'PICKED_UP' ? '#7C3AED' : '#1A9E5F' }]}>
                {order.status === 'PICKED_UP' ? 'Rider is on the way to customer' : 'Awaiting rider pickup'}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Reject modal */}
      <Modal
        visible={rejectModal}
        transparent
        animationType="fade"
        onRequestClose={() => !rejectSubmitting && setRejectModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={[styles.modalBox, { backgroundColor: T.surface, borderColor: T.border }]}>
            <Text style={[styles.modalTitle, { color: T.text }]}>Reject Order</Text>
            <Text style={[styles.modalSub, { color: T.textSec }]}>
              {order.orderNumber} · Why are you rejecting this order?
            </Text>
            <TextInput
              style={[styles.modalInput, { color: T.text, borderColor: T.border, backgroundColor: T.bg }]}
              placeholder="e.g. Out of stock, closing early…"
              placeholderTextColor={T.textMuted}
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
              maxLength={200}
              editable={!rejectSubmitting}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => { setRejectModal(false); setRejectReason(''); }}
                disabled={rejectSubmitting}
                style={[styles.modalCancelBtn, { backgroundColor: T.surface2, borderColor: T.border }]}
              >
                <Text style={[styles.modalBtnText, { color: T.textSec }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={submitReject}
                disabled={rejectSubmitting}
                style={[styles.modalRejectBtn, { opacity: rejectSubmitting ? 0.6 : 1 }]}
              >
                {rejectSubmitting
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={[styles.modalBtnText, { color: '#fff' }]}>Reject Order</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header:           { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  headerTitle:      { fontSize: 16, fontWeight: '800' },
  headerSub:        { fontSize: 11, marginTop: 1 },
  statusPill:       { borderRadius: 4, paddingVertical: 4, paddingHorizontal: 10 },
  statusText:       { fontSize: 11, fontWeight: '700' },
  scroll:           { padding: 16, gap: 12, paddingBottom: 120 },
  card:             { borderRadius: 4, borderWidth: 1, padding: 16, gap: 0 },
  sectionLabel:     { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 },
  row:              { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  customerName:     { fontSize: 15, fontWeight: '700', flex: 1 },
  addressText:      { fontSize: 13, lineHeight: 18, flex: 1 },
  callBtn:          { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 4, borderWidth: 1, alignSelf: 'flex-start' },
  callBtnText:      { fontSize: 13, fontWeight: '600' },
  itemRow:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  itemLeft:         { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  qtyBadge:         { borderRadius: 4, paddingHorizontal: 7, paddingVertical: 3 },
  qtyText:          { fontSize: 12, fontWeight: '700' },
  itemName:         { fontSize: 14, fontWeight: '500', flex: 1 },
  itemPrice:        { fontSize: 14, fontWeight: '700' },
  noteBox:          { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 12, padding: 10, borderRadius: 4, borderWidth: 1 },
  noteText:         { fontSize: 12, lineHeight: 17, flex: 1 },
  summaryRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5 },
  summaryKey:       { fontSize: 13 },
  summaryVal:       { fontSize: 13, fontWeight: '600' },
  totalRow:         { marginTop: 8, paddingTop: 12, borderTopWidth: 1 },
  totalKey:         { fontSize: 15, fontWeight: '700' },
  totalVal:         { fontSize: 16, fontWeight: '800' },
  paymentBadgeRow:  { flexDirection: 'row', gap: 8, marginTop: 12 },
  paymentBadge:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 4, borderWidth: 1 },
  paymentBadgeText: { fontSize: 12, fontWeight: '600' },
  footer:           { padding: 16, borderTopWidth: 1 },
  footerRow:        { flexDirection: 'row', gap: 10 },
  footerOutlineBtn: { flex: 1, borderWidth: 1, borderRadius: 4, height: 46, alignItems: 'center', justifyContent: 'center' },
  footerOutlineBtnText: { fontSize: 14, fontWeight: '700' },
  footerPrimaryBtn: { flex: 1, borderRadius: 4, height: 46, alignItems: 'center', justifyContent: 'center' },
  footerPrimaryBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  statusBanner:     { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 4, padding: 14 },
  statusBannerText: { fontSize: 13, fontWeight: '600' },
  modalOverlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalBox:         { width: '100%', borderRadius: 4, borderWidth: 1, padding: 20, gap: 14 },
  modalTitle:       { fontSize: 16, fontWeight: '800' },
  modalSub:         { fontSize: 12, marginTop: -6 },
  modalInput:       { borderWidth: 1, borderRadius: 4, padding: 12, fontSize: 13, minHeight: 80, textAlignVertical: 'top' },
  modalActions:     { flexDirection: 'row', gap: 10 },
  modalCancelBtn:   { flex: 1, paddingVertical: 10, borderRadius: 4, alignItems: 'center', justifyContent: 'center', borderWidth: 1, minHeight: 42 },
  modalRejectBtn:   { flex: 1, paddingVertical: 10, borderRadius: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E23B3B', minHeight: 42 },
  modalBtnText:     { fontSize: 13, fontWeight: '700' },
});
