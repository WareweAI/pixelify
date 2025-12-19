import { useState, useEffect, useCallback } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { getShopifyInstance } from "../shopify.server";
import prisma from "../db.server";
import {
  Page,
  Layout,
  Card,
  Text,
  DataTable,
  Badge,
  EmptyState,
  Select,
  InlineStack,
  BlockStack,
  Spinner,
  Button,
} from "@shopify/polaris";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const shopify = getShopifyInstance();
  if (!shopify?.authenticate) {
    throw new Response("Shopify configuration not found", { status: 500 });
  }
  const { session } = await shopify.authenticate.admin(request);
  const shop = session.shop;

  const user = await prisma.user.findUnique({
    where: { email: shop },
  });

  if (!user) {
    return { apps: [] };
  }

  const apps = await prisma.app.findMany({
    where: { userId: user.id },
    select: { id: true, appId: true, name: true },
  });

  return { apps };
};

interface EventData {
  id: string;
  eventName: string;
  url: string | null;
  city: string | null;
  country: string | null;
  browser: string | null;
  deviceType: string | null;
  createdAt: string;
}

export default function EventsPage() {
  const { apps } = useLoaderData<typeof loader>();
  const [selectedApp, setSelectedApp] = useState(apps[0]?.appId || "");
  const [events, setEvents] = useState<EventData[]>([]);
  const [loading, setLoading] = useState(false);
  const [eventFilter, setEventFilter] = useState("");
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const fetchEvents = useCallback(async () => {
    if (!selectedApp) return;

    setLoading(true);
    try {
      let url = `/api/events?appId=${selectedApp}&limit=${limit}&offset=${offset}`;
      if (eventFilter) {
        url += `&eventName=${encodeURIComponent(eventFilter)}`;
      }
      
      const res = await fetch(url);
      const data = await res.json();
      
      if (data.events) {
        setEvents(data.events);
        setTotal(data.total || 0);
      }
    } catch (error) {
      console.error("Failed to fetch events:", error);
    } finally {
      setLoading(false);
    }
  }, [selectedApp, eventFilter, offset]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    setOffset(0);
  }, [selectedApp, eventFilter]);

  const getBadgeTone = (eventName: string) => {
    switch (eventName) {
      case "pageview":
        return "info";
      case "purchase":
        return "success";
      case "addToCart":
        return "attention";
      case "initiateCheckout":
        return "warning";
      default:
        return undefined;
    }
  };

  const rows = events.map((event) => {
    let pathname = "-";
    try {
      if (event.url) {
        pathname = new URL(event.url).pathname;
      }
    } catch {
      pathname = event.url || "-";
    }

    return [
      <Badge key={event.id} tone={getBadgeTone(event.eventName)}>
        {event.eventName}
      </Badge>,
      <Text key={`url-${event.id}`} as="span" truncate>
        {pathname}
      </Text>,
      [event.city, event.country].filter(Boolean).join(", ") || "-",
      event.browser || "-",
      event.deviceType || "-",
      new Date(event.createdAt).toLocaleString(),
    ];
  });

  const appOptions = apps.map((app: { appId: string; name: string }) => ({
    label: app.name,
    value: app.appId,
  }));

  const eventFilterOptions = [
    { label: "All Events", value: "" },
    { label: "Pageviews", value: "pageview" },
    { label: "Purchases", value: "purchase" },
    { label: "Add to Cart", value: "addToCart" },
    { label: "View Content", value: "viewContent" },
    { label: "Initiate Checkout", value: "initiateCheckout" },
    { label: "Lead", value: "lead" },
    { label: "Search", value: "search" },
    { label: "Subscribe", value: "subscribe" },
  ];

  if (apps.length === 0) {
    return (
      <Page title="Event Logs">
        <Layout>
          <Layout.Section>
            <Card>
              <EmptyState
                heading="No pixels yet"
                action={{ content: "Create Pixel", url: "/app/dashboard" }}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>Create a pixel to start tracking events.</p>
              </EmptyState>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return (
    <Page title="Event Logs">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack gap="400" wrap={false}>
                <div style={{ minWidth: "200px" }}>
                  <Select
                    label="Select Pixel"
                    options={appOptions}
                    value={selectedApp}
                    onChange={(value) => {
                      setSelectedApp(value);
                      setEvents([]);
                    }}
                  />
                </div>
                <div style={{ minWidth: "200px" }}>
                  <Select
                    label="Filter by Event"
                    options={eventFilterOptions}
                    value={eventFilter}
                    onChange={setEventFilter}
                  />
                </div>
                <div style={{ alignSelf: "flex-end" }}>
                  <Button onClick={fetchEvents} loading={loading}>
                    Refresh
                  </Button>
                </div>
              </InlineStack>

              <InlineStack align="space-between">
                <Text as="p" tone="subdued">
                  {total > 0 ? `Showing ${offset + 1}-${Math.min(offset + limit, total)} of ${total} events` : "No events"}
                </Text>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              {loading ? (
                <BlockStack gap="400" inlineAlign="center">
                  <Spinner size="large" />
                  <Text as="p">Loading events...</Text>
                </BlockStack>
              ) : events.length === 0 ? (
                <EmptyState
                  heading="No events yet"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>Events will appear here once your pixel starts tracking.</p>
                </EmptyState>
              ) : (
                <>
                  <DataTable
                    columnContentTypes={["text", "text", "text", "text", "text", "text"]}
                    headings={["Event", "Page", "Location", "Browser", "Device", "Time"]}
                    rows={rows}
                  />
                  
                  {total > limit && (
                    <InlineStack align="center" gap="200">
                      <Button
                        disabled={offset === 0}
                        onClick={() => setOffset(Math.max(0, offset - limit))}
                      >
                        Previous
                      </Button>
                      <Text as="span" tone="subdued">
                        Page {Math.floor(offset / limit) + 1} of {Math.ceil(total / limit)}
                      </Text>
                      <Button
                        disabled={offset + limit >= total}
                        onClick={() => setOffset(offset + limit)}
                      >
                        Next
                      </Button>
                    </InlineStack>
                  )}
                </>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
