import {
  addDays, addMonths, buildExpiryMessage, can, checkTransition, daysBetween, dueTiers, durationBetween, expiryBucket, isLockedForEdit,
  maskValue, normalisePhone, pickTierToSend, PwmAccess, rangesOverlap, renewalDueDates, resolveRecipients, retryDelay, slaState,
  validateContractDates, workingDaysBetween, DEFAULT_TIERS, RecipientContext,
} from '../rules';

const access = (level: PwmAccess['level'], over: Partial<PwmAccess> = {}): PwmAccess =>
  ({ userId: 'u', memberId: 'm', level, isMd: false, canViewCompensation: false, employeeId: null, headedDepartmentIds: [], ...over });

describe('dates', () => {
  it('counts calendar days and working days', () => {
    expect(daysBetween('2026-12-01', '2026-12-31')).toBe(30);
    expect(daysBetween('2026-12-31', '2026-12-01')).toBe(-30);
    expect(workingDaysBetween('2026-12-04', '2026-12-08')).toBe(2); // Fri -> Tue: Mon, Tue
    expect(workingDaysBetween('2026-12-04', '2026-12-08', ['2026-12-07'])).toBe(1);
  });
  it('adds days and months without overflowing month ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-06-15', 6)).toBe('2026-12-15');
  });
  it('measures a contract duration inclusively', () => {
    expect(durationBetween('2026-01-01', '2026-12-31')).toEqual({ years: 1, months: 0, days: 0 });
    expect(durationBetween('2026-01-15', '2026-07-14')).toEqual({ years: 0, months: 6, days: 0 });
  });
});

describe('status transitions', () => {
  it('allows the matrix moves and says who approves', () => {
    expect(checkTransition('ACTIVE', 'ON_LEAVE')).toMatchObject({ ok: true, needsApproval: false });
    expect(checkTransition('ACTIVE', 'TERMINATED')).toMatchObject({ ok: true, needsApproval: true });
    expect(checkTransition('ACTIVE', 'SUSPENDED')).toMatchObject({ ok: true, needsApproval: true });
  });
  it('rejects moves outside the matrix and direct reactivation of an archived employee', () => {
    expect(checkTransition('ARCHIVED', 'ACTIVE').ok).toBe(false);
    expect(checkTransition('ARCHIVED', 'PENDING_ONBOARDING').reason).toMatch(/Rehire/);
    expect(checkTransition('RESIGNED', 'ACTIVE').ok).toBe(false);
    expect(checkTransition('PENDING_ONBOARDING', 'TERMINATED').ok).toBe(false);
  });
});

describe('contracts', () => {
  it('requires an expiry date for non-permanent types (AC-CON-01)', () => {
    expect(validateContractDates({ contractType: 'FIXED_TERM', commencementDate: '2026-01-01' })).toContain('Expiry date is required for Fixed-term contracts.');
    expect(validateContractDates({ contractType: 'PERMANENT', commencementDate: '2026-01-01' })).toEqual([]);
  });
  it('requires the expiry to follow the start', () => {
    expect(validateContractDates({ contractType: 'FIXED_TERM', commencementDate: '2026-06-01', expiryDate: '2026-06-01' })).toHaveLength(1);
  });
  it('detects overlaps, treating open-ended contracts as running forever', () => {
    expect(rangesOverlap('2026-01-01', '2026-12-31', '2026-12-31', null)).toBe(true);
    expect(rangesOverlap('2026-01-01', '2026-12-31', '2027-01-01', '2027-12-31')).toBe(false);
  });
  it('locks core terms once signed (CON-14)', () => {
    expect(isLockedForEdit('DRAFT')).toBe(false);
    expect(isLockedForEdit('ACTIVE')).toBe(true);
  });
  it('puts contracts in the tracker buckets', () => {
    expect(expiryBucket(-1)).toBe('EXPIRED_ACTION');
    expect(expiryBucket(0)).toBe('TODAY');
    expect(expiryBucket(3)).toBe('D1_3');
    expect(expiryBucket(30)).toBe('D8_30');
    expect(expiryBucket(90)).toBe('D61_90');
    expect(expiryBucket(null)).toBe('NO_EXPIRY');
  });
});

