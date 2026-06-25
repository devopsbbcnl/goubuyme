'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface CartItem {
  id?: string;
  menuItemId: string;
  name: string;
  price: number;
  qty: number;
  image?: string;
  vendorId: string;
  vendorName: string;
  compositeKey?: string;
}

interface CartCtx {
  items: CartItem[];
  totalCount: number;
  totalAmount: number;
  addItem: (item: Omit<CartItem, 'qty'>) => void;
  removeItem: (menuItemId: string) => void;
  updateQty: (menuItemId: string, qty: number) => void;
  clearCart: () => void;
}

const Ctx = createContext<CartCtx>({
  items: [], totalCount: 0, totalAmount: 0,
  addItem: () => {}, removeItem: () => {}, updateQty: () => {}, clearCart: () => {},
});

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('gbm_cart');
      if (raw) setItems(JSON.parse(raw));
    } catch {}
  }, []);

  const persist = (next: CartItem[]) => {
    setItems(next);
    localStorage.setItem('gbm_cart', JSON.stringify(next));
  };

  const addItem = (item: Omit<CartItem, 'qty'>) => {
    setItems(prev => {
      const existing = prev.find(i => i.menuItemId === item.menuItemId);
      const next = existing
        ? prev.map(i => i.menuItemId === item.menuItemId ? { ...i, qty: i.qty + 1 } : i)
        : [...prev, { ...item, qty: 1 }];
      localStorage.setItem('gbm_cart', JSON.stringify(next));
      return next;
    });
  };

  const removeItem = (menuItemId: string) => {
    persist(items.filter(i => i.menuItemId !== menuItemId));
  };

  const updateQty = (menuItemId: string, qty: number) => {
    if (qty <= 0) { removeItem(menuItemId); return; }
    persist(items.map(i => i.menuItemId === menuItemId ? { ...i, qty } : i));
  };

  const clearCart = () => persist([]);

  const totalCount = items.reduce((s, i) => s + i.qty, 0);
  const totalAmount = items.reduce((s, i) => s + i.price * i.qty, 0);

  return (
    <Ctx.Provider value={{ items, totalCount, totalAmount, addItem, removeItem, updateQty, clearCart }}>
      {children}
    </Ctx.Provider>
  );
}

export const useCart = () => useContext(Ctx);
