/**
 * One-off: free the store names still held by vendors whose accounts were
 * soft-deleted before deletion started renaming them. Safe to re-run — vendors
 * already renamed (name ends in "(deleted xxxxxx)") are skipped.
 *
 *   npx ts-node prisma/release-deleted-vendor-names.ts
 */
import { PrismaClient } from '@prisma/client';
import { deletedVendorName } from '../src/utils/deletedVendorName';

const prisma = new PrismaClient();

async function main() {
  const vendors = await prisma.vendor.findMany({
    where: { user: { deletedAt: { not: null } } },
    select: { id: true, businessName: true },
  });

  let renamed = 0;
  for (const v of vendors) {
    if (v.businessName.endsWith(`(deleted ${v.id.slice(-6)})`)) continue;
    const name = deletedVendorName(v.businessName, v.id);
    await prisma.vendor.update({ where: { id: v.id }, data: { businessName: name } });
    console.log(`${v.businessName}  →  ${name}`);
    renamed++;
  }
  console.log(`Done. Released ${renamed} store name(s).`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
