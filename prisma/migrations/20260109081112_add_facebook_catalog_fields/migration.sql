-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN     "facebookCatalogEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "facebookCatalogId" TEXT,
ADD COLUMN     "facebookCatalogLastSync" TIMESTAMP(3),
ADD COLUMN     "facebookCatalogSyncStatus" TEXT;
