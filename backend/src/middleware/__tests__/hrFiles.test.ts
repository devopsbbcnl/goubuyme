import { Request, Response } from 'express';

const verifyUploads = jest.fn<Promise<string | null>, [Array<string | null | undefined>]>();
jest.mock('../../services/uploadVerification.service', () => ({ verifyUploads: (u: Array<string | null | undefined>) => verifyUploads(u) }));

import { normaliseHrBody, signHrLinks, hrFilesFor } from '../hrFiles.middleware';
import { createUploadTicket, parseHrReference, hrKeyFromSignedUrl, signedViewUrl, UploadNotAllowedError } from '../../services/objectStorage.service';

const KEY = 'hr/user-1/3f2b8c1e-9d4a-4e2b-8a61-0c5d7e9f1a23.pdf';
const REF = `r2-hr:${KEY}`;

beforeAll(() => {
  Object.assign(process.env, {
    R2_ACCOUNT_ID: 'acct123', R2_KYC_BUCKET: 'gobuyme-kyc', R2_KYC_ACCESS_KEY_ID: 'k', R2_KYC_SECRET_ACCESS_KEY: 'kyc-secret-value', R2_KYC_JURISDICTION: 'eu',
  });
});
beforeEach(() => verifyUploads.mockReset().mockResolvedValue(null));

describe('HR tickets', () => {
  it('issues a private HR ticket that allows PDFs', async () => {
    const t = await createUploadTicket({ purpose: 'hr', userId: 'user-1', role: 'STAFF', contentType: 'application/pdf' });
    expect(t.key).toMatch(/^hr\/user-1\/[0-9a-f-]{36}\.pdf$/);
    expect(t.reference).toBe(`r2-hr:${t.key}`);
    expect(new URL(t.uploadUrl).pathname.startsWith('/gobuyme-kyc/hr/user-1/')).toBe(true);
    expect(t.headers['Cache-Control']).toBeUndefined();
  });
  it('does not allow PDFs for ID photos or public media', async () => {
    await expect(createUploadTicket({ purpose: 'kyc', userId: 'u', role: 'RIDER', contentType: 'application/pdf' })).rejects.toThrow(UploadNotAllowedError);
    await expect(createUploadTicket({ purpose: 'avatar', userId: 'u', role: 'CUSTOMER', contentType: 'application/pdf' })).rejects.toThrow(UploadNotAllowedError);
  });
  it('keeps the no-login HR ticket off the normal ticket route', async () => {
    await expect(createUploadTicket({ purpose: 'hrpublic', userId: 'public', role: 'PUBLIC', contentType: 'application/pdf' })).rejects.toThrow(UploadNotAllowedError);
    const t = await createUploadTicket({ purpose: 'hrpublic', userId: 'public', role: 'PUBLIC', contentType: 'application/pdf', allowInternal: true });
    expect(t.key.startsWith('hr/public/')).toBe(true);
    expect(t.reference.startsWith('r2-hr:')).toBe(true);
  });
});

describe('HR references', () => {
  it('parses only well-formed HR references', () => {
    expect(parseHrReference(REF)).toBe(KEY);
    expect(parseHrReference('r2-hr:hr/legacy/abcdef0123456789.pdf')).toBe('hr/legacy/abcdef0123456789.pdf');
    expect(parseHrReference('r2-hr:kyc/user-1/x.pdf')).toBeNull();
    expect(parseHrReference('r2-hr:hr/../../etc/passwd')).toBeNull();
    expect(parseHrReference('r2-kyc:hr/user-1/x.pdf')).toBeNull();
  });
  it('recovers the key from a signed link and refuses ID-photo links', async () => {
    const link = await signedViewUrl('kyc', KEY);
    expect(hrKeyFromSignedUrl(link)).toBe(KEY);
    expect(hrKeyFromSignedUrl(await signedViewUrl('kyc', 'kyc/user-1/3f2b8c1e-9d4a-4e2b-8a61-0c5d7e9f1a23.jpg'))).toBeNull();
    expect(hrKeyFromSignedUrl('https://evil.example/gobuyme-kyc/' + KEY)).toBeNull();
  });
});

describe('normaliseHrBody (saving)', () => {
  it('turns signed links the page received back into references, at any depth', async () => {
    const link = await signedViewUrl('kyc', KEY);
    const body = { fileUrl: link, items: [{ receiptUrl: link, note: 'x' }], nested: { deep: { docs: [link] } } };
    const refs = normaliseHrBody(body);
    expect(body.fileUrl).toBe(REF);
    expect(body.items[0].receiptUrl).toBe(REF);
    expect(body.nested.deep.docs[0]).toBe(REF);
    expect(refs).toEqual([REF, REF, REF]);
  });
  it('leaves other values alone and finds plain references', () => {
    const body = { a: 'https://res.cloudinary.com/x/raw/upload/old.pdf', b: 'hello', c: 5, d: REF };
    expect(normaliseHrBody(body)).toEqual([REF]);
    expect(body.a).toBe('https://res.cloudinary.com/x/raw/upload/old.pdf');
  });
});

