'use client';
import { useState, useEffect } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { api } from '@/lib/api';

type Status = 'ACTIVE' | 'INACTIVE';
type ZoneType = 'NORMAL' | 'RURAL_EDGE' | 'FLOOD_PRONE' | 'HIGH_COST';
type ZoneHierarchyType = 'COUNTRY' | 'STATE' | 'CITY' | 'OPERATIONAL' | 'MICRO_ZONE';
type SurchargeType = 'NIGHT_DELIVERY' | 'RAIN' | 'HIGH_TRAFFIC' | 'FUEL' | 'EMERGENCY';
type ModifierType = 'PERCENTAGE' | 'FIXED';

interface PricingProfile {
  id: string;
  name: string;
  country: string;
  state: string | null;
  city: string | null;
  status: Status;
  baseFee: number;
  minimumFee: number;
  maximumFee: number | null;
  maxDeliveryRadiusKm: number;
  freeDeliveryThreshold: number | null;
  riderPayoutPercentage: number;
  isDefault: boolean;
  priority: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdAt: string;
  _count: { buckets: number; modifiers: number; zones: number };
}

interface PricingBucket {
  id: string;
  pricingProfileId: string;
  minDistanceKm: number;
  maxDistanceKm: number | null;
  fee: number;
  perKmRate: number | null;
  description: string;
}

interface PricingModifier {
  id: string;
  pricingProfileId: string;
  type: ModifierType;
  surchargeType: SurchargeType;
  name: string;
  value: number;
  conditions: any;
  isActive: boolean;
}

interface DeliveryZone {
  id: string;
  pricingProfileId: string;
  name: string;
  type: ZoneType;
  zoneType: ZoneHierarchyType;
  parentZoneId: string | null;
  multiplier: number;
  description: string;
  polygonCoordinates: any;
  geometry: any;
  landmarkKeywords: string[];
  requiresManualCorrection: boolean;
  isActive: boolean;
}

interface SurgeEvent {
  id: string;
  name: string;
  type: string;
  multiplier: number;
  startTime: string;
  endTime: string;
  affectedAreas: any;
  isActive: boolean;
}

interface SimulationResult {
  distanceKm: number;
  durationMinutes: number;
  matchedPricingProfile: {
    id: string;
    name: string;
    country: string;
    state: string | null;
    city: string | null;
  };
  pricingZone: {
    id: string;
    name: string;
    type: string;
    multiplier: number;
  } | null;
  baseFee: number;
  bucketFee: number;
  surcharges: Array<{
    name: string;
    type: string;
    value: number;
    amount: number;
  }>;
  areaMultiplier: number;
  surgeMultiplier: number;
  finalFee: number;
  estimatedRiderPayout: number;
}

const fmtCurrency = (n: number) => `₦${n.toLocaleString()}`;
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const STATUS_COLORS: Record<Status, { bg: string; text: string }> = {
  ACTIVE:   { bg: '#D1FAE5', text: '#065F46' },
  INACTIVE: { bg: '#F3F4F6', text: '#6B7280' },
};