describe('reminder schedule', () => {
  it('has nothing due 31 days out and T-30 due at 30 days', () => {
    expect(dueTiers(31, 0)).toEqual([]);
    expect(dueTiers(30, 0).map((d) => d.key)).toEqual(['T-30']);
  });
  it('sends only the most severe due tier and skips the older ones (catch-up)', () => {
    const due = dueTiers(2, 0); // T-30, T-7, T-3 all reached
    const r = pickTierToSend(due, new Set());
    expect(r.send?.key).toBe('T-3');
    expect(r.skipped.map((d) => d.key)).toEqual(['T-30', 'T-7']);
  });
  it('is idempotent once a tier has a record (AC-REM-01)', () => {
    const r = pickTierToSend(dueTiers(30, 0), new Set(['T-30']));
    expect(r.send).toBeNull();
  });
  it('moves through T0 and T+1 and then repeats T+n every two working days', () => {
    expect(pickTierToSend(dueTiers(0, 0), new Set(['T-30', 'T-7', 'T-3', 'T-1'])).send?.key).toBe('T0');
    expect(pickTierToSend(dueTiers(-1, 1), new Set(['T-30', 'T-7', 'T-3', 'T-1', 'T0'])).send?.key).toBe('T+1');
    const done = new Set(['T-30', 'T-7', 'T-3', 'T-1', 'T0', 'T+1']);
    expect(pickTierToSend(dueTiers(-3, 2), done).send).toBeNull();
    expect(pickTierToSend(dueTiers(-4, 3), done).send?.key).toBe('T+n#1');
    expect(pickTierToSend(dueTiers(-6, 5), new Set([...done, 'T+n#1'])).send?.key).toBe('T+n#2');
  });
  it('honours a changed offset from settings (AC-REM-05)', () => {
    const tiers = DEFAULT_TIERS.map((t) => (t.key === 'T-7' ? { ...t, offsetDays: 10 } : t));
    expect(dueTiers(10, 0, tiers).map((d) => d.key)).toContain('T-7');
    expect(dueTiers(10, 0).map((d) => d.key)).not.toContain('T-7');
  });
  it('backs off 1, 5, 15, 60, 240 minutes then gives up', () => {
    expect([1, 2, 3, 4, 5].map(retryDelay)).toEqual([1, 5, 15, 60, 240]);
    expect(retryDelay(6)).toBeNull();
  });
});

