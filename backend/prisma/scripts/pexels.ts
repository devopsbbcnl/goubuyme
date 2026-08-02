import * as fs from 'fs';
import * as path from 'path';

const CACHE_PATH = path.join(__dirname, '.pexels-cache.json');

let cache: Record<string, string | null> = {};
if (fs.existsSync(CACHE_PATH)) {
  cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
}

function saveCache() {
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

/** Looks up a Pexels photo URL for a search query, using a local cache to avoid refetching. */
export async function resolvePexelsImage(query: string): Promise<string | null> {
  if (query in cache) return cache[query];

  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) throw new Error('PEXELS_API_KEY is not set');

  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`;
  const res = await fetch(url, { headers: { Authorization: apiKey } });

  if (!res.ok) {
    console.warn(`  ⚠️  Pexels lookup failed for "${query}" (${res.status})`);
    cache[query] = null;
    saveCache();
    return null;
  }

  const data = (await res.json()) as { photos?: Array<{ src: { large: string } }> };
  const photoUrl = data.photos?.[0]?.src.large ?? null;
  cache[query] = photoUrl;
  saveCache();
  return photoUrl;
}

/** Rate-limit-friendly delay between successive Pexels calls. */
export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
