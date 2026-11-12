-- Safe additive migration: old certificates remain valid and retain their action/registration links.
ALTER TABLE "Certificate" ADD COLUMN IF NOT EXISTS "scope" TEXT NOT NULL DEFAULT 'ACTION';

-- Enforce a single EVENT document for each user in an event, including revoked ones.
-- ACTION documents (legacy) are intentionally excluded from this uniqueness rule.
CREATE UNIQUE INDEX IF NOT EXISTS "Certificate_userId_eventId_event_unique"
  ON "Certificate" ("userId", "eventId") WHERE "scope" = 'EVENT';

CREATE INDEX IF NOT EXISTS "Certificate_scope_eventId_idx" ON "Certificate" ("scope", "eventId");

ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_scope_consistency_check"
  CHECK (("scope" = 'ACTION') OR ("scope" = 'EVENT' AND "actionId" IS NULL AND "registrationId" IS NULL));
