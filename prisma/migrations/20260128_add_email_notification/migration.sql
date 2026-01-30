-- CreateTable
CREATE TABLE "EmailNotification" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailNotification_appId_idx" ON "EmailNotification"("appId");

-- CreateIndex
CREATE INDEX "EmailNotification_email_idx" ON "EmailNotification"("email");

-- CreateIndex
CREATE INDEX "EmailNotification_status_idx" ON "EmailNotification"("status");

-- CreateIndex
CREATE INDEX "EmailNotification_createdAt_idx" ON "EmailNotification"("createdAt");
