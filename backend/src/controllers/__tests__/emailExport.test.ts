jest.mock('../../config/db', () => ({ __esModule: true, default: {} }));
jest.mock('../../services/broadcast.service', () => ({ audienceWhere: jest.fn() }));

import { csvCell } from '../emailExport.controller';

describe('csvCell', () => {
  it('leaves plain text alone', () => {
    expect(csvCell('ada@example.com')).toBe('ada@example.com');
  });

  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('Mama, Put')).toBe('"Mama, Put"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it('defuses spreadsheet formulas', () => {
    expect(csvCell('=HYPERLINK("http://evil")')).toBe(`"'=HYPERLINK(""http://evil"")"`);
    expect(csvCell('+234 801')).toBe("'+234 801");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('renders null as empty', () => {
    expect(csvCell(null)).toBe('');
  });
});
