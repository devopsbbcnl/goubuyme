// Lifecycle automations: once a day, message users who newly match a trigger
// (e.g. no order in 30 days). Each run becomes a Campaign so stats and delivery are shared.
import { AutomationTrigger, CrmAutomation, OrderStatus, Prisma } from '@prisma/client';
import prisma from '../../config/db';
import logger from '../../utils/logger';
import { recordError } from '../../utils/recordError';
import { audienceBase } from './segment.service';
import { createRecipients, marketableWhere } from './campaign.service';

const DAY_MS = 24 * 60 * 60 * 1000;

export const TRIGGERS: Record<AutomationTrigger, { label: string; role: 'CUSTOMER' | 'VENDOR'; describe: (days: number) => string }> = {
  WIN_BACK: {
    label: 'Win back lapsed customers',
    role: 'CUSTOMER',
    describe: d => `Customers who have ordered before but not in the last ${d} days`,
  },
  FIRST_ORDER_NUDGE: {
    label: 'Nudge sign-ups to first order',
    role: 'CUSTOMER',
    describe: d => `Customers who signed up at least ${d} days ago and have never ordered`,
  },
  VENDOR_INACTIVE: {
    label: 'Re-engage quiet vendors',
    role: 'VENDOR',
    describe: d => `Approved vendors with no orders in the last ${d} days`,
  },
};

/** Who currently matches an automation's trigger, before cooldown and marketing filters. */
export const triggerWhere = (trigger: AutomationTrigger, days: number, now = new Date()): Prisma.UserWhereInput => {
  const since = new Date(now.getTime() - days * DAY_MS);
  const live = { status: { not: OrderStatus.CANCELLED } };
  switch (trigger) {
    case 'WIN_BACK':
      return {
        ...audienceBase('CUSTOMER'),
        AND: [
          { customer: { orders: { some: live } } },
          { customer: { orders: { none: { ...live, createdAt: { gte: since } } } } },
        ],
      };
    case 'FIRST_ORDER_NUDGE':
      return {
        ...audienceBase('CUSTOMER'),
        createdAt: { lt: since },
        customer: { orders: { none: live } },
      };
    case 'VENDOR_INACTIVE':
      return {
        ...audienceBase('VENDOR'),
        vendor: { approvalStatus: 'APPROVED', createdAt: { lt: since }, orders: { none: { ...live, createdAt: { gte: since } } } },
      };
  }
};

/** Full audience for a run: trigger match, marketable, and not messaged by this automation within its cooldown. */
export const automationAudienceWhere = (a: Pick<CrmAutomation, 'id' | 'trigger' | 'days' | 'cooldownDays'>, now = new Date()): Prisma.UserWhereInput => ({
  AND: [
    triggerWhere(a.trigger, a.days, now),
    marketableWhere(now),
    {
      campaignRecipients: {
        none: {
          campaign: { automationId: a.id },
          createdAt: { gte: new Date(now.getTime() - a.cooldownDays * DAY_MS) },
        },
      },
    },
  ],
});

/** Runs one automation now. Returns the number of users queued (0 creates no campaign). */
export const runAutomation = async (automation: CrmAutomation, now = new Date()) => {
  const users = await prisma.user.findMany({
    where: automationAudienceWhere(automation, now),
    select: { id: true, phone: true },
    take: 50_000,
  });
  if (users.length === 0) return 0;

  const campaign = await prisma.campaign.create({
    data: {
      name: `${automation.name} · ${now.toISOString().slice(0, 10)}`,
      automationId: automation.id,
      channels: automation.channels,
      title: automation.title,
      body: automation.body,
      emailSubject: automation.emailSubject,
      ctaUrl: automation.ctaUrl,
      // Recipients are written before the campaign is picked up for delivery.
      status: 'DRAFT',
      createdById: automation.createdById,
    },
  });
  await createRecipients(campaign.id, automation.channels, users);
  await prisma.campaign.update({
    where: { id: campaign.id },
    data: { status: 'SENDING', startedAt: now, audienceSize: users.length },
  });
  return users.length;
};

/** Daily tick: runs each enabled automation at most once per calendar day across all workers. */
export const runDueAutomations = async (now = new Date()) => {
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);

  const automations = await prisma.crmAutomation.findMany({ where: { enabled: true } });
  for (const a of automations) {
    const claimed = await prisma.crmAutomation.updateMany({
      where: { id: a.id, enabled: true, OR: [{ lastRunAt: null }, { lastRunAt: { lt: dayStart } }] },
      data: { lastRunAt: now },
    });
    if (claimed.count === 0) continue;
    try {
      const queued = await runAutomation(a, now);
      logger.info(`Automation "${a.name}" queued ${queued} users`);
    } catch (err) {
      recordError('automation-job', `Automation ${a.id} failed`, err);
    }
  }
};
