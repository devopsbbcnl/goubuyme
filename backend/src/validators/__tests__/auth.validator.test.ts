// Signup payload rules for the logistics-company role and vendor branches.
import { registerSchema } from '../auth.validator';

const base = { name: 'Ada Obi', email: 'ada@example.com', password: 'Str0ng!pass' };

const company = {
  ...base,
  role: 'LOGISTICS_COMPANY',
  companyName: 'Swift Riders Ltd',
  address: '12 Aba Road',
  city: 'Port Harcourt',
  state: 'Rivers',
};

const vendor = {
  ...base,
  role: 'VENDOR',
  commissionTier: 'TIER_1',
  businessName: 'Mama Put',
  category: 'RESTAURANT',
  address: '1 Main St',
  city: 'Port Harcourt',
  state: 'Rivers',
};

const branch = { name: 'Rumuola', address: '5 Rumuola Rd', city: 'Port Harcourt' };

describe('registerSchema: logistics company', () => {
  it('accepts a company signup', () => {
    expect(registerSchema.validate(company).error).toBeUndefined();
  });

  it('requires a company name', () => {
    const { companyName, ...rest } = company;
    expect(companyName).toBeDefined();
    expect(registerSchema.validate(rest).error).toBeDefined();
  });

  it('rejects rider-only fields on a company', () => {
    expect(registerSchema.validate({ ...company, vehicleType: 'Bike' }).error).toBeDefined();
  });

  it('rejects company fields on other roles', () => {
    expect(registerSchema.validate({ ...vendor, companyName: 'X Co' }).error).toBeDefined();
  });
});

describe('registerSchema: vendor branches', () => {
  it('accepts a vendor with no branches', () => {
    expect(registerSchema.validate(vendor).error).toBeUndefined();
  });

  it('accepts a vendor with branches', () => {
    expect(registerSchema.validate({ ...vendor, branches: [branch, { ...branch, name: 'GRA', phone: '08031234567' }] }).error).toBeUndefined();
  });

  it('rejects more than 10 branches', () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ ...branch, name: `Branch ${i}` }));
    expect(registerSchema.validate({ ...vendor, branches: many }).error).toBeDefined();
  });

  it('rejects a branch missing its address', () => {
    expect(registerSchema.validate({ ...vendor, branches: [{ name: 'Rumuola', city: 'Port Harcourt' }] }).error).toBeDefined();
  });

  it('rejects a malformed branch phone', () => {
    expect(registerSchema.validate({ ...vendor, branches: [{ ...branch, phone: '12ab' }] }).error).toBeDefined();
  });

  it('rejects branches on a non-vendor', () => {
    expect(registerSchema.validate({ ...company, branches: [branch] }).error).toBeDefined();
  });
});
