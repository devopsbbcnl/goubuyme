import {
  SmoisAccess, can, canMoveManually, canRecordPublish, canSchedule, detectConflicts, isMaterialChange, isOverdue,
  needsBypass, occurrenceDue, qualityWarnings, reviewTarget, roleDefaults, statusAfterMaterialEdit, submitTarget, taskMoveAllowed,
} from '../workflow';
import { resolvePeriod } from '../period';

const acc = (level: SmoisAccess['level'], extra: Partial<SmoisAccess> = {}): SmoisAccess => ({
  userId: 'u', memberId: level === 'SUPER' ? null : 'm', level, canApprove: false, canPublish: false, canEmergencyPublish: false, canConnectAccounts: false, ...extra,
});

describe('capabilities', () => {
  it('super admin can do everything', () => {
    for (const c of ['createContent', 'approve', 'publish', 'manageTasks', 'manageAccounts', 'manageTeam', 'configure', 'viewAll', 'viewActivity'] as const) {
      expect(can(acc('SUPER'), c)).toBe(true);
    }
  });

  it('a manager can write and complete work but not approve, assign or connect accounts by default', () => {
    const m = acc('MANAGER', roleDefaults('MANAGER'));
    expect(can(m, 'createContent')).toBe(true);
    expect(can(m, 'completeTasks')).toBe(true);
    expect(can(m, 'approve')).toBe(false);
    expect(can(m, 'publish')).toBe(false);
    expect(can(m, 'manageTasks')).toBe(false);
    expect(can(m, 'manageAccounts')).toBe(false);
    expect(can(m, 'viewAll')).toBe(false);
    expect(can(m, 'manageTeam')).toBe(false);
  });

  it('publishing is configurable per manager', () => {
    expect(can(acc('MANAGER', { canPublish: true }), 'publish')).toBe(true);
  });

  it('reviewers approve but cannot create content or see the activity log', () => {
    const r = acc('REVIEWER', roleDefaults('REVIEWER'));
    expect(can(r, 'approve')).toBe(true);
    expect(can(r, 'createContent')).toBe(false);
    expect(can(r, 'publish')).toBe(false);
    expect(can(r, 'viewActivity')).toBe(false);
  });

  it('read-only users can view everything and change nothing, even with stray switches', () => {
    const v = acc('VIEWER', { canApprove: true, canPublish: true });
    expect(can(v, 'viewAll')).toBe(true);
    expect(can(v, 'approve')).toBe(false);
    expect(can(v, 'publish')).toBe(false);
    expect(can(v, 'createContent')).toBe(false);
    expect(can(v, 'manageTasks')).toBe(false);
  });

  it('management can connect accounts only when granted', () => {
    expect(can(acc('MANAGEMENT', roleDefaults('MANAGEMENT')), 'manageAccounts')).toBe(false);
    expect(can(acc('MANAGEMENT', { canConnectAccounts: true }), 'manageAccounts')).toBe(true);
    expect(can(acc('MANAGEMENT'), 'manageTeam')).toBe(false);
  });
});

