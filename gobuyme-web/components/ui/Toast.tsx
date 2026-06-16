'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface ToastItem { id: number; msg: string; type: 'success' | 'error' | 'info'; }
type ToastFn = (msg: string, type?: ToastItem['type']) => void;

const Ctx = createContext<ToastFn>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((msg: string, type: ToastItem['type'] = 'info') => {
    const id = Date.now();
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000);
  }, []);

  return (
    <Ctx.Provider value={toast}>
      {children}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.type === 'success' && '✓'}{t.type === 'error' && '✕'}{t.type === 'info' && 'ℹ'}
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
