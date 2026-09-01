import prisma from '../config/db';
import logger from '../utils/logger';

export async function blockIpAddress(ip: string, reason: string, blockedBy?: string): Promise<boolean> {
  try {
    await prisma.blockedIP.upsert({
      where: { ip },
      update: { reason, blockedBy: blockedBy || null },
      create: { ip, reason, blockedBy: blockedBy || null },
    });
    logger.info('IP blocked', { ip, reason, auto: !blockedBy });
    return true;
  } catch (err) {
    logger.error('Failed to block IP', { ip, error: (err as Error).message });
    return false;
  }
}

export async function unblockIpAddress(ip: string): Promise<boolean> {
  try {
    const deleted = await prisma.blockedIP.delete({
      where: { ip },
    });
    logger.info('IP unblocked', { ip });
    return !!deleted;
  } catch (err) {
    logger.error('Failed to unblock IP', { ip, error: (err as Error).message });
    return false;
  }
}

export async function getBlockedIps(): Promise<{ ip: string; reason: string; blockedAt: string }[]> {
  try {
    const ips = await prisma.blockedIP.findMany({
      orderBy: { blockedAt: 'desc' },
    });
    return ips.map((item: any) => ({
      ip: item.ip,
      reason: item.reason,
      blockedAt: item.blockedAt.toISOString(),
    }));
  } catch (err) {
    logger.error('Failed to fetch blocked IPs', { error: (err as Error).message });
    return [];
  }
}

export async function isIpBlocked(ip: string): Promise<boolean> {
  try {
    const blocked = await prisma.blockedIP.findUnique({
      where: { ip },
    });
    return !!blocked;
  } catch (err) {
    return false;
  }
}
