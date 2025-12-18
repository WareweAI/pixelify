-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "storeUrl" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "App" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "appToken" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "App_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "url" TEXT,
    "referrer" TEXT,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "country" TEXT,
    "countryCode" TEXT,
    "region" TEXT,
    "city" TEXT,
    "zip" TEXT,
    "lat" DOUBLE PRECISION,
    "lon" DOUBLE PRECISION,
    "timezone" TEXT,
    "isp" TEXT,
    "browser" TEXT,
    "browserVersion" TEXT,
    "os" TEXT,
    "osVersion" TEXT,
    "device" TEXT,
    "deviceType" TEXT,
    "deviceVendor" TEXT,
    "fingerprint" TEXT,
    "sessionId" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmTerm" TEXT,
    "utmContent" TEXT,
    "pageTitle" TEXT,
    "screenWidth" INTEGER,
    "screenHeight" INTEGER,
    "scrollDepth" INTEGER,
    "clickX" INTEGER,
    "clickY" INTEGER,
    "value" DOUBLE PRECISION,
    "currency" TEXT,
    "productId" TEXT,
    "productName" TEXT,
    "quantity" INTEGER,
    "customData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomEvent" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "metaEventName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "pageType" TEXT NOT NULL DEFAULT 'all',
    "pageUrl" TEXT,
    "eventType" TEXT NOT NULL DEFAULT 'click',
    "selector" TEXT,
    "eventData" TEXT,

    CONSTRAINT "CustomEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyStats" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "pageviews" INTEGER NOT NULL DEFAULT 0,
    "uniqueUsers" INTEGER NOT NULL DEFAULT 0,
    "sessions" INTEGER NOT NULL DEFAULT 0,
    "purchases" INTEGER NOT NULL DEFAULT 0,
    "revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsSession" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "fingerprint" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "browser" TEXT,
    "os" TEXT,
    "deviceType" TEXT,
    "country" TEXT,
    "pageviews" INTEGER NOT NULL DEFAULT 0,
    "duration" INTEGER NOT NULL DEFAULT 0,
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErrorLog" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "message" TEXT,
    "stack" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErrorLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "autoTrackPageviews" BOOLEAN NOT NULL DEFAULT true,
    "autoTrackClicks" BOOLEAN NOT NULL DEFAULT true,
    "autoTrackScroll" BOOLEAN NOT NULL DEFAULT true,
    "recordIp" BOOLEAN NOT NULL DEFAULT true,
    "recordLocation" BOOLEAN NOT NULL DEFAULT true,
    "recordSession" BOOLEAN NOT NULL DEFAULT true,
    "metaPixelId" TEXT,
    "metaAccessToken" TEXT,
    "metaPixelEnabled" BOOLEAN NOT NULL DEFAULT false,
    "metaTestEventCode" TEXT,
    "metaVerified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScriptInjection" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "scriptTagId" TEXT,
    "scriptUrl" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScriptInjection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_storeUrl_key" ON "User"("storeUrl");

-- CreateIndex
CREATE UNIQUE INDEX "App_appId_key" ON "App"("appId");

-- CreateIndex
CREATE INDEX "Event_appId_createdAt_idx" ON "Event"("appId", "createdAt");

-- CreateIndex
CREATE INDEX "Event_eventName_idx" ON "Event"("eventName");

-- CreateIndex
CREATE INDEX "Event_country_idx" ON "Event"("country");

-- CreateIndex
CREATE INDEX "Event_deviceType_idx" ON "Event"("deviceType");

-- CreateIndex
CREATE INDEX "CustomEvent_appId_idx" ON "CustomEvent"("appId");

-- CreateIndex
CREATE INDEX "CustomEvent_pageType_idx" ON "CustomEvent"("pageType");

-- CreateIndex
CREATE INDEX "CustomEvent_isActive_idx" ON "CustomEvent"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "CustomEvent_appId_name_key" ON "CustomEvent"("appId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "DailyStats_appId_date_key" ON "DailyStats"("appId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsSession_sessionId_key" ON "AnalyticsSession"("sessionId");

-- CreateIndex
CREATE INDEX "AnalyticsSession_appId_startTime_idx" ON "AnalyticsSession"("appId", "startTime");

-- CreateIndex
CREATE UNIQUE INDEX "AppSettings_appId_key" ON "AppSettings"("appId");

-- CreateIndex
CREATE INDEX "ScriptInjection_shop_idx" ON "ScriptInjection"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "ScriptInjection_appId_shop_key" ON "ScriptInjection"("appId", "shop");

-- AddForeignKey
ALTER TABLE "App" ADD CONSTRAINT "App_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomEvent" ADD CONSTRAINT "CustomEvent_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyStats" ADD CONSTRAINT "DailyStats_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsSession" ADD CONSTRAINT "AnalyticsSession_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErrorLog" ADD CONSTRAINT "ErrorLog_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppSettings" ADD CONSTRAINT "AppSettings_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
