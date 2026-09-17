-- CreateTable
CREATE TABLE "job_locks" (
    "key" TEXT NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_locks_pkey" PRIMARY KEY ("key")
);
