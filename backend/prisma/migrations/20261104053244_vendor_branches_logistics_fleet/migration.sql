-- CreateEnum
CREATE TYPE "FleetInviteStatus" AS ENUM ('INVITED', 'CLAIMED', 'REVOKED');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'LOGISTICS_COMPANY';

-- AlterTable
ALTER TABLE "riders" ADD COLUMN     "approvedViaCompany" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "companyId" TEXT;

-- CreateTable
CREATE TABLE "logistics_companies" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "registrationNumber" TEXT,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'Rivers',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "logistics_companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fleet_invites" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" "FleetInviteStatus" NOT NULL DEFAULT 'INVITED',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fleet_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'Rivers',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "logistics_companies_userId_key" ON "logistics_companies"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "logistics_companies_companyName_key" ON "logistics_companies"("companyName");

-- CreateIndex
CREATE INDEX "logistics_companies_approvalStatus_idx" ON "logistics_companies"("approvalStatus");

-- CreateIndex
CREATE INDEX "fleet_invites_email_idx" ON "fleet_invites"("email");

-- CreateIndex
CREATE UNIQUE INDEX "fleet_invites_companyId_email_key" ON "fleet_invites"("companyId", "email");

-- CreateIndex
CREATE INDEX "branches_vendorId_idx" ON "branches"("vendorId");

-- CreateIndex
CREATE INDEX "riders_companyId_idx" ON "riders"("companyId");

-- AddForeignKey
ALTER TABLE "riders" ADD CONSTRAINT "riders_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "logistics_companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_companies" ADD CONSTRAINT "logistics_companies_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fleet_invites" ADD CONSTRAINT "fleet_invites_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "logistics_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
