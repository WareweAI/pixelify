-- DropForeignKey
ALTER TABLE "App" DROP CONSTRAINT "App_userId_fkey";

-- AlterTable
ALTER TABLE "App" ALTER COLUMN "userId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "App" ADD CONSTRAINT "App_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
