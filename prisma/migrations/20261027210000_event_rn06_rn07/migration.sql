-- Aditiva. NULL preserva eventos legados; nenhum backfill presumido.
ALTER TYPE "EventStatus" ADD VALUE IF NOT EXISTS 'EM_ANDAMENTO';
ALTER TABLE "Event"
  ADD COLUMN "category" TEXT,
  ADD COLUMN "workloadMinutes" INTEGER,
  ADD COLUMN "registrationStartDate" TIMESTAMP(3),
  ADD COLUMN "registrationEndDate" TIMESTAMP(3),
  ADD COLUMN "totalCapacity" INTEGER;
ALTER TABLE "Event" ADD CONSTRAINT "Event_rn06_positive"
  CHECK (("workloadMinutes" IS NULL OR "workloadMinutes" > 0)
    AND ("totalCapacity" IS NULL OR "totalCapacity" > 0));
ALTER TABLE "Event" ADD CONSTRAINT "Event_registration_window"
  CHECK (("registrationStartDate" IS NULL AND "registrationEndDate" IS NULL)
    OR ("registrationStartDate" IS NOT NULL AND "registrationEndDate" IS NOT NULL
      AND "registrationStartDate" < "registrationEndDate"
      AND "registrationEndDate" <= "endDate"));
