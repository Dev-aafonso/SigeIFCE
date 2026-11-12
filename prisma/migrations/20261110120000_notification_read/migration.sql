CREATE TABLE "NotificationRead" (
  "userId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationRead_pkey" PRIMARY KEY ("userId", "key"),
  CONSTRAINT "NotificationRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
