import { normalizeState, sameState, vendorStateFilter, NIGERIA_STATES } from '../nigeriaStates';

describe('normalizeState', () => {
  it('accepts canonical names and common spellings', () => {
    expect(normalizeState('Rivers')).toBe('Rivers');
    expect(normalizeState('rivers state')).toBe('Rivers');
    expect(normalizeState('  imo ')).toBe('Imo');
    expect(normalizeState('Akwa Ibom State')).toBe('Akwa Ibom');
    expect(normalizeState('Cross-River')).toBe('Cross River');
  });

  it('maps every FCT spelling to FCT', () => {
    for (const s of ['FCT', 'Abuja', 'Federal Capital Territory', 'FCT, Abuja']) {
      expect(normalizeState(s)).toBe('FCT');
    }
  });

  it('returns null for anything that is not a Nigerian state', () => {
    expect(normalizeState('Texas')).toBeNull();
    expect(normalizeState('')).toBeNull();
    expect(normalizeState(null)).toBeNull();
    expect(normalizeState('Nigeria')).toBeNull();
  });

  it('knows all 36 states plus the FCT', () => {
    expect(NIGERIA_STATES).toHaveLength(37);
  });
});

describe('sameState', () => {
  it('compares after normalising', () => {
    expect(sameState('Imo', 'imo')).toBe(true);
    expect(sameState('Abuja', 'FCT')).toBe(true);
    expect(sameState('Lagos', 'Ogun')).toBe(false);
  });

  it('never treats unknown or missing values as equal', () => {
    expect(sameState(null, null)).toBe(false);
    expect(sameState('Nowhere', 'Nowhere')).toBe(false);
  });
});

describe('vendorStateFilter', () => {
  it('is empty when no state is asked for', () => {
    expect(vendorStateFilter(undefined)).toEqual({});
  });

  it('matches stored spellings case-insensitively', () => {
    const f = vendorStateFilter('Rivers State') as { OR: Array<{ state: { equals: string } }> };
    expect(f.OR.map((c) => c.state.equals)).toEqual(expect.arrayContaining(['Rivers', 'Rivers State']));
  });

  it('includes legacy FCT spellings', () => {
    const f = vendorStateFilter('abuja') as { OR: Array<{ state: { equals: string } }> };
    expect(f.OR.map((c) => c.state.equals)).toEqual(expect.arrayContaining(['FCT', 'Abuja', 'Federal Capital Territory']));
  });

  it('matches nothing, not everything, for an unknown state', () => {
    expect(vendorStateFilter('Texas')).toEqual({ id: '__no_such_state__' });
  });
});
