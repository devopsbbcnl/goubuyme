import * as SecureStore from 'expo-secure-store';

// A vendor account can own several locations (its main business plus branches). This remembers which
// one the vendor is currently managing; the API client sends it as `X-Vendor-Id` on vendor calls.
// null means the main business, which is also what the server assumes when the header is absent.

const KEY = 'activeVendorId';

let activeId: string | null = null;
let loaded = false;
let loading: Promise<void> | null = null;
const listeners = new Set<(id: string | null) => void>();

const load = (): Promise<void> => {
  if (loaded) return Promise.resolve();
  if (!loading) {
    loading = SecureStore.getItemAsync(KEY)
      .then((v) => { activeId = v || null; })
      .catch(() => { activeId = null; })
      .finally(() => { loaded = true; });
  }
  return loading;
};

/** Current location id (null = main business). Waits for the stored value on first use. */
export const getActiveVendorId = async (): Promise<string | null> => {
  await load();
  return activeId;
};

/** Synchronous read for rendering; call `getActiveVendorId` once at startup to prime it. */
export const peekActiveVendorId = (): string | null => activeId;

export const setActiveVendorId = async (id: string | null): Promise<void> => {
  loaded = true;
  if (id === activeId) return;
  activeId = id;
  try {
    if (id) await SecureStore.setItemAsync(KEY, id);
    else await SecureStore.deleteItemAsync(KEY);
  } catch {
    // The choice still applies for this session even if it cannot be persisted.
  }
  listeners.forEach((l) => l(activeId));
};

export const subscribeActiveVendorId = (listener: (id: string | null) => void): (() => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
