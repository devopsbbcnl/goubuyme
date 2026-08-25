import axios from 'axios';
import logger from '../utils/logger';
import { recordError } from '../utils/recordError';

const TERMII_BASE = 'https://api.ng.termii.com/api';

// Termii expects local Nigerian numbers in international format without the leading "+".
function normalizeNigerianNumber(phone: string): string {
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = `234${digits.slice(1)}`;
  if (!digits.startsWith('234')) digits = `234${digits}`;
  return digits;
}

export const sendSms = async (to: string, body: string): Promise<void> => {
  const apiKey = process.env.TERMII_API_KEY;
  const senderId = process.env.TERMII_SENDER_ID;
  if (!apiKey || !senderId) {
    recordError('sms', 'Termii not configured (TERMII_API_KEY/TERMII_SENDER_ID missing)', undefined, { to });
    return;
  }

  try {
    const res = await axios.post(`${TERMII_BASE}/sms/send`, {
      to: normalizeNigerianNumber(to),
      from: senderId,
      sms: body,
      type: 'plain',
      channel: 'generic',
      api_key: apiKey,
    });
    if (res.data?.code && res.data.code !== 'ok') {
      recordError('sms', 'Termii send returned non-ok code', undefined, { to, response: res.data });
      return;
    }
    logger.info(`SMS sent to ${to}`);
  } catch (err) {
    recordError('sms', 'sendSms failed', err, { to });
  }
};
