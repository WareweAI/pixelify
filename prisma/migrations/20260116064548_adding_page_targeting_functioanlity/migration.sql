-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN     "selectedCollections" TEXT,
ADD COLUMN     "selectedProductTags" TEXT,
ADD COLUMN     "selectedProductTypes" TEXT,
ADD COLUMN     "selectedProducts" TEXT,
ADD COLUMN     "trackingPages" TEXT DEFAULT 'all';
