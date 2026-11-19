-- Sign in with Apple: link an account to its Apple id, and keep an encrypted refresh token so the
-- grant can be revoked when the account is deleted (App Store requirement).
ALTER TABLE "users" ADD COLUMN "appleId" TEXT;
ALTER TABLE "users" ADD COLUMN "appleRefreshToken" TEXT;
CREATE UNIQUE INDEX "users_appleId_key" ON "users"("appleId");
