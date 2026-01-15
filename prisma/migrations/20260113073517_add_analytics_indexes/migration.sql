-- CreateIndex
CREATE INDEX "Event_url_idx" ON "Event"("url");

-- CreateIndex
CREATE INDEX "Event_browser_idx" ON "Event"("browser");

-- CreateIndex
CREATE INDEX "Event_referrer_idx" ON "Event"("referrer");

-- CreateIndex
CREATE INDEX "Event_fingerprint_idx" ON "Event"("fingerprint");
