const findUnique = jest.fn();
const findMany = jest.fn();
jest.mock('../../config/db', () => ({
  __esModule: true,
  default: { user: { findUnique: (...a: unknown[]) => findUnique(...a) }, vendor: { findMany: (...a: unknown[]) => findMany(...a) } },
}));

import { isReviewer, reviewVendorFilter, isHiddenFromViewer, reviewVendorIds, __testing } from '../reviewAccess';

const setEnv = (slugs?: string, emails?: string) => {
  if (slugs === undefined) delete process.env.REVIEW_VENDOR_SLUGS; else process.env.REVIEW_VENDOR_SLUGS = slugs;
  if (emails === undefined) delete process.env.REVIEWER_EMAILS; else process.env.REVIEWER_EMAILS = emails;
};

beforeEach(() => {
  findUnique.mockReset();
  findMany.mockReset();
  __testing.clearCache();
  setEnv(undefined, undefined);
});
afterAll(() => setEnv(undefined, undefined));

describe('review-only vendor access', () => {
  it('hides nothing when no review vendor is configured', async () => {
    expect(await reviewVendorFilter({ userId: 'u1' })).toEqual({});
    expect(await isHiddenFromViewer('savour-naija-kitchen', undefined)).toBe(false);
    expect(await reviewVendorIds()).toEqual([]);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('hides the vendor from guests and from ordinary customers', async () => {
    setEnv('Savour-Naija-Kitchen', 'reviewer@x.com');
    expect(await reviewVendorFilter(undefined)).toEqual({ slug: { notIn: ['savour-naija-kitchen'] } });
    findUnique.mockResolvedValue({ email: 'someone@else.com' });
    expect(await reviewVendorFilter({ userId: 'u2' })).toEqual({ slug: { notIn: ['savour-naija-kitchen'] } });
    expect(await isHiddenFromViewer('savour-naija-kitchen', { userId: 'u2' })).toBe(true);
  });

  it('shows the vendor to a reviewer login (case-insensitive) and caches the lookup', async () => {
    setEnv('savour-naija-kitchen', 'Reviewer@X.com, vendor@storedemo.gobuyme.ng');
    findUnique.mockResolvedValue({ email: 'REVIEWER@x.com' });
    expect(await reviewVendorFilter({ userId: 'u3' })).toEqual({});
    expect(await isReviewer('u3')).toBe(true);
    expect(await isHiddenFromViewer('savour-naija-kitchen', { userId: 'u3' })).toBe(false);
    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it('does not hide other vendors', async () => {
    setEnv('savour-naija-kitchen', 'reviewer@x.com');
    expect(await isHiddenFromViewer('some-real-vendor', undefined)).toBe(false);
  });

  it('looks up vendor ids by slug for filters that are not on the vendor table', async () => {
    setEnv('savour-naija-kitchen', undefined);
    findMany.mockResolvedValue([{ id: 'v1' }]);
    expect(await reviewVendorIds()).toEqual(['v1']);
    expect(findMany).toHaveBeenCalledWith({ where: { slug: { in: ['savour-naija-kitchen'] } }, select: { id: true } });
  });
});
