-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN     "autoTrackAddToCart" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "autoTrackInitiateCheckout" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "autoTrackPurchase" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "autoTrackViewContent" BOOLEAN NOT NULL DEFAULT true;
