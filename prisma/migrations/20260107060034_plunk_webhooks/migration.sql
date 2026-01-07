-- AlterTable
ALTER TABLE "App" ADD COLUMN     "plan" TEXT NOT NULL DEFAULT 'Free',
ADD COLUMN     "welcomeEmailSent" BOOLEAN NOT NULL DEFAULT false;
