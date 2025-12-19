import { useMemo } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import {
  Page,
  Layout,
  Card,
  DataTable,
  Text,
  InlineStack,
  Badge,
} from "@shopify/polaris";
import { getShopifyInstance } from "../shopify.server";
import prisma from "../db.server";

type VisitorEvent = {
  id: string;
  appId: string;
  eventName: string;
  url: string | null;
  referrer: string | null;
  country: string | null;
  countryCode: string | null;
  city: string | null;
  deviceType: string | null;
  browser: string | null;
  os: string | null;
  createdAt: string;
};

type AppLite = { id: string; appId: string; name: string };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const shopify = getShopifyInstance();
  if (!shopify?.authenticate) {
    throw new Response("Shopify configuration not found", { status: 500 });
  }

  const { session } = await shopify.authenticate.admin(request);
  const shop = session.shop;

  const user = await prisma.user.findUnique({ where: { email: shop } });
  if (!user) {
    return { events: [], apps: [] };
  }

  const apps = await prisma.app.findMany({
    where: { userId: user.id },
    select: { id: true, appId: true, name: true },
  });

  if (!apps.length) {
    return { events: [], apps };
  }

  const events = await prisma.event.findMany({
    where: { appId: { in: apps.map((a) => a.id) } },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      appId: true,
      eventName: true,
      url: true,
      referrer: true,
      country: true,
      countryCode: true,
      city: true,
      deviceType: true,
      browser: true,
      os: true,
      createdAt: true,
    },
  });

  return {
    events: events.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })),
    apps,
  };
};

export default function VisitorsPage() {
  const { events, apps } = useLoaderData<typeof loader>() as {
    events: VisitorEvent[];
    apps: AppLite[];
  };

  const appName = useMemo(
    () => (id: string) => apps.find((a) => a.id === id)?.name || "Unknown",
    [apps]
  );

  return (
    <Page title="Visitors" subtitle="Recent visits with geo and device info">
      <Layout>
        <Layout.Section>
          <Card>
            {!events.length ? (
              <Text as="p" tone="subdued">
                No events yet. Install the pixel and check back after some traffic.
              </Text>
            ) : (
              <DataTable
                columnContentTypes={[
                  "text",
                  "text",
                  "text",
                  "text",
                  "text",
                  "text",
                ]}
                headings={[
                  "App",
                  "Event",
                  "Page",
                  "Location",
                  "Device",
                  "Time",
                ]}
                rows={events.map((e) => [
                  appName(e.appId),
                  e.eventName,
                  e.url ? safePath(e.url) : "-",
                  formatLocation(e.country, e.countryCode, e.city),
                  formatDevice(e.deviceType, e.browser, e.os),
                  new Date(e.createdAt).toLocaleString(),
                ])}
              />
            )}
          </Card>
        </Layout.Section>
        <Layout.Section>
          <InlineStack gap="300">
            <Badge>
              Showing {events.length} of {events.length >= 200 ? "200+" : "recent"} events
            </Badge>
          </InlineStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

function safePath(url: string) {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return url;
  }
}

function formatLocation(
  country: string | null,
  countryCode: string | null,
  city: string | null
) {
  if (city && (country || countryCode)) return `${city}, ${country || countryCode}`;
  if (country || countryCode) return country || countryCode || "-";
  return "-";
}

function formatDevice(
  deviceType: string | null,
  browser: string | null,
  os: string | null
) {
  const parts = [deviceType, browser, os].filter(Boolean);
  return parts.join(" • ") || "-";
}
