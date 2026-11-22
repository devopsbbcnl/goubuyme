import sharp from 'sharp';
import { shrinkImage, MAX_SIDE } from '../imageShrink.service';

jest.setTimeout(60000); // loading the image library is slow on some machines

it('uses the same 1600px limit as the apps', () => expect(MAX_SIDE).toBe(1600));

// A noisy picture, so the file is realistically large and shrinking has something to win.
const make = (w: number, h: number, fmt: 'jpeg' | 'png' | 'webp' = 'jpeg'): Promise<Buffer> => {
  const raw = Buffer.alloc(w * h * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = Math.floor(Math.random() * 255);
  return sharp(raw, { raw: { width: w, height: h, channels: 3 } })[fmt]().toBuffer();
};

describe('shrinkImage', () => {
  it('shrinks a large photo to the display limit without cropping', async () => {
    // Same behaviour as the real 1600px limit, on a small picture so the test stays fast.
    const big = await make(1600, 1200);
    const r = await shrinkImage(big, 'image/jpeg', 800);
    const m = await sharp(r.body).metadata();
    expect(r.changed).toBe(true);
    expect(m.width).toBe(800);
    expect(m.height).toBe(600);
    expect(r.body.length).toBeLessThan(big.length);
    expect(r.contentType).toBe('image/jpeg');
  });

  it('keeps portrait proportions', async () => {
    const r = await shrinkImage(await make(1200, 1600), 'image/jpeg', 800);
    const m = await sharp(r.body).metadata();
    expect([m.width, m.height]).toEqual([600, 800]);
  });

  it('leaves small images untouched', async () => {
    const small = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#fff' } }).jpeg().toBuffer();
    const r = await shrinkImage(small, 'image/jpeg');
    expect(r.changed).toBe(false);
    expect(r.body).toBe(small);
  });

  it('leaves GIFs, SVGs and unknown types alone', async () => {
    const buf = Buffer.from('GIF89a');
    for (const t of ['image/gif', 'image/svg+xml', 'application/pdf']) {
      const r = await shrinkImage(buf, t);
      expect(r.changed).toBe(false);
      expect(r.body).toBe(buf);
    }
  });

  it('never fails on a corrupt file: returns it unchanged', async () => {
    const junk = Buffer.from('not an image at all');
    const r = await shrinkImage(junk, 'image/jpeg');
    expect(r.changed).toBe(false);
  });
});
