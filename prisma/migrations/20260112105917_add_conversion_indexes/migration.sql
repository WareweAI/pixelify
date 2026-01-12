-- CreateIndex
CREATE INDEX "Event_appId_eventName_createdAt_idx" ON "Event"("appId", "eventName", "createdAt");
