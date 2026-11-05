import { Request, Response } from 'express';
import { ApprovalStatus } from '@prisma/client';
import prisma from '../config/db';
import { apiResponse } from '../utils/apiResponse';
import { catchAsync } from '../utils/catchAsync';
import { recordError } from '../utils/recordError';
import { AuthRequest } from '../middleware/auth.middleware';
import { sendCompanyApprovalEmail } from '../services/email.service';

const STATUSES: ApprovalStatus[] = ['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED'];

// GET /admin/companies?status=&search=&page=&limit=
export const getAdminCompanies = catchAsync(async (req: Request, res: Response) => {
  const { status, search, page = '1', limit = '20' } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

  const where = {
    user: { deletedAt: null },
    ...(status && STATUSES.includes(status as ApprovalStatus) ? { approvalStatus: status as ApprovalStatus } : {}),
    ...(search ? { companyName: { contains: search, mode: 'insensitive' as const } } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.logisticsCompany.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
      select: {
        id: true, userId: true, companyName: true, registrationNumber: true, address: true, city: true,
        state: true, approvalStatus: true, createdAt: true,
        user: { select: { name: true, email: true, phone: true } },
        _count: { select: { riders: true } },
      },
    }),
    prisma.logisticsCompany.count({ where }),
  ]);

  const data = rows.map((c) => ({
    id: c.id,
    userId: c.userId,
    companyName: c.companyName,
    registrationNumber: c.registrationNumber,
    address: c.address,
    city: c.city,
    state: c.state,
    approvalStatus: c.approvalStatus,
    createdAt: c.createdAt,
    ownerName: c.user.name,
    ownerEmail: c.user.email,
    ownerPhone: c.user.phone,
    riders: c._count.riders,
  }));

  return apiResponse.paginated(res, 'Companies fetched.', data, {
    page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum),
  });
});

// PATCH /admin/companies/:id/status  { status }
export const updateCompanyStatus = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { status } = req.body as { status?: ApprovalStatus };
  if (!status || !STATUSES.includes(status)) return apiResponse.error(res, 'Invalid status.', 400);

  const existing = await prisma.logisticsCompany.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return apiResponse.error(res, 'Company not found.', 404);

  const company = await prisma.logisticsCompany.update({
    where: { id },
    data: { approvalStatus: status },
    select: { id: true, approvalStatus: true, user: { select: { email: true, name: true } } },
  });

  await prisma.auditLog.create({
    data: { userId: req.user!.userId, action: `COMPANY_${status}`, entity: 'LogisticsCompany', entityId: id },
  });

  if (status === 'APPROVED' || status === 'REJECTED' || status === 'SUSPENDED') {
    sendCompanyApprovalEmail(company.user.email, company.user.name, status).catch((err) =>
      recordError('admin', 'Company approval email failed', err, { companyId: id, status }),
    );
  }

  return apiResponse.success(res, `Company ${status.toLowerCase()}.`, {
    id: company.id,
    approvalStatus: company.approvalStatus,
  });
});
