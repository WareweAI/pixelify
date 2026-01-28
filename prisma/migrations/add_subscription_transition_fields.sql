-- Add subscription transition fields to AppSettings
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "planExpiresAt" TIMESTAMP(3);
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "pendingPlan" TEXT;
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "pendingPlanStartDate" TIMESTAMP(3);
ALTER TABLE "AppSettings" ADD COLUMN IF NOT EXISTS "billingCycle" TEXT;

-- Add index for efficient expiry checks
CREATE INDEX IF NOT EXISTS "AppSettings_planExpiresAt_idx" ON "AppSettings"("planExpiresAt");
