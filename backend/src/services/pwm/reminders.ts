// The contract expiry reminder engine (PRD 10.6, 12). Hourly and idempotent: running it twice in a day
// creates nothing new. It never ends anyone's employment; expiry only flags the record for a person to decide.
import { Prisma, PwmReminder } from '@prisma/client';
import prisma from '../../config/db';
import logger from '../../utils/logger';
import { notifyUser } from '../notification.service';
import { sendPwmReminderEmail } from '../email.service';
import { pwmAudit } from './audit';
import { getPwmConfig, PwmConfig } from './settings';
import {
  Channel, SEVERITY_NEEDS_ACK, Severity, addDays, buildExpiryMessage, daysBetween, dateOnly, dueTiers, fromYmd, lagosHour, lagosYmd,
  pickTierToSend, reminderKey, renewalDueDates, resolveRecipients, retryDelay, workingDaysBetween, WATCHED_CONTRACT, fullName, RecipientContext, CONTRACT_STATUS_LABEL,
} from './rules';
import { applyStatus, hrAdminUserIds, managementUserIds, mdUserIds, superAdminUserIds } from './people';

const MAX_PER_RUN = 300;

export interface EngineResult {
  ranAt: string;
  evaluatedContracts: number;
  remindersCreated: number;
  delivered: number;
  failed: number;
  escalated: number;
  expiredFlagged: number;
  renewalsOpened: number;
}

const STEP_LABEL: Record<string, string> = {
  RECOMMENDATION: 'Awaiting department head recommendation', DECISION: 'Awaiting management decision', PREPARATION: 'New contract being prepared',
  ISSUANCE: 'New contract to be issued', SIGNATURE: 'Awaiting signature', COMPLETED: 'Renewal completed', CLOSED: 'Renewal closed',
};

type NewReminder = Omit<Prisma.PwmReminderCreateManyInput, 'id' | 'createdAt'>;

const insertReminders = async (rows: NewReminder[]): Promise<number> => {
  if (!rows.length) return 0;
  const r = await prisma.pwmReminder.createMany({ data: rows, skipDuplicates: true });
  return r.count;
};

/** One reminder per person and channel; the idempotency key makes a repeat run a no-op. */
const fanOut = (
  base: Pick<NewReminder, 'kind' | 'contractId' | 'employeeId' | 'documentId' | 'renewalId' | 'tierKey' | 'severity' | 'expiryDate' | 'title' | 'body' | 'link'>,
  people: { userId: string; role: string }[], channels: Channel[], keyParts: (string | number)[],
): NewReminder[] => {
  const needsAck = SEVERITY_NEEDS_ACK[(base.severity as Severity) ?? 'EARLY'] ?? false;
  const rows: NewReminder[] = [];
  for (const p of people) {
    for (const channel of channels) {
      rows.push({
        ...base, recipientUserId: p.userId, recipientRole: p.role, channel, requiresAck: needsAck, status: 'QUEUED', scheduledFor: new Date(), nextAttemptAt: new Date(),
        idempotencyKey: reminderKey([...keyParts, p.userId, channel]),
      });
    }
  }
  return rows;
};

// ── Contracts ────────────────────────────────────────────────────────────────

