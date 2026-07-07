import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

// Ported from gobuy-shine-sparkle netlify/functions/form-submit.mjs.
// ALLOWED_FORMS must stay in sync with SiteFormId in marketing/lib/submitSiteForm.ts.
const ALLOWED_FORMS = new Set(['contact', 'riders-signup', 'vendors-apply', 'affiliate', 'book-a-call']);

// Per-form overrides — to address and subject prefix
const FORM_OVERRIDES: Record<string, { to?: string; subjectPrefix?: string }> = {
  'book-a-call': {
    to: process.env.PARTNERS_EMAIL?.trim() || 'partners@gobuyme.shop',
    subjectPrefix: '[GoBuyMe] Enterprise enquiry',
  },
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { formId, fields } = body as { formId?: unknown; fields?: unknown };

    if (!formId || typeof formId !== 'string' || !ALLOWED_FORMS.has(formId)) {
      return NextResponse.json({ error: 'Invalid form' }, { status: 400 });
    }
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
      return NextResponse.json({ error: 'Invalid fields' }, { status: 400 });
    }

    const apiKey = process.env.RESEND_API_KEY?.trim();
    const from = process.env.RESEND_FROM?.trim() || 'GoBuyMe <contact@notifications.gobuyme.shop>';
    const defaultTo = process.env.FORMS_TO_EMAIL?.trim();

    if (!apiKey) {
      console.error('form-submit: missing RESEND_API_KEY');
      return NextResponse.json({ error: 'Mail is not configured on the server' }, { status: 503 });
    }
    if (!defaultTo) {
      console.error('form-submit: missing FORMS_TO_EMAIL');
      return NextResponse.json({ error: 'Mail is not configured on the server' }, { status: 503 });
    }

    const override = FORM_OVERRIDES[formId] ?? {};
    const to = override.to ?? defaultTo;

    const flat = Object.fromEntries(
      Object.entries(fields as Record<string, unknown>).map(([k, v]) => [k, v == null ? '' : String(v)]),
    );

    const lines = Object.entries(flat).map(([k, v]) => `${k}: ${v}`);
    const textBody = [`Form: ${formId}`, `Submitted (UTC): ${new Date().toISOString()}`, '', ...lines].join('\n');
    const safeHtml = textBody
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .split('\n')
      .join('<br>\n');

    const subject = override.subjectPrefix
      ? `${override.subjectPrefix} — ${flat.businessName || flat.name || formId}`
      : `[GoBuyMe forms] ${formId}`;

    const resend = new Resend(apiKey);

    const payload: Parameters<typeof resend.emails.send>[0] = {
      from,
      to,
      subject,
      text: textBody,
      html: `<p style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.6">${safeHtml}</p>`,
    };

    const replyEmail = flat.email?.trim();
    if (replyEmail && replyEmail.includes('@')) {
      payload.replyTo = replyEmail;
    }

    const { error } = await resend.emails.send(payload);

    if (error) {
      console.error('form-submit resend error:', error);
      return NextResponse.json({ error: 'Failed to send message' }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('form-submit:', e);
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}
