// GET /admin/crm/overview — one-screen health check across support, customers, marketing and pipeline.
import { Response } from 'express';
import prisma from '../../config/db';
import { AuthRequest } from '../../middleware/auth.middleware';
import { catchAsync } from '../../utils/catchAsync';
import { apiResponse } from '../../utils/apiResponse';
import { lifecycleWhere } from '../../services/crm/profile.service';
import { OPEN_STAGES } from '../../services/crm/lead.service';

const DAY_MS = 86_400_000;

export const getCrmOverview = catchAsync(async (req: AuthRequest, res: Response) => {
  const now = new Date();
  const since30 = new Date(now.getTime() - 30 * DAY_MS);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const liveCustomer = { role: 'CUSTOMER' as const, deletedAt: null };

  const [
    openTickets, overdueTickets, unassignedTickets, csat, ticketsByCategory,
    activeCustomers, atRiskCustomers, churnedCustomers, optedOut,
    campaignsSent, openLeads, newLeads, liveLeads,
    myTasksToday, myOverdue, teamOverdue,
  ] = await Promise.all([
    prisma.ticket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS', 'PENDING_REQUESTER'] } } }),
    prisma.ticket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] }, slaDueAt: { lt: now } } }),
    prisma.ticket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS', 'PENDING_REQUESTER'] }, assigneeId: null } }),
    prisma.ticket.aggregate({ where: { csatScore: { not: null }, resolvedAt: { gte: since30 } }, _avg: { csatScore: true }, _count: { csatScore: true } }),
    prisma.ticket.groupBy({ by: ['category'], where: { createdAt: { gte: since30 } }, _count: { _all: true }, orderBy: { _count: { category: 'desc' } }, take: 5 }),
    prisma.user.count({ where: { AND: [liveCustomer, lifecycleWhere('CUSTOMER', 'ACTIVE', now)] } }),
    prisma.user.count({ where: { AND: [liveCustomer, lifecycleWhere('CUSTOMER', 'AT_RISK', now)] } }),
    prisma.user.count({ where: { AND: [liveCustomer, lifecycleWhere('CUSTOMER', 'CHURNED', now)] } }),
    prisma.user.count({ where: { ...liveCustomer, marketingOptIn: false } }),
    prisma.campaign.findMany({ where: { status: 'SENT', completedAt: { gte: since30 } }, select: { id: true } }),
    prisma.lead.count({ where: { stage: { in: OPEN_STAGES } } }),
    prisma.lead.count({ where: { createdAt: { gte: since30 } } }),
    prisma.lead.count({ where: { liveAt: { gte: since30 } } }),
    prisma.crmTask.count({ where: { status: 'OPEN', assigneeId: req.user!.userId, dueAt: { lte: endOfToday } } }),
    prisma.crmTask.count({ where: { status: 'OPEN', assigneeId: req.user!.userId, dueAt: { lt: now } } }),
    prisma.crmTask.count({ where: { status: 'OPEN', dueAt: { lt: now } } }),
  ]);

  // Revenue from customers who ordered within 72h of a campaign message in the last 30 days.
  const campaignIds = campaignsSent.map(c => c.id);
  let campaignRevenue = 0;
  let campaignBuyers = 0;
  if (campaignIds.length) {
    const [row] = await prisma.$queryRaw<Array<{ buyers: number; revenue: number }>>`
      SELECT COUNT(DISTINCT c."userId")::int AS buyers, COALESCE(SUM(o."totalAmount"), 0)::float AS revenue
      FROM orders o
      JOIN customers c ON c.id = o."customerId"
      JOIN (
        SELECT "userId", MIN("sentAt") AS first_sent FROM campaign_recipients
        WHERE status::text = 'SENT' AND "sentAt" >= ${since30}
        GROUP BY "userId"
      ) r ON r."userId" = c."userId"
      WHERE o.status::text <> 'CANCELLED' AND o."createdAt" >= r.first_sent AND o."createdAt" < r.first_sent + interval '72 hours'`;
    campaignRevenue = row?.revenue ?? 0;
    campaignBuyers = row?.buyers ?? 0;
  }

  return apiResponse.success(res, 'Overview fetched.', {
    support: {
      open: openTickets, overdue: overdueTickets, unassigned: unassignedTickets,
      csatAverage30d: csat._avg.csatScore ? Math.round(csat._avg.csatScore * 10) / 10 : null,
      csatResponses30d: csat._count.csatScore,
      topCategories30d: ticketsByCategory.map(c => ({ category: c.category, count: c._count._all })),
    },
    customers: { active: activeCustomers, atRisk: atRiskCustomers, churned: churnedCustomers, optedOutOfMarketing: optedOut },
    marketing: { campaignsSent30d: campaignIds.length, attributedRevenue30d: campaignRevenue, buyers30d: campaignBuyers },
    pipeline: { open: openLeads, new30d: newLeads, live30d: liveLeads },
    tasks: { myDueToday: myTasksToday, myOverdue, teamOverdue },
  });
});
