import axios from 'axios';
import logger from '../utils/logger';
import { recordError } from '../utils/recordError';

// WhatsApp Business Cloud API (Meta) requires an approved message template for any
// business-initiated message outside a 24h user session — there's no free-text send.
// Two templates are used by the escalation job ("order_reminder_alert", "urgent_order_alert")
// and must be created and approved in Meta Business Manager before this will deliver.

function normalizeNigerianNumber(phone: string): string {
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = `234${digits.slice(1)}`;
  if (!digits.startsWith('234')) digits = `234${digits}`;
  return digits;
}

// Returns whether the message was actually sent — callers use this to fall back to SMS
// only when WhatsApp isn't configured or delivery fails, since WhatsApp messaging is
// cheaper than SMS and should be tried first wherever both channels are available.
export const sendWhatsappMessage = async (
  to: string,
  templateName: string,
  params: string[],
): Promise<boolean> => {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!accessToken || !phoneNumberId) {
    recordError('whatsapp', 'WhatsApp not configured (WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID missing)', undefined, { to, templateName });
    return false;
  }

  try {
    await axios.post(
      `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: normalizeNigerianNumber(to),
        type: 'template',
        template: {
          name: templateName,
          language: { code: 'en' },
          components: params.length
            ? [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }]
            : undefined,
        },
      },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    logger.info(`WhatsApp message sent to ${to}: ${templateName}`);
    return true;
  } catch (err) {
    recordError('whatsapp', 'sendWhatsappMessage failed', err, { to, templateName });
    return false;
  }
};
