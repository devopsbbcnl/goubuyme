/**
 * One-shot image URL repair.
 * Replaces dead source.unsplash.com URLs in vendors and menu items
 * with equivalent picsum.photos URLs.
 *
 * Run:  npx ts-node --project tsconfig.json prisma/patch-images.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function convert(url: string | null): string | null {
  if (!url || !url.includes('source.unsplash.com')) return url;
  // e.g. https://source.unsplash.com/featured/400x300/?jollof+rice+nigerian
  const m = url.match(/featured\/(\d+)x(\d+)\/\?(.+)$/);
  if (!m) return url;
  const [, w, h, raw] = m;
  const seed = decodeURIComponent(raw).replace(/\++/g, '-').replace(/\s+/g, '-');
  return `https://picsum.photos/seed/${seed}/${w}/${h}`;
}

async function main() {
  // ── Vendors ──────────────────────────────────────────────────────────────
  const vendors = await prisma.vendor.findMany({
    where: {
      OR: [
        { coverImage: { contains: 'source.unsplash.com' } },
        { logo:       { contains: 'source.unsplash.com' } },
      ],
    },
    select: { id: true, coverImage: true, logo: true },
  });

  console.log(`Found ${vendors.length} vendor(s) with broken image URLs`);

  for (const v of vendors) {
    await prisma.vendor.update({
      where: { id: v.id },
      data: {
        coverImage: convert(v.coverImage) ?? undefined,
        logo:       convert(v.logo)       ?? undefined,
      },
    });
  }

  // ── Menu items ───────────────────────────────────────────────────────────
  const items = await prisma.menuItem.findMany({
    where: { image: { contains: 'source.unsplash.com' } },
    select: { id: true, image: true },
  });

  console.log(`Found ${items.length} menu item(s) with broken image URLs`);

  for (const item of items) {
    await prisma.menuItem.update({
      where: { id: item.id },
      data: { image: convert(item.image) ?? undefined },
    });
  }

  // ── Promotions ───────────────────────────────────────────────────────────
  const promos = await prisma.vendorPromotion.findMany({
    where: { imageUrl: { contains: 'source.unsplash.com' } },
    select: { id: true, imageUrl: true },
  });

  console.log(`Found ${promos.length} promotion(s) with broken image URLs`);

  for (const p of promos) {
    await prisma.vendorPromotion.update({
      where: { id: p.id },
      data: { imageUrl: convert(p.imageUrl) ?? undefined },
    });
  }

  console.log('✅ Image URLs patched successfully');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
