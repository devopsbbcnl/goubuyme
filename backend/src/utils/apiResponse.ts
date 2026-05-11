import { Response } from 'express';

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const success = (res: Response, message: string, data?: unknown, statusCode = 200) => {
  return res.status(statusCode).json({ status: 'success', message, data });
};

const paginated = (
  res: Response,
  message: string,
  data: unknown[],
  pagination: PaginationMeta,
) => {
  return res.status(200).json({ status: 'success', message, data, pagination });
};

const error = (res: Response, message: string, statusCode = 400, errors?: unknown[]) => {
  return res.status(statusCode).json({ status: 'error', message, errors });
};

export const apiResponse = { success, paginated, error };