const evaluateContracts = async (now: Date, cfg: PwmConfig, out: EngineResult): Promise<void> => {
  const today = lagosYmd(now);
  const [hrAdmins, management, mds, supers] = await Promise.all([hrAdminUserIds(), managementUserIds(), mdUserIds(), superAdminUserIds()]);

  const contracts = await prisma.pwmContract.findMany({
    where: { status: { in: [...WATCHED_CONTRACT] }, expiryDate: { not: null }, decisionRecordedAt: null, archivedAt: null },
    include: {
      employee: { select: { id: true, employeeNo: true, firstName: true, middleName: true, lastName: true, status: true, userId: true, hrOfficerUserId: true, department: { select: { name: true, head: { select: { userId: true } } } } } },
      renewals: { where: { step: { notIn: ['COMPLETED', 'CLOSED'] } }, take: 1, select: { id: true, step: true } },
    },
    take: 2000,
  });
  out.evaluatedContracts = contracts.length;
  const digest = new Map<string, { tierKey: string; lines: string[] }>(); // management digest per user

  for (const c of contracts) {
    const expiry = dateOnly(c.expiryDate as Date);
    const daysRemaining = daysBetween(today, expiry);
    const wda = daysRemaining < 0 ? workingDaysBetween(expiry, today, cfg.holidays) : 0;
    const emp = c.employee;
    const open = c.renewals[0] ?? null;
    const name = fullName(emp);

    // Open the renewal task as soon as the first window is reached (REN-01); never a duplicate.
    const firstOffset = Math.max(...cfg.tiers.filter((t) => !t.repeat).map((t) => t.offsetDays));
    let renewalId = open?.id ?? null;
    let step = open?.step ?? null;
    if (!open && daysRemaining <= firstOffset) {
      const d = renewalDueDates(expiry);
      const created = await prisma.pwmRenewal.create({
        data: {
          contractId: c.id, employeeId: emp.id, dueRecommendation: fromYmd(d.recommendation), dueDecision: fromYmd(d.decision),
          duePreparation: fromYmd(d.preparation), dueIssuance: fromYmd(d.issuance), dueSignature: fromYmd(d.signature),
          events: { create: { action: 'OPENED', note: 'Opened automatically when the expiry window began.' } },
        },
        select: { id: true, step: true },
      }).catch(() => null);
      if (created) {
        renewalId = created.id; step = created.step; out.renewalsOpened++;
        if (c.status === 'ACTIVE') await prisma.pwmContract.update({ where: { id: c.id }, data: { status: 'RENEWAL_PENDING' } });
        if (['ACTIVE', 'PROBATION'].includes(emp.status)) await applyStatus({ employeeId: emp.id, to: 'RENEWAL_PENDING', reason: `Contract ${c.reference} is within its renewal window`, bySystem: true });
        await pwmAudit(null, { action: 'RENEWAL_OPENED', entity: 'PwmContract', entityId: c.id, after: { renewalId }, userId: null });
      }
    }

    // After expiry with no decision: contract Expired - action required, employee flagged. Never Terminated (REM-11).
    if (daysRemaining <= -1 && c.status !== 'EXPIRED_ACTION_REQUIRED') {
      await prisma.pwmContract.update({ where: { id: c.id }, data: { status: 'EXPIRED_ACTION_REQUIRED', version: { increment: 1 } } });
      if (['ACTIVE', 'PROBATION', 'RENEWAL_PENDING', 'CONTRACT_ISSUED'].includes(emp.status)) {
        const r = await applyStatus({ employeeId: emp.id, to: 'CONTRACT_EXPIRED', reason: `Contract ${c.reference} expired with no recorded decision`, bySystem: true });
        if (!r.ok) logger.warn(`PWM: could not flag ${emp.employeeNo} as Contract expired: ${r.reason}`);
      }
      await pwmAudit(null, { action: 'CONTRACT_EXPIRED_ACTION_REQUIRED', entity: 'PwmContract', entityId: c.id, before: { status: c.status }, after: { status: 'EXPIRED_ACTION_REQUIRED' }, userId: null });
      out.expiredFlagged++;
    }

    const doneRows = await prisma.pwmReminderTier.findMany({ where: { contractId: c.id, expiryDate: c.expiryDate as Date }, select: { tierKey: true } });
    const done = new Set(doneRows.map((r) => r.tierKey));
    const { send, skipped } = pickTierToSend(dueTiers(daysRemaining, wda, cfg.tiers, cfg.repeatEveryWorkingDays), done);
    if (!send) continue;

    const markTier = async (key: string, outcome: string, note?: string) =>
      prisma.pwmReminderTier.create({ data: { contractId: c.id, tierKey: key, expiryDate: c.expiryDate as Date, outcome, note } }).then(() => true).catch(() => false);
    for (const s of skipped) await markTier(s.key, 'SKIPPED_CATCHUP', 'A later tier was already due; only the most severe is sent.');

    // A contract just brought in by bulk import is covered by one summary message, not a burst per contract (12.4).
    if (c.isImported && now.getTime() - c.createdAt.getTime() < 36 * 3_600_000) {
      await markTier(send.key, 'SUPPRESSED_IMPORT', 'Covered by the bulk-import summary.');
      continue;
    }
    if (!(await markTier(send.key, 'DISPATCHED'))) continue; // another worker claimed it

    const ctx: RecipientContext = {
      hrOfficerUserId: c.responsibleOfficerUserId ?? emp.hrOfficerUserId, hrAdminUserIds: hrAdmins, deptHeadUserId: emp.department?.head?.userId ?? null,
      managementUserIds: management, mdUserIds: mds, superAdminUserIds: supers, employeeUserId: emp.userId,
      recommendationOutstanding: !open || open.step === 'RECOMMENDATION', workingDaysAfter: wda,
      employeeRecipientOn: cfg.employeeRecipientOn, superAdminAfterWorkingDays: cfg.superAdminAfterWorkingDays,
    };
    const { people, gaps } = resolveRecipients(send.tier, ctx);
    const msg = buildExpiryMessage(send.key, send.tier.severity, {
      employeeName: name, employeeNo: emp.employeeNo, department: emp.department?.name ?? c.departmentName ?? 'No department', contractRef: c.reference,
      contractType: c.contractType, expiryDate: expiry, daysRemaining, stage: step ? STEP_LABEL[step] : 'No renewal started yet',
    });
    const baseKey = send.key.split('#')[0];
    const base = { kind: 'CONTRACT_EXPIRY', contractId: c.id, employeeId: emp.id, tierKey: send.key, severity: send.tier.severity, expiryDate: c.expiryDate as Date, title: msg.title, body: msg.body, link: `/pwm/contracts/${c.id}` };

    let individuals = people;
    if (send.tier.digest) {
      // Management and the MD hear about early-warning tiers in a daily digest instead.
      for (const p of people.filter((x) => x.role === 'MANAGEMENT' || x.role === 'MD')) {
        const d = digest.get(p.userId) ?? { tierKey: baseKey, lines: [] };
        d.lines.push(`${name} (${emp.employeeNo}), ${c.reference}, expires ${expiry}`);
        digest.set(p.userId, d);
      }
      individuals = people.filter((x) => x.role !== 'MANAGEMENT' && x.role !== 'MD');
    }
    out.remindersCreated += await insertReminders(fanOut(base, individuals, send.tier.channels, [c.id, send.key, expiry]));

    for (const gap of gaps) {
      const label: Record<string, string> = { DEPT_HEAD: 'has no department head set', HR_OFFICER: 'has no responsible HR officer', MANAGEMENT: 'has no management group configured' };
      out.remindersCreated += await insertReminders(fanOut(
        { kind: 'CONFIG_GAP', contractId: c.id, employeeId: emp.id, tierKey: `GAP-${gap}`, severity: 'ACTION', expiryDate: c.expiryDate as Date, title: `Configuration gap: ${name} ${label[gap] ?? 'is missing a recipient'}`, body: `The ${send.key} reminder for ${c.reference} was sent to the HR administrators instead. Fix the setup so it reaches the right person next time.`, link: `/pwm/employees/${emp.id}` },
        hrAdmins.map((id) => ({ userId: id, role: 'HR_ADMIN' })), ['IN_APP'], [c.id, `gap-${gap}`, expiry],
      ));
    }
    await pwmAudit(null, { action: 'REMINDER_TIER_DISPATCHED', entity: 'PwmContract', entityId: c.id, meta: { tier: send.key, recipients: people.length, skipped: skipped.map((s) => s.key), gaps }, userId: null });
  }

  // Daily early-warning digest for management.
  for (const [userId, d] of digest) {
    const day = today;
    out.remindersCreated += await insertReminders(fanOut(
      { kind: 'CONTRACT_EXPIRY', tierKey: `${d.tierKey}-digest`, severity: 'EARLY', title: `[Early warning] ${d.lines.length} contract${d.lines.length === 1 ? '' : 's'} now within 30 days of expiry`, body: d.lines.slice(0, 15).join('; ') + (d.lines.length > 15 ? `; and ${d.lines.length - 15} more.` : '.'), link: '/pwm/contracts' },
      [{ userId, role: 'MANAGEMENT' }], ['IN_APP', 'EMAIL'], ['digest', d.tierKey, day],
    ));
  }
};

