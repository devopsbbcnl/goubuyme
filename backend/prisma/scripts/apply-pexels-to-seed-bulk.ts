/**
 * One-shot codemod: replaces the picsum-based `unsplash()` image helper in
 * seed-bulk.ts with a static lookup table of real Pexels photo URLs, keyed
 * by the existing coverKeyword/imgKeyword strings already in the file.
 *
 * Run:  npx ts-node --project tsconfig.json prisma/scripts/apply-pexels-to-seed-bulk.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { resolvePexelsImage, sleep } from './pexels';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const SEED_FILE = path.join(__dirname, '..', 'seed-bulk.ts');

async function main() {
  let content = fs.readFileSync(SEED_FILE, 'utf-8');

  const keywords = new Set<string>();
  const keywordRegex = /(?:coverKeyword|imgKeyword):\s*'([^']+)'/g;
  let m: RegExpExecArray | null;
  while ((m = keywordRegex.exec(content))) {
    keywords.add(m[1]);
  }

  console.log(`Found ${keywords.size} distinct keywords in seed-bulk.ts`);

  const imageUrls: Record<string, string> = {};
  let i = 0;
  for (const keyword of keywords) {
    i++;
    const url = await resolvePexelsImage(keyword);
    if (url) {
      imageUrls[keyword] = url;
      console.log(`  [${i}/${keywords.size}] "${keyword}" -> ok`);
    } else {
      console.log(`  [${i}/${keywords.size}] "${keyword}" -> no match, will fall back to picsum`);
    }
    await sleep(120);
  }

  const mapEntries = Object.entries(imageUrls)
    .map(([keyword, url]) => `  ${JSON.stringify(keyword)}: ${JSON.stringify(url)},`)
    .join('\n');

  const newHelperBlock = `const PEXELS_IMAGE_URLS: Record<string, string> = {
${mapEntries}
};

const unsplash = (w: number, h: number, keyword: string) =>
  PEXELS_IMAGE_URLS[keyword] ??
  \`https://picsum.photos/seed/\${encodeURIComponent(keyword.replace(/\\s+/g, '-'))}/\${w}/\${h}\`;`;

  const oldHelperStart = content.indexOf('const unsplash = (w: number, h: number, keyword: string) =>');
  const oldHelperEnd = content.indexOf('`;', oldHelperStart) + 2;

  if (oldHelperStart === -1 || oldHelperEnd === -1) {
    throw new Error('Could not find the existing unsplash() helper to replace — aborting.');
  }

  content = content.slice(0, oldHelperStart) + newHelperBlock + content.slice(oldHelperEnd);
  fs.writeFileSync(SEED_FILE, content);

  console.log(`\n✅ Replaced unsplash() helper with ${Object.keys(imageUrls).length} baked Pexels URLs in seed-bulk.ts`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
