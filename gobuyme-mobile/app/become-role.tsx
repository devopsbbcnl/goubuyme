import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { AppInput } from '@/components/ui/AppInput';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { KeyboardAvoidingWrapper } from '@/components/ui/KeyboardAvoidingWrapper';
import { forwardGeocode } from '@/services/geocoding';

const CATEGORIES = [
  { value: 'RESTAURANT', label: 'Restaurant' },
  { value: 'EMART', label: 'EMART Mart' },
  { value: 'PHARMACY', label: 'Pharmacy' },
  { value: 'BAKERY', label: 'Bakery' },
  { value: 'DRINKS', label: 'Drinks' },
  { value: 'BUTCHER', label: 'Butcher' },
  { value: 'GAS', label: 'Gas' },
];

// An existing account registers a second role (vendor or rider). Same login, same history.
export default function BecomeRoleScreen() {
  const { theme: T } = useTheme();
  const insets = useSafeAreaInsets();
  const { user, addRole } = useAuth();
  const params = useLocalSearchParams<{ role?: string }>();
  const role: 'vendor' | 'rider' = params.role === 'rider' ? 'rider' : 'vendor';

  const [businessName, setBusinessName] = useState('');
  const [category, setCategory] = useState('RESTAURANT');
  const [vehicleType, setVehicleType] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('Owerri');
  const [state, setState] = useState('Imo');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const next: Record<string, string> = {};
    if (role === 'vendor' && businessName.trim().length < 2) next.businessName = 'Enter your business name.';
    if (role === 'rider' && !vehicleType.trim()) next.vehicleType = 'Enter your vehicle type.';
    if (role === 'rider' && !plateNumber.trim()) next.plateNumber = 'Enter your plate number.';
    if (!address.trim()) next.address = 'Enter your address.';
    if (!city.trim()) next.city = 'Enter your city.';
    if (!state.trim()) next.state = 'Enter your state.';
    setErrors(next);
    if (Object.keys(next).length) return;

    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        role: role.toUpperCase(),
        address: address.trim(), city: city.trim(), state: state.trim(),
      };
      try {
        const hits = await forwardGeocode(`${address.trim()}, ${city.trim()}, ${state.trim()}`);
        if (hits.length > 0) { payload.latitude = hits[0].lat; payload.longitude = hits[0].lng; }
      } catch {
        // coordinates are optional
      }
      if (role === 'vendor') {
        payload.businessName = businessName.trim();
        payload.category = category;
        payload.commissionTier = 'TIER_1';
      } else {
        payload.vehicleType = vehicleType.trim();
        payload.plateNumber = plateNumber.trim().toUpperCase();
      }

      await addRole(payload);
      // Vendors finish their store profile next; riders go straight to their dashboard.
      router.replace((role === 'vendor' ? '/vendor-complete-profile' : '/') as never);
    } catch (e: any) {
      setErrors({ general: e?.response?.data?.message ?? 'Could not add this role. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingWrapper>
      <ScrollView
        style={{ flex: 1, backgroundColor: T.bg }}
        contentContainerStyle={{ padding: 20, paddingTop: insets.top + 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={{ color: T.textSec, fontWeight: '600', marginBottom: 16 }}>← Back</Text>
        </TouchableOpacity>

        <Text style={[styles.title, { color: T.text }]}>
          {role === 'vendor' ? 'Register your business' : 'Become a delivery partner'}
        </Text>
        <Text style={[styles.sub, { color: T.textSec }]}>
          You'll use the same login ({user?.email}). Your orders and account stay as they are, and you can switch back any time.
          {role === 'vendor' ? ' New businesses start on the Starter plan and are reviewed before going live.' : ' Riders are reviewed before they can accept deliveries.'}
        </Text>

        {role === 'vendor' ? (
          <>
            <AppInput label="Business name" value={businessName} onChangeText={setBusinessName} error={errors.businessName} />
            <Text style={[styles.label, { color: T.textSec }]}>Category</Text>
            <View style={styles.chips}>
              {CATEGORIES.map((c) => (
                <TouchableOpacity
                  key={c.value}
                  onPress={() => setCategory(c.value)}
                  activeOpacity={0.8}
                  style={[styles.chip, {
                    backgroundColor: category === c.value ? T.primaryTint : T.surface,
                    borderColor: category === c.value ? T.primary : T.border,
                  }]}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: category === c.value ? T.primary : T.textSec }}>{c.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : (
          <>
            <AppInput label="Vehicle type" value={vehicleType} onChangeText={setVehicleType} placeholder="e.g. Motorcycle" error={errors.vehicleType} />
            <AppInput label="Plate number" value={plateNumber} onChangeText={setPlateNumber} autoCapitalize="characters" error={errors.plateNumber} />
          </>
        )}

        <AppInput label="Address" value={address} onChangeText={setAddress} error={errors.address} />
        <AppInput label="City" value={city} onChangeText={setCity} error={errors.city} />
        <AppInput label="State" value={state} onChangeText={setState} error={errors.state} />

        {!!errors.general && <Text style={styles.error}>{errors.general}</Text>}

        <PrimaryButton onPress={submit} loading={loading}>
          {role === 'vendor' ? 'Register business' : 'Register as rider'}
        </PrimaryButton>
      </ScrollView>
    </KeyboardAvoidingWrapper>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '800' },
  sub:   { fontSize: 13, lineHeight: 19, marginTop: 6, marginBottom: 20 },
  label: { fontSize: 12, fontWeight: '600', marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip:  { borderRadius: 4, borderWidth: 1, paddingVertical: 8, paddingHorizontal: 12 },
  error: { color: '#E53E3E', fontSize: 13, marginBottom: 12 },
});
