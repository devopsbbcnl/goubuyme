'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface ConfirmOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface ConfirmRequest extends ConfirmOptions {
  message: string;
  resolve: (value: boolean) => void;
}

type ConfirmFn = (message: string, options?: ConfirmOptions) => Promise<boolean>;

const Ctx = createContext<ConfirmFn>(async () => false);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);

  const confirmDialog = useCallback<ConfirmFn>((message, options = {}) => {
    return new Promise<boolean>(resolve => {
      setRequest({ message, resolve, ...options });
    });
  }, []);

  const close = (result: boolean) => {
    request?.resolve(result);
    setRequest(null);
  };

  return (
    <Ctx.Provider value={confirmDialog}>
      {children}
      {request && (
        <div className="modal-overlay" onClick={() => close(false)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{request.title ?? 'Are you sure?'}</h3>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14, lineHeight: 1.5 }}>{request.message}</p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => close(false)}>{request.cancelLabel ?? 'Cancel'}</button>
              <button className={`btn ${request.danger === false ? 'btn-primary' : 'btn-danger'}`} onClick={() => close(true)}>
                {request.confirmLabel ?? 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

export const useConfirm = () => useContext(Ctx);
