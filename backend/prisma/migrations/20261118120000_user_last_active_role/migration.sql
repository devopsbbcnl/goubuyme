-- Multi-role accounts: remember the experience a person last used so the next sign-in opens it.
ALTER TABLE "users" ADD COLUMN "lastActiveRole" "Role";
