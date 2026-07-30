import prisma from '../config/db';
import { OnboardingEventType, Role, Prisma } from '@prisma/client';
import logger from '../utils/logger';

/**
 * Records an onboarding transition for a user. First occurrence wins — the
 * @@unique([userId, event]) constraint keeps one row per transition, so calling
 * this again for the same step is a harmless no-op.
 *
 * Fire-and-forget: always call as `void recordOnboardingEvent(...)`. Failures are
 * logged and swallowed so analytics instrumentation can never break a user flow.
 */
export async function recordOnboardingEvent(
  userId: string,
  role: Role,
  event: OnboardingEventType,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.onboardingEvent.upsert({
      where: { userId_event: { userId, event } },
      create: {
        userId,
        role,
        event,
        ...(metadata ? { metadata: metadata as Prisma.InputJsonValue } : {}),
      },
      update: {}, // keep the original timestamp of the first occurrence
    });
  } catch (err) {
    logger.error('Failed to record onboarding event', { userId, role, event, err });
  }
}