// ── Probation, certifications and documents ──────────────────────────────────

const evaluateProbation = async (now: Date, cfg: PwmConfig, out: EngineResult): Promise<void> => {
  const today = lagosYmd(now);
  const hrAdmins = await hrAdminUserIds();
  const emps = await prisma.pwmEmployee.findMany({
    where: { status: 'PROBATION', probationEndDate: { not: null, lte: fromYmd(addDays(today, cfg.probationReminderDays)), gte: fromYmd(today) }, archivedAt: null },
    select: { id: true, employeeNo: true, firstName: true, middleName: true, lastName: true, probationEndDate: true, hrOfficerUserId: true, department: { select: { head: { select: { userId: true } } } } },
    take: 500,
  });
  for (const e of emps) {
    const end = dateOnly(e.probationEndDate as Date);
    const people = new Map<string, string>();
    if (e.department?.head?.userId) people.set(e.department.head.userId, 'DEPT_HEAD');
    if (e.hrOfficerUserId) people.set(e.hrOfficerUserId, 'HR_OFFICER');
    if (!people.size) hrAdmins.forEach((id) => people.set(id, 'HR_ADMIN'));
    out.remindersCreated += await insertReminders(fanOut(
      { kind: 'PROBATION', employeeId: e.id, tierKey: 'PROBATION', severity: 'ACTION', expiryDate: e.probationEndDate, title: `[Action required] Probation review due by ${end}: ${fullName(e)} (${e.employeeNo})`, body: `Probation ends on ${end} (${daysBetween(today, end)} days). Complete the probation assessment and record the confirmation or extension.`, link: `/pwm/employees/${e.id}` },
      [...people].map(([userId, role]) => ({ userId, role })), ['IN_APP', 'EMAIL'], [e.id, 'probation', end],
    ));
  }
};