describe('signHrLinks (responses)', () => {
  it('replaces references with 15-minute signed links, keeping the rest of the data', async () => {
    const out = (await signHrLinks({ id: 1, when: new Date('2026-11-22T00:00:00Z'), docs: [{ url: REF }, { url: 'https://res.cloudinary.com/x/old.pdf' }], none: null })) as any;
    const link = new URL(out.docs[0].url);
    expect(link.pathname).toBe(`/gobuyme-kyc/${KEY}`);
    expect(link.searchParams.get('X-Amz-Expires')).toBe('900');
    expect(out.docs[1].url).toBe('https://res.cloudinary.com/x/old.pdf');
    expect(out.when).toEqual(new Date('2026-11-22T00:00:00Z'));
    expect(out.id).toBe(1);
    expect(out.none).toBeNull();
    expect(JSON.stringify(out)).not.toContain('kyc-secret-value');
  });
  it('leaves malformed references untouched rather than signing something unexpected', async () => {
    expect(await signHrLinks('r2-hr:hr/../x.pdf')).toBe('r2-hr:hr/../x.pdf');
  });
});

describe('hrFilesFor middleware', () => {
  const make = (body: unknown, headers: Record<string, string> = {}) => {
    const sent: { status?: number; body?: unknown } = {};
    const res: any = {
      status(c: number) { sent.status = c; return res; },
      json(b: unknown) { sent.body = b; return res; },
    };
    const req = { body, headers } as unknown as Request;
    return { req, res: res as Response, sent };
  };
  const run = (mw: ReturnType<typeof hrFilesFor>, req: Request, res: Response) => new Promise<boolean>((resolve) => {
    mw(req, res, (() => resolve(true)) as never);
    setTimeout(() => resolve(false), 400);
  });

  it('rejects a malformed reference with a plain message', async () => {
    const { req, res, sent } = make({ fileUrl: 'r2-hr:hr/../x.pdf' }, { authorization: 'Bearer t' });
    expect(await run(hrFilesFor(), req, res)).toBe(false);
    expect(sent.status).toBe(400);
  });
  it('checks stored files for signed-in requests and passes the message through', async () => {
    verifyUploads.mockResolvedValueOnce('That photo is too large (the limit is 15 MB). Please choose a smaller one.');
    const { req, res, sent } = make({ fileUrl: REF }, { authorization: 'Bearer t' });
    expect(await run(hrFilesFor(), req, res)).toBe(false);
    expect(sent.status).toBe(400);
    expect((sent.body as any).message).toContain('too large');
    expect(verifyUploads).toHaveBeenCalledWith([REF]);
  });
  it('does not touch storage for anonymous calls on the signed-in routers', async () => {
    const { req, res } = make({ fileUrl: REF });
    expect(await run(hrFilesFor(), req, res)).toBe(true);
    expect(verifyUploads).not.toHaveBeenCalled();
  });
  it('always checks files on public routes', async () => {
    const { req, res } = make({ cvUrl: REF });
    expect(await run(hrFilesFor({ publicRoute: true }), req, res)).toBe(true);
    expect(verifyUploads).toHaveBeenCalledWith([REF]);
  });
  it('refuses a request that points at too many files', async () => {
    const body = { docs: Array.from({ length: 11 }, () => REF) };
    const { req, res, sent } = make(body, { authorization: 'Bearer t' });
    expect(await run(hrFilesFor(), req, res)).toBe(false);
    expect(sent.status).toBe(400);
  });
  it('signs references in the response after the handler runs', async () => {
    const { req, res, sent } = make({}, { authorization: 'Bearer t' });
    await run(hrFilesFor(), req, res);
    res.status(200).json({ status: 'success', data: { contract: { documentUrl: REF } } });
    await new Promise((r) => setTimeout(r, 50));
    const url = (sent.body as any).data.contract.documentUrl as string;
    expect(url.startsWith('https://acct123.eu.r2.cloudflarestorage.com/gobuyme-kyc/hr/')).toBe(true);
    expect(url).toContain('X-Amz-Signature');
  });
  it('sends responses without HR files straight through', async () => {
    const { req, res, sent } = make({}, { authorization: 'Bearer t' });
    await run(hrFilesFor(), req, res);
    res.status(200).json({ status: 'success', data: { name: 'Ada' } });
    expect(sent.body).toEqual({ status: 'success', data: { name: 'Ada' } });
  });
});
