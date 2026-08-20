'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import api from '@/services/api';
import { useAuth } from './AuthContext';

export interface CartItem {
  id?: string;          // backend cart-item id — set once synced, undefined while an add is in flight
  menuItemId: string;   // real menu item id — always required for backend calls
  name: string;
  price: number;
  qty: number;
  image?: string;
  vendorId: string;
  vendorName: string;
  compositeKey?: string; // local-only key distinguishing variant selections of the same menuItemId
}

export interface VendorCart {
  vendorId: string;
  vendorName: string;
  vendorLogo?: string;
  items: CartItem[];
}

interface CartCtx {
  carts: VendorCart[];
  totalCount: number;
  getVendorCart: (vendorId: string) => VendorCart | undefined;
  getVendorItems: (vendorId: string) => CartItem[];
  addItem: (item: Omit<CartItem, 'qty'>, initialQty?: number) => void;
  removeItem: (vendorId: string, key: string) => void;
  updateQty: (vendorId: string, key: string, qty: number) => void;
  clearCart: (vendorId: string) => void;
}

const Ctx = createContext<CartCtx>({
  carts: [], totalCount: 0,
  getVendorCart: () => undefined, getVendorItems: () => [],
  addItem: () => {}, removeItem: () => {}, updateQty: () => {}, clearCart: () => {},
});

// Backend cart items are identified by menuItemId only (see customer.controller.ts
// addToCart — it merges by menuItemId regardless of note/options). So two different
// variants of the same base menu item (e.g. different drink/option selections) will
// merge into a single quantity line server-side once synced — the compositeKey concept
// only distinguishes them client-side, before the first sync. This is a pre-existing
// limitation of the backend cart model, not something fixed here.
export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [carts, setCarts] = useState<VendorCart[]>([]);
  const cartsRef = useRef<VendorCart[]>([]);
  useEffect(() => { cartsRef.current = carts; }, [carts]);

  const refresh = useCallback(async () => {
    if (!user) { setCarts([]); return; }
    try {
      const { data } = await api.get('/cart');
      const rawCarts: any[] = data.data?.carts ?? [];

      setCarts(rawCarts.map((c): VendorCart => ({
        vendorId: c.vendorId,
        vendorName: c.vendorName ?? '',
        vendorLogo: c.vendorLogo ?? undefined,
        items: (c.items ?? []).map((ci: any): CartItem => ({
          id: ci.id,
          menuItemId: ci.menuItemId,
          name: ci.menuItem?.name ?? '',
          price: ci.unitPrice ?? ci.menuItem?.price ?? 0,
          qty: ci.quantity,
          image: ci.menuItem?.image,
          vendorId: ci.menuItem?.vendorId ?? c.vendorId,
          vendorName: c.vendorName ?? '',
          // The note is the closest thing the backend keeps to a variant description —
          // reuse it as the local dedup key so a page reload doesn't collapse distinct
          // variants that happen to share a menuItemId into one row visually.
          compositeKey: ci.note || undefined,
        })),
      })));
    } catch {
      setCarts([]);
    }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  const getVendorCart = (vendorId: string) => cartsRef.current.find(c => c.vendorId === vendorId);
  const getVendorItems = (vendorId: string) => getVendorCart(vendorId)?.items ?? [];

  const resolveServerId = (vendorId: string, key: string): string | undefined =>
    getVendorItems(vendorId).find(i => (i.compositeKey ?? i.menuItemId) === key)?.id;

  const updateLocalCarts = (updater: (prev: VendorCart[]) => VendorCart[]) => {
    setCarts(prev => {
      const next = updater(prev);
      cartsRef.current = next;
      return next;
    });
  };

  const addItem = (item: Omit<CartItem, 'qty'>, initialQty = 1) => {
    const key = item.compositeKey ?? item.menuItemId;
    updateLocalCarts(prev => {
      const existingCart = prev.find(c => c.vendorId === item.vendorId);
      if (!existingCart) {
        return [...prev, { vendorId: item.vendorId, vendorName: item.vendorName, items: [{ ...item, id: undefined, qty: initialQty }] }];
      }
      const existingItem = existingCart.items.find(i => (i.compositeKey ?? i.menuItemId) === key);
      const nextItems = existingItem
        ? existingCart.items.map(i => (i.compositeKey ?? i.menuItemId) === key ? { ...i, qty: i.qty + initialQty } : i)
        : [...existingCart.items, { ...item, id: undefined, qty: initialQty }];
      return prev.map(c => c.vendorId === item.vendorId ? { ...c, items: nextItems } : c);
    });
    api.post('/cart/add', {
      menuItemId: item.menuItemId,
      quantity: initialQty,
      unitPrice: item.price,
      // Human-readable variant description (e.g. "Jollof Rice (2x Chicken, Coke)") when
      // this is a composite item — see the merge-by-menuItemId caveat above the class doc.
      ...(item.compositeKey ? { note: item.name } : {}),
    }).then(refresh).catch(refresh);
  };

  const removeItem = (vendorId: string, key: string) => {
    updateLocalCarts(prev => prev.map(c =>
      c.vendorId === vendorId ? { ...c, items: c.items.filter(i => (i.compositeKey ?? i.menuItemId) !== key) } : c
    ));
    const serverId = resolveServerId(vendorId, key);
    if (serverId) {
      api.delete(`/cart/remove/${serverId}`).then(refresh).catch(refresh);
    } else {
      // No known server id (e.g. removed before its addItem's own refresh landed) —
      // reconcile against whatever the backend actually has.
      refresh();
    }
  };

  const updateQty = (vendorId: string, key: string, qty: number) => {
    if (qty <= 0) { removeItem(vendorId, key); return; }
    updateLocalCarts(prev => prev.map(c =>
      c.vendorId === vendorId
        ? { ...c, items: c.items.map(i => (i.compositeKey ?? i.menuItemId) === key ? { ...i, qty } : i) }
        : c
    ));
    const serverId = resolveServerId(vendorId, key);
    if (serverId) {
      api.put(`/cart/update/${serverId}`, { quantity: qty }).then(refresh).catch(refresh);
    } else {
      refresh();
    }
  };

  const clearCart = (vendorId: string) => {
    updateLocalCarts(prev => prev.filter(c => c.vendorId !== vendorId));
    api.delete('/cart/clear', { params: { vendorId } }).catch(() => {});
  };

  const totalCount = carts.reduce((s, c) => s + c.items.reduce((s2, i) => s2 + i.qty, 0), 0);

  return (
    <Ctx.Provider value={{ carts, totalCount, getVendorCart, getVendorItems, addItem, removeItem, updateQty, clearCart }}>
      {children}
    </Ctx.Provider>
  );
}

export const useCart = () => useContext(Ctx);
