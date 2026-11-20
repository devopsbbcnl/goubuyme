// PWM activity trail. Rows go in AuditLog (entity "Pwm...") and are made immutable by a DB trigger,
// so HR history can be read but never rewritten.
import { Prisma } from '@prisma/client';
import prisma from '../../config/db';
import type { PwmRequest } from '../../middleware/pwm.middleware';
import logger from '../../utils/logger';

type Db = Pick<Prisma.TransactionClient, 'auditLog'>;

export interface PwmAuditInput {
  action: string;
  /** Must start with "Pwm" so the append-only trigger covers it. */
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
  meta?: Record<string, unknown>;
  /** Pass null for the system (jobs); omit to use the signed-in person. */
  userId?: string | null;
}

const clip = (v: unknown) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v, (_k, val) => (typeof val === 'string' && val.length > 2000 ? `${val.slice(0, 2000)}…` : val))));

export const pwmAudit = async (req: PwmRequest | null, input: PwmAuditInput, db: Db = prisma): Promise<void> => {
  try {
    await db.auditLog.create({
      data: {
        userId: input.userId !== undefined ? input.userId : req?.user?.userId ?? null,
        actorType: input.userId === null || (!req && input.userId === undefined) ? 'SYSTEM' : 'ADMIN',
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        ip: req?.ip ?? null,
        meta: {
          before: clip(input.before),
          after: clip(input.after),
          reason: input.reason,
          device: req?.headers['user-agent']?.slice(0, 200),
          ...(input.meta ?? {}),
        } as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    // The trail must never take the action down with it, but a gap should be loud.
    logger.error(`PWM audit write failed (${input.action} ${input.entity}/${input.entityId}): ${(err as Error).message}`);
  }
};