const evaluateDocuments = async (now: Date, cfg: PwmConfig, out: EngineResult): Promise<void> => {
  const today = lagosYmd(now);
  const hrAdmins = await hrAdminUserIds();
  const horizon = Math.max(cfg.certificationReminderDays, cfg.documentReminderDays);
  const docs = await prisma.pwmDocument.findMany({
    where: { expiryDate: { not: null, lte: fromYmd(addDays(today, horizon)) }, archivedAt: null, employee: { status: { in: ['PROBATION', 'ACTIVE', 'RENEWAL_PENDING', 'CONTRACT_ISSUED', 'ON_LEAVE', 'SUSPENDED', 'NOTICE_PERIOD', 'CONTRACT_EXPIRED'] } } },
    select: { id: true, kind: true, name: true, expiryDate: true, employee: { select: { id: true, employeeNo: true, firstName: true, middleName: true, lastName: true, hrOfficerUserId: true } } },
    take: 500,
  });
  for (const d of docs) {
    const expiry = dateOnly(d.expiryDate as Date);
    const left = daysBetween(today, expiry);
    const window = d.kind === 'CERTIFICATION' ? cfg.certificationReminderDays : cfg.documentReminderDays;
    if (left > window) continue;
    const to = d.employee.hrOfficerUserId ? [d.employee.hrOfficerUserId] : hrAdmins;
    const what = d.kind === 'CERTIFICATION' ? 'Certification' : 'Document';
    out.remindersCreated += await insertReminders(fanOut(
      { kind: 'CERTIFICATION', employeeId: d.employee.id, documentId: d.id, tierKey: left < 0 ? 'EXPIRED' : 'EXPIRING', severity: left < 0 ? 'URGENT' : 'ACTION', expiryDate: d.expiryDate, title: `${what} ${left < 0 ? 'has expired' : `expires in ${left} days`}: ${d.name} (${fullName(d.employee)}, ${d.employee.employeeNo})`, body: `${d.name} ${left < 0 ? 'expired on' : 'expires on'} ${expiry}. Ask the employee for the renewed document and upload it.`, link: `/pwm/employees/${d.employee.id}` },
      to.map((userId) => ({ userId, role: 'HR_OFFICER' })), ['IN_APP'], [d.id, 'doc', expiry, left < 0 ? 'expired' : 'expiring'],
    ));
  }
};

// ── Renewal step SLAs ────────────────────────────────────────────────────────

