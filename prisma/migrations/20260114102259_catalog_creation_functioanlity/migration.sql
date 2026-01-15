-- CreateTable
CREATE TABLE "FacebookCatalog" (
    "id" TEXT NOT NULL,
    "catalogId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessId" TEXT,
    "businessName" TEXT,
    "pixelId" TEXT,
    "pixelEnabled" BOOLEAN NOT NULL DEFAULT true,
    "autoSync" BOOLEAN NOT NULL DEFAULT true,
    "productCount" INTEGER NOT NULL DEFAULT 0,
    "lastSync" TIMESTAMP(3),
    "nextSync" TIMESTAMP(3),
    "syncStatus" TEXT NOT NULL DEFAULT 'pending',
    "variantMode" TEXT NOT NULL DEFAULT 'separate',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacebookCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FacebookCatalog_catalogId_key" ON "FacebookCatalog"("catalogId");

-- CreateIndex
CREATE INDEX "FacebookCatalog_userId_idx" ON "FacebookCatalog"("userId");
