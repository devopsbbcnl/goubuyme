import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { shadows } from '@/theme';
import api from '@/services/api';

interface Job {
  orderId: string;
  orderNumber: string;
  vendor: string;
  vendorImg: string | null;
  vendorLat: number | null;
  vendorLng: number | null;
  customer: string;
  customerAddress: string;
  customerLat: number | null;
  customerLng: number | null;
  itemCount: number;
  fee: number;
  distanceKm: number | null;
  eta: string | null;
}

interface ActiveDelivery {
  orderId: string;
  orderNumber: string;
  status: string;
  fee: number;
  customerName: string;
  customerAddress: string;
  customerLat: number | null;
  customerLng: number | null;
  vendorName: string;
  vendorLat: number | null;
  vendorLng: number | null;
}

export default function AvailableOrdersScreen() {
  const { theme: T } = useTheme();
  const [jobs,           setJobs]           = useState<Job[]>([]);
  const [activeDelivery, setActiveDelivery] = useState<ActiveDelivery | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [refreshing,     setRefreshing]     = useState(false);
  const [accepting,      setAccepting]      = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    try {
      const [jobsRes, activeRes] = await Promise.all([
        api.get('/riders/me/available-jobs'),
        api.get('/riders/me/active'),
      ]);
      setJobs(jobsRes.data.data ?? []);
      setActiveDelivery(activeRes.data.data ?? null);
    } catch {
      // silently keep previous list
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchJobs();
  }, [fetchJobs]);

  const accept = async (job: Job) => {
    setAccepting(job.orderId);
    try {
      const res = await api.post(`/riders/me/accept/${job.orderId}`);
      const d = res.data.data;
      router.push({
        pathname: '/(rider)/active',
        params: {
          orderId:         d.orderId,
          orderNumber:     d.orderNumber,
          customerName:    d.customerName,
          customerAddress: d.customerAddress,
          vendorLat:       String(d.vendorLat ?? ''),
          vendorLng:       String(d.vendorLng ?? ''),
          customerLat:     String(d.customerLat ?? ''),
          customerLng:     String(d.customerLng ?? ''),
          fee:             String(Math.round(d.fee)),
        },
      });
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? 'Could not accept job. It may have been taken.';
      Alert.alert('Job Unavailable', msg);
      setAccepting(null);
      fetchJobs(); // refresh to remove the taken job
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: T.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={T.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: T.bg }}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: T.border, paddingTop: 56 }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: T.text }]}>Available Jobs</Text>
          <Text style={styles.headerSub}>● {jobs.length} order{jobs.length !== 1 ? 's' : ''} near you</Text>
        </View>
        <TouchableOpacity onPress={handleRefresh} style={[styles.refreshBtn, { backgroundColor: T.primaryTint }]}>
          <Text style={[styles.refreshText, { color: T.primary }]}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {activeDelivery && (
        <TouchableOpacity
          onPress={() => router.push({
            pathname: '/(rider)/active',
            params: {
              orderId:         activeDelivery.orderId,
              orderNumber:     activeDelivery.orderNumber,
              customerName:    activeDelivery.customerName,
              customerAddress: activeDelivery.customerAddress,
              vendorLat:       String(activeDelivery.vendorLat ?? ''),
              vendorLng:       String(activeDelivery.vendorLng ?? ''),
              customerLat:     String(activeDelivery.customerLat ?? ''),
              customerLng:     String(activeDelivery.customerLng ?? ''),
              fee:             String(Math.round(activeDelivery.fee)),
              status:          activeDelivery.status,
            },
          })}
          style={[styles.resumeBanner, { backgroundColor: T.primary }]}
          activeOpacity={0.85}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.resumeTitle}>Active Delivery in Progress</Text>
            <Text style={styles.resumeSub}>
              {activeDelivery.orderNumber} · {activeDelivery.customerName} · ₦{Math.round(activeDelivery.fee).toLocaleString()}
            </Text>
          </View>
          <Ionicons name="arrow-forward-circle" size={28} color="#fff" />
        </TouchableOpacity>
      )}

      {jobs.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Text style={{ fontSize: 40 }}>📭</Text>
          <Text style={[{ fontSize: 16, fontWeight: '700' }, { color: T.text }]}>No jobs nearby</Text>
          <Text style={[{ fontSize: 13 }, { color: T.textSec }]}>Pull down to refresh</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={T.primary} colors={[T.primary]} />
          }
        >
          {jobs.map(job => (
            <View
              key={job.orderId}
              style={[
                styles.jobCard,
                { backgroundColor: T.surface, borderColor: T.border },
                accepting && accepting !== job.orderId && { opacity: 0.5 },
              ]}
            >
              {/* Vendor image strip */}
              <View style={styles.vendorStrip}>
                {job.vendorImg ? (
                  <Image source={{ uri: job.vendorImg }} style={StyleSheet.absoluteFillObject as any} resizeMode="cover" />
                ) : (
                  <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#1A2430', alignItems: 'center', justifyContent: 'center' }]}>
                    <Text style={{ fontSize: 32 }}>🍛</Text>
                  </View>
                )}
                <View style={styles.stripGrad} />
                <View style={styles.stripInfo}>
                  <Text style={styles.stripVendor}>{job.vendor}</Text>
                  <Text style={styles.stripItems}>{job.itemCount} item{job.itemCount !== 1 ? 's' : ''}</Text>
                </View>
                <View style={[styles.feePill, { backgroundColor: T.primary }]}>
                  <Text style={styles.feePillText}>₦{Math.round(job.fee).toLocaleString()}</Text>
                </View>
              </View>

              <View style={{ padding: 12, paddingTop: 14 }}>
                {/* Route */}
                <View style={styles.routeRow}>
                  <View style={styles.routeDots}>
                    <View style={[styles.dotTop, { backgroundColor: T.primary }]} />
                    <View style={[styles.routeBar, { backgroundColor: T.border }]} />
                    <View style={[styles.dotBottom, { backgroundColor: '#1A9E5F' }]} />
                  </View>
                  <View style={{ flex: 1, gap: 10 }}>
                    <View>
                      <Text style={[styles.routeLabel, { color: T.textSec }]}>PICK UP</Text>
                      <Text style={[styles.routeValue, { color: T.text }]}>{job.vendor}</Text>
                    </View>
                    <View>
                      <Text style={[styles.routeLabel, { color: T.textSec }]}>DELIVER TO</Text>
                      <Text style={[styles.routeValue, { color: T.text }]}>{job.customerAddress}</Text>
                    </View>
                  </View>
                </View>

                {/* Meta */}
                <View style={styles.metaRow}>
                  {job.eta && (
                    <View style={styles.metaItem}>
                      <Ionicons name="flash-outline" size={13} color={T.textSec} />
                      <Text style={[styles.metaText, { color: T.textSec }]}>{job.eta}</Text>
                    </View>
                  )}
                  {job.distanceKm != null && (
                    <View style={styles.metaItem}>
                      <Ionicons name="map-outline" size={13} color={T.textSec} />
                      <Text style={[styles.metaText, { color: T.textSec }]}>{job.distanceKm} km</Text>
                    </View>
                  )}
                  <Text style={[styles.metaText, { color: T.textSec }]}>For: {job.customer}</Text>
                </View>

                {/* Accept button */}
                <TouchableOpacity
                  onPress={() => accept(job)}
                  disabled={!!accepting}
                  style={[
                    styles.acceptBtn,
                    { backgroundColor: accepting === job.orderId ? '#1A9E5F' : T.primary },
                    !accepting && shadows.primaryGlow(T.primary),
                  ]}
                  activeOpacity={0.85}
                >
                  {accepting === job.orderId ? (
                    <>
                      <Ionicons name="checkmark" size={16} color="#fff" />
                      <Text style={styles.acceptBtnText}>Accepted!</Text>
                    </>
                  ) : (
                    <Text style={styles.acceptBtnText}>Accept · ₦{Math.round(job.fee).toLocaleString()}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  resumeBanner:  { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginTop: 14, borderRadius: 4, padding: 14, gap: 12 },
  resumeTitle:   { fontSize: 14, fontWeight: '800', color: '#fff' },
  resumeSub:     { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  header:        { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
  headerTitle:   { fontSize: 20, fontWeight: '800' },
  headerSub:     { fontSize: 12, color: '#1A9E5F', marginTop: 1 },
  refreshBtn:    { borderRadius: 4, paddingVertical: 5, paddingHorizontal: 12 },
  refreshText:   { fontSize: 12, fontWeight: '700' },
  jobCard:       { borderRadius: 4, overflow: 'hidden', borderWidth: 1 },
  vendorStrip:   { height: 80, position: 'relative' },
  stripGrad:     { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)' },
  stripInfo:     { position: 'absolute', top: 12, left: 14 },
  stripVendor:   { fontSize: 14, fontWeight: '800', color: '#fff' },
  stripItems:    { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 1 },
  feePill:       { position: 'absolute', top: 12, right: 14, borderRadius: 4, paddingVertical: 4, paddingHorizontal: 10 },
  feePillText:   { fontSize: 12, fontWeight: '800', color: '#fff' },
  routeRow:      { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 12 },
  routeDots:     { alignItems: 'center', gap: 2, paddingTop: 3 },
  dotTop:        { width: 8, height: 8, borderRadius: 4 },
  routeBar:      { width: 1.5, height: 20 },
  dotBottom:     { width: 8, height: 8, borderRadius: 4 },
  routeLabel:    { fontSize: 11, fontWeight: '600' },
  routeValue:    { fontSize: 13, fontWeight: '600', marginTop: 1 },
  metaRow:       { flexDirection: 'row', gap: 16, marginBottom: 14 },
  metaItem:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText:      { fontSize: 12 },
  acceptBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 4 },
  acceptBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
