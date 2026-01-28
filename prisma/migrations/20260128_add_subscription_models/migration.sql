-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "shopifySubscriptionId" TEXT,
    "planName" TEXT NOT NULL,
    "planLevel" INTEGER NOT NULL,
    "billingCycle" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "isCurrentPlan" BOOLEAN NOT NULL DEFAULT false,
    "isPendingPlan" BOOLEAN NOT NULL DEFAULT false,
    "transitionType" TEXT,
    "replacesSubscriptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionHistory" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "fromPlan" TEXT,
    "toPlan" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailNotification" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "templateId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_shopifySubscriptionId_key" ON "Subscription"("shopifySubscriptionId");

-- CreateIndex
CREATE INDEX "Subscription_appId_status_idx" ON "Subscription"("appId", "status");

-- CreateIndex
CREATE INDEX "Subscription_appId_isCurrentPlan_idx" ON "Subscription"("appId", "isCurrentPlan");

-- CreateIndex
CREATE INDEX "Subscription_endDate_status_idx" ON "Subscription"("endDate", "status");

-- CreateIndex
CREATE INDEX "Subscription_shopifySubscriptionId_idx" ON "Subscription"("shopifySubscriptionId");

-- CreateIndex
CREATE INDEX "SubscriptionHistory_appId_createdAt_idx" ON "SubscriptionHistory"("appId", "createdAt");

-- CreateIndex
CREATE INDEX "SubscriptionHistory_subscriptionId_idx" ON "SubscriptionHistory"("subscriptionId");

-- CreateIndex
CREATE INDEX "EmailNotification_appId_type_idx" ON "EmailNotification"("appId", "type");

-- CreateIndex
CREATE INDEX "EmailNotification_status_idx" ON "EmailNotification"("status");

-- CreateIndex
CREATE INDEX "EmailNotification_createdAt_idx" ON "EmailNotification"("createdAt");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE CASCADE ON UPDATE CASCADE;