describe('content workflow', () => {
  it('submit goes to review, or back to review after a revision', () => {
    expect(submitTarget('IN_PRODUCTION')).toBe('SUBMITTED');
    expect(submitTarget('REVISION_REQUESTED')).toBe('RESUBMITTED');
    expect(submitTarget('APPROVED')).toBeNull();
    expect(submitTarget('PUBLISHED')).toBeNull();
  });

  it('only submitted or resubmitted work can be reviewed', () => {
    expect(reviewTarget('SUBMITTED', 'APPROVED')).toBe('APPROVED');
    expect(reviewTarget('RESUBMITTED', 'REVISION_REQUESTED')).toBe('REVISION_REQUESTED');
    expect(reviewTarget('IN_PRODUCTION', 'APPROVED')).toBeNull();
    expect(reviewTarget('APPROVED', 'REJECTED')).toBeNull();
  });

  it('unapproved content cannot be scheduled or recorded as published when approval is mandatory', () => {
    expect(canSchedule('IN_PRODUCTION', true)).toBe(false);
    expect(canSchedule('SUBMITTED', true)).toBe(false);
    expect(canSchedule('APPROVED', true)).toBe(true);
    expect(canRecordPublish('SUBMITTED', true)).toBe(false);
    expect(canRecordPublish('SCHEDULED', true)).toBe(true);
  });

  it('with approval switched off, drafts can be scheduled, but work under review cannot skip its review', () => {
    expect(canSchedule('IN_PRODUCTION', false)).toBe(true);
    expect(canSchedule('SUBMITTED', false)).toBe(false);
  });

  it('only unapproved states need an emergency bypass', () => {
    expect(needsBypass('SUBMITTED')).toBe(true);
    expect(needsBypass('IN_PRODUCTION')).toBe(true);
    expect(needsBypass('APPROVED')).toBe(false);
    expect(needsBypass('PUBLISHED')).toBe(false);
  });

  it('finished content only moves to the archive', () => {
    expect(canMoveManually('PUBLISHED', 'ARCHIVED')).toBe(true);
    expect(canMoveManually('PUBLISHED', 'IN_PRODUCTION')).toBe(false);
    expect(canMoveManually('SCHEDULED', 'CANCELLED')).toBe(true);
    expect(canMoveManually('SUBMITTED', 'APPROVED')).toBe(false); // must go through review
  });

  it('a material edit after approval returns the item to review; reviewed items stay put', () => {
    expect(statusAfterMaterialEdit('APPROVED')).toBe('RESUBMITTED');
    expect(statusAfterMaterialEdit('SCHEDULED')).toBe('RESUBMITTED');
    expect(statusAfterMaterialEdit('SUBMITTED')).toBe('SUBMITTED');
    expect(statusAfterMaterialEdit('IN_PRODUCTION')).toBe('IN_PRODUCTION');
  });

  const base = { caption: 'Hello world', hashtags: ['a'], mentions: [], mediaUrls: [{ url: 'https://x/y.jpg' }], linkUrl: null, accountId: 'acc1' };
  it('detects what counts as a material change', () => {
    expect(isMaterialChange(base, { ...base })).toBe(false);
    expect(isMaterialChange(base, { ...base, caption: '  Hello world ' })).toBe(false);
    expect(isMaterialChange(base, { ...base, caption: 'Hello there' })).toBe(true);
    expect(isMaterialChange(base, { ...base, hashtags: ['a', 'b'] })).toBe(true);
    expect(isMaterialChange(base, { ...base, mediaUrls: [] })).toBe(true);
    expect(isMaterialChange(base, { ...base, linkUrl: 'https://z' })).toBe(true);
    expect(isMaterialChange(base, { ...base, accountId: 'acc2' })).toBe(true);
  });

  it('warns about platform limits and missing media', () => {
    const long = 'x'.repeat(300);
    expect(qualityWarnings('X', { caption: long, hashtags: [], mediaUrls: [], linkUrl: null }, 'TEXT').join(' ')).toMatch(/280/);
    expect(qualityWarnings('INSTAGRAM', { caption: 'hi', hashtags: [], mediaUrls: [], linkUrl: null }, 'IMAGE').join(' ')).toMatch(/no media/);
    expect(qualityWarnings('INSTAGRAM', { caption: 'hi', hashtags: [], mediaUrls: [{ url: 'u' }], linkUrl: null }, 'IMAGE')).toEqual([]);
  });
});

describe('calendar conflicts', () => {
  const now = new Date('2026-11-05T09:00:00Z');
  const at = (h: number, m = 0) => new Date(`2026-11-06T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`);
  const item = (id: string, over: Partial<Parameters<typeof detectConflicts>[0][number]> = {}) =>
    ({ id, accountId: 'a1', status: 'APPROVED' as const, caption: `Caption number ${id} is unique`, at: at(10), ...over });

  it('flags the same caption on the same account but not across accounts', () => {
    const same = detectConflicts([item('1', { caption: 'Big sale this weekend only' }), item('2', { caption: 'big  sale this weekend ONLY', at: at(14) })], now, 30);
    expect(same.some((c) => c.type === 'DUPLICATE')).toBe(true);
    const other = detectConflicts([item('1', { caption: 'Big sale this weekend only' }), item('2', { accountId: 'a2', caption: 'Big sale this weekend only', at: at(14) })], now, 30);
    expect(other.some((c) => c.type === 'DUPLICATE')).toBe(false);
  });

  it('flags posts closer than the minimum gap on one account only', () => {
    expect(detectConflicts([item('1'), item('2', { at: at(10, 10) })], now, 30).some((c) => c.type === 'TOO_CLOSE')).toBe(true);
    expect(detectConflicts([item('1'), item('2', { at: at(11) })], now, 30).some((c) => c.type === 'TOO_CLOSE')).toBe(false);
    expect(detectConflicts([item('1'), item('2', { accountId: 'a2', at: at(10, 10) })], now, 30).some((c) => c.type === 'TOO_CLOSE')).toBe(false);
  });

  it('flags past dates and unapproved posts going out within 24 hours', () => {
    expect(detectConflicts([item('1', { at: new Date('2026-11-04T10:00:00Z') })], now, 30).some((c) => c.type === 'PAST_DATE')).toBe(true);
    expect(detectConflicts([item('1', { status: 'IN_PRODUCTION', at: at(6) })], now, 30).some((c) => c.type === 'UNAPPROVED_SCHEDULED')).toBe(true);
    expect(detectConflicts([item('1', { status: 'APPROVED', at: at(6) })], now, 30).some((c) => c.type === 'UNAPPROVED_SCHEDULED')).toBe(false);
  });

  it('ignores cancelled, published and archived items', () => {
    const out = detectConflicts([item('1', { status: 'CANCELLED', at: new Date('2026-11-01T00:00:00Z') }), item('2', { status: 'PUBLISHED', at: new Date('2026-11-01T00:00:00Z') })], now, 30);
    expect(out).toEqual([]);
  });
});

