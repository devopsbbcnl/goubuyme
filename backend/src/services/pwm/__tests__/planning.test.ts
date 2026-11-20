import { staffingGap, successionRisk } from '../rules';

describe('staffingGap', () => {
  it('is short when under plan and keeps hiring in progress separate', () => {
    expect(staffingGap({ planned: 5, actual: 3, openVacancies: 1 })).toEqual({ gap: 2, toRecruit: 1, state: 'SHORT' });
  });
  it('never asks to recruit more than the gap', () => {
    expect(staffingGap({ planned: 3, actual: 3, openVacancies: 2 })).toEqual({ gap: 0, toRecruit: 0, state: 'ON_PLAN' });
  });
  it('flags over plan', () => {
    expect(staffingGap({ planned: 2, actual: 4, openVacancies: 0 }).state).toBe('OVER');
  });
});

describe('successionRisk', () => {
  it('is exposed with nobody named', () => expect(successionRisk('LOW', [])).toBe('EXPOSED'));
  it('is exposed for a critical seat with only future-ready people', () => expect(successionRisk('HIGH', [{ readiness: 'ONE_TO_TWO_YEARS' }])).toBe('EXPOSED'));
  it('is thin for a non-critical seat with no one ready now', () => expect(successionRisk('MEDIUM', [{ readiness: 'THREE_PLUS_YEARS' }])).toBe('THIN'));
  it('is thin for a critical seat with a single ready successor', () => expect(successionRisk('HIGH', [{ readiness: 'READY_NOW' }])).toBe('THIN'));
  it('is covered with two ready, or one ready on a non-critical seat', () => {
    expect(successionRisk('HIGH', [{ readiness: 'READY_NOW' }, { readiness: 'READY_NOW' }])).toBe('COVERED');
    expect(successionRisk('LOW', [{ readiness: 'READY_NOW' }])).toBe('COVERED');
  });
});
