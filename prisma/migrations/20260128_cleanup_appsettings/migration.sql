-- Remove unused subscription fields from AppSettings
-- These are now handled by the Subscription model

ALTER TABLE "AppSettings" DROP COLUMN IF EXISTS "planExpiresAt";
ALTER TABLE "AppSettings" DROP COLUMN IF EXISTS "pendingPlan";
ALTER TABLE "AppSettings" DROP COLUMN IF EXISTS "pendingPlanStartDate";
ALTER TABLE "AppSettings" DROP COLUMN IF EXISTS "billingCycle";

-- Drop the index if it exists
DROP INDEX IF EXISTS "AppSettings_planExpiresAt_idx";