describe('recipients', () => {
  const ctx = (over: Partial<RecipientContext> = {}): RecipientContext => ({
    hrOfficerUserId: 'officer', hrAdminUserIds: ['hra'], deptHeadUserId: 'head', managementUserIds: ['exec'], mdUserIds: ['md'],
    superAdminUserIds: ['sa'], recommendationOutstanding: true, workingDaysAfter: 0, ...over,
  });
  const tier = (k: string) => DEFAULT_TIERS.find((t) => t.key === k)!;

  it('resolves roles to people and dedupes someone who holds two roles', () => {
    const r = resolveRecipients(tier('T-1'), ctx({ managementUserIds: ['exec', 'md'], mdUserIds: ['md'] }));
    const ids = r.people.map((p) => p.userId);
    expect(ids).toEqual(expect.arrayContaining(['officer', 'hra', 'head', 'exec', 'md']));
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('only includes the department head at T-7 while a recommendation is outstanding', () => {
    expect(resolveRecipients(tier('T-7'), ctx({ recommendationOutstanding: false })).people.map((p) => p.userId)).not.toContain('head');
    expect(resolveRecipients(tier('T-7'), ctx()).people.map((p) => p.userId)).toContain('head');
  });
  it('falls back to the HR administrators and reports a gap when a role is empty (REM-13)', () => {
    const r = resolveRecipients(tier('T-3'), ctx({ deptHeadUserId: null, hrOfficerUserId: null }));
    expect(r.gaps).toEqual(expect.arrayContaining(['DEPT_HEAD', 'HR_OFFICER']));
    expect(r.people.map((p) => p.userId)).toContain('hra');
  });
  it('adds the super admin to T+n only after five working days', () => {
    expect(resolveRecipients(tier('T+n'), ctx({ workingDaysAfter: 3 })).people.map((p) => p.userId)).not.toContain('sa');
    expect(resolveRecipients(tier('T+n'), ctx({ workingDaysAfter: 5 })).people.map((p) => p.userId)).toContain('sa');
  });
  it('keeps the employee off the list unless switched on', () => {
    const t = { ...tier('T-30'), recipients: [...tier('T-30').recipients, 'EMPLOYEE' as const] };
    expect(resolveRecipients(t, ctx({ employeeUserId: 'emp' })).people.map((p) => p.userId)).not.toContain('emp');
    expect(resolveRecipients(t, ctx({ employeeUserId: 'emp', employeeRecipientOn: true })).people.map((p) => p.userId)).toContain('emp');
  });
});

describe('messages', () => {
  const m = { employeeName: 'Ada Obi', employeeNo: 'PWM-2026-0042', department: 'Operations', contractRef: 'CTR-2026-000001', contractType: 'Fixed-term', expiryDate: '2026-12-31', daysRemaining: 1, stage: 'Decision pending' };
  it('says employment has not ended at T0 and T+1, and carries no pay data', () => {
    const t0 = buildExpiryMessage('T0', 'CRITICAL', m);
    expect(t0.body).toMatch(/Employment has not been ended/);
    expect(buildExpiryMessage('T+1', 'CRITICAL', m).body).toMatch(/Employment has not been ended/);
    expect(JSON.stringify(t0)).not.toMatch(/salary|₦|NGN/i);
  });
});

describe('renewal schedule', () => {
  it('counts the step due dates back from expiry', () => {
    expect(renewalDueDates('2026-12-31')).toEqual({ recommendation: '2026-12-17', decision: '2026-12-24', preparation: '2026-12-26', issuance: '2026-12-28', signature: '2026-12-30' });
  });
  it('flags overdue and due-soon steps', () => {
    expect(slaState('2026-12-17', '2026-12-18', false)).toBe('OVERDUE');
    expect(slaState('2026-12-17', '2026-12-16', false)).toBe('DUE_SOON');
    expect(slaState('2026-12-17', '2026-12-01', false)).toBe('ON_TRACK');
    expect(slaState('2026-12-17', '2026-12-20', true)).toBe('DONE');
  });
});

describe('permissions', () => {
  it('keeps pay away from HR administrators unless switched on', () => {
    expect(can(access('HR_ADMIN'), 'viewCompensation')).toBe(false);
    expect(can(access('HR_ADMIN', { canViewCompensation: true }), 'viewCompensation')).toBe(true);
    expect(can(access('FINANCE'), 'viewCompensation')).toBe(true);
    expect(can(access('HR_OFFICER'), 'viewCompensation')).toBe(false);
  });
  it('lets only management approve renewals and terminations', () => {
    expect(can(access('EXECUTIVE'), 'decide')).toBe(true);
    expect(can(access('HR_ADMIN'), 'decide')).toBe(false);
    expect(can(access('HR_ADMIN'), 'approveStatus')).toBe(false);
    expect(can(access('DEPARTMENT_HEAD'), 'viewRestricted')).toBe(false);
    expect(can(access('DEPARTMENT_HEAD'), 'recommend')).toBe(true);
  });
  it('keeps the audit reader read-only', () => {
    expect(can(access('AUDITOR'), 'viewAudit')).toBe(true);
    expect(can(access('AUDITOR'), 'manageEmployees')).toBe(false);
  });
});

describe('helpers', () => {
  it('masks sensitive numbers', () => {
    expect(maskValue('12345678901')).toBe('*******8901');
    expect(maskValue('123')).toBe('****');
  });
  it('normalises Nigerian phone numbers', () => {
    expect(normalisePhone('0803 123 4567')).toBe('+2348031234567');
    expect(normalisePhone('2348031234567')).toBe('+2348031234567');
    expect(normalisePhone('+44 7700 900123')).toBe('+447700900123');
    expect(normalisePhone('12345')).toBeNull();
  });
});
