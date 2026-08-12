import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '@/services/api';
import { useAuth } from '@/context/AuthContext';

export type AddressType = 'home' | 'work' | 'other';

export interface Address {
  id: string;
  type: AddressType;
  label: string;
  address: string;
  city?: string;
  state?: string;
  latitude?: number;
  longitude?: number;
  isDefault: boolean;
}

type AddressInput = Omit<Address, 'id' | 'isDefault'>;
type AddressPatch = Partial<Omit<Address, 'id'>>;

type AddressCtx = {
  addresses: Address[];
  selectedId: string | null;
  selected: Address | null;
  // False until the server-sourced address list has loaded (or resolved to "no user").
  // Callers that look up an address by id server-side (e.g. estimate-fee) should wait
  // for this before firing, otherwise they can hit a stale AsyncStorage-cached id from
  // before the list synced and get a false "not found" from the backend.
  ready: boolean;
  addAddress: (a: AddressInput) => Promise<void>;
  updateAddress: (id: string, patch: AddressPatch) => Promise<void>;
  deleteAddress: (id: string) => Promise<void>;
  setDefault: (id: string) => Promise<void>;
  selectAddress: (id: string) => void;
};

const AddressContext = createContext<AddressCtx>({
  addresses: [],
  selectedId: null,
  selected: null,
  ready: false,
  addAddress: async () => {},
  updateAddress: async () => {},
  deleteAddress: async () => {},
  setDefault: async () => {},
  selectAddress: () => {},
});

const STORAGE_PREFIX = 'gbm_addresses';

function storageKey(userId?: string | null) {
  return userId ? `${STORAGE_PREFIX}:${userId}` : STORAGE_PREFIX;
}

function normalizeAddress(raw: any): Address | null {
  if (!raw?.address || !raw?.label) return null;

  return {
    id: String(raw.id ?? raw._id ?? Date.now()),
    type: ['home', 'work', 'other'].includes(raw.type) ? raw.type : 'other',
    label: String(raw.label),
    address: String(raw.address),
    city: raw.city ? String(raw.city) : undefined,
    state: raw.state ? String(raw.state) : undefined,
    latitude: typeof raw.latitude === 'number' ? raw.latitude : undefined,
    longitude: typeof raw.longitude === 'number' ? raw.longitude : undefined,
    isDefault: Boolean(raw.isDefault),
  };
}

function normalizeAddresses(raw: any): Address[] {
  const nested = raw?.data;
  const source = Array.isArray(raw)
    ? raw
    : Array.isArray(nested)
    ? nested
    : raw?.addresses ?? raw?.user?.addresses ?? nested?.addresses ?? nested?.user?.addresses ?? [];

  return source
    .map(normalizeAddress)
    .filter(Boolean) as Address[];
}

function toAddressPayload(address: Address | AddressInput | AddressPatch) {
  const a = address as any;
  return {
    label: a.label,
    address: a.address,
    city: a.city,
    state: a.state,
    latitude: a.latitude,
    longitude: a.longitude,
    isDefault: 'isDefault' in address ? address.isDefault : undefined,
  };
}

export function AddressProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const persistLocal = async (next: Address[]) => {
    setAddresses(next);
    await AsyncStorage.setItem(storageKey(user?.id), JSON.stringify(next));
  };

  useEffect(() => {
    let mounted = true;
    setReady(false);

    (async () => {
      const key = storageKey(user?.id);
      try {
        const raw = await AsyncStorage.getItem(key);
        if (raw && mounted) {
          const local = normalizeAddresses(JSON.parse(raw));
          setAddresses(local);
          setSelectedId(local.find(a => a.isDefault)?.id ?? local[0]?.id ?? null);
        }
      } catch {
        // Ignore corrupt local cache and let the server response win.
      }

      if (!user) {
        if (mounted) {
          setAddresses([]);
          setSelectedId(null);
          setReady(true);
        }
        return;
      }

      try {
        const { data } = await api.get('/addresses');
        if (!mounted) return;

        // Server is the source of truth for a logged-in user. Apply the remote
        // list even when it is empty — otherwise stale/legacy local entries with
        // phantom ids or missing coordinates linger and break delivery-fee
        // estimation and order placement (both look the address up by DB id).
        const remote = normalizeAddresses(data);
        setAddresses(remote);
        setSelectedId(remote.find(a => a.isDefault)?.id ?? remote[0]?.id ?? null);
        await AsyncStorage.setItem(key, JSON.stringify(remote));
      } catch {
        // Local cache keeps the screen usable if the profile fetch fails.
      } finally {
        // Signal "safe to trust selectedId against the server" only after the
        // remote list has had a chance to overwrite any stale local cache —
        // mirrors the web checkout, which only ever reads addresses fetched
        // directly from the server (no local caching layer to race against).
        if (mounted) setReady(true);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [user?.id]);

  const addAddress = async (a: AddressInput) => {
    const isFirst = addresses.length === 0;
    let next: Address;

    if (user) {
      const { data } = await api.post('/addresses', toAddressPayload({ ...a, isDefault: isFirst }));
      // Must use the server-issued DB id. Falling back to a local timestamp id
      // would create a phantom address the backend can't find, breaking
      // estimate-fee and order placement at checkout.
      const created = normalizeAddress(data?.data);
      if (!created) throw new Error('Address could not be saved. Please try again.');
      next = created;
    } else {
      next = {
        ...a,
        id: Date.now().toString(),
        isDefault: isFirst,
      };
    }

    const updated = isFirst ? [next] : [...addresses, next];

    await persistLocal(updated);
    if (isFirst) setSelectedId(next.id);
  };

  const updateAddress = async (id: string, patch: AddressPatch) => {
    const current = addresses.find(a => a.id === id);
    if (!current) return;

    const nextAddress = { ...current, ...patch };
    if (user) {
      await api.put(`/addresses/${id}`, toAddressPayload(nextAddress));
    }

    await persistLocal(addresses.map(a => a.id === id ? nextAddress : a));
  };

  const deleteAddress = async (id: string) => {
    if (user) {
      await api.delete(`/addresses/${id}`);
    }

    const next = addresses.filter(a => a.id !== id);

    if (next.length > 0 && !next.some(a => a.isDefault)) {
      next[0] = { ...next[0], isDefault: true };
      if (user) {
        await api.put(`/addresses/${next[0].id}`, toAddressPayload(next[0]));
      }
    }

    await persistLocal(next);
    if (selectedId === id) {
      const def = next.find(a => a.isDefault);
      setSelectedId(def?.id ?? null);
    }
  };

  const setDefault = async (id: string) => {
    if (user) {
      const current = addresses.find(a => a.id === id);
      if (current) {
        await api.put(`/addresses/${id}`, toAddressPayload({ ...current, isDefault: true }));
      }
    }

    await persistLocal(addresses.map(a => ({ ...a, isDefault: a.id === id })));
    setSelectedId(id);
  };

  const selectAddress = (id: string) => setSelectedId(id);
  const selected = addresses.find(a => a.id === selectedId) ?? null;

  return (
    <AddressContext.Provider value={{
      addresses, selectedId, selected, ready,
      addAddress, updateAddress, deleteAddress, setDefault, selectAddress,
    }}>
      {children}
    </AddressContext.Provider>
  );
}

export const useAddress = () => useContext(AddressContext);