const evaluateRenewalSla = async (now: Date, out: EngineResult): Promise<void> => {
  const today = lagosYmd(now);
  const [hrAdmins, management] = await Promise.all([hrAdminUserIds(), managementUserIds()]);
  const open = await prisma.pwmRenewal.findMany({
    where: { step: { in: ['RECOMMENDATION', 'DECISION', 'PREPARATION', 'ISSUANCE', 'SIGNATURE'] }, contract: { archivedAt: null } },
    include: {
      contract: { select: { id: true, reference: true, responsibleOfficerUserId: true } },
      employee: { select: { id: true, employeeNo: true, firstName: true, middleName: true, lastName: true, hrOfficerUserId: true, department: { select: { head: { select: { userId: true } } } } } },
    },
    take: 500,
  });
  for (const r of open) {
    const due = { RECOMMENDATION: r.dueRecommendation, DECISION: r.dueDecision, PREPARATION: r.duePreparation, ISSUANCE: r.dueIssuance, SIGNATURE: r.dueSignature }[r.step as 'RECOMMENDATION'];
    if (!due || dateOnly(due) >= today) continue;
    const officer = r.contract.responsibleOfficerUserId ?? r.employee.hrOfficerUserId;
    const owners = r.step === 'RECOMMENDATION' ? [r.employee.department?.head?.userId ?? officer] : r.step === 'DECISION' ? management : [officer];
    const people = new Map<string, string>();
    owners.filter((x): x is string => !!x).forEach((id) => people.set(id, 'STEP_OWNER'));
    hrAdmins.forEach((id) => { if (!people.has(id)) people.set(id, 'HR_ADMIN'); });
    out.remindersCreated += await insertReminders(fanOut(
      { kind: 'RENEWAL_SLA', contractId: r.contract.id, employeeId: r.employee.id, renewalId: r.id, tierKey: `SLA-${r.step}`, severity: 'URGENT', expiryDate: due, title: `[Overdue] ${STEP_LABEL[r.step]}: ${fullName(r.employee)} (${r.employee.employeeNo})`, body: `This renewal step was due on ${dateOnly(due)} for contract ${r.contract.reference}. Complete it so the renewal can stay on schedule.`, link: `/pwm/renewals` },
      [...people].map(([userId, role]) => ({ userId, role })), ['IN_APP'], [r.id, 'sla', r.step, today],
    ));
  }
};

// ── Delivery, retry, acknowledgement ─────────────────────────────────────────

const deliverOne = async (r: PwmReminder): Promise<boolean> => {
  try {
    if (r.channel === 'IN_APP') {
      await notifyUser(r.recipientUserId, { title: r.title, body: r.body, type: 'pwm', data: { link: r.link, reminderId: r.id } });
      return true;
    }
    const u = await prisma.user.findUnique({ where: { id: r.recipientUserId }, select: { email: true, name: true, isActive: true } });
    if (!u?.isActive) throw new Error('Recipient has no active login');
    return await sendPwmReminderEmail(u.email, u.name, r.title, r.body, r.link ?? undefined);
  } catch (err) {
    await prisma.pwmReminder.update({ where: { id: r.id }, data: { lastError: (err as Error).message.slice(0, 300) } }).catch(() => undefined);
    return false;
  }
};

export const deliverDue = async (now: Date, out: EngineResult): Promise<void> => {
  const due = await prisma.pwmReminder.findMany({
    where: { status: { in: ['QUEUED', 'FAILED'] }, nextAttemptAt: { lte: now } },
    orderBy: { scheduledFor: 'asc' }, take: MAX_PER_RUN,
  });
  const hrAdmins = due.length ? await hrAdminUserIds() : [];
  for (const r of due) {
    const ok = await deliverOne(r);
    const attempts = r.attempts + 1;
    if (ok) {
      await prisma.pwmReminder.update({ where: { id: r.id }, data: { status: r.channel === 'IN_APP' ? 'DELIVERED' : 'SENT', sentAt: now, attempts, nextAttemptAt: null, lastError: null } });
      out.delivered++;
      continue;
    }
    const delay = retryDelay(attempts);
    await prisma.pwmReminder.update({ where: { id: r.id }, data: { status: 'FAILED', attempts, nextAttemptAt: delay === null ? null : new Date(now.getTime() + delay * 60_000) } });
    out.failed++;
    if (delay === null) {
      // Out of retries: tell HR, so a missed reminder is never silent (REM-09).
      await insertReminders(fanOut(
        { kind: 'CONFIG_GAP', contractId: r.contractId, employeeId: r.employeeId, tierKey: 'DELIVERY_FAILED', severity: 'URGENT', title: `Reminder could not be delivered by ${r.channel === 'EMAIL' ? 'email' : 'app'}`, body: `"${r.title}" failed after ${attempts} attempts. Check the recipient's contact details or resend it from Automated Reminders.`, link: '/pwm/reminders' },
        hrAdmins.map((id) => ({ userId: id, role: 'HR_ADMIN' })), ['IN_APP'], [r.id, 'delivery-failed'],
      ));
    }
  }
};

