-- CreateTable
CREATE TABLE "smois_preferences" (
    "userId" TEXT NOT NULL,
    "emailAlerts" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "smois_preferences_pkey" PRIMARY KEY ("userId")
);

