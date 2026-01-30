-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "shopifySubscriptionId" TEXT,
    "planName" TEXT NOT NULL,
    "planLevel" INTEGER NOT NULL DEFAULT 0,
    "billingCycle" TEXT NOT NULL DEFAULT 'monthly',
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isCurrentPlan" BOOLEAN NOT NULL DEFAULT false,
    "isPendingPlan" BOOLEAN NOT NULL DEFAULT false,
    "transitionType" TEXT,
    "replacesSubscriptionId" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Subscription_appId_idx" ON "Subscription"("appId");

-- CreateIndex
CREATE INDEX "Subscription_shopifySubscriptionId_idx" ON "Subscription"("shopifySubscriptionId");

-- CreateIndex
CREATE INDEX "Subscription_isCurrentPlan_idx" ON "Subscription"("isCurrentPlan");

-- CreateIndex
CREATE INDEX "Subscription_isPendingPlan_idx" ON "Subscription"("isPendingPlan");

-- CreateIndex
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- CreateIndex
CREATE INDEX "Subscription_startDate_idx" ON "Subscription"("startDate");

-- CreateIndex
CREATE INDEX "Subscription_endDate_idx" ON "Subscription"("endDate");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Drop old SubscriptionHistory table if exists
DROP TABLE IF EXISTS "SubscriptionHistory";

-- CreateTable (new SubscriptionHistory)
CREATE TABLE "SubscriptionHistory" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "eventType" TEXT NOT NULL,
    "fromPlan" TEXT NOT NULL,
    "toPlan" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubscriptionHistory_appId_idx" ON "SubscriptionHistory"("appId");

-- CreateIndex
CREATE INDEX "SubscriptionHistory_subscriptionId_idx" ON "SubscriptionHistory"("subscriptionId");

-- CreateIndex
CREATE INDEX "SubscriptionHistory_eventType_idx" ON "SubscriptionHistory"("eventType");

-- CreateIndex
CREATE INDEX "SubscriptionHistory_createdAt_idx" ON "SubscriptionHistory"("createdAt");

-- AddForeignKey
ALTER TABLE "SubscriptionHistory" ADD CONSTRAINT "SubscriptionHistory_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
