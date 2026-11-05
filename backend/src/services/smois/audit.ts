// SMOIS activity trail. Rows go in AuditLog (entity "Smois…") and are made immutable by a DB trigger.
import { Prisma } from '@prisma/client';
import prisma from '../../config/db';
import { SmoisRequest } from '../../middleware/smois.middleware';
import logger from '../../utils/logger';

type Db = Pick<Prisma.TransactionClient, 'auditLog'>;

export interface AuditInput {
  action: string;
  /** e.g. SmoisContent. Must start with "Smois" so the append-only trigger covers it. */
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  meta?: Record<string, unknown>;
  success?: boolean;
  /** Pass when there is no request (jobs) or the actor differs. */
  userId?: string | null;
}

const clip = (v: unknown) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v, (_k, val) => (typeof val === 'string' && val.length > 2000 ? `${val.slice(0, 2000)}…` : val))));

export const smoisAudit = async (req: SmoisRequest | null, input: AuditInput, db: Db = prisma): Promise<void> => {
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
          success: input.success ?? true,
          before: clip(input.before),
          after: clip(input.after),
          device: req?.headers['user-agent']?.slice(0, 200),
          ...(input.meta ?? {}),
        } as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    // The trail must never take the action down with it, but a gap should be loud.
    logger.error(`SMOIS audit write failed (${input.action} ${input.entity}/${input.entityId}): ${(err as Error).message}`);
  }
};
