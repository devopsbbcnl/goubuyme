import axios from 'axios';
import logger from '../utils/logger';

const BASE = 'https://api.paystack.co';
const headers = () => ({ Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` });

// 10-minute in-memory cache — avoids redundant Paystack lookups and rate-limit hits
const resolveCache = new Map<string, { accountName: string; expiresAt: number }>();

export const resolveAccountNumber = async (
  accountNumber: string,
  bankCode: string,
): Promise<{ accountName: string }> => {
  const cacheKey = `${accountNumber}:${bankCode}`;
  const cached = resolveCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return { accountName: cached.accountName };
  }

  const { data } = await axios.get(
    `${BASE}/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
    { headers: headers() },
  );
  const accountName = data.data.account_name as string;
  resolveCache.set(cacheKey, { accountName, expiresAt: Date.now() + 10 * 60 * 1000 });
  return { accountName };
};

export const createTransferRecipient = async (
  name: string,
  accountNumber: string,
  bankCode: string,
): Promise<string> => {
  const { data } = await axios.post(
    `${BASE}/transferrecipient`,
    { type: 'nuban', name, account_number: accountNumber, bank_code: bankCode, currency: 'NGN' },
    { headers: headers() },
  );
  logger.info(`Paystack recipient created: ${data.data.recipient_code}`);
  return data.data.recipient_code as string;
};

export const initiateTransfer = async (
  recipientCode: string,
  amountNaira: number,
  reason: string,
): Promise<{ transferCode: string; status: string }> => {
  const { data } = await axios.post(
    `${BASE}/transfer`,
    {
      source: 'balance',
      amount: Math.round(amountNaira * 100), // kobo
      recipient: recipientCode,
      reason,
    },
    { headers: headers() },
  );
  logger.info(`Paystack transfer initiated: ${data.data.transfer_code}`);
  return { transferCode: data.data.transfer_code as string, status: data.data.status as string };
};
