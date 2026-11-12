CREATE TABLE "EventCover" (
  "eventId" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "data" BYTEA NOT NULL,
  CONSTRAINT "EventCover_pkey" PRIMARY KEY ("eventId"),
  CONSTRAINT "EventCover_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
