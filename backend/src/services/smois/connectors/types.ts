// What a platform connector must provide. Real API calls live inside providers; everything else (tokens, jobs,
// retries, notifications, audit) is shared and lives in sync.ts.
import { SmoisPlatform } from '@prisma/client';

export class ConnectorNotReady extends Error {}
export class RateLimited extends Error { constructor(public retryAfterSeconds?: number) { super('Rate limited by the platform'); } }
export class AuthRejected extends Error {}

export interface TokenSet { accessToken: string; refreshToken?: string | null; expiresAt?: Date | null; scopes?: string[] }
export interface Remote { externalId: string; name: string }

export interface DailyMetrics { date: string; followers?: number | null; reach?: number | null; impressions?: number | null; engagement?: number | null; profileVisits?: number | null; videoViews?: number | null; websiteClicks?: number | null }
export interface InboundMessage { externalId: string; kind: 'COMMENT' | 'MESSAGE' | 'MENTION'; authorName: string | null; text: string; at: Date }

export interface Connector {
  id: string;
  label: string;
  platforms: SmoisPlatform[];
  /** Are the developer-app credentials present on this server? */
  configured(): boolean;
  /** What the app has been approved for. Anything absent is not attempted. */
  capabilities: { metrics: boolean; inbound: boolean; publish: boolean };
  authUrl(state: string, redirectUri: string): string;
  /** Trade the one-time code for tokens and find the page/profile this account refers to. */
  connect(code: string, redirectUri: string, platform: SmoisPlatform): Promise<{ tokens: TokenSet; remote: Remote }>;
  refresh?(tokens: TokenSet): Promise<TokenSet>;
  /** Daily readings from `since` (inclusive, YYYY-MM-DD). Must return only what the platform reported; omit what it did not. */
  fetchMetrics(accessToken: string, remote: Remote, since: string): Promise<DailyMetrics[]>;
  verifyWebhook?(rawBody: Buffer | undefined, headers: Record<string, string | string[] | undefined>): boolean;
  parseWebhook?(body: unknown): { eventKey: string; remoteId: string; messages: InboundMessage[] }[];
}
