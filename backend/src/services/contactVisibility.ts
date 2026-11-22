/**
 * Who may see a customer's phone number, and when (NDPA register G14, data minimisation).
 *
 * A vendor needs the number while an order is open (to sort out a problem with it); a rider needs it only
 * after accepting the job. Once an order is delivered or cancelled the number is not returned, so old
 * order screens do not turn into a contact list.
 */
const CLOSED = new Set(['DELIVERED', 'CANCELLED']);

export const isOrderOpen = (status: string): boolean => !CLOSED.has(status);

/** Phone shown to the vendor for this order, or null once the order is closed. */
export const customerPhoneForVendor = (status: string, phone: string | null | undefined): string | null =>
  isOrderOpen(status) ? phone ?? null : null;
