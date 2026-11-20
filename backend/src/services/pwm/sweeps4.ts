// Daily work for Phase 4: asset expiries and unacknowledged custody, and deadlines on employee relations cases.
// Reminder text never carries anything about a case beyond its reference.
import prisma from '../../config/db';
import { hrAdminUserIds } from './people';
import { addDays, dateOnly, daysBetween, lagosYmd } from './rules';

const insert = async (rows: { kind: string; employeeId?: string | null; tierKey: string; severity: string; recipientUserId: string; recipientRole: string; key: string; title: string; body: string; link: string }[]): Promise<number> => {
  if (!rows.length) return 0;
  const r = await prisma.pwmReminder.createMany({ data: rows.map((x) => ({ kind: x.kind, employeeId: x.employeeId ?? null, tierKey: x.tierKey, severity: x.severity, recipientUserId: x.recipientUserId, recipientRole: x.recipientRole, channel: 'IN_APP', idempotencyKey: x.key, title: x.title, body: x.body, link: x.link, nextAttemptAt: new Date() })), skipDuplicates: true });
  return r.count;
};

export const assetSweep = async (now = new Date()): Promise<number> => {
  const today = lagosYmd(now);
  const horizon = addDays(today, 30);
  const hr = await hrAdminUserIds();
  const rows: Parameters<typeof insert>[0] = [];
  const assets = await prisma.pwmAsset.findMany({ where: { archivedAt: null, status: { not: 'RETIRED' } }, select: { id: true, tag: true, name: true, warrantyExpiry: true, expiries: true } });
  for (const a of assets) {
    const dates: { label: string; date: string }[] = [...(a.warrantyExpiry ? [{ label: 'Warranty', date: dateOnly(a.warrantyExpiry) }] : []), ...(((a.expiries as { label: string; date: string }[] | null) ?? []))];
    for (const d of dates) {
      if (d.date > horizon) continue;
      const left = daysBetween(today, d.date);
      for (const uid of hr) rows.push({ kind: 'ASSET', tierKey: left < 0 ? 'EXPIRED' : 'EXPIRING', severity: left < 0 ? 'URGENT' : 'ACTION', recipientUserId: uid, recipientRole: 'HR_ADMIN', key: `asset|${a.id}|${d.label}|${d.date}|${left < 0 ? 'x' : 'y'}|${uid}`, title: `${d.label} ${left < 0 ? 'has expired' : `ends in ${left} days`}: ${a.name} (${a.tag})`, body: `${d.label} date ${d.date}. Renew it or update the asset record.`, link: '/pwm/assets' });
    }
  }
  const unack = await prisma.pwmAssetAssignment.findMany({ where: { status: 'ACTIVE', acknowledgedAt: null, assignedAt: { lte: new Date(now.getTime() - 3 * 86_400_000) } }, include: { asset: { select: { tag: true, name: true } }, employee: { select: { userId: true } } }, take: 300 });
  for (const u of unack) if (u.employee.userId) rows.push({ kind: 'ASSET', employeeId: u.employeeId, tierKey: 'ACK', severity: 'ACTION', recipientUserId: u.employee.userId, recipientRole: 'EMPLOYEE', key: `assetack|${u.id}`, title: `Please confirm you received: ${u.asset.name} (${u.asset.tag})`, body: 'Open My HR → My Assets and acknowledge custody.', link: '/my-hr/assets' });
  return insert(rows);
};

export const caseSweep = async (now = new Date()): Promise<number> => {
  const today = lagosYmd(now);
  const open = await prisma.pwmCase.findMany({ where: { stage: { not: 'CLOSED' } }, include: { handlers: { where: { recusedAt: null }, select: { userId: true } } }, take: 500 });
  const rows: Parameters<typeof insert>[0] = [];
  for (const c of open) {
    const items: { tier: string; text: string }[] = [];
    if (c.responseDue && c.stage === 'INTAKE') { const left = daysBetween(today, dateOnly(c.responseDue)); if (left <= 2) items.push({ tier: left < 0 ? 'RESPONSE_OVERDUE' : 'RESPONSE_DUE', text: left < 0 ? 'The response deadline has passed' : `A response is due in ${left} day${left === 1 ? '' : 's'}` }); }
    if (c.hearingAt && c.stage === 'HEARING') { const left = daysBetween(today, lagosYmd(c.hearingAt)); if (left >= 0 && left <= 2) items.push({ tier: 'HEARING_SOON', text: left === 0 ? 'A hearing is today' : `A hearing is in ${left} day${left === 1 ? '' : 's'}` }); }
    if (c.appealDue && c.stage === 'OUTCOME') { const left = daysBetween(today, dateOnly(c.appealDue)); if (left < 0) items.push({ tier: 'APPEAL_ENDED', text: 'The appeal period has ended; the case can be closed' }); }
    for (const it of items) for (const h of c.handlers) rows.push({ kind: 'CASE', tierKey: it.tier, severity: 'ACTION', recipientUserId: h.userId, recipientRole: 'CASE_HANDLER', key: `case|${c.id}|${it.tier}|${today}|${h.userId}`, title: `Case ${c.reference}: ${it.text}`, body: 'Open Employee Relations to act.', link: '/pwm/cases' });
  }
  return insert(rows);
};

