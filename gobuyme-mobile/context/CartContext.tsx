import React from 'react';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@/context/AuthContext';

export interface CartItemSelection {
  label: string;
  price: number;
}

export interface CartItem {
  id: string;
  name: string;
  price: number;
  qty: number;
  img: string;
  // Chosen drinks/option-group choices for this line, e.g. [{ label: 'Coke', price: 300 }].
  selections?: CartItemSelection[];
}

export interface VendorInfo {
  id: string;
  name: string;
  image?: string;
}

export interface VendorBucket {
  vendorId: string;
  vendorName: string;
  vendorImage?: string;
  items: CartItem[];
}

type CartCtx = {
  carts: Record<string, VendorBucket>;
  count: number;
  addItem: (item: Omit<CartItem, 'qty'>, delta: number, vendor: VendorInfo) => void;
  replaceItem: (item: Omit<CartItem, 'qty'>, qty: number, vendor: VendorInfo) => void;
  clearCart: (vendorId?: string) => void;
  getItems: (vendorId: string) => CartItem[];
  getTotal: (vendorId: string) => number;
  getCount: (vendorId: string) => number;
  getVendorCarts: () => VendorBucket[];
};

const CartContext = createContext<CartCtx>({
  carts: {},
  count: 0,
  addItem: () => {},
  replaceItem: () => {},
  clearCart: () => {},
  getItems: () => [],
  getTotal: () => 0,
  getCount: () => 0,
  getVendorCarts: () => [],
});

const STORAGE_PREFIX = 'gbm_cart';

function storageKey(userId?: string | null) {
  return userId ? `${STORAGE_PREFIX}:${userId}` : `${STORAGE_PREFIX}:guest`;
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [carts, setCarts] = useState<Record<string, VendorBucket>>({});
  const loadedRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    loadedRef.current = false;

    (async () => {
      try {
        const raw = await AsyncStorage.getItem(storageKey(user?.id));
        if (mounted && raw) setCarts(JSON.parse(raw));
        else if (mounted) setCarts({});
      } catch {
        if (mounted) setCarts({});
      } finally {
        if (mounted) loadedRef.current = true;
      }
    })();

    return () => { mounted = false; };
  }, [user?.id]);

  useEffect(() => {
    if (!loadedRef.current) return;
    AsyncStorage.setItem(storageKey(user?.id), JSON.stringify(carts)).catch(() => {});
  }, [carts, user?.id]);

  const bucketFor = (prev: Record<string, VendorBucket>, vendor: VendorInfo): VendorBucket =>
    prev[vendor.id] ?? { vendorId: vendor.id, vendorName: vendor.name, vendorImage: vendor.image, items: [] };

  const addItem = (item: Omit<CartItem, 'qty'>, delta: number, vendor: VendorInfo) => {
    setCarts(prev => {
      const bucket = bucketFor(prev, vendor);
      const existing = bucket.items.find(i => i.id === item.id);
      let nextItems: CartItem[];
      if (!existing) {
        nextItems = delta > 0 ? [...bucket.items, { ...item, qty: 1 }] : bucket.items;
      } else {
        const newQty = existing.qty + delta;
        nextItems = newQty <= 0
          ? bucket.items.filter(i => i.id !== item.id)
          : bucket.items.map(i => i.id === item.id ? { ...i, qty: newQty } : i);
      }
      if (nextItems.length === 0) {
        const { [vendor.id]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [vendor.id]: { ...bucket, vendorName: vendor.name, vendorImage: vendor.image, items: nextItems } };
    });
  };

  const replaceItem = (item: Omit<CartItem, 'qty'>, qty: number, vendor: VendorInfo) => {
    setCarts(prev => {
      const bucket = bucketFor(prev, vendor);
      const filtered = bucket.items.filter(i => i.id !== item.id);
      const nextItems = qty <= 0 ? filtered : [...filtered, { ...item, qty }];
      if (nextItems.length === 0) {
        const { [vendor.id]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [vendor.id]: { ...bucket, vendorName: vendor.name, vendorImage: vendor.image, items: nextItems } };
    });
  };

  const clearCart = (vendorId?: string) => {
    if (vendorId) {
      setCarts(prev => { const { [vendorId]: _, ...rest } = prev; return rest; });
    } else {
      setCarts({});
    }
  };

  const getItems = (vendorId: string) => carts[vendorId]?.items ?? [];
  const getTotal = (vendorId: string) => (carts[vendorId]?.items ?? []).reduce((s, i) => s + i.price * i.qty, 0);
  const getCount = (vendorId: string) => (carts[vendorId]?.items ?? []).reduce((s, i) => s + i.qty, 0);
  const getVendorCarts = () => Object.values(carts).filter(b => b.items.length > 0);

  // Total items across every vendor's cart — used for the global cart badge.
  const count = Object.values(carts).reduce((s, b) => s + b.items.reduce((si, i) => si + i.qty, 0), 0);

  return (
    <CartContext.Provider value={{ carts, count, addItem, replaceItem, clearCart, getItems, getTotal, getCount, getVendorCarts }}>
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => useContext(CartContext);
