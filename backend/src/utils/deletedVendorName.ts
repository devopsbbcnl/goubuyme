/**
 * Vendor.businessName is unique, so a soft-deleted vendor would otherwise keep
 * its store name forever. Renaming on delete frees the name for re-registration
 * while staying readable in admin views; the original goes in the audit log.
 */
export const deletedVendorName = (businessName: string, vendorId: string): string =>
  `${businessName} (deleted ${vendorId.slice(-6)})`;
