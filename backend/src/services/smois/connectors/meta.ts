// Meta (Facebook Pages + Instagram professional accounts). SCAFFOLD: the OAuth hand-off and webhook verification are
// written to Meta's documented shapes but have NOT been run against a real app: that needs a Meta developer app,
// Business verification and app review. Reading metrics and inbound messages is deliberately not implemented yet:
// `capabilities` stays false, so the sync engine refuses to run instead of pretending.
import { SmoisPlatform } from '@prisma/client';
import { ConnectorNotReady, Connector } from './types';
import { verifyMetaSignature } from './rules';

const GRAPH = 'https://graph.facebook.com/v21.0';
const SCOPES: Record<string, string[]> = {
  FACEBOOK: ['pages_show_list', 'pages_read_engagement', 'read_insights'],
  INSTAGRAM: ['pages_show_list', 'instagram_basic', 'instagram_manage_insights'],
};

const need = (k: string) => { const v = process.env[k]; if (!v) throw new ConnectorNotReady(`${k} is not set on the server`); return v; };

export const meta: Connector = {
  id: 'meta',
  label: 'Meta (Facebook & Instagram)',
  platforms: ['FACEBOOK', 'INSTAGRAM'] as SmoisPlatform[],
  configured: () => Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET),
  capabilities: { metrics: false, inbound: false, publish: false },

  authUrl(state, redirectUri) {
    const q = new URLSearchParams({ client_id: need('META_APP_ID'), redirect_uri: redirectUri, state, response_type: 'code', scope: [...new Set(Object.values(SCOPES).flat())].join(',') });
    return `https://www.facebook.com/v21.0/dialog/oauth?${q}`;
  },

  async connect(code, redirectUri, platform) {
    const q = new URLSearchParams({ client_id: need('META_APP_ID'), client_secret: need('META_APP_SECRET'), redirect_uri: redirectUri, code });
    const t = await (await fetch(`${GRAPH}/oauth/access_token?${q}`)).json() as { access_token?: string; expires_in?: number; error?: { message: string } };
    if (!t.access_token) throw new ConnectorNotReady(t.error?.message ?? 'Meta did not return a token');
    // The page / Instagram account to read is chosen in a later step once review is granted; until then record the grant only.
    return {
      tokens: { accessToken: t.access_token, expiresAt: t.expires_in ? new Date(Date.now() + t.expires_in * 1000) : null, scopes: SCOPES[platform] ?? [] },
      remote: { externalId: '', name: '' },
    };
  },

  async fetchMetrics() { throw new ConnectorNotReady('Reading metrics from Meta is not built yet (needs approved app permissions).'); },

  verifyWebhook: (raw, headers) => verifyMetaSignature(raw, headers['x-hub-signature-256'] as string | undefined, process.env.META_APP_SECRET),
};

/** Meta's one-off subscription handshake: GET with hub.mode=subscribe; answer with hub.challenge if the token matches. */
export const metaHandshake = (q: Record<string, unknown>): string | null =>
  q['hub.mode'] === 'subscribe' && process.env.META_WEBHOOK_VERIFY_TOKEN && q['hub.verify_token'] === process.env.META_WEBHOOK_VERIFY_TOKEN ? String(q['hub.challenge'] ?? '') : null;
