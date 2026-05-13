import React from 'react';
import { createContext, useContext, useState } from 'react';

export interface CartItem {
  id: string;
  name: string;
  price: number;
  qty: number;
  img: string;
}

type CartCtx = {
  carts: Record<string, CartItem[]>;
  addItem: (item: Omit<CartItem, 'qty'>, delta: number, vendorId: string) => void;
  replaceItem: (item: Omit<CartItem, 'qty'>, qty: number, vendorId: string) => void;
  clearCart: (vendorId?: string) => void;
  getItems: (vendorId: string) => CartItem[];
  getTotal: (vendorId: string) => number;
  getCount: (vendorId: string) => number;
};

const CartContext = createContext<CartCtx>({
  carts: {},
  addItem: () => {},
  replaceItem: () => {},
  clearCart: () => {},
  getItems: () => [],
  getTotal: () => 0,
  getCount: () => 0,
});

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [carts, setCarts] = useState<Record<string, CartItem[]>>({});

  const addItem = (item: Omit<CartItem, 'qty'>, delta: number, vendorId: string) => {
    setCarts(prev => {
      const bucket = prev[vendorId] ?? [];
      const existing = bucket.find(i => i.id === item.id);
      let next: CartItem[];
      if (!existing) {
        next = delta > 0 ? [...bucket, { ...item, qty: 1 }] : bucket;
      } else {
        const newQty = existing.qty + delta;
        next = newQty <= 0
          ? bucket.filter(i => i.id !== item.id)
          : bucket.map(i => i.id === item.id ? { ...i, qty: newQty } : i);
      }
      return { ...prev, [vendorId]: next };
    });
  };

  const replaceItem = (item: Omit<CartItem, 'qty'>, qty: number, vendorId: string) => {
    setCarts(prev => {
      const bucket = prev[vendorId] ?? [];
      const filtered = bucket.filter(i => i.id !== item.id);
      const next = qty <= 0 ? filtered : [...filtered, { ...item, qty }];
      return { ...prev, [vendorId]: next };
    });
  };

  const clearCart = (vendorId?: string) => {
    if (vendorId) {
      setCarts(prev => { const { [vendorId]: _, ...rest } = prev; return rest; });
    } else {
      setCarts({});
    }
  };

  const getItems = (vendorId: string) => carts[vendorId] ?? [];
  const getTotal = (vendorId: string) => (carts[vendorId] ?? []).reduce((s, i) => s + i.price * i.qty, 0);
  const getCount = (vendorId: string) => (carts[vendorId] ?? []).reduce((s, i) => s + i.qty, 0);

  return (
    <CartContext.Provider value={{ carts, addItem, replaceItem, clearCart, getItems, getTotal, getCount }}>
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => useContext(CartContext);
