/*
  Warnings:

  - Added the required column `updatedAt` to the `campaign_recipients` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "campaign_recipients" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;
