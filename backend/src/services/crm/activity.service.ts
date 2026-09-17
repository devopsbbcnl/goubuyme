import { Prisma } from '@prisma/client';
import prisma from '../../config/db';
import { recordError } from '../../utils/recordError';

export type CrmActivityType =
  | 'NOTE_ADDED'
  | 'TAG_ADDED'
  | 'TAG_REMOVED'
  | 'CREDIT_ISSUED'
  | 'ACCOUNT_SUSPENDED'
  | 'ACCOUNT_REACTIVATED'
  | 'MESSAGE_SENT'
  | 'TICKET_CREATED'
  | 'TICKET_RESOLVED'
  | 'TICKET_CREDIT_ISSUED';

/**
 * Records a CRM timeline entry and the matching audit log row for a staff action.
 * Never throws — a failed timeline write must not fail the action that caused it.
 */
export const logCrmActivity = async (params: {
  subjectUserId: string;
  actorId: string;
  type: CrmActivityType;
  title: string;
  meta?: Record<string, unknown>;
}): Promise<void> => {
  const { subjectUserId, actorId, type, title, meta } = params;
  try {
    await prisma.$transaction([
      prisma.crmActivity.create({
        data: { subjectUserId, actorId, type, title, meta: meta as Prisma.InputJsonValue },
      }),
      prisma.auditLog.create({
        data: {
          userId: actorId,
          action: `CRM_${type}`,
          entity: 'User',
          entityId: subjectUserId,
          meta: meta as Prisma.InputJsonValue,
        },
      }),
    ]);
  } catch (err) {
    recordError('crm', 'logCrmActivity failed', err, { subjectUserId, type });
  }
};
