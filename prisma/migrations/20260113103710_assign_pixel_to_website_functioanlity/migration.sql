-- AlterTable
ALTER TABLE "App" ADD COLUMN     "websiteDomain" TEXT;

-- CreateIndex
CREATE INDEX "App_websiteDomain_idx" ON "App"("websiteDomain");
