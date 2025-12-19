// App Service - Business logic for app management
import prisma from "~/db.server";
import * as crypto from "node:crypto";

interface CreateAppParams {
  userId: string;
  name: string;
  metaAppId?: string;
  metaAccessToken?: string;
}

// Get all apps for a user
export async function getUserApps(userId: string) {
  return prisma.app.findMany({
    where: { userId },
    include: {
      _count: {
        select: { events: true, analyticsSessions: true },
      },
      settings: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

// Get app by ID
export async function getAppById(appId: string) {
  return prisma.app.findUnique({
    where: { id: appId },
    include: {
      settings: true,
      _count: {
        select: { events: true, analyticsSessions: true },
      },
    },
  });
}

// Get app by appId (public ID)
export async function getAppByAppId(appId: string) {
  return prisma.app.findUnique({
    where: { appId },
    include: { settings: true },
  });
}

// Create a new app with settings
export async function createAppWithSettings({
  userId,
  name,
  metaAppId,
  metaAccessToken,
}: CreateAppParams) {
  const appId = crypto.randomBytes(8).toString("hex");
  
  // Generate appToken - use dataset ID (metaAppId) if available, otherwise generate random
  const appToken = metaAppId 
    ? `token_${metaAppId}_${crypto.randomBytes(12).toString("hex")}`
    : `token_${Date.now()}_${crypto.randomBytes(12).toString("hex")}`;

  const app = await prisma.app.create({
    data: {
      appId,
      name,
      userId,
      appToken,
    },
  });

  const settings = await prisma.appSettings.create({
    data: {
      appId: app.id,
      metaPixelId: metaAppId || null,
      metaAccessToken: metaAccessToken || null,
      metaPixelEnabled: !!metaAppId && !!metaAccessToken,
      metaVerified: false,
    },
  });

  return { app, settings };
}

// Rename an app
export async function renameApp(appId: string, newName: string) {
  return prisma.app.update({
    where: { id: appId },
    data: { name: newName },
  });
}

// Delete an app and all its data
export async function deleteAppWithData(appId: string) {
  // Delete in order to respect foreign key constraints
  await prisma.customEvent.deleteMany({ where: { appId } });
  await prisma.appSettings.deleteMany({ where: { appId } });
  await prisma.event.deleteMany({ where: { appId } });
  await prisma.analyticsSession.deleteMany({ where: { appId } });
  await prisma.dailyStats.deleteMany({ where: { appId } });
  await prisma.errorLog.deleteMany({ where: { appId } });
  await prisma.app.delete({ where: { id: appId } });

  return { success: true };
}

// Update app settings
export async function updateAppSettings(
  appId: string,
  data: Partial<{
    autoTrackPageviews: boolean;
    autoTrackClicks: boolean;
    autoTrackScroll: boolean;
    recordIp: boolean;
    recordLocation: boolean;
    recordSession: boolean;
    metaPixelId: string | null;
    metaAccessToken: string | null;
    metaTestEventCode: string | null;
    metaPixelEnabled: boolean;
    metaVerified: boolean;
  }>
) {
  return prisma.appSettings.update({
    where: { appId },
    data,
  });
}

