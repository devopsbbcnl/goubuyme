export async function register() {
  // Node.js 22+ exposes localStorage/sessionStorage as globals but they are
  // non-functional without --localstorage-file. Next.js router code detects
  // the global and calls .getItem(), crashing SSR. Replace with a no-op shim.
  const isBrokenStorage = (obj: unknown): boolean =>
    typeof obj !== 'undefined' && typeof (obj as Storage).getItem !== 'function';

  const noopStorage: Storage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
    key: () => null,
    length: 0,
  };

  if (isBrokenStorage(globalThis.localStorage)) {
    Object.defineProperty(globalThis, 'localStorage', {
      value: noopStorage,
      writable: true,
      configurable: true,
    });
  }

  if (isBrokenStorage(globalThis.sessionStorage)) {
    Object.defineProperty(globalThis, 'sessionStorage', {
      value: noopStorage,
      writable: true,
      configurable: true,
    });
  }
}
