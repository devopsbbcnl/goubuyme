/**
 * One-shot codemod: replaces picsum.photos placeholder images in seed-demo.ts
 * with real Pexels photo URLs relevant to each vendor / menu item, so demo
 * data actually looks like food, groceries, pharmacy, or electronics.
 *
 * Skips avatar/KYC-document images (NIN, selfie, CAC, license, vehicle) —
 * those aren't meant to depict real people/documents and are left untouched.
 *
 * Run:  npx ts-node --project tsconfig.json prisma/scripts/apply-pexels-to-seed-demo.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { resolvePexelsImage, sleep } from './pexels';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const SEED_FILE = path.join(__dirname, '..', 'seed-demo.ts');

// businessName -> { cover keyword (storefront/landscape), logo keyword (close-up dish/product) }
const VENDOR_KEYWORDS: Record<string, { cover: string; logo: string }> = {
  "Mama Chika's Kitchen": { cover: 'nigerian home cooking food', logo: 'jollof rice nigerian' },
  'QuickMart Groceries': { cover: 'grocery store shelves', logo: 'grocery basket fresh produce' },
  'HealthPlus Pharmacy': { cover: 'pharmacy medicine shelves', logo: 'medicine pills pharmacy' },
  'NovaMart PH': { cover: 'electronics store gadgets', logo: 'wireless earbuds gadgets' },
  'Spicy Kings Shawarma & Grills': { cover: 'shawarma grill restaurant', logo: 'chicken shawarma wrap' },
  'FreshMart Hypermarket': { cover: 'supermarket hypermarket aisle', logo: 'grocery basket fresh produce' },
  'Yellow Chilli Restaurant': { cover: 'nigerian restaurant food', logo: 'jollof rice nigerian' },
  'FreshBasket Supermarket': { cover: 'supermarket grocery store', logo: 'fresh vegetables market' },
  'The Buka Spot': { cover: 'nigerian buka food', logo: 'nigerian soup food' },
  'Capital Pharmacy': { cover: 'pharmacy drugstore', logo: 'medicine pills pharmacy' },
  'Annang Kitchen': { cover: 'nigerian kitchen food', logo: 'nigerian soup food' },
  'Efik Seafood House': { cover: 'seafood restaurant nigerian', logo: 'grilled fish seafood' },
  "Miners' Grill": { cover: 'grilled meat bbq restaurant', logo: 'suya nigerian spiced beef' },
  'Coal City Mart': { cover: 'grocery store market', logo: 'grocery basket fresh produce' },
  'Ariaria Chop House': { cover: 'nigerian chop house food', logo: 'nigerian soup food' },
  'Owerre Nchaa': { cover: 'igbo food nigerian restaurant', logo: 'nigerian stew soup' },
};

const SKIP_MARKERS = ['nin-doc', 'selfie', 'cac-doc', '-lic', 'vehicle', 'rider', 'adaeze', 'emeka', 'tunde', 'biodun'];

function cleanMenuItemName(name: string): string {
  return name
    .replace(/\([^)]*\)/g, '') // drop "(Large)", "(x5)" etc
    .replace(/[+×]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  let content = fs.readFileSync(SEED_FILE, 'utf-8');
  const lines = content.split('\n');

  let currentVendor: string | null = null;
  const replacements: Array<{ lineIndex: number; oldUrl: string; keyword: string }> = [];

  const businessNameRegex = /businessName:\s*["'](.+?)["'],/;
  const picsumRegex = /https:\/\/picsum\.photos\/seed\/[^'"]+/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const bn = line.match(businessNameRegex);
    if (bn) currentVendor = bn[1];

    if (!line.includes('picsum.photos')) continue;
    if (SKIP_MARKERS.some((marker) => line.toLowerCase().includes(marker))) continue;

    const urlMatch = line.match(picsumRegex);
    if (!urlMatch) continue;
    const oldUrl = urlMatch[0];

    if (line.includes('logo:')) {
      if (currentVendor && VENDOR_KEYWORDS[currentVendor]) {
        replacements.push({ lineIndex: i, oldUrl, keyword: VENDOR_KEYWORDS[currentVendor].logo });
      }
    } else if (line.includes('coverImage:')) {
      if (currentVendor && VENDOR_KEYWORDS[currentVendor]) {
        replacements.push({ lineIndex: i, oldUrl, keyword: VENDOR_KEYWORDS[currentVendor].cover });
      }
    } else if (line.includes('imageUrl:') && oldUrl.includes('/seed/promo-')) {
      if (currentVendor && VENDOR_KEYWORDS[currentVendor]) {
        replacements.push({ lineIndex: i, oldUrl, keyword: VENDOR_KEYWORDS[currentVendor].cover });
      }
    } else if (line.includes('image:')) {
      const nameMatch = line.match(/name:\s*["'](.+?)["'],/);
      if (nameMatch) {
        replacements.push({ lineIndex: i, oldUrl, keyword: cleanMenuItemName(nameMatch[1]) });
      }
    }
  }

  console.log(`Found ${replacements.length} images to replace in seed-demo.ts`);

  let resolved = 0;
  for (const r of replacements) {
    const url = await resolvePexelsImage(r.keyword);
    if (url) {
      lines[r.lineIndex] = lines[r.lineIndex].replace(r.oldUrl, url);
      resolved++;
    } else {
      console.log(`  ⚠️  no match for "${r.keyword}", leaving picsum placeholder`);
    }
    await sleep(120);
  }

  fs.writeFileSync(SEED_FILE, lines.join('\n'));
  console.log(`\n✅ Replaced ${resolved}/${replacements.length} images in seed-demo.ts`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
