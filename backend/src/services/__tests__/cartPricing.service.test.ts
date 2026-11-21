import { priceCartLine, parseSelectionLabel, PriceableItem } from '../cartPricing';

const item: PriceableItem = {
  price: 3800,
  drinkOptions: [{ name: 'Soft drink (can)', price: 500 }, { name: 'Chilled Zobo', price: 800 }],
  optionItems: [{ name: 'Fried plantain', extraPrice: 600 }, { name: 'Hot', extraPrice: 0 }],
};
const plain: PriceableItem = { price: 1200, drinkOptions: [], optionItems: [] };

describe('parseSelectionLabel', () => {
  it('reads plain, ×N and Nx labels', () => {
    expect(parseSelectionLabel('Chilled Zobo')).toEqual({ name: 'Chilled Zobo', qty: 1 });
    expect(parseSelectionLabel('Chilled Zobo ×3')).toEqual({ name: 'Chilled Zobo', qty: 3 });
    expect(parseSelectionLabel('2x Fried plantain')).toEqual({ name: 'Fried plantain', qty: 2 });
    expect(parseSelectionLabel('  ')).toBeNull();
  });
});

describe('priceCartLine with selections', () => {
  it('prices from the menu, not from the client', () => {
    const r = priceCartLine(item, 0, [{ label: 'Chilled Zobo ×2', price: 1 }, { label: 'Hot', price: 999 }]);
    expect(r).toEqual({
      ok: true,
      unitPrice: 3800 + 1600,
      selections: [{ label: 'Chilled Zobo ×2', price: 1600 }, { label: 'Hot', price: 0 }],
    });
  });

  it('ignores a tampered unit price completely', () => {
    const r = priceCartLine(item, 1, [{ label: 'Soft drink (can)', price: 0 }]);
    expect(r).toMatchObject({ ok: true, unitPrice: 4300 });
  });

  it('matches names case-insensitively', () => {
    expect(priceCartLine(item, 0, [{ label: 'fried PLANTAIN' }])).toMatchObject({ ok: true, unitPrice: 4400 });
  });

  it('rejects an option the item does not have', () => {
    const r = priceCartLine(item, 3800, [{ label: 'Free steak' }]);
    expect(r.ok).toBe(false);
  });

  it('rejects bad quantities and shapes', () => {
    expect(priceCartLine(item, 3800, [{ label: 'Chilled Zobo ×0' }]).ok).toBe(false);
    expect(priceCartLine(item, 3800, [{ label: 'Chilled Zobo ×99' }]).ok).toBe(false);
    expect(priceCartLine(item, 3800, 'nope').ok).toBe(false);
    expect(priceCartLine(item, 3800, [{ price: 1 }]).ok).toBe(false);
  });

  it('an empty list means no extras', () => {
    expect(priceCartLine(item, 1, [])).toEqual({ ok: true, unitPrice: 3800, selections: [] });
  });
});

describe('priceCartLine without selections', () => {
  it('never goes below the item price', () => {
    expect(priceCartLine(item, 0, undefined)).toEqual({ ok: true, unitPrice: 3800 });
    expect(priceCartLine(item, -50, undefined)).toEqual({ ok: true, unitPrice: 3800 });
    expect(priceCartLine(item, NaN, undefined)).toEqual({ ok: true, unitPrice: 3800 });
    expect(priceCartLine(item, '1', undefined)).toEqual({ ok: true, unitPrice: 3800 });
  });

  it('keeps a higher client price when the item has extras (it only costs the customer more)', () => {
    expect(priceCartLine(item, 4300, undefined)).toEqual({ ok: true, unitPrice: 4300 });
  });

  it('is exactly the item price when the item has no extras at all', () => {
    expect(priceCartLine(plain, 0, undefined)).toEqual({ ok: true, unitPrice: 1200 });
    expect(priceCartLine(plain, 9999, undefined)).toEqual({ ok: true, unitPrice: 1200 });
  });
});
