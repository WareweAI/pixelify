-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN     "billingCycle" TEXT,
ADD COLUMN     "pendingPlan" TEXT,
ADD COLUMN     "pendingPlanStartDate" TIMESTAMP(3),
ADD COLUMN     "planExpiresAt" TIMESTAMP(3);
