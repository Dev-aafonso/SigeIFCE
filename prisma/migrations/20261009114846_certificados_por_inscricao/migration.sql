/*
  Warnings:

  - A unique constraint covering the columns `[registrationId]` on the table `Certificate` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[userId,actionId]` on the table `Certificate` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Certificate_userId_eventId_key";

-- AlterTable
ALTER TABLE "Certificate" ADD COLUMN     "actionId" TEXT,
ADD COLUMN     "registrationId" TEXT,
ADD COLUMN     "revokedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "name" SET DEFAULT 'UsuÃƒÂ¡rio';

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_registrationId_key" ON "Certificate"("registrationId");

-- CreateIndex
CREATE INDEX "Certificate_actionId_idx" ON "Certificate"("actionId");

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_userId_actionId_key" ON "Certificate"("userId", "actionId");

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "Action"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
