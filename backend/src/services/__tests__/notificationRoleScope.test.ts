jest.mock('../../config/db', () => ({ __esModule: true, default: {} }));
jest.mock('../../utils/recordError', () => ({ recordError: jest.fn() }));

import { roleScope } from '../notification.service';

describe('roleScope', () => {
  it.each(['CUSTOMER', 'VENDOR', 'RIDER'])('%s sees its own notifications plus the every-role ones', (role) => {
    expect(roleScope(role)).toEqual({ OR: [{ role: null }, { role }] });
  });

  it('does not narrow staff, who have a single experience', () => {
    expect(roleScope('SUPER_ADMIN')).toEqual({});
    expect(roleScope('LOGISTICS_COMPANY')).toEqual({});
  });
});
