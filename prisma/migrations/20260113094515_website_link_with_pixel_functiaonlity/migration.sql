-- DropIndex
DROP INDEX "Event_browser_idx";

-- DropIndex
DROP INDEX "Event_fingerprint_idx";

-- DropIndex
DROP INDEX "Event_referrer_idx";

-- DropIndex
DROP INDEX "Event_url_idx";

-- CreateTable
CREATE TABLE "Website" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Website_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebsitePixel" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebsitePixel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Website_domain_idx" ON "Website"("domain");

-- CreateIndex
CREATE INDEX "Website_userId_idx" ON "Website"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Website_userId_domain_key" ON "Website"("userId", "domain");

-- CreateIndex
CREATE INDEX "WebsitePixel_websiteId_idx" ON "WebsitePixel"("websiteId");

-- CreateIndex
CREATE INDEX "WebsitePixel_appId_idx" ON "WebsitePixel"("appId");

-- CreateIndex
CREATE UNIQUE INDEX "WebsitePixel_websiteId_appId_key" ON "WebsitePixel"("websiteId", "appId");

-- AddForeignKey
ALTER TABLE "Website" ADD CONSTRAINT "Website_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebsitePixel" ADD CONSTRAINT "WebsitePixel_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "Website"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebsitePixel" ADD CONSTRAINT "WebsitePixel_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE CASCADE ON UPDATE CASCADE;
