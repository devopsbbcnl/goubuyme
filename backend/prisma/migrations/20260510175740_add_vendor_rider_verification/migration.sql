-- CreateEnum
CREATE TYPE "VerificationBadge" AS ENUM ('UNVERIFIED', 'ID_VERIFIED', 'BUSINESS_VERIFIED', 'PREMIUM_VERIFIED');

-- CreateEnum
CREATE TYPE "LicenseType" AS ENUM ('NAFDAC', 'PHARMACIST', 'FOOD_HANDLER', 'BUSINESS_PERMIT', 'IMPORT_PERMIT');

-- CreateEnum
CREATE TYPE "LicenseStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED');

-- AlterTable
ALTER TABLE "vendor_documents" ADD COLUMN     "bvn" TEXT,
ADD COLUMN     "selfieUrl" TEXT;

-- AlterTable
ALTER TABLE "vendors" ADD COLUMN     "verificationBadge" "VerificationBadge" NOT NULL DEFAULT 'UNVERIFIED';

-- CreateTable
CREATE TABLE "vendor_business_verifications" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "cacNumber" TEXT,
    "cacImageUrl" TEXT,
    "tin" TEXT,
    "directorNin" TEXT,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_business_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_licenses" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "type" "LicenseType" NOT NULL,
    "licenseNumber" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "status" "LicenseStatus" NOT NULL DEFAULT 'PENDING',
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_licenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rider_documents" (
    "id" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "ninNumber" TEXT NOT NULL,
    "ninImageUrl" TEXT,
    "selfieUrl" TEXT,
    "vehicleImageUrl" TEXT,
    "guarantorName" TEXT,
    "guarantorPhone" TEXT,
    "guarantorAddress" TEXT,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rider_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vendor_business_verifications_vendorId_key" ON "vendor_business_verifications"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "rider_documents_riderId_key" ON "rider_documents"("riderId");

-- AddForeignKey
ALTER TABLE "vendor_business_verifications" ADD CONSTRAINT "vendor_business_verifications_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_licenses" ADD CONSTRAINT "vendor_licenses_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_documents" ADD CONSTRAINT "rider_documents_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "riders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
