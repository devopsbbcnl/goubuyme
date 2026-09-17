// Pipeline helpers: phone matching across number formats, CSV import parsing, stage bookkeeping,
// and linking a new vendor/rider account to its open lead.

jest.mock('../../config/db', () => ({
  __esModule: true,
  default: {
    user: { findUnique: jest.fn() },
    lead: { findFirst: jest.fn(), updateMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    leadActivity: { create: jest.fn() },
  },
}));

import prisma from '../../config/db';
import {
  LeadError, linkLeadForUser, markLeadLiveForUser, parseCsv, parseLeadImport, phoneKey, stageChangeData,
} from '../crm/lead.service';

const db = prisma as unknown as {
  user: { findUnique: jest.Mock };
  lead: { findFirst: jest.Mock; updateMany: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
  leadActivity: { create: jest.Mock };
};

beforeEach(() => jest.clearAllMocks());

describe('phoneKey', () => {
  it('matches local, international and formatted Nigerian numbers', () => {
    expect(phoneKey('08031234567')).toBe('8031234567');
    expect(phoneKey('+234 803 123 4567')).toBe('8031234567');
    expect(phoneKey('2348031234567')).toBe('8031234567');
    expect(phoneKey('12345')).toBeNull();
    expect(phoneKey(null)).toBeNull();
  });
});

describe('parseCsv / parseLeadImport', () => {
  it('handles quotes, embedded commas, escaped quotes and CRLF', () => {
    expect(parseCsv('name,notes\r\n"Mama Put, Rumuola","Said ""call back"""\r\n\r\n')).toEqual([
      ['name', 'notes'],
      ['Mama Put, Rumuola', 'Said "call back"'],
    ]);
  });

  it('maps header aliases, normalizes values and reports bad lines', () => {
    const csv = [
      'Business Name,Owner,Phone Number,Email,City,Category',
      'Chicken Hub,Ada,0803 123 4567,ADA@Example.com,Port Harcourt,restaurant',
      ',Nobody,08000000000,,,',
      'Bad Cat,Obi,08099999999,,Lagos,Spaceships',
      'Bad Mail,Obi,,not-an-email,,',
    ].join('\n');
    const { valid, errors } = parseLeadImport(csv, 'VENDOR');
    expect(valid).toEqual([{
      name: 'Chicken Hub', contactName: 'Ada', phone: '0803 123 4567', email: 'ada@example.com',
      city: 'Port Harcourt', area: null, category: 'RESTAURANT', notes: null,
    }]);
    expect(errors).toEqual([
      { line: 3, message: 'Missing name' },
      { line: 4, message: 'Unknown category "Spaceships"' },
      { line: 5, message: 'Invalid email "not-an-email"' },
    ]);
  });

  it('requires a name column', () => {
    expect(() => parseLeadImport('phone\n0803', 'RIDER')).toThrow(LeadError);
  });
});

describe('stageChangeData', () => {
  const now = new Date('2026-09-17T10:00:00Z');
  it('stamps live/lost timestamps and clears them when reopened', () => {
    expect(stageChangeData('LIVE', now)).toMatchObject({ stage: 'LIVE', liveAt: now, lostAt: null, lostReason: null });
    expect(stageChangeData('LOST', now, 'Too far')).toMatchObject({ lostAt: now, liveAt: null, lostReason: 'Too far' });
    expect(stageChangeData('CONTACTED', now)).toMatchObject({ liveAt: null, lostAt: null, stageChangedAt: now });
  });
});

describe('linkLeadForUser', () => {
  it('links a new vendor to the open lead with the same phone and moves it to onboarding', async () => {
    db.user.findUnique.mockResolvedValue({ id: 'u1', role: 'VENDOR', phone: '+2348031234567', email: 'x@y.com' });
    db.lead.findFirst.mockResolvedValue({ id: 'l1', stage: 'INTERESTED', phoneKey: '8031234567' });
    db.lead.updateMany.mockResolvedValue({ count: 1 });

    await linkLeadForUser('u1');

    expect(db.lead.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ type: 'VENDOR', convertedUserId: null, OR: [{ phoneKey: '8031234567' }, { email: { equals: 'x@y.com', mode: 'insensitive' } }] }),
    }));
    expect(db.lead.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'l1', convertedUserId: null }, data: expect.objectContaining({ convertedUserId: 'u1', stage: 'ONBOARDING' }),
    }));
    expect(db.leadActivity.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: 'CONVERTED', meta: expect.objectContaining({ matchedBy: 'phone' }) }) });
  });

  it('ignores customers and does nothing when another worker already linked the lead', async () => {
    db.user.findUnique.mockResolvedValueOnce({ id: 'c1', role: 'CUSTOMER', phone: '08031234567', email: 'c@y.com' });
    await linkLeadForUser('c1');
    expect(db.lead.findFirst).not.toHaveBeenCalled();

    db.user.findUnique.mockResolvedValueOnce({ id: 'r1', role: 'RIDER', phone: '08031234567', email: null });
    db.lead.findFirst.mockResolvedValue({ id: 'l2', stage: 'NEW', phoneKey: '8031234567' });
    db.lead.updateMany.mockResolvedValue({ count: 0 });
    await linkLeadForUser('r1');
    expect(db.leadActivity.create).not.toHaveBeenCalled();
  });
});

describe('markLeadLiveForUser', () => {
  it('moves the linked lead to LIVE once', async () => {
    db.lead.findUnique.mockResolvedValueOnce({ id: 'l1', stage: 'ONBOARDING' });
    await markLeadLiveForUser('u1');
    expect(db.lead.update).toHaveBeenCalledWith({ where: { id: 'l1' }, data: expect.objectContaining({ stage: 'LIVE' }) });

    db.lead.findUnique.mockResolvedValueOnce({ id: 'l1', stage: 'LIVE' });
    await markLeadLiveForUser('u1');
    expect(db.lead.update).toHaveBeenCalledTimes(1);
  });
});
