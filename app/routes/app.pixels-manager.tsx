import { useState, useCallback, useEffect } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useFetcher, useNavigation } from "react-router";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  Button,
  TextField,
  Banner,
  DataTable,
  Box,
  Modal,
  FormLayout,
  Divider,
  Icon,
} from "@shopify/polaris";
import { SearchIcon, EditIcon } from "@shopify/polaris-icons";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const user = await prisma.user.findUnique({
    where: { storeUrl: shop },
    include: {
      apps: {
        include: { settings: true, _count: { select: { events: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!user) {
    return { apps: [], shop };
  }

  return {
    apps: user.apps.map((app) => ({
      id: app.id,
      name: app.name,
      appId: app.appId,
      enabled: app.enabled,
      trackingPages: app.settings?.trackingPages || "all",
      selectedPageTypes: app.settings?.selectedProductTypes || [],
      serverApiEnabled: app.settings?.metaPixelEnabled || false,
      eventCount: app._count.events,
      metaPixelId: app.settings?.metaPixelId,
      settings: app.settings,
      createdAt: app.createdAt,
    })),
    shop,
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent");

  const user = await prisma.user.findUnique({
    where: { storeUrl: shop },
    include: { apps: true },
  });

  if (!user) {
    return { error: "User not found" };
  }

  if (intent === "toggle-server-api") {
    const appId = formData.get("appId") as string;
    const enabled = formData.get("enabled") === "true";

    const app = await prisma.app.findUnique({
      where: { id: appId },
      include: { settings: true },
    });

    if (!app || app.userId !== user.id) {
      return { error: "App not found" };
    }

    if (app.settings) {
      await prisma.appSettings.update({
        where: { id: app.settings.id },
        data: { metaPixelEnabled: enabled },
      });
    } else {
      await prisma.appSettings.create({
        data: { appId: app.id, metaPixelEnabled: enabled },
      });
    }

    return { success: true, message: `Server-Side API ${enabled ? "enabled" : "disabled"}` };
  }

  return { error: "Unknown intent" };
}

export default function PixelsManagerPage() {
  const { apps, shop } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const navigation = useNavigation();

  const [searchTerm, setSearchTerm] = useState("");
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedPixels, setSelectedPixels] = useState<Set<string>>(new Set());
  const [showEditModal, setShowEditModal] = useState<string | null>(null);
  const [showTestModal, setShowTestModal] = useState<string | null>(null);

  // Filter apps based on search term
  const filteredApps = apps.filter((app) =>
    app.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    app.appId.toLowerCase().includes(searchTerm.toLowerCase()) ||
    app.metaPixelId?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Pagination
  const startIdx = (currentPage - 1) * rowsPerPage;
  const endIdx = startIdx + rowsPerPage;
  const paginatedApps = filteredApps.slice(startIdx, endIdx);
  const totalPages = Math.ceil(filteredApps.length / rowsPerPage);

  const handleToggleServerApi = useCallback(
    (appId: string, currentState: boolean) => {
      const formData = new FormData();
      formData.append("intent", "toggle-server-api");
      formData.append("appId", appId);
      formData.append("enabled", (!currentState).toString());
      fetcher.submit(formData, { method: "POST" });
    },
    [fetcher]
  );

  const toggleSelectPixel = useCallback((appId: string) => {
    setSelectedPixels((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(appId)) {
        newSet.delete(appId);
      } else {
        newSet.add(appId);
      }
      return newSet;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedPixels.size === paginatedApps.length) {
      setSelectedPixels(new Set());
    } else {
      setSelectedPixels(new Set(paginatedApps.map((app) => app.id)));
    }
  }, [paginatedApps, selectedPixels.size]);

  // Get page tracking display
  const getPageTrackingDisplay = (trackingPages: string, pageCount: number) => {
    if (trackingPages === "all") {
      return <Badge tone="success">All pages</Badge>;
    } else if (trackingPages === "selected") {
      return <Badge>{`${pageCount} pages`}</Badge>;
    } else if (trackingPages === "excluded") {
      return <Badge tone="warning">{`Excluded: ${pageCount} pages`}</Badge>;
    }
    return <Badge tone="subdued">Not configured</Badge>;
  };

  const rows = paginatedApps.map((app) => [
    <input
      key={`checkbox-${app.id}`}
      type="checkbox"
      checked={selectedPixels.has(app.id)}
      onChange={() => toggleSelectPixel(app.id)}
      style={{ cursor: "pointer" }}
    />,
    <div key={`status-${app.id}`}>
      <Badge tone={app.enabled ? "success" : "attention"}>
        {app.enabled ? "Active" : "Inactive"}
      </Badge>
    </div>,
    <Text key={`id-${app.id}`} variant="bodySm" fontWeight="semibold" as="span">
      {app.appId}
    </Text>,
    <Text key={`name-${app.id}`} variant="bodyMd" as="span">
      {app.name}
    </Text>,
    <div key={`pages-${app.id}`}>
      {getPageTrackingDisplay(
        app.trackingPages,
        (app.selectedPageTypes as any[])?.length || 0
      )}
    </div>,
    <div key={`api-${app.id}`} style={{ display: "flex", justifyContent: "center" }}>
      <Button
        variant={app.serverApiEnabled ? "primary" : "secondary"}
        onClick={() => handleToggleServerApi(app.id, app.serverApiEnabled)}
        accessibilityLabel="Toggle Server-Side API"
      >
        {app.serverApiEnabled ? "Enabled" : "Disabled"}
      </Button>
    </div>,
    <Button
      key={`test-${app.id}`}
      size="slim"
      variant="secondary"
      onClick={() => setShowTestModal(app.id)}
    >
      Set up
    </Button>,
    <Button
      key={`edit-${app.id}`}
      size="slim"
      variant="plain"
      onClick={() => setShowEditModal(app.id)}
      icon={EditIcon}
      accessibilityLabel="Edit"
    />,
  ]);

  return (
    <Page
      title="Facebook Pixel Manager"
      subtitle={`Manage ${apps.length} pixel${apps.length !== 1 ? "s" : ""}`}
      primaryAction={{
        content: "Add New Pixel",
        url: "/app/dashboard?modal=create",
      }}
    >
      <Layout>
        {/* Messages */}
        {fetcher.data?.success && (
          <Layout.Section>
            <Banner tone="success" onDismiss={() => fetcher.data = null}>
              <p>{fetcher.data.message}</p>
            </Banner>
          </Layout.Section>
        )}
        {fetcher.data?.error && (
          <Layout.Section>
            <Banner tone="critical" onDismiss={() => fetcher.data = null}>
              <p>{fetcher.data.error}</p>
            </Banner>
          </Layout.Section>
        )}

        {/* Filter and Actions */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Box style={{ flex: 1, maxWidth: "400px" }}>
                  <TextField
                    label=""
                    type="text"
                    placeholder="Filter by pixel title, pixel ID"
                    value={searchTerm}
                    onChange={setSearchTerm}
                    clearButton
                    onClearButtonClick={() => setSearchTerm("")}
                    prefix={<SearchIcon />}
                    autoComplete="off"
                  />
                </Box>
                {selectedPixels.size > 0 && (
                  <InlineStack gap="200">
                    <Text as="span" variant="bodySm" tone="subdued">
                      {selectedPixels.size} selected
                    </Text>
                    <Button
                      size="slim"
                      variant="secondary"
                      tone="critical"
                      onClick={() => setSelectedPixels(new Set())}
                    >
                      Clear Selection
                    </Button>
                  </InlineStack>
                )}
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Pixels Table */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              {filteredApps.length === 0 ? (
                <Box paddingBlock="400" paddingInline="400">
                  <Text as="p" variant="bodyMd" tone="subdued" alignment="center">
                    {apps.length === 0
                      ? "No pixels configured yet. Create your first pixel to get started."
                      : "No pixels match your search."}
                  </Text>
                </Box>
              ) : (
                <>
                  <div style={{ width: "100%", overflowX: "auto" }}>
                    <DataTable
                      columnContentTypes={[
                        "text",
                        "text",
                        "text",
                        "text",
                        "text",
                        "text",
                        "text",
                        "text",
                      ]}
                      headings={[
                        <input
                          key="select-all"
                          type="checkbox"
                          checked={selectedPixels.size === paginatedApps.length && paginatedApps.length > 0}
                          onChange={toggleSelectAll}
                          style={{ cursor: "pointer" }}
                        />,
                        "Status",
                        "Pixel ID",
                        "Title",
                        "Pages",
                        "Server-Side API",
                        "Test Server Events",
                        "Action",
                      ]}
                      rows={rows}
                    />
                  </div>

                  {/* Pagination */}
                  {filteredApps.length > rowsPerPage && (
                    <Box paddingBlockStart="300">
                      <InlineStack gap="400" align="space-between" blockAlign="center">
                        <InlineStack gap="200" blockAlign="center">
                          <Text as="span" variant="bodySm" tone="subdued">
                            Rows per page:
                          </Text>
                          <select
                            value={rowsPerPage}
                            onChange={(e) => {
                              setRowsPerPage(parseInt(e.target.value));
                              setCurrentPage(1);
                            }}
                            style={{
                              padding: "6px 12px",
                              borderRadius: "4px",
                              border: "1px solid #d9d9db",
                              fontSize: "14px",
                              cursor: "pointer",
                            }}
                          >
                            <option value={5}>5</option>
                            <option value={10}>10</option>
                            <option value={25}>25</option>
                            <option value={50}>50</option>
                          </select>
                        </InlineStack>

                        <Text as="span" variant="bodySm" tone="subdued">
                          {startIdx + 1}-{Math.min(endIdx, filteredApps.length)} of{" "}
                          {filteredApps.length}
                        </Text>

                        <InlineStack gap="200">
                          <Button
                            size="slim"
                            variant="secondary"
                            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                            disabled={currentPage === 1}
                          >
                            Previous
                          </Button>
                          <Text as="span" variant="bodySm" tone="subdued">
                            {currentPage} / {totalPages}
                          </Text>
                          <Button
                            size="slim"
                            variant="secondary"
                            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                            disabled={currentPage === totalPages}
                          >
                            Next
                          </Button>
                        </InlineStack>
                      </InlineStack>
                    </Box>
                  )}
                </>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Help Footer */}
        <Layout.Section>
          <Box paddingBlockStart="400">
            <InlineStack gap="200" blockAlign="center" distribute="center">
              <Text as="span" variant="bodySm" tone="subdued">
                For more guidance, visit our{" "}
              </Text>
              <a href="https://help.pixelify.app" target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb" }}>
                knowledge base
              </a>
              <Text as="span" variant="bodySm" tone="subdued">
                {" "}or{" "}
              </Text>
              <a href="https://support.pixelify.app" target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb" }}>
                request support
              </a>
            </InlineStack>
          </Box>
        </Layout.Section>
      </Layout>

      {/* Edit Modal */}
      {showEditModal && (
        <Modal
          open={true}
          onClose={() => setShowEditModal(null)}
          title="Edit Pixel"
          primaryAction={{
            content: "Save",
            onAction: () => setShowEditModal(null),
          }}
          secondaryActions={[
            {
              content: "Cancel",
              onAction: () => setShowEditModal(null),
            },
          ]}
        >
          <Modal.Section>
            <BlockStack gap="300">
              <Text as="p" variant="bodyMd">
                Edit options for pixel: {apps.find((a) => a.id === showEditModal)?.name}
              </Text>
              {/* Add edit form here */}
            </BlockStack>
          </Modal.Section>
        </Modal>
      )}

      {/* Test Server Events Modal */}
      {showTestModal && (
        <Modal
          open={true}
          onClose={() => setShowTestModal(null)}
          title="Test Server Events"
          primaryAction={{
            content: "Send Test Event",
            onAction: () => setShowTestModal(null),
          }}
          secondaryActions={[
            {
              content: "Cancel",
              onAction: () => setShowTestModal(null),
            },
          ]}
        >
          <Modal.Section>
            <BlockStack gap="300">
              <Text as="p" variant="bodyMd">
                Send a test server event to verify your setup for pixel:{" "}
                <strong>{apps.find((a) => a.id === showTestModal)?.name}</strong>
              </Text>
              <Banner tone="info">
                <p>
                  This will send a test Purchase event to your server-side API. Check your
                  Meta Events Manager to confirm receipt.
                </p>
              </Banner>
              {/* Add test event form here */}
            </BlockStack>
          </Modal.Section>
        </Modal>
      )}
    </Page>
  );
}
