-- CreateTable
CREATE TABLE "Presence" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "responsibleId" TEXT NOT NULL,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Presence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Presence_registrationId_key" ON "Presence"("registrationId");

-- CreateIndex
CREATE INDEX "Presence_responsibleId_idx" ON "Presence"("responsibleId");

-- CreateIndex
CREATE INDEX "Presence_registeredAt_idx" ON "Presence"("registeredAt");

-- AddForeignKey
ALTER TABLE "Presence" ADD CONSTRAINT "Presence_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
