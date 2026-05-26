import 'dotenv/config';
import prisma from '../src/config/db';
import { forwardGeocodeVendorAddress } from '../src/services/geocoding.service';

async function run() {
  const vendorId = process.argv[2];
  const where = vendorId
    ? { id: vendorId }
    : { OR: [{ latitude: null }, { longitude: null }] };

  const vendors = await prisma.vendor.findMany({
    where,
    select: { id: true, businessName: true, address: true, city: true, state: true, latitude: true, longitude: true },
  });

  if (vendors.length === 0) {
    console.log('No vendors found matching the criteria.');
    return;
  }

  console.log(`Found ${vendors.length} vendor(s) to geocode.`);

  let updated = 0;
  for (const vendor of vendors) {
    const query = [vendor.address, vendor.city, vendor.state].filter(Boolean).join(', ');
    if (!query) {
      console.log(`Skipping vendor ${vendor.id} (${vendor.businessName}) because address is incomplete.`);
      continue;
    }

    console.log(`Geocoding vendor ${vendor.id} (${vendor.businessName}): ${query}`);
    const coords = await forwardGeocodeVendorAddress(vendor.address, vendor.city, vendor.state);
    if (!coords) {
      console.log(`  → No coordinates found for ${vendor.id}`);
      continue;
    }

    await prisma.vendor.update({
      where: { id: vendor.id },
      data: { latitude: coords.lat, longitude: coords.lng },
    });
    updated += 1;
    console.log(`  → Updated ${vendor.id} with ${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)} using query: "${coords.query}"`);
  }

  console.log(`Completed geocoding. Updated ${updated} of ${vendors.length} vendor(s).`);
}

run()
  .catch((err) => {
    console.error('Vendor geocode backfill failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
