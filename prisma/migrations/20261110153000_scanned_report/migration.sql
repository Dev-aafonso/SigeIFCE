CREATE TABLE "ScannedReport" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScannedReport_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ScannedReport_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ScannedReport_eventId_idx" ON "ScannedReport"("eventId");
