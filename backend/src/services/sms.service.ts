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

// Error logs are shipped to third parties (error-analysis LLM, Telegram alerts),
// so never record a full phone number there.
const maskPhone = (phone: string): string => {
  const digits = phone.replace(/\D/g, '');
  return digits.length > 4 ? `***${digits.slice(-4)}` : '***';
};

export interface SendSmsOptions {
  /**
   * Termii route. 'generic' is cheaper but is not delivered to numbers on the
   * NCC Do-Not-Disturb list; 'dnd' is the transactional route (needs DND enabled
   * on the Termii account/sender ID) and is what OTPs must use.
   */
  channel?: 'generic' | 'dnd';
}

/** Sends one SMS. Resolves true when Termii accepted it; never throws. */
export const sendSms = async (to: string, body: string, options: SendSmsOptions = {}): Promise<boolean> => {
  const apiKey = process.env.TERMII_API_KEY;
  const senderId = process.env.TERMII_SENDER_ID;
  const masked = maskPhone(to);
  if (!apiKey || !senderId) {
    recordError('sms', 'Termii not configured (TERMII_API_KEY/TERMII_SENDER_ID missing)', undefined, { to: masked });
    return false;
  }

  try {
    const res = await axios.post(`${TERMII_BASE}/sms/send`, {
      to: normalizeNigerianNumber(to),
      from: senderId,
      sms: body,
      type: 'plain',
      channel: options.channel ?? 'generic',
      api_key: apiKey,
    });
    if (res.data?.code && res.data.code !== 'ok') {
      recordError('sms', 'Termii send returned non-ok code', undefined, { to: masked, response: res.data });
      return false;
    }
    logger.info(`SMS sent to ${masked}`);
    return true;
  } catch (err) {
    // Termii's error body (the actual validation reason — bad sender ID, no units, etc.)
    // lives in err.response.data, not err.message, which axios reduces to a generic
    // "Request failed with status code 422". Without this the recorded error is a dead end.
    const providerResponse = axios.isAxiosError(err) ? err.response?.data : undefined;
    recordError('sms', 'sendSms failed', err, { to: masked, providerResponse });
    return false;
  }
};
