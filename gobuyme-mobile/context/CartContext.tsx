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
  items: CartItem[];
  vendorId: string | null;
  addItem: (item: Omit<CartItem, 'qty'>, delta: number) => void;
  clearCart: () => void;
  total: number;
  count: number;
};

const CartContext = createContext<CartCtx>({
  items: [], vendorId: null, addItem: () => {}, clearCart: () => {}, total: 0, count: 0,
});

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [vendorId, setVendorId] = useState<string | null>(null);

  const addItem = (item: Omit<CartItem, 'qty'>, delta: number) => {
    setItems(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (!existing) return delta > 0 ? [...prev, { ...item, qty: 1 }] : prev;
      const newQty = existing.qty + delta;
      if (newQty <= 0) return prev.filter(i => i.id !== item.id);
      return prev.map(i => i.id === item.id ? { ...i, qty: newQty } : i);
    });
  };

  const clearCart = () => { setItems([]); setVendorId(null); };

  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  const count = items.reduce((s, i) => s + i.qty, 0);

  return (
    <CartContext.Provider value={{ items, vendorId, addItem, clearCart, total, count }}>
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => useContext(CartContext);
