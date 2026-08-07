// CLIENT_URL is comma-separated (server.ts splits the whole list for the CORS allowlist),
// e.g. "https://gobuyme.shop,http://localhost:3000" — but any single link a human actually
// clicks (password reset, payment callback) needs exactly one origin. Picking the localhost
// entry in development and the first non-localhost entry in production means links generated
// while developing locally point back at the local app instead of production.
export function getPrimaryClientUrl(): string {
  const entries = (process.env.CLIENT_URL ?? '')
    .split(',')
    .map(u => u.trim())
    .filter(Boolean);

  if (entries.length === 0) return '';

  if (process.env.NODE_ENV !== 'production') {
    const local = entries.find(u => u.includes('localhost') || u.includes('127.0.0.1'));
    if (local) return local;
  }

  return entries[0];
}
