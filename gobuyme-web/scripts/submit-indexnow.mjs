// Pings the IndexNow API so Bing (and Yandex, Seznam, Naver — all IndexNow
// participants) pick up new/changed URLs immediately instead of waiting for
// their next crawl. Run after a deploy that adds or changes marketing pages:
//
//   node scripts/submit-indexnow.mjs
//
// The verification key file lives at public/<INDEXNOW_KEY>.txt and must stay
// in sync with the key below — IndexNow checks that file to prove domain
// ownership before accepting submissions.

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://gobuyme.shop';
const INDEXNOW_KEY = 'b48cf7ca0eef1899a99c5c3c983886b6';

async function getSitemapUrls() {
  const res = await fetch(`${SITE_URL}/sitemap.xml`);
  if (!res.ok) throw new Error(`Failed to fetch sitemap: ${res.status}`);
  const xml = await res.text();
  return [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]);
}

async function submit(urls) {
  const host = new URL(SITE_URL).host;
  const body = {
    host,
    key: INDEXNOW_KEY,
    keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`,
    urlList: urls,
  };

  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  });

  // IndexNow returns 200/202 on success, 400/403/422/429 on error — no body.
  console.log(`IndexNow responded ${res.status} ${res.statusText} for ${urls.length} URLs`);
  if (!res.ok) process.exitCode = 1;
}

const urls = await getSitemapUrls();
console.log(`Submitting ${urls.length} URLs from ${SITE_URL}/sitemap.xml to IndexNow...`);
await submit(urls);
