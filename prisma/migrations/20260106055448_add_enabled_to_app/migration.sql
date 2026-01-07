-- AlterTable
ALTER TABLE "App" ADD COLUMN     "enabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "AppSettings" ALTER COLUMN "timezone" SET DEFAULT 'GMT+0';
