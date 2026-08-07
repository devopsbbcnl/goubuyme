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

interface CartCtx {
  items: CartItem[];
  totalCount: number;
  totalAmount: number;
  addItem: (item: Omit<CartItem, 'qty'>, initialQty?: number) => void;
  removeItem: (key: string) => void;
  updateQty: (key: string, qty: number) => void;
  clearCart: () => void;
}

const Ctx = createContext<CartCtx>({
  items: [], totalCount: 0, totalAmount: 0,
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
  const [items, setItems] = useState<CartItem[]>([]);
  const itemsRef = useRef<CartItem[]>([]);
  useEffect(() => { itemsRef.current = items; }, [items]);

  const refresh = useCallback(async () => {
    if (!user) { setItems([]); return; }
    try {
      const { data } = await api.get('/cart');
      const cart = data.data;
      const rawItems: any[] = cart?.items ?? [];
      if (!rawItems.length) { setItems([]); return; }

      const vendorId = cart.vendorId ?? rawItems[0]?.menuItem?.vendorId;
      let vendorName = '';
      if (vendorId) {
        try {
          const v = await api.get(`/vendors/${vendorId}`);
          vendorName = v.data?.data?.businessName ?? '';
        } catch { /* keep vendorName blank rather than fail the whole cart load */ }
      }

      setItems(rawItems.map((ci): CartItem => ({
        id: ci.id,
        menuItemId: ci.menuItemId,
        name: ci.menuItem?.name ?? '',
        price: ci.unitPrice ?? ci.menuItem?.price ?? 0,
        qty: ci.quantity,
        image: ci.menuItem?.image,
        vendorId: ci.menuItem?.vendorId ?? vendorId,
        vendorName,
        // The note is the closest thing the backend keeps to a variant description —
        // reuse it as the local dedup key so a page reload doesn't collapse distinct
        // variants that happen to share a menuItemId into one row visually.
        compositeKey: ci.note || undefined,
      })));
    } catch {
      setItems([]);
    }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  const resolveServerId = (key: string): string | undefined =>
    itemsRef.current.find(i => (i.compositeKey ?? i.menuItemId) === key)?.id;

  const addItem = (item: Omit<CartItem, 'qty'>, initialQty = 1) => {
    const key = item.compositeKey ?? item.menuItemId;
    setItems(prev => {
      const existing = prev.find(i => (i.compositeKey ?? i.menuItemId) === key);
      const next = existing
        ? prev.map(i => (i.compositeKey ?? i.menuItemId) === key ? { ...i, qty: i.qty + initialQty } : i)
        : [...prev, { ...item, id: undefined, qty: initialQty }];
      itemsRef.current = next;
      return next;
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

  const removeItem = (key: string) => {
    setItems(prev => {
      const next = prev.filter(i => (i.compositeKey ?? i.menuItemId) !== key);
      itemsRef.current = next;
      return next;
    });
    const serverId = resolveServerId(key);
    if (serverId) {
      api.delete(`/cart/remove/${serverId}`).then(refresh).catch(refresh);
    } else {
      // No known server id (e.g. removed before its addItem's own refresh landed) —
      // reconcile against whatever the backend actually has.
      refresh();
    }
  };

  const updateQty = (key: string, qty: number) => {
    if (qty <= 0) { removeItem(key); return; }
    setItems(prev => {
      const next = prev.map(i => (i.compositeKey ?? i.menuItemId) === key ? { ...i, qty } : i);
      itemsRef.current = next;
      return next;
    });
    const serverId = resolveServerId(key);
    if (serverId) {
      api.put(`/cart/update/${serverId}`, { quantity: qty }).then(refresh).catch(refresh);
    } else {
      refresh();
    }
  };

  const clearCart = () => {
    setItems([]);
    itemsRef.current = [];
    api.delete('/cart/clear').catch(() => {});
  };

  const totalCount = items.reduce((s, i) => s + i.qty, 0);
  const totalAmount = items.reduce((s, i) => s + i.price * i.qty, 0);

  return (
    <Ctx.Provider value={{ items, totalCount, totalAmount, addItem, removeItem, updateQty, clearCart }}>
      {children}
    </Ctx.Provider>
  );
}

export const useCart = () => useContext(Ctx);
