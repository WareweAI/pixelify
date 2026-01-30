-- CreateTable
CREATE TABLE "SubscriptionHistory" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "shopEmail" TEXT NOT NULL,
    "previousPlan" TEXT NOT NULL,
    "newPlan" TEXT NOT NULL,
    "changeType" TEXT NOT NULL,
    "reason" TEXT,
    "emailSent" BOOLEAN NOT NULL DEFAULT false,
    "emailSentAt" TIMESTAMP(3),
    "emailType" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubscriptionHistory_appId_idx" ON "SubscriptionHistory"("appId");

-- CreateIndex
CREATE INDEX "SubscriptionHistory_shopEmail_idx" ON "SubscriptionHistory"("shopEmail");

-- CreateIndex
CREATE INDEX "SubscriptionHistory_emailSent_idx" ON "SubscriptionHistory"("emailSent");

-- CreateIndex
CREATE INDEX "SubscriptionHistory_createdAt_idx" ON "SubscriptionHistory"("createdAt");
