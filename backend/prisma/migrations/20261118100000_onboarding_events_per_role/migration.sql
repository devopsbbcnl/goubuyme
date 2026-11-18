-- Multi-role accounts: onboarding funnel events are unique per user AND role, so an account that
-- adds a vendor or rider role later records that role's own transitions instead of being dropped.
DROP INDEX "onboarding_events_userId_event_key";
CREATE UNIQUE INDEX "onboarding_events_userId_role_event_key" ON "onboarding_events"("userId", "role", "event");
