import prisma from '../config/db';
import logger from '../utils/logger';
import { blockIpAddress } from './ip-blocker.service';

// Thresholds for auto-blocking
const THRESHOLDS = {
  RATE_LIMIT_HITS: 5,           // hits
  RATE_LIMIT_WINDOW: 60 * 60,   // 1 hour in seconds
  FAILED_LOGINS: 10,             // attempts
  FAILED_LOGIN_WINDOW: 15 * 60,  // 15 min in seconds
  SCANNER_HITS: 15,              // hits on 404s
  SCANNER_WINDOW: 15 * 60,       // 15 min in seconds
};

export async function trackSuspiciousActivity(
  ip: string,
  type: 'rate_limit' | 'failed_login' | 'scanner',
  details?: any,
): Promise<boolean> {
  try {
    // Check if IP is already blocked
    const blocked = await prisma.blockedIP.findUnique({ where: { ip } });
    if (blocked) return false;

    const now = new Date();
    const existing = await prisma.suspiciousActivity.findUnique({
      where: { ip_type: { ip, type } },
    });

    const windowMs = getWindowMs(type);
    const windowStart = existing?.windowStart || now;
    const windowAge = (now.getTime() - windowStart.getTime()) / 1000;

    // Reset counter if window expired
    if (windowAge > getWindowSeconds(type)) {
      await prisma.suspiciousActivity.upsert({
        where: { ip_type: { ip, type } },
        create: { ip, type, count: 1, windowStart: now, details },
        update: { count: 1, windowStart: now, lastOccurrence: now, details },
      });
      return false;
    }

    // Increment counter
    const newCount = (existing?.count || 0) + 1;
    await prisma.suspiciousActivity.upsert({
      where: { ip_type: { ip, type } },
      create: { ip, type, count: newCount, windowStart, details },
      update: { count: newCount, lastOccurrence: now, details },
    });

    // Check if threshold exceeded
    const threshold = getThreshold(type);
    if (newCount >= threshold) {
      await blockIpAddress(ip, `Auto-blocked: ${type} (${newCount} ${type}s in ${getWindowMs(type)}ms)`, 'SYSTEM');
      await prisma.blockedIP.update({
        where: { ip },
        data: { isAuto: true },
      });
      logger.warn('IP auto-blocked', { ip, type, count: newCount, threshold });
      return true;
    }

    return false;
  } catch (err) {
    logger.error('Failed to track suspicious activity', { ip, type, error: (err as Error).message });
    return false;
  }
}

export async function getSuspiciousActivity(ip: string): Promise<any[]> {
  try {
    return await prisma.suspiciousActivity.findMany({
      where: { ip },
      orderBy: { lastOccurrence: 'desc' },
    });
  } catch (err) {
    logger.error('Failed to get suspicious activity', { ip, error: (err as Error).message });
    return [];
  }
}

export async function clearSuspiciousActivity(ip: string, type?: string): Promise<void> {
  try {
    if (type) {
      await prisma.suspiciousActivity.delete({
        where: { ip_type: { ip, type } },
      });
    } else {
      await prisma.suspiciousActivity.deleteMany({ where: { ip } });
    }
  } catch (err) {
    logger.error('Failed to clear suspicious activity', { ip, error: (err as Error).message });
  }
}

function getThreshold(type: string): number {
  switch (type) {
    case 'rate_limit': return THRESHOLDS.RATE_LIMIT_HITS;
    case 'failed_login': return THRESHOLDS.FAILED_LOGINS;
    case 'scanner': return THRESHOLDS.SCANNER_HITS;
    default: return 999;
  }
}

function getWindowSeconds(type: string): number {
  switch (type) {
    case 'rate_limit': return THRESHOLDS.RATE_LIMIT_WINDOW;
    case 'failed_login': return THRESHOLDS.FAILED_LOGIN_WINDOW;
    case 'scanner': return THRESHOLDS.SCANNER_WINDOW;
    default: return 60;
  }
}

function getWindowMs(type: string): number {
  return getWindowSeconds(type) * 1000;
}
