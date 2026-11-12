-- What changed in the latest app version, shown in the app's update prompt (one line per change).
ALTER TABLE "platform_settings" ADD COLUMN     "appReleaseNotes" TEXT NOT NULL DEFAULT '';