describe('recurring tasks', () => {
  // 2026-11-05 is a Thursday (Lagos).
  const thu = new Date('2026-11-05T08:00:00Z');
  it('daily rules are always due, keyed by the Lagos date', () => {
    expect(occurrenceDue({ recurrence: 'DAILY', dayOfWeek: null, dayOfMonth: null }, thu)).toBe('2026-11-05');
  });
  it('uses Lagos time around midnight UTC', () => {
    expect(occurrenceDue({ recurrence: 'DAILY', dayOfWeek: null, dayOfMonth: null }, new Date('2026-11-05T23:30:00Z'))).toBe('2026-11-06');
  });
  it('weekly rules fire only on their weekday', () => {
    expect(occurrenceDue({ recurrence: 'WEEKLY', dayOfWeek: 4, dayOfMonth: null }, thu)).toBe('2026-11-05');
    expect(occurrenceDue({ recurrence: 'WEEKLY', dayOfWeek: 1, dayOfMonth: null }, thu)).toBeNull();
  });
  it('monthly rules fire only on their day', () => {
    expect(occurrenceDue({ recurrence: 'MONTHLY', dayOfWeek: null, dayOfMonth: 5 }, thu)).toBe('2026-11-05');
    expect(occurrenceDue({ recurrence: 'MONTHLY', dayOfWeek: null, dayOfMonth: 6 }, thu)).toBeNull();
  });
});

describe('tasks', () => {
  it('assignees can accept, start and submit but not self-approve; managers review', () => {
    expect(taskMoveAllowed('PENDING', 'ACCEPTED', 'assignee')).toBe(true);
    expect(taskMoveAllowed('IN_PROGRESS', 'SUBMITTED', 'assignee')).toBe(true);
    expect(taskMoveAllowed('SUBMITTED', 'COMPLETED', 'assignee')).toBe(false);
    expect(taskMoveAllowed('SUBMITTED', 'COMPLETED', 'manager')).toBe(true);
    expect(taskMoveAllowed('SUBMITTED', 'REVISION_REQUIRED', 'manager')).toBe(true);
    expect(taskMoveAllowed('PENDING', 'COMPLETED', 'manager')).toBe(false);
  });

  it('overdue excludes finished work and open work with no deadline', () => {
    const now = new Date('2026-11-05T12:00:00Z');
    const past = new Date('2026-11-05T10:00:00Z');
    expect(isOverdue({ status: 'IN_PROGRESS', deadline: past }, now)).toBe(true);
    expect(isOverdue({ status: 'COMPLETED', deadline: past }, now)).toBe(false);
    expect(isOverdue({ status: 'CANCELLED', deadline: past }, now)).toBe(false);
    expect(isOverdue({ status: 'PENDING', deadline: null }, now)).toBe(false);
  });
});

describe('periods (Lagos time)', () => {
  const now = new Date('2026-11-05T08:00:00Z'); // Thursday
  it('today and yesterday', () => {
    const t = resolvePeriod('today', now);
    expect(t.from.toISOString()).toBe('2026-11-04T23:00:00.000Z');
    expect(t.to.toISOString()).toBe('2026-11-05T22:59:59.999Z');
    expect(resolvePeriod('yesterday', now).to.toISOString()).toBe('2026-11-04T22:59:59.999Z');
  });
  it('weeks start on Monday', () => {
    expect(resolvePeriod('week', now).from.toISOString()).toBe('2026-11-01T23:00:00.000Z'); // Mon 2 Nov, 00:00 Lagos
    expect(resolvePeriod('lastWeek', now).from.toISOString()).toBe('2026-10-25T23:00:00.000Z');
  });
  it('months, quarters and years', () => {
    expect(resolvePeriod('month', now).from.toISOString()).toBe('2026-10-31T23:00:00.000Z');
    expect(resolvePeriod('lastMonth', now).from.toISOString()).toBe('2026-09-30T23:00:00.000Z');
    expect(resolvePeriod('quarter', now).from.toISOString()).toBe('2026-09-30T23:00:00.000Z'); // Q4 starts 1 Oct
    expect(resolvePeriod('lastQuarter', now).from.toISOString()).toBe('2026-06-30T23:00:00.000Z');
    expect(resolvePeriod('year', now).from.toISOString()).toBe('2025-12-31T23:00:00.000Z');
    expect(resolvePeriod('lastYear', now).to.toISOString()).toBe('2025-12-31T22:59:59.999Z');
  });
  it('January looks back into the previous year', () => {
    const jan = new Date('2027-01-10T08:00:00Z');
    expect(resolvePeriod('lastMonth', jan).from.toISOString()).toBe('2026-11-30T23:00:00.000Z');
    expect(resolvePeriod('lastQuarter', jan).from.toISOString()).toBe('2026-09-30T23:00:00.000Z');
  });
});
