-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN     "latestAppVersion" TEXT NOT NULL DEFAULT '1.0.0',
ADD COLUMN     "minAppVersion" TEXT NOT NULL DEFAULT '1.0.0',
ADD COLUMN     "storeUrlAndroid" TEXT NOT NULL DEFAULT 'https://play.google.com/store/apps/details?id=dev.bubblebarrel.gobuyme',
ADD COLUMN     "storeUrlIos" TEXT NOT NULL DEFAULT '';
