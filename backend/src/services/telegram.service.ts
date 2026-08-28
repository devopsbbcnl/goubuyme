import axios from 'axios';
import logger from '../utils/logger';
import { recordError } from '../utils/recordError';

// Critical-error escalation channel. A single Telegram group/channel that every
// SUPER_ADMIN joins — bot token + chat id live in the backend env, so adding or
// removing a recipient is just group membership, no code or config change.
//
// Telegram bots cannot cold-message a user: the destination must always be a
// chat id that has already started the bot (a group the bot was added to, here).
//
// Never throws — a failed alert must not break the error-analysis pipeline that
// calls it.

const TELEGRAM_API = 'https://api.telegram.org';

let warnedNotConfigured = false;

export const isTelegramConfigured = (): boolean =>
  Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_ALERT_CHAT_ID);

// `html` may contain a small subset of HTML tags Telegram supports: <b> <i>
// <code> <pre> <a>. Anything user-derived interpolated into it must be escaped
// by the caller with `escapeTelegramHtml`.
export const sendTelegramAlert = async (html: string): Promise<boolean> => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ALERT_CHAT_ID;

  if (!token || !chatId) {
    // Log the misconfiguration once — repeating it on every critical error would
    // itself flood the error log.
    if (!warnedNotConfigured) {
      warnedNotConfigured = true;
      recordError(
        'telegram',
        'Telegram not configured (TELEGRAM_BOT_TOKEN/TELEGRAM_ALERT_CHAT_ID missing) — critical error alerts are disabled',
      );
    }
    return false;
  }

  try {
    await axios.post(
      `${TELEGRAM_API}/bot${token}/sendMessage`,
      {
        chat_id: chatId,
        text: html,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      },
      { timeout: 8000 },
    );
    logger.info('Telegram critical-error alert sent');
    return true;
  } catch (err) {
    // Telegram's real reason (bad chat id, bot not in group, bot blocked) lives
    // in err.response.data, not err.message.
    const providerResponse = axios.isAxiosError(err) ? err.response?.data : undefined;
    recordError('telegram', 'sendTelegramAlert failed', err, { providerResponse });
    return false;
  }
};

export const escapeTelegramHtml = (raw: string): string =>
  raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
