import logger from '../utils/logger';

interface CloudflareListItem {
  id: string;
  ip: string;
  comment: string;
  created_on?: string;
}

interface CloudflareListResponse {
  success: boolean;
  errors: any[];
  messages: any[];
  result?: CloudflareListItem | CloudflareListItem[] | { id: string }[];
  result_info?: {
    page: number;
    per_page: number;
    count: number;
    total_count: number;
  };
}

const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ZONE_ID = process.env.CLOUDFLARE_ZONE_ID;
const LIST_ID = process.env.CLOUDFLARE_IP_BLOCKLIST_ID || '';

const BASE_URL = 'https://api.cloudflare.com/client/v4';

async function cfApiCall(method: string, endpoint: string, body?: any): Promise<any> {
  if (!API_TOKEN || !ZONE_ID) {
    logger.warn('cloudflare-waf: Missing API token or zone ID — IP blocking disabled');
    return null;
  }

  const url = `${BASE_URL}${endpoint}`;
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${API_TOKEN}`,
    'Content-Type': 'application/json',
  };

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error('cloudflare-waf: API error', {
        status: response.status,
        endpoint,
        error,
      });
      return null;
    }

    return await response.json();
  } catch (err) {
    logger.error('cloudflare-waf: Request failed', {
      endpoint,
      error: (err as Error).message,
    });
    return null;
  }
}

export async function ensureBlocklistExists(): Promise<string | null> {
  if (LIST_ID) return LIST_ID;

  const res = await cfApiCall('GET', `/accounts/${API_TOKEN?.split('_')[2]?.slice(0, 32)}/lists?name=gobuyme-attack-blocklist`);
  if (!res?.success) return null;

  const lists = res.result as CloudflareListItem[];
  const existing = lists.find((l) => l.comment === 'GoBuyMe automated attack IP blocklist');
  if (existing) {
    process.env.CLOUDFLARE_IP_BLOCKLIST_ID = existing.id;
    return existing.id;
  }

  const created = await cfApiCall('POST', `/accounts/${API_TOKEN?.split('_')[2]?.slice(0, 32)}/lists`, {
    name: 'gobuyme-attack-blocklist',
    description: 'GoBuyMe automated attack IP blocklist',
    kind: 'ip',
  });

  if (created?.success && created.result?.id) {
    process.env.CLOUDFLARE_IP_BLOCKLIST_ID = created.result.id;
    logger.info('cloudflare-waf: Created IP blocklist', { listId: created.result.id });
    return created.result.id;
  }

  return null;
}

export async function blockIpAddress(
  ip: string,
  reason: string,
  durationMinutes: number = 1440,
): Promise<boolean> {
  if (!API_TOKEN || !ZONE_ID) {
    logger.warn('cloudflare-waf: Skipping IP block — Cloudflare not configured', { ip });
    return false;
  }

  const listId = LIST_ID || (await ensureBlocklistExists());
  if (!listId) {
    logger.error('cloudflare-waf: Could not get or create blocklist', { ip });
    return false;
  }

  const timestamp = new Date().toISOString();
  const expiryTime = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();

  const res = await cfApiCall(
    'POST',
    `/accounts/${API_TOKEN?.split('_')[2]?.slice(0, 32)}/lists/${listId}/items`,
    {
      items: [
        {
          ip,
          comment: `Auto-blocked: ${reason} (expires ${expiryTime}) — ${timestamp}`,
        },
      ],
    },
  );

  if (res?.success) {
    logger.info('cloudflare-waf: IP blocked', { ip, reason, duration: durationMinutes });
    return true;
  }

  logger.error('cloudflare-waf: Failed to block IP', { ip, response: res });
  return false;
}

export async function unblockIpAddress(ip: string): Promise<boolean> {
  if (!API_TOKEN || !ZONE_ID) return false;

  const listId = LIST_ID || (await ensureBlocklistExists());
  if (!listId) return false;

  const res = await cfApiCall('GET', `/accounts/${API_TOKEN?.split('_')[2]?.slice(0, 32)}/lists/${listId}/items`);
  if (!res?.success) return false;

  const items = res.result as CloudflareListItem[];
  const item = items.find((i) => i.ip === ip);
  if (!item) return false;

  const deleteRes = await cfApiCall(
    'DELETE',
    `/accounts/${API_TOKEN?.split('_')[2]?.slice(0, 32)}/lists/${listId}/items/${item.id}`,
  );

  if (deleteRes?.success) {
    logger.info('cloudflare-waf: IP unblocked', { ip });
    return true;
  }

  return false;
}

export async function getBlockedIps(): Promise<{ ip: string; reason: string; blockedAt: string }[]> {
  if (!API_TOKEN || !ZONE_ID) return [];

  const listId = LIST_ID || (await ensureBlocklistExists());
  if (!listId) return [];

  const res = await cfApiCall('GET', `/accounts/${API_TOKEN?.split('_')[2]?.slice(0, 32)}/lists/${listId}/items?limit=100`);
  if (!res?.success) return [];

  const items = res.result as CloudflareListItem[];
  return items.map((item) => ({
    ip: item.ip,
    reason: item.comment?.split('Auto-blocked: ')[1]?.split(' (expires')[0] || 'Unknown',
    blockedAt: item.created_on || new Date().toISOString(),
  }));
}
