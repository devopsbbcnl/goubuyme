// Central resolver for EXPO_PUBLIC_* env vars.
//
// These are inlined at bundle time, NOT read at runtime. If a build is made
// without the value present (stale Metro cache, old APK, or an EAS profile
// missing the key), `process.env.EXPO_PUBLIC_*` is undefined and every caller
// silently falls back to localhost — which on a real device points at the
// phone itself and surfaces as a socket.io/axios "connection error".
//
// This guard makes that failure loud instead of silent:
//   - production build (!__DEV__): throw, so it never ships pointing at localhost
//   - dev build: warn loudly but keep the localhost fallback for local backends

/**
 * Resolve a required EXPO_PUBLIC_* env var.
 * @param name        the full env var name, e.g. 'EXPO_PUBLIC_SOCKET_URL' — used only for logging/errors
 * @param value       the value read via a static `process.env.EXPO_PUBLIC_*` expression at the call site.
 *                    Must be static (not `process.env[name]`) — Expo's bundler only inlines literal
 *                    `process.env.EXPO_PUBLIC_*` member expressions, not computed property access.
 * @param devFallback value to use in dev when the var is missing
 */
export const requirePublicEnv = (name: string, value: string | undefined, devFallback: string): string => {
  if (value && value.trim()) {
    console.log(`[env] ${name} =`, value);
    return value;
  }

  const message =
    `[env] Missing ${name}. EXPO_PUBLIC_* vars are inlined at bundle time — ` +
    `restart with "npx expo start -c" (dev) or rebuild with the correct EAS ` +
    `profile (standalone). Falling back to "${devFallback}" would point a real ` +
    `device at itself and break sockets/API.`;

  if (!__DEV__) {
    // Never let a production build silently default to localhost.
    throw new Error(message);
  }

  console.warn(`${message}\n[env] Using dev fallback: ${devFallback}`);
  return devFallback;
};