/** Action-required reminders nobody acknowledged within the window go to the next level (REM-10). */
const escalateUnacknowledged = async (now: Date, cfg: PwmConfig, out: EngineResult): Promise<void> => {
  const cutoff = new Date(now.getTime() - cfg.ackEscalationHours * 3_600_000);
  const stale = await prisma.pwmReminder.findMany({
    where: { requiresAck: true, acknowledgedAt: null, escalatedAt: null, status: { in: ['SENT', 'DELIVERED'] }, sentAt: { lte: cutoff }, channel: 'IN_APP', kind: { in: ['CONTRACT_EXPIRY', 'RENEWAL_SLA'] }, NOT: { tierKey: { startsWith: 'ESC-' } } },
    include: { contract: { select: { decisionRecordedAt: true, archivedAt: true } } },
    take: 200,
  });
  if (!stale.length) return;
  const [hrAdmins, management] = await Promise.all([hrAdminUserIds(), managementUserIds()]);
  for (const r of stale) {
    if (r.contract?.decisionRecordedAt || r.contract?.archivedAt) { await prisma.pwmReminder.update({ where: { id: r.id }, data: { escalatedAt: now } }); continue; }
    const to = new Map<string, string>();
    [...hrAdmins, ...management].filter((id) => id !== r.recipientUserId).forEach((id) => to.set(id, 'ESCALATION'));
    const rec = await prisma.user.findUnique({ where: { id: r.recipientUserId }, select: { name: true } });
    await insertReminders(fanOut(
      { kind: r.kind, contractId: r.contractId, employeeId: r.employeeId, renewalId: r.renewalId, tierKey: `ESC-${r.tierKey}`, severity: 'URGENT', expiryDate: r.expiryDate, title: `[Not acknowledged] ${r.title}`, body: `${rec?.name ?? 'The recipient'} has not acknowledged this reminder within ${cfg.ackEscalationHours} hours. ${r.body}`, link: r.link },
      [...to].map(([userId, role]) => ({ userId, role })), ['IN_APP', 'EMAIL'], [r.id, 'escalation'],
    ));
    await prisma.pwmReminder.update({ where: { id: r.id }, data: { escalatedAt: now } });
    out.escalated++;
  }
};

// ── Entry point ──────────────────────────────────────────────────────────────

export const HEARTBEAT_ID = 'engine';

/**
 * One engine pass. Evaluation runs from the configured send hour (default 08:00 Lagos) and again every hour
 * after it, which is also how a missed window is caught up after an outage; delivery and retries run every pass.
 */
export const runReminderEngine = async (now = new Date(), opts: { force?: boolean } = {}): Promise<EngineResult> => {
  const cfg = await getPwmConfig();
  const out: EngineResult = { ranAt: now.toISOString(), evaluatedContracts: 0, remindersCreated: 0, delivered: 0, failed: 0, escalated: 0, expiredFlagged: 0, renewalsOpened: 0 };
  try {
    if (opts.force || lagosHour(now) >= cfg.sendHour) {
      await evaluateContracts(now, cfg, out);
      await evaluateProbation(now, cfg, out);
      await evaluateDocuments(now, cfg, out);
      await evaluateRenewalSla(now, out);
    }
    await deliverDue(now, out);
    await escalateUnacknowledged(now, cfg, out);
    await prisma.pwmSettings.upsert({ where: { id: HEARTBEAT_ID }, create: { id: HEARTBEAT_ID, config: { lastRunAt: out.ranAt, ok: true, result: out } as unknown as Prisma.InputJsonValue }, update: { config: { lastRunAt: out.ranAt, ok: true, result: out } as unknown as Prisma.InputJsonValue } });
    return out;
  } catch (err) {
    await prisma.pwmSettings.upsert({ where: { id: HEARTBEAT_ID }, create: { id: HEARTBEAT_ID, config: { lastRunAt: out.ranAt, ok: false, error: (err as Error).message } }, update: { config: { lastRunAt: out.ranAt, ok: false, error: (err as Error).message } } }).catch(() => undefined);
    throw err;
  }
};