export default function PricingPage() {
  const { theme: T } = useTheme();
  const [activeTab, setActiveTab] = useState<'profiles' | 'zones' | 'surge' | 'simulation'>('profiles');

  // Profiles
  const [profiles, setProfiles] = useState<PricingProfile[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<PricingProfile | null>(null);
  const [profileForm, setProfileForm] = useState({
    name: '',
    country: 'Nigeria',
    state: '',
    city: '',
    baseFee: 700,
    minimumFee: 700,
    maximumFee: '',
    maxDeliveryRadiusKm: 25,
    freeDeliveryThreshold: '',
    riderPayoutPercentage: 85,
    isDefault: false,
    priority: 0,
  });
  const [profileSaving, setProfileSaving] = useState(false);

  // Zones
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [zonesLoading, setZonesLoading] = useState(true);
  const [zoneModalOpen, setZoneModalOpen] = useState(false);
  const [selectedZone, setSelectedZone] = useState<DeliveryZone | null>(null);
  const [zoneForm, setZoneForm] = useState({
    pricingProfileId: '',
    name: '',
    type: 'NORMAL' as ZoneType,
    zoneType: 'CITY' as ZoneHierarchyType,
    parentZoneId: '',
    multiplier: 1.0,
    description: '',
    landmarkKeywords: '',
    requiresManualCorrection: false,
    isActive: true,
  });
  const [zoneSaving, setZoneSaving] = useState(false);

  // Surge Events
  const [surgeEvents, setSurgeEvents] = useState<SurgeEvent[]>([]);
  const [surgeLoading, setSurgeLoading] = useState(true);
  const [surgeModalOpen, setSurgeModalOpen] = useState(false);
  const [selectedSurge, setSelectedSurge] = useState<SurgeEvent | null>(null);
  const [surgeForm, setSurgeForm] = useState({
    name: '',
    type: 'EMERGENCY' as SurchargeType,
    multiplier: 1.5,
    startTime: '',
    endTime: '',
    country: 'Nigeria',
    state: '',
    city: '',
    isActive: true,
  });
  const [surgeSaving, setSurgeSaving] = useState(false);

  // Simulation
  const [simulating, setSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
  const [simForm, setSimForm] = useState({
    vendorLat: 6.5244,
    vendorLng: 3.3792,
    customerLat: 6.6018,
    customerLng: 3.3515,
    country: 'Nigeria',
    state: 'Lagos',
    city: 'Lagos',
    weatherCondition: 'CLEAR' as const,
    trafficLevel: 'LOW' as const,
  });

  useEffect(() => {
    fetchProfiles();
  }, []);

  const fetchProfiles = async () => {
    setProfilesLoading(true);
    try {
      const res = await api.get<{ data: PricingProfile[] }>('/admin/pricing/profiles');
      setProfiles(res.data);
    } catch (err) {
      console.error('Failed to fetch pricing profiles:', err);
    } finally {
      setProfilesLoading(false);
    }
  };

  const fetchZones = async () => {
    setZonesLoading(true);
    try {
      const res = await api.get<{ data: DeliveryZone[] }>('/admin/pricing/zones');
      setZones(res.data);
    } catch (err) {
      console.error('Failed to fetch delivery zones:', err);
    } finally {
      setZonesLoading(false);
    }
  };

  const fetchSurgeEvents = async () => {
    setSurgeLoading(true);
    try {
      const res = await api.get<{ data: SurgeEvent[] }>('/admin/pricing/surge-events');
      setSurgeEvents(res.data);
    } catch (err) {
      console.error('Failed to fetch surge events:', err);
    } finally {
      setSurgeLoading(false);
    }
  };

  const runSimulation = async () => {
    setSimulating(true);
    try {
      const res = await api.post<{ data: SimulationResult }>('/admin/pricing/simulate', simForm);
      setSimulationResult(res.data);
    } catch (err) {
      console.error('Simulation failed:', err);
    } finally {
      setSimulating(false);
    }
  };

  const handleProfileSubmit = async () => {
    setProfileSaving(true);
    try {
      const payload = {
        name: profileForm.name,
        country: profileForm.country,
        state: profileForm.state || null,
        city: profileForm.city || null,
        baseFee: profileForm.baseFee,
        minimumFee: profileForm.minimumFee,
        maximumFee: profileForm.maximumFee ? parseFloat(profileForm.maximumFee) : null,
        maxDeliveryRadiusKm: profileForm.maxDeliveryRadiusKm,
        freeDeliveryThreshold: profileForm.freeDeliveryThreshold ? parseFloat(profileForm.freeDeliveryThreshold) : null,
        riderPayoutPercentage: profileForm.riderPayoutPercentage,
        isDefault: profileForm.isDefault,
        priority: profileForm.priority,
      };
      
      if (selectedProfile) {
        await api.patch(`/admin/pricing/profiles/${selectedProfile.id}`, payload);
      } else {
        await api.post('/admin/pricing/profiles', payload);
      }
      await fetchProfiles();
      setProfileModalOpen(false);
      setSelectedProfile(null);
      setProfileForm({
        name: '',
        country: 'Nigeria',
        state: '',
        city: '',
        baseFee: 700,
        minimumFee: 700,
        maximumFee: '',
        maxDeliveryRadiusKm: 25,
        freeDeliveryThreshold: '',
        riderPayoutPercentage: 85,
        isDefault: false,
        priority: 0,
      });
    } catch (err) {
      console.error('Failed to save profile:', err);
    } finally {
      setProfileSaving(false);
    }
  };

  const handleZoneSubmit = async () => {
    setZoneSaving(true);
    try {
      const payload = {
        pricingProfileId: zoneForm.pricingProfileId,
        name: zoneForm.name,
        type: zoneForm.type,
        zoneType: zoneForm.zoneType,
        parentZoneId: zoneForm.parentZoneId || null,
        multiplier: zoneForm.multiplier,
        description: zoneForm.description,
        landmarkKeywords: zoneForm.landmarkKeywords ? zoneForm.landmarkKeywords.split(',').map(k => k.trim()) : [],
        requiresManualCorrection: zoneForm.requiresManualCorrection,
        isActive: zoneForm.isActive,
      };
      
      if (selectedZone) {
        await api.patch(`/admin/pricing/zones/${selectedZone.id}`, payload);
      } else {
        await api.post('/admin/pricing/zones', payload);
      }
      await fetchZones();
      setZoneModalOpen(false);
      setSelectedZone(null);
      setZoneForm({
        pricingProfileId: '',
        name: '',
        type: 'NORMAL' as ZoneType,
        zoneType: 'CITY' as ZoneHierarchyType,
        parentZoneId: '',
        multiplier: 1.0,
        description: '',
        landmarkKeywords: '',
        requiresManualCorrection: false,
        isActive: true,
      });
    } catch (err) {
      console.error('Failed to save zone:', err);
    } finally {
      setZoneSaving(false);
    }
  };

  const handleSurgeSubmit = async () => {
    setSurgeSaving(true);
    try {
      const payload = {
        name: surgeForm.name,
        type: surgeForm.type,
        multiplier: surgeForm.multiplier,
        startTime: surgeForm.startTime,
        endTime: surgeForm.endTime,
        affectedAreas: {
          country: surgeForm.country,
          state: surgeForm.state || undefined,
          city: surgeForm.city || undefined,
        },
        isActive: surgeForm.isActive,
      };
      
      if (selectedSurge) {
        await api.patch(`/admin/pricing/surge-events/${selectedSurge.id}`, payload);
      } else {
        await api.post('/admin/pricing/surge-events', payload);
      }
      await fetchSurgeEvents();
      setSurgeModalOpen(false);
      setSelectedSurge(null);
      setSurgeForm({
        name: '',
        type: 'EMERGENCY',
        multiplier: 1.5,
        startTime: '',
        endTime: '',
        country: 'Nigeria',
        state: '',
        city: '',
        isActive: true,
      });
    } catch (err) {
      console.error('Failed to save surge event:', err);
    } finally {
      setSurgeSaving(false);
    }
  };

  const handleDeleteProfile = async (id: string) => {
    if (!confirm('Are you sure you want to delete this pricing profile?')) return;
    try {
      await api.del(`/admin/pricing/profiles/${id}`);
      await fetchProfiles();
    } catch (err) {
      console.error('Failed to delete profile:', err);
    }
  };

  const handleDeleteZone = async (id: string) => {
    if (!confirm('Are you sure you want to delete this delivery zone?')) return;
    try {
      await api.del(`/admin/pricing/zones/${id}`);
      await fetchZones();
    } catch (err) {
      console.error('Failed to delete zone:', err);
    }
  };

  const handleDeleteSurge = async (id: string) => {
    if (!confirm('Are you sure you want to delete this surge event?')) return;
    try {
      await api.del(`/admin/pricing/surge-events/${id}`);
      await fetchSurgeEvents();
    } catch (err) {
      console.error('Failed to delete surge event:', err);
    }
  };

  const openProfileModal = (profile?: PricingProfile) => {
    if (profile) {
      setSelectedProfile(profile);
      setProfileForm({
        name: profile.name,
        country: profile.country,
        state: profile.state || '',
        city: profile.city || '',
        baseFee: profile.baseFee,
        minimumFee: profile.minimumFee,
        maximumFee: profile.maximumFee?.toString() || '',
        maxDeliveryRadiusKm: profile.maxDeliveryRadiusKm,
        freeDeliveryThreshold: profile.freeDeliveryThreshold?.toString() || '',
        riderPayoutPercentage: profile.riderPayoutPercentage,
        isDefault: profile.isDefault,
        priority: profile.priority,
      });
    } else {
      setSelectedProfile(null);
      setProfileForm({
        name: '',
        country: 'Nigeria',
        state: '',
        city: '',
        baseFee: 700,
        minimumFee: 700,
        maximumFee: '',
        maxDeliveryRadiusKm: 25,
        freeDeliveryThreshold: '',
        riderPayoutPercentage: 85,
        isDefault: false,
        priority: 0,
      });
    }
    setProfileModalOpen(true);
  };

  const openZoneModal = (zone?: DeliveryZone) => {
    if (zone) {
      setSelectedZone(zone);
      setZoneForm({
        pricingProfileId: zone.pricingProfileId,
        name: zone.name,
        type: zone.type,
        zoneType: zone.zoneType,
        parentZoneId: zone.parentZoneId || '',
        multiplier: zone.multiplier,
        description: zone.description,
        landmarkKeywords: zone.landmarkKeywords ? zone.landmarkKeywords.join(', ') : '',
        requiresManualCorrection: zone.requiresManualCorrection,
        isActive: zone.isActive,
      });
    } else {
      setSelectedZone(null);
      setZoneForm({
        pricingProfileId: profiles[0]?.id || '',
        name: '',
        type: 'NORMAL' as ZoneType,
        zoneType: 'CITY' as ZoneHierarchyType,
        parentZoneId: '',
        multiplier: 1.0,
        description: '',
        landmarkKeywords: '',
        requiresManualCorrection: false,
        isActive: true,
      });
    }
    setZoneModalOpen(true);
  };

  const openSurgeModal = (surge?: SurgeEvent) => {
    if (surge) {
      setSelectedSurge(surge);
      const areas = surge.affectedAreas as any;
      setSurgeForm({
        name: surge.name,
        type: surge.type as SurchargeType,
        multiplier: surge.multiplier,
        startTime: surge.startTime.slice(0, 16),
        endTime: surge.endTime.slice(0, 16),
        country: areas?.country || 'Nigeria',
        state: areas?.state || '',
        city: areas?.city || '',
        isActive: surge.isActive,
      });
    } else {
      setSelectedSurge(null);
      setSurgeForm({
        name: '',
        type: 'EMERGENCY',
        multiplier: 1.5,
        startTime: '',
        endTime: '',
        country: 'Nigeria',
        state: '',
        city: '',
        isActive: true,
      });
    }
    setSurgeModalOpen(true);
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: T.text, marginBottom: 8 }}>
          Pricing Management
        </h1>
        <p style={{ fontSize: 14, color: T.textSec }}>
          Configure delivery pricing profiles, zones, and surge events
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: `1px solid ${T.border}` }}>
        {[
          { key: 'profiles' as const, label: 'Pricing Profiles' },
          { key: 'zones' as const, label: 'Delivery Zones' },
          { key: 'surge' as const, label: 'Surge Events' },
          { key: 'simulation' as const, label: 'Pricing Simulation' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => {
              setActiveTab(tab.key);
              if (tab.key === 'zones' && zones.length === 0) fetchZones();
              if (tab.key === 'surge' && surgeEvents.length === 0) fetchSurgeEvents();
            }}
            style={{
              padding: '10px 16px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab.key ? `2px solid ${T.primary}` : '2px solid transparent',
              fontSize: 13,
              fontWeight: activeTab === tab.key ? 600 : 500,
              color: activeTab === tab.key ? T.primary : T.textSec,
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Profiles Tab */}
      {activeTab === 'profiles' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: T.text }}>Pricing Profiles</h2>
            <button
              onClick={() => openProfileModal()}
              style={{
                padding: '8px 16px',
                background: T.primary,
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              + Add Profile
            </button>
          </div>

          {profilesLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: T.textSec }}>Loading...</div>
          ) : profiles.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: T.textSec }}>No pricing profiles found</div>
          ) : (
            <div style={{ display: 'grid', gap: 16 }}>
              {profiles.map(profile => (
                <div
                  key={profile.id}
                  style={{
                    background: T.surface,
                    border: `1px solid ${T.border}`,
                    borderRadius: 8,
                    padding: 20,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <h3 style={{ fontSize: 16, fontWeight: 600, color: T.text }}>{profile.name}</h3>
                      {profile.isDefault && (
                        <span style={{
                          fontSize: 11, fontWeight: 700, color: '#065F46',
                          background: '#D1FAE5', borderRadius: 4,
                          padding: '3px 9px', whiteSpace: 'nowrap',
                        }}>Default</span>
                      )}
                      <Badge status={profile.status === 'ACTIVE' ? 'APPROVED' : 'PENDING'} />
                    </div>
                    <div style={{ fontSize: 13, color: T.textSec, marginBottom: 12 }}>
                      {profile.city ? `${profile.city}, ${profile.state}, ${profile.country}` : 
                       profile.state ? `${profile.state}, ${profile.country}` : profile.country}
                    </div>
                    <div style={{ display: 'flex', gap: 20, fontSize: 13, color: T.textSec }}>
                      <span>Base: {fmtCurrency(profile.baseFee)}</span>
                      <span>Min: {fmtCurrency(profile.minimumFee)}</span>
                      <span>Max: {profile.maximumFee ? fmtCurrency(profile.maximumFee) : 'Unlimited'}</span>
                      <span>Radius: {profile.maxDeliveryRadiusKm}km</span>
                    </div>
                    <div style={{ display: 'flex', gap: 20, fontSize: 12, color: T.textSec, marginTop: 8 }}>
                      <span>{profile._count.buckets} buckets</span>
                      <span>{profile._count.modifiers} modifiers</span>
                      <span>{profile._count.zones} zones</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => openProfileModal(profile)}
                      style={{
                        padding: '6px 12px',
                        background: T.surface2,
                        border: `1px solid ${T.border}`,
                        borderRadius: 4,
                        fontSize: 12,
                        color: T.text,
                        cursor: 'pointer',
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteProfile(profile.id)}
                      style={{
                        padding: '6px 12px',
                        background: '#FEE2E2',
                        border: '1px solid #FCA5A5',
                        borderRadius: 4,
                        fontSize: 12,
                        color: '#DC2626',
                        cursor: 'pointer',
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Zones Tab */}
      {activeTab === 'zones' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: T.text }}>Delivery Zones</h2>
            <button
              onClick={() => openZoneModal()}
              style={{
                padding: '8px 16px',
                background: T.primary,
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              + Add Zone
            </button>
          </div>

          {zonesLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: T.textSec }}>Loading...</div>
          ) : zones.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: T.textSec }}>No delivery zones found</div>
          ) : (
            <div style={{ display: 'grid', gap: 16 }}>
              {zones.map(zone => (
                <div
                  key={zone.id}
                  style={{
                    background: T.surface,
                    border: `1px solid ${T.border}`,
                    borderRadius: 8,
                    padding: 20,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 600, color: T.text, marginBottom: 4 }}>
                      {zone.name}
                    </h3>
                    <div style={{ fontSize: 13, color: T.textSec, marginBottom: 8 }}>
                      {zone.type} • {zone.description}
                    </div>
                    <div style={{ fontSize: 13, color: T.text }}>
                      Multiplier: <strong>{zone.multiplier}x</strong>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => openZoneModal(zone)}
                      style={{
                        padding: '6px 12px',
                        background: T.surface2,
                        border: `1px solid ${T.border}`,
                        borderRadius: 4,
                        fontSize: 12,
                        color: T.text,
                        cursor: 'pointer',
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteZone(zone.id)}
                      style={{
                        padding: '6px 12px',
                        background: '#FEE2E2',
                        border: '1px solid #FCA5A5',
                        borderRadius: 4,
                        fontSize: 12,
                        color: '#DC2626',
                        cursor: 'pointer',
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Surge Events Tab */}
      {activeTab === 'surge' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: T.text }}>Surge Events</h2>
            <button
              onClick={() => openSurgeModal()}
              style={{
                padding: '8px 16px',
                background: T.primary,
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              + Add Surge Event
            </button>
          </div>

          {surgeLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: T.textSec }}>Loading...</div>
          ) : surgeEvents.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: T.textSec }}>No surge events found</div>
          ) : (
            <div style={{ display: 'grid', gap: 16 }}>
              {surgeEvents.map(surge => (
                <div
                  key={surge.id}
                  style={{
                    background: T.surface,
                    border: `1px solid ${T.border}`,
                    borderRadius: 8,
                    padding: 20,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <h3 style={{ fontSize: 16, fontWeight: 600, color: T.text }}>{surge.name}</h3>
                      <Badge status={surge.isActive ? 'APPROVED' : 'PENDING'} />
                    </div>
                    <div style={{ fontSize: 13, color: T.textSec, marginBottom: 8 }}>
                      {fmtDate(surge.startTime)} - {fmtDate(surge.endTime)}
                    </div>
                    <div style={{ fontSize: 13, color: T.text }}>
                      Multiplier: <strong>{surge.multiplier}x</strong>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => openSurgeModal(surge)}
                      style={{
                        padding: '6px 12px',
                        background: T.surface2,
                        border: `1px solid ${T.border}`,
                        borderRadius: 4,
                        fontSize: 12,
                        color: T.text,
                        cursor: 'pointer',
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteSurge(surge.id)}
                      style={{
                        padding: '6px 12px',
                        background: '#FEE2E2',
                        border: '1px solid #FCA5A5',
                        borderRadius: 4,
                        fontSize: 12,
                        color: '#DC2626',
                        cursor: 'pointer',
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Simulation Tab */}
      {activeTab === 'simulation' && (
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: T.text, marginBottom: 16 }}>Pricing Simulation</h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            {/* Form */}
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 16 }}>Input Parameters</h3>
              
              <div style={{ display: 'grid', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 500, color: T.textSec, marginBottom: 4, display: 'block' }}>
                    Vendor Location (Lat, Lng)
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="number"
                      step="0.0001"
                      value={simForm.vendorLat}
                      onChange={e => setSimForm({ ...simForm, vendorLat: parseFloat(e.target.value) })}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        background: T.bg,
                        border: `1px solid ${T.border}`,
                        borderRadius: 4,
                        fontSize: 13,
                        color: T.text,
                      }}
                    />
                    <input
                      type="number"
                      step="0.0001"
                      value={simForm.vendorLng}
                      onChange={e => setSimForm({ ...simForm, vendorLng: parseFloat(e.target.value) })}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        background: T.bg,
                        border: `1px solid ${T.border}`,
                        borderRadius: 4,
                        fontSize: 13,
                        color: T.text,
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 500, color: T.textSec, marginBottom: 4, display: 'block' }}>
                    Customer Location (Lat, Lng)
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="number"
                      step="0.0001"
                      value={simForm.customerLat}
                      onChange={e => setSimForm({ ...simForm, customerLat: parseFloat(e.target.value) })}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        background: T.bg,
                        border: `1px solid ${T.border}`,
                        borderRadius: 4,
                        fontSize: 13,
                        color: T.text,
                      }}
                    />
                    <input
                      type="number"
                      step="0.0001"
                      value={simForm.customerLng}
                      onChange={e => setSimForm({ ...simForm, customerLng: parseFloat(e.target.value) })}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        background: T.bg,
                        border: `1px solid ${T.border}`,
                        borderRadius: 4,
                        fontSize: 13,
                        color: T.text,
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 500, color: T.textSec, marginBottom: 4, display: 'block' }}>
                    Country
                  </label>
                  <input
                    type="text"
                    value={simForm.country}
                    onChange={e => setSimForm({ ...simForm, country: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      background: T.bg,
                      border: `1px solid ${T.border}`,
                      borderRadius: 4,
                      fontSize: 13,
                      color: T.text,
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 500, color: T.textSec, marginBottom: 4, display: 'block' }}>
                    State
                  </label>
                  <input
                    type="text"
                    value={simForm.state}
                    onChange={e => setSimForm({ ...simForm, state: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      background: T.bg,
                      border: `1px solid ${T.border}`,
                      borderRadius: 4,
                      fontSize: 13,
                      color: T.text,
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 500, color: T.textSec, marginBottom: 4, display: 'block' }}>
                    City
                  </label>
                  <input
                    type="text"
                    value={simForm.city}
                    onChange={e => setSimForm({ ...simForm, city: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      background: T.bg,
                      border: `1px solid ${T.border}`,
                      borderRadius: 4,
                      fontSize: 13,
                      color: T.text,
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 500, color: T.textSec, marginBottom: 4, display: 'block' }}>
                    Weather Condition
                  </label>
                  <select
                    value={simForm.weatherCondition}
                    onChange={e => setSimForm({ ...simForm, weatherCondition: e.target.value as any })}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      background: T.bg,
                      border: `1px solid ${T.border}`,
                      borderRadius: 4,
                      fontSize: 13,
                      color: T.text,
                    }}
                  >
                    <option value="CLEAR">Clear</option>
                    <option value="RAIN">Rain</option>
                    <option value="HEAVY_RAIN">Heavy Rain</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 500, color: T.textSec, marginBottom: 4, display: 'block' }}>
                    Traffic Level
                  </label>
                  <select
                    value={simForm.trafficLevel}
                    onChange={e => setSimForm({ ...simForm, trafficLevel: e.target.value as any })}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      background: T.bg,
                      border: `1px solid ${T.border}`,
                      borderRadius: 4,
                      fontSize: 13,
                      color: T.text,
                    }}
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                  </select>
                </div>

                <button
                  onClick={runSimulation}
                  disabled={simulating}
                  style={{
                    padding: '10px 16px',
                    background: T.primary,
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: simulating ? 'not-allowed' : 'pointer',
                    opacity: simulating ? 0.6 : 1,
                  }}
                >
                  {simulating ? 'Calculating...' : 'Calculate Fee'}
                </button>
              </div>
            </div>

            {/* Results */}
            {simulationResult && (
              <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 16 }}>Results</h3>
                
                <div style={{ display: 'grid', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${T.border}` }}>
                    <span style={{ fontSize: 13, color: T.textSec }}>Distance</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>
                      {simulationResult.distanceKm.toFixed(2)} km
                    </span>
                  </div>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${T.border}` }}>
                    <span style={{ fontSize: 13, color: T.textSec }}>Duration</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>
                      {simulationResult.durationMinutes} min
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${T.border}` }}>
                    <span style={{ fontSize: 13, color: T.textSec }}>Pricing Profile</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>
                      {simulationResult.matchedPricingProfile.name}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${T.border}` }}>
                    <span style={{ fontSize: 13, color: T.textSec }}>Base Fee</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>
                      {fmtCurrency(simulationResult.baseFee)}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${T.border}` }}>
                    <span style={{ fontSize: 13, color: T.textSec }}>Bucket Fee</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>
                      {fmtCurrency(simulationResult.bucketFee)}
                    </span>
                  </div>

                  {simulationResult.surcharges.length > 0 && (
                    <div>
                      <div style={{ fontSize: 12, color: T.textSec, marginBottom: 8 }}>Surcharges</div>
                      {simulationResult.surcharges.map((surge, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
                          <span style={{ color: T.text }}>{surge.name}</span>
                          <span style={{ fontWeight: 600, color: T.text }}>
                            {fmtCurrency(surge.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${T.border}` }}>
                    <span style={{ fontSize: 13, color: T.textSec }}>Area Multiplier</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>
                      {simulationResult.areaMultiplier}x
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${T.border}` }}>
                    <span style={{ fontSize: 13, color: T.textSec }}>Surge Multiplier</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>
                      {simulationResult.surgeMultiplier}x
                    </span>
                  </div>

                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    padding: '12px 0', 
                    borderTop: `2px solid ${T.border}`,
                    marginTop: 8,
                  }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: T.text }}>Final Fee</span>
                    <span style={{ fontSize: 18, fontWeight: 700, color: T.primary }}>
                      {fmtCurrency(simulationResult.finalFee)}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                    <span style={{ fontSize: 12, color: T.textSec }}>Estimated Rider Payout</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>
                      {fmtCurrency(simulationResult.estimatedRiderPayout)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Profile Modal */}
      <Modal
        open={profileModalOpen}
        onClose={() => { setProfileModalOpen(false); setSelectedProfile(null); }}
        title={selectedProfile ? 'Edit Pricing Profile' : 'Add Pricing Profile'}
      >
        <div style={{ padding: 20 }}>
          <div style={{ display: 'grid', gap: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: T.textSec, marginBottom: 4, display: 'block' }}>
                Profile Name *
              </label>
              <input
                type="text"
                value={profileForm.name}
                onChange={e => setProfileForm({ ...profileForm, name: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: T.bg,
                  border: `1px solid ${T.border}`,
                  borderRadius: 4,
                  fontSize: 13,
                  color: T.text,
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: T.textSec, marginBottom: 4, display: 'block' }}>
                Country *
              </label>
              <input
                type="text"
                value={profileForm.country}
                onChange={e => setProfileForm({ ...profileForm, country: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: T.bg,
                  border: `1px solid ${T.border}`,
                  borderRadius: 4,
                  fontSize: 13,
                  color: T.text,
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: T.textSec, marginBottom: 4, display: 'block' }}>
                  State
                </label>
                <input
                  type="text"
                  value={profileForm.state}
                  onChange={e => setProfileForm({ ...profileForm, state: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: T.bg,
                    border: `1px solid ${T.border}`,
                    borderRadius: 4,
                    fontSize: 13,
                    color: T.text,
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: T.textSec, marginBottom: 4, display: 'block' }}>
                  City
                </label>
                <input
                  type="text"
                  value={profileForm.city}
                  onChange={e => setProfileForm({ ...profileForm, city: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: T.bg,
                    border: `1px solid ${T.border}`,
                    borderRadius: 4,
                    fontSize: 13,
                    color: T.text,
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: T.textSec, marginBottom: 4, display: 'block' }}>
                  Base Fee (₦) *
                </label>
                <input
                  type="number"
                  value={profileForm.baseFee}
                  onChange={e => setProfileForm({ ...profileForm, baseFee: parseFloat(e.target.value) })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: T.bg,
                    border: `1px solid ${T.border}`,
                    borderRadius: 4,
                    fontSize: 13,
                    color: T.text,
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: T.textSec, marginBottom: 4, display: 'block' }}>
                  Minimum Fee (₦) *
                </label>
                <input
                  type="number"
                  value={profileForm.minimumFee}
                  onChange={e => setProfileForm({ ...profileForm, minimumFee: parseFloat(e.target.value) })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: T.bg,
                    border: `1px solid ${T.border}`,
                    borderRadius: 4,
                    fontSize: 13,
                    color: T.text,
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: T.textSec, marginBottom: 4, display: 'block' }}>
                  Maximum Fee (₦)
                </label>
                <input
                  type="number"
                  value={profileForm.maximumFee}
                  onChange={e => setProfileForm({ ...profileForm, maximumFee: e.target.value })}
                  placeholder="Unlimited if empty"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: T.bg,
                    border: `1px solid ${T.border}`,
                    borderRadius: 4,
                    fontSize: 13,
                    color: T.text,
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: T.textSec, marginBottom: 4, display: 'block' }}>
                  Free Delivery Threshold (₦)
                </label>
                <input
                  type="number"
                  value={profileForm.freeDeliveryThreshold}
                  onChange={e => setProfileForm({ ...profileForm, freeDeliveryThreshold: e.target.value })}
                  placeholder="Order amount for free delivery"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: T.bg,
                    border: `1px solid ${T.border}`,
                    borderRadius: 4,
                    fontSize: 13,
                    color: T.text,
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: T.textSec, marginBottom: 4, display: 'block' }}>
                Max Delivery Radius (km) *
              </label>
              <input
                type="number"
                value={profileForm.maxDeliveryRadiusKm}
                onChange={e => setProfileForm({ ...profileForm, maxDeliveryRadiusKm: parseFloat(e.target.value) })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: T.bg,
                  border: `1px solid ${T.border}`,
                  borderRadius: 4,
                  fontSize: 13,
                  color: T.text,
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: T.textSec, display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={profileForm.isDefault}
                  onChange={e => setProfileForm({ ...profileForm, isDefault: e.target.checked })}
                  style={{ width: 16, height: 16 }}
                />
                Set as Default Profile
              </label>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: T.textSec, marginBottom: 4, display: 'block' }}>
                Rider Payout Percentage (%) *
              </label>
              <input
                type="number"
                step="1"
                min="0"
                max="100"
                value={profileForm.riderPayoutPercentage}
                onChange={e => setProfileForm({ ...profileForm, riderPayoutPercentage: parseFloat(e.target.value) })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: T.bg,
                  border: `1px solid ${T.border}`,
                  borderRadius: 4,
                  fontSize: 13,
                  color: T.text,
                }}
              />
              <div style={{ fontSize: 11, color: T.textSec, marginTop: 4 }}>
                Percentage of delivery fee paid to rider (default: 85%)
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <button
                onClick={() => { setProfileModalOpen(false); setSelectedProfile(null); }}
                style={{
                  padding: '8px 16px',
                  background: T.surface2,
                  border: `1px solid ${T.border}`,
                  borderRadius: 6,
                  fontSize: 13,
                  color: T.text,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleProfileSubmit}
                disabled={profileSaving}
                style={{
                  padding: '8px 16px',
                  background: T.primary,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: profileSaving ? 'not-allowed' : 'pointer',
                  opacity: profileSaving ? 0.6 : 1,
                }}
              >
                {profileSaving ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Zone Modal */}
      <Modal
        open={zoneModalOpen}
        onClose={() => { setZoneModalOpen(false); setSelectedZone(null); }}
        title={selectedZone ? 'Edit Delivery Zone' : 'Add Delivery Zone'}
      >
        <div style={{ padding: 20 }}>
          <div style={{ display: 'grid', gap: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: T.textSec, marginBottom: 4, display: 'block' }}>
                Pricing Profile *
              </label>
              <select
                value={zoneForm.pricingProfileId}
                onChange={e => setZoneForm({ ...zoneForm, pricingProfileId: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: T.bg,
                  border: `1px solid ${T.border}`,
                  borderRadius: 4,
                  fontSize: 13,
                  color: T.text,
                }}
              >
                <option value="">Select a profile</option>
                {profiles.map(profile => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name} ({profile.city ? `${profile.city}, ` : ''}{profile.country})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: T.textSec, marginBottom: 4, display: 'block' }}>
                Zone Name *
              </label>
              <input
                type="text"
                value={zoneForm.name}
                onChange={e => setZoneForm({ ...zoneForm, name: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: T.bg,
                  border: `1px solid ${T.border}`,
                  borderRadius: 4,
                  fontSize: 13,
                  color: T.text,
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: T.textSec, marginBottom: 4, display: 'block' }}>
                Zone Type *
              </label>
              <select
                value={zoneForm.type}
                onChange={e => setZoneForm({ ...zoneForm, type: e.target.value as ZoneType })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: T.bg,
                  border: `1px solid ${T.border}`,
                  borderRadius: 4,
                  fontSize: 13,
                  color: T.text,
                }}
              >
                <option value="NORMAL">Normal</option>
                <option value="RURAL_EDGE">Rural Edge</option>
                <option value="FLOOD_PRONE">Flood Prone</option>
                <option value="HIGH_COST">High Cost</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: T.textSec, marginBottom: 4, display: 'block' }}>
                Multiplier *
              </label>
              <input
                type="number"
                step="0.1"
                value={zoneForm.multiplier}
                onChange={e => setZoneForm({ ...zoneForm, multiplier: parseFloat(e.target.value) })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: T.bg,
                  border: `1px solid ${T.border}`,
                  borderRadius: 4,
                  fontSize: 13,
                  color: T.text,
                }}
              />
              <div style={{ fontSize: 11, color: T.textSec, marginTop: 4 }}>
                1.0 = normal, 1.3 = 30% increase, etc.
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: T.textSec, marginBottom: 4, display: 'block' }}>
                  Zone Hierarchy Type *
                </label>
                <select
                  value={zoneForm.zoneType}
                  onChange={e => setZoneForm({ ...zoneForm, zoneType: e.target.value as ZoneHierarchyType })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: T.bg,
                    border: `1px solid ${T.border}`,
                    borderRadius: 4,
                    fontSize: 13,
                    color: T.text,
                  }}
                >
                  <option value="COUNTRY">Country</option>
                  <option value="STATE">State</option>
                  <option value="CITY">City</option>
                  <option value="OPERATIONAL">Operational Zone</option>
                  <option value="MICRO_ZONE">Micro-Zone</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: T.textSec, marginBottom: 4, display: 'block' }}>
                  Parent Zone ID
                </label>
                <input
                  type="text"
                  value={zoneForm.parentZoneId}
                  onChange={e => setZoneForm({ ...zoneForm, parentZoneId: e.target.value })}
                  placeholder="Optional: parent zone for hierarchy"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: T.bg,
                    border: `1px solid ${T.border}`,
                    borderRadius: 4,
                    fontSize: 13,
                    color: T.text,
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: T.textSec, marginBottom: 4, display: 'block' }}>
                Landmark Keywords
              </label>
              <input
                type="text"
                value={zoneForm.landmarkKeywords}
                onChange={e => setZoneForm({ ...zoneForm, landmarkKeywords: e.target.value })}
                placeholder="Comma-separated: GRA, Trans Amadi, Stadium"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: T.bg,
                  border: `1px solid ${T.border}`,
                  borderRadius: 4,
                  fontSize: 13,
                  color: T.text,
                }}
              />
              <div style={{ fontSize: 11, color: T.textSec, marginTop: 4 }}>
                Secondary signal for zone detection when GPS is inaccurate
              </div>
            </div>

            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: T.textSec, display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={zoneForm.requiresManualCorrection}
                  onChange={e => setZoneForm({ ...zoneForm, requiresManualCorrection: e.target.checked })}
                  style={{ width: 16, height: 16 }}
                />
                Requires Manual Rider Correction
              </label>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: T.textSec, marginBottom: 4, display: 'block' }}>
                Description
              </label>
              <textarea
                value={zoneForm.description}
                onChange={e => setZoneForm({ ...zoneForm, description: e.target.value })}
                rows={3}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: T.bg,
                  border: `1px solid ${T.border}`,
                  borderRadius: 4,
                  fontSize: 13,
                  color: T.text,
                  resize: 'vertical',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: T.textSec, display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={zoneForm.isActive}
                  onChange={e => setZoneForm({ ...zoneForm, isActive: e.target.checked })}
                  style={{ width: 16, height: 16 }}
                />
                Active
              </label>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <button
                onClick={() => { setZoneModalOpen(false); setSelectedZone(null); }}
                style={{
                  padding: '8px 16px',
                  background: T.surface2,
                  border: `1px solid ${T.border}`,
                  borderRadius: 6,
                  fontSize: 13,
                  color: T.text,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleZoneSubmit}
                disabled={zoneSaving}
                style={{
                  padding: '8px 16px',
                  background: T.primary,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: zoneSaving ? 'not-allowed' : 'pointer',
                  opacity: zoneSaving ? 0.6 : 1,
                }}
              >
                {zoneSaving ? 'Saving...' : 'Save Zone'}
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Surge Modal */}
      <Modal
        open={surgeModalOpen}
        onClose={() => { setSurgeModalOpen(false); setSelectedSurge(null); }}
        title={selectedSurge ? 'Edit Surge Event' : 'Add Surge Event'}
      >
        <div style={{ padding: 20 }}>
          <div style={{ display: 'grid', gap: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: T.textSec, marginBottom: 4, display: 'block' }}>
                Event Name *
              </label>
              <input
                type="text"
                value={surgeForm.name}
                onChange={e => setSurgeForm({ ...surgeForm, name: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: T.bg,
                  border: `1px solid ${T.border}`,
                  borderRadius: 4,
                  fontSize: 13,
                  color: T.text,
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: T.textSec, marginBottom: 4, display: 'block' }}>
                Surge Type *
              </label>
              <select
                value={surgeForm.type}
                onChange={e => setSurgeForm({ ...surgeForm, type: e.target.value as SurchargeType })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: T.bg,
                  border: `1px solid ${T.border}`,
                  borderRadius: 4,
                  fontSize: 13,
                  color: T.text,
                }}
              >
                <option value="RAIN">Rain</option>
                <option value="NIGHT_DELIVERY">Night Delivery</option>
                <option value="HIGH_TRAFFIC">High Traffic</option>
                <option value="FUEL">Fuel</option>
                <option value="EMERGENCY">Emergency</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: T.textSec, marginBottom: 4, display: 'block' }}>
                Multiplier *
              </label>
              <input
                type="number"
                step="0.1"
                value={surgeForm.multiplier}
                onChange={e => setSurgeForm({ ...surgeForm, multiplier: parseFloat(e.target.value) })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: T.bg,
                  border: `1px solid ${T.border}`,
                  borderRadius: 4,
                  fontSize: 13,
                  color: T.text,
                }}
              />
              <div style={{ fontSize: 11, color: T.textSec, marginTop: 4 }}>
                1.5 = 50% surge, 2.0 = 100% surge, etc.
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: T.textSec, marginBottom: 4, display: 'block' }}>
                  Start Time *
                </label>
                <input
                  type="datetime-local"
                  value={surgeForm.startTime}
                  onChange={e => setSurgeForm({ ...surgeForm, startTime: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: T.bg,
                    border: `1px solid ${T.border}`,
                    borderRadius: 4,
                    fontSize: 13,
                    color: T.text,
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: T.textSec, marginBottom: 4, display: 'block' }}>
                  End Time *
                </label>
                <input
                  type="datetime-local"
                  value={surgeForm.endTime}
                  onChange={e => setSurgeForm({ ...surgeForm, endTime: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: T.bg,
                    border: `1px solid ${T.border}`,
                    borderRadius: 4,
                    fontSize: 13,
                    color: T.text,
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: T.textSec, marginBottom: 4, display: 'block' }}>
                Affected Area - Country *
              </label>
              <input
                type="text"
                value={surgeForm.country}
                onChange={e => setSurgeForm({ ...surgeForm, country: e.target.value })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: T.bg,
                  border: `1px solid ${T.border}`,
                  borderRadius: 4,
                  fontSize: 13,
                  color: T.text,
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: T.textSec, marginBottom: 4, display: 'block' }}>
                  State
                </label>
                <input
                  type="text"
                  value={surgeForm.state}
                  onChange={e => setSurgeForm({ ...surgeForm, state: e.target.value })}
                  placeholder="Leave empty for all states"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: T.bg,
                    border: `1px solid ${T.border}`,
                    borderRadius: 4,
                    fontSize: 13,
                    color: T.text,
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: T.textSec, marginBottom: 4, display: 'block' }}>
                  City
                </label>
                <input
                  type="text"
                  value={surgeForm.city}
                  onChange={e => setSurgeForm({ ...surgeForm, city: e.target.value })}
                  placeholder="Leave empty for all cities"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: T.bg,
                    border: `1px solid ${T.border}`,
                    borderRadius: 4,
                    fontSize: 13,
                    color: T.text,
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: T.textSec, display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={surgeForm.isActive}
                  onChange={e => setSurgeForm({ ...surgeForm, isActive: e.target.checked })}
                  style={{ width: 16, height: 16 }}
                />
                Active
              </label>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <button
                onClick={() => { setSurgeModalOpen(false); setSelectedSurge(null); }}
                style={{
                  padding: '8px 16px',
                  background: T.surface2,
                  border: `1px solid ${T.border}`,
                  borderRadius: 6,
                  fontSize: 13,
                  color: T.text,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSurgeSubmit}
                disabled={surgeSaving}
                style={{
                  padding: '8px 16px',
                  background: T.primary,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: surgeSaving ? 'not-allowed' : 'pointer',
                  opacity: surgeSaving ? 0.6 : 1,
                }}
              >
                {surgeSaving ? 'Saving...' : 'Save Surge Event'}
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
