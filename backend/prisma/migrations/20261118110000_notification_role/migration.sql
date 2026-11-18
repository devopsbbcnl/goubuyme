-- Multi-role accounts: a notification can be for one experience (customer / vendor / rider).
-- NULL means every role, so all existing rows keep showing everywhere.
ALTER TABLE "notifications" ADD COLUMN "role" "Role";
CREATE INDEX "notifications_userId_role_idx" ON "notifications"("userId", "role");
