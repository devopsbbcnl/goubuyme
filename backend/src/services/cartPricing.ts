/**
 * Server-side pricing of a cart line.
 *
 * The apps send `unitPrice` (item + chosen drinks/options) and `selections` with every add-to-cart.
 * Neither can be trusted: a client can send any number. The unit price that is stored, charged and
 * paid out on is therefore worked out here from the menu, never copied from the request.
 *
 * - With `selections`: each one must name a real drink option or option item of this menu item
 *   (optionally with a quantity, "Coke ×2"). The unit price is the item price plus the SERVER's
 *   price for each, and the stored selections carry the server's prices.
 * - Without `selections`: the line can cost no less than the item price. (The client's number is
 *   only kept when it is higher, which only ever costs the customer more.)
 */

export interface PriceableItem {
  price: number;
  drinkOptions: { name: string; price: number }[];
  optionItems: { name: string; extraPrice: number }[];
}

export type PricedSelection = {
  label: string;
  price: number;
};

export type PricedLine =
  | { ok: true; unitPrice: number; selections?: PricedSelection[] }
  | { ok: false; message: string };

const MAX_PER_OPTION = 20;
const MAX_SELECTIONS = 40;
const round2 = (n: number) => Math.round(n * 100) / 100;
const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/** "Coke", "Coke ×2" (mobile) and "2x Coke" (older web labels) → name + quantity. */
export function parseSelectionLabel(label: string): { name: string; qty: number } | null {
  const t = label.trim();
  if (!t) return null;
  let m = /^(.*\S)\s*×\s*(\d+)$/.exec(t);
  if (m) return { name: m[1], qty: Number(m[2]) };
  m = /^(\d+)\s*[x×]\s+(.+)$/i.exec(t);
  if (m) return { name: m[2], qty: Number(m[1]) };
  return { name: t, qty: 1 };
}

export function priceCartLine(
  item: PriceableItem,
  clientUnitPrice: unknown,
  selections: unknown,
): PricedLine {
  if (selections !== undefined && selections !== null) {
    if (!Array.isArray(selections)) return { ok: false, message: 'Invalid item options.' };
    if (selections.length > MAX_SELECTIONS) return { ok: false, message: 'Too many item options.' };

    const byName = new Map<string, number>();
    for (const d of item.drinkOptions) byName.set(norm(d.name), d.price);
    for (const o of item.optionItems) if (!byName.has(norm(o.name))) byName.set(norm(o.name), o.extraPrice);

    const priced: PricedSelection[] = [];
    let extras = 0;
    for (const raw of selections) {
      const label = (raw as { label?: unknown } | null)?.label;
      if (typeof label !== 'string') return { ok: false, message: 'Invalid item options.' };
      const parsed = parseSelectionLabel(label);
      if (!parsed || !Number.isInteger(parsed.qty) || parsed.qty < 1 || parsed.qty > MAX_PER_OPTION) {
        return { ok: false, message: `"${label}" is not a valid option.` };
      }
      const unit = byName.get(norm(parsed.name));
      if (unit === undefined) return { ok: false, message: `"${label}" is not an option for this item.` };
      const price = round2(unit * parsed.qty);
      extras += price;
      priced.push({ label: label.trim(), price });
    }
    return { ok: true, unitPrice: round2(item.price + extras), selections: priced };
  }

  const client = typeof clientUnitPrice === 'number' && Number.isFinite(clientUnitPrice) ? clientUnitPrice : item.price;
  const hasExtras = item.drinkOptions.length > 0 || item.optionItems.length > 0;
  return { ok: true, unitPrice: round2(hasExtras ? Math.max(client, item.price) : item.price) };
}
