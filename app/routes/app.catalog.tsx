import { useState, useEffect } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher, useNavigate } from "react-router";
import { getShopifyInstance } from "../shopify.server";
import prisma from "../db.server";
import {
  Page, Card, Button, TextField, Layout, Text, BlockStack, InlineStack,
  Banner, Select, Badge, Box, Spinner, Link, IndexTable,
  Pagination, Popover, ActionList, Modal, RadioButton, Checkbox,
} from "@shopify/polaris";
import { RefreshIcon, MenuHorizontalIcon, ExternalIcon } from "@shopify/polaris-icons";
import { FacebookConnectionStatus } from "../components/FacebookConnectionStatus";

interface Catalog {
  id: string;
  catalogId: string;
  name: string;
  pixelId: string | null;
  pixelEnabled: boolean;
  autoSync: boolean;
  productCount: number;
  lastSync: string | null;
  nextSync: string | null;
  syncStatus: string;
}

interface BusinessAccount { id: string; name: string; }
interface Pixel { id: string; name: string; }

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const shopify = getShopifyInstance();
  if (!shopify?.authenticate) throw new Response("Shopify not configured", { status: 500 });

  let session, admin;
  try {
    const authResult = await shopify.authenticate.admin(request);
    session = authResult.session;
    admin = authResult.admin;
  } catch (error) {
    // If it's a redirect response, re-throw it for proper redirect handling
    if (error instanceof Response) {
      // Check if it's an HTML response (Shopify bounce page) instead of proper redirect
      const contentType = error.headers.get('content-type');
      if (contentType?.includes('text/html') && error.status === 200) {
        console.error("[Catalog] Session expired - Shopify returned HTML bounce page");
        throw new Response("Session expired. Please reload the app to re-authenticate.", { status: 401 });
      }
      // Otherwise, it's a proper redirect (302/401) - re-throw it
      throw error;
    }
    console.error("[Catalog] Authentication error:", error);
    throw new Response("Authentication failed. Please refresh the page.", { status: 401 });
  }

  const shop = session.shop;

  // Get user first
  const user = await prisma.user.findUnique({ where: { storeUrl: shop } });
  if (!user) throw new Response("User not found", { status: 404 });

  // Get apps with settings to find access token
  const apps = await prisma.app.findMany({ 
    where: { userId: user.id }, 
    include: { settings: true } 
  });
  
  console.log(`[Catalog Loader] Found ${apps.length} apps for user ${user.id}`);
  
  // Debug: Log all apps and their tokens
  apps.forEach((app: any, index: number) => {
    const hasToken = !!app.settings?.metaAccessToken;
    const tokenPreview = app.settings?.metaAccessToken ? app.settings.metaAccessToken.substring(0, 20) + '...' : 'none';
    console.log(`[Catalog Loader] App ${index + 1}: ${app.name}, hasSettings: ${!!app.settings}, hasToken: ${hasToken}, tokenPreview: ${tokenPreview}`);
  });
  
  const appWithToken = apps.find((app: any) => app.settings?.metaAccessToken);
  const accessToken = appWithToken?.settings?.metaAccessToken || null;
  
  console.log(`[Catalog Loader] User: ${user.id}, Apps: ${apps.length}, Has token: ${!!accessToken}`);

  // Fetch product count and Facebook user info in parallel
  const [productCountRes, facebookUser, dbCatalogs] = await Promise.all([
    // Get active product count
    admin.graphql(`query { products(first: 250, query: "status:active") { edges { node { id } } } }`)
      .then(r => r.json())
      .then(data => data.data?.products?.edges?.length || 0)
      .catch(() => 0),
    
    // Fetch Facebook user info if token exists
    accessToken
      ? fetch(`https://graph.facebook.com/v18.0/me?fields=id,name,picture.type(large)&access_token=${accessToken}`)
          .then(res => res.json())
          .then(data => {
            if (data.error) {
              console.error(`[Catalog Loader] Facebook API error:`, data.error);
              return null;
            }
            console.log(`[Catalog Loader] Facebook user: ${data.name}`);
            return {
              id: data.id,
              name: data.name,
              picture: data.picture?.data?.url || null,
            };
          })
          .catch((err) => {
            console.error(`[Catalog Loader] Facebook fetch error:`, err);
            return null;
          })
      : Promise.resolve(null),
    
    // Get catalogs from DATABASE (only catalogs created through Pixelify)
    prisma.facebookCatalog.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    }).catch(() => []),
  ]);

  const productCount = productCountRes;

  // Fetch actual product counts from Facebook for all catalogs to auto-fix incorrect counts
  const catalogsWithCorrectCounts = await Promise.all(
    dbCatalogs.map(async (cat: any) => {
      try {
        if (accessToken && cat.catalogId) {
          console.log(`[Catalog Loader] Fetching actual count from Facebook for catalog ${cat.name}...`);
          const countRes = await fetch(
            `https://graph.facebook.com/v18.0/${cat.catalogId}/products?fields=id&limit=1&summary=true&access_token=${accessToken}`
          );
          const countData = await countRes.json();
          
          if (countData.summary?.total_count !== undefined) {
            const actualCount = Math.max(0, Math.floor(countData.summary.total_count || 0));
            console.log(`[Catalog Loader] Catalog ${cat.name}: DB has ${cat.productCount}, Facebook has ${actualCount}`);
            
            // If counts don't match, update database
            if (actualCount !== cat.productCount) {
              console.log(`[Catalog Loader] ⚠️ Mismatch detected! Updating database from ${cat.productCount} to ${actualCount}...`);
              const updated = await prisma.facebookCatalog.update({
                where: { id: cat.id },
                data: { productCount: actualCount, lastSync: new Date() },
              });
              console.log(`[Catalog Loader] ✅ Updated catalog ${cat.name} productCount to ${updated.productCount}`);
              return updated;
            }
          }
        }
      } catch (err) {
        console.error(`[Catalog Loader] Error fetching count for ${cat.name}:`, err);
      }
      return cat;
    })
  );

  const catalogs: Catalog[] = catalogsWithCorrectCounts.map((cat: any) => ({
    id: cat.id,
    catalogId: cat.catalogId,
    name: cat.name,
    pixelId: cat.pixelId,
    pixelEnabled: cat.pixelEnabled,
    autoSync: cat.autoSync,
    productCount: cat.productCount,
    lastSync: cat.lastSync?.toISOString() || null,
    nextSync: cat.nextSync?.toISOString() || null,
    syncStatus: cat.syncStatus,
  }));

  const syncedProductCount = catalogs.reduce((sum, c) => sum + c.productCount, 0);
  const hasToken = !!accessToken;
  const isConnected = hasToken && !!facebookUser;

  console.log(`[Catalog Loader] ✅ Final counts - productCount: ${productCount}, syncedProductCount: ${syncedProductCount}`);

  return { 
    shop, 
    hasToken, 
    productCount, 
    syncedProductCount, 
    catalogs, 
    userId: user.id,
    facebookUser,
    isConnected,
  };
};


// Removed old action and makeFbProduct - now using /api/catalog for all operations

export default function CatalogPage() {
  const { shop, hasToken, productCount, syncedProductCount, catalogs: initialCatalogs, facebookUser: initialFacebookUser, isConnected } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const navigate = useNavigate();

  const [catalogs, setCatalogs] = useState<Catalog[]>(initialCatalogs); // Now mutable for optimistic updates
  const [facebookUser] = useState<{ id: string; name: string; picture?: string } | null>(initialFacebookUser); // Read-only
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [businesses, setBusinesses] = useState<BusinessAccount[]>([]);
  const [pixels, setPixels] = useState<Pixel[]>([]);
  const [selectedBusiness, setSelectedBusiness] = useState("");
  const [selectedBusinessName, setSelectedBusinessName] = useState("");
  const [selectedPixels, setSelectedPixels] = useState<string[]>([]);
  const [catalogName, setCatalogName] = useState("");
  const [productSelection, setProductSelection] = useState<"all" | "selected">("all");
  const [variantSubmission, setVariantSubmission] = useState<"separate" | "grouped" | "first">("separate");
  const [isLoadingBusinesses, setIsLoadingBusinesses] = useState(false);
  const [isLoadingPixels, setIsLoadingPixels] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activePopover, setActivePopover] = useState<string | null>(null);
  const [filterBusiness, setFilterBusiness] = useState<string>("all");
  const [isLoadingFilterBusinesses, setIsLoadingFilterBusinesses] = useState(false);

  const isLoading = fetcher.state !== "idle";
  const filteredCatalogs = catalogs.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase());
    // Business filter would require storing businessId in Catalog, handled via UI display
    return matchesSearch;
  });

  useEffect(() => {
    if (fetcher.data?.businesses) { setBusinesses(fetcher.data.businesses); setIsLoadingBusinesses(false); }
    if (fetcher.data?.pixels) { setPixels(fetcher.data.pixels); setIsLoadingPixels(false); }
    if (fetcher.data?.filterBusinesses) { setBusinesses(fetcher.data.filterBusinesses); setIsLoadingFilterBusinesses(false); }
    
    // Handle catalog updates without full page reload
    if (fetcher.data?.catalog) {
      const updatedCatalog = fetcher.data.catalog;
      setCatalogs(prev => prev.map(cat => 
        cat.id === updatedCatalog.id ? { ...cat, ...updatedCatalog } : cat
      ));
      
      // If autosync was enabled, trigger immediate sync
      if (fetcher.data?.triggerSync && updatedCatalog.id) {
        console.log('[Catalog] AutoSync enabled, triggering immediate sync...');
        setTimeout(() => {
          fetcher.submit(
            { intent: "sync-catalog", id: updatedCatalog.id }, 
            { method: "POST", action: "/api/catalog" }
          );
        }, 500);
      }
      
      // If sync completed successfully, reload page to show updated counts
      if (fetcher.data?.success && updatedCatalog.syncStatus === "synced") {
        console.log('[Catalog] Sync completed successfully. Updated productCount:', updatedCatalog.productCount);
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      }
      
      // If product count was refreshed, reload page to show updated global count
      if (fetcher.data?.success && updatedCatalog.productCount !== undefined && fetcher.data?.message?.includes("Product count updated")) {
        console.log('[Catalog] Product count refreshed to:', updatedCatalog.productCount);
        setTimeout(() => {
          window.location.reload();
        }, 800);
      }
    }
    
    // Handle token expiration
    if (fetcher.data?.tokenExpired) {
      console.error('[Catalog] Token expired, user needs to reconnect Facebook');
      // Show error banner with reconnect button
    }
    
    // Only reload for create/delete operations
    if (fetcher.data?.reload) {
      window.location.reload();
    }
  }, [fetcher.data]);

  useEffect(() => {
    if (selectedBusiness) {
      setIsLoadingPixels(true);
      const biz = businesses.find(b => b.id === selectedBusiness);
      setSelectedBusinessName(biz?.name || "");
      fetcher.submit({ intent: "fetch-pixels", businessId: selectedBusiness }, { method: "POST", action: "/api/catalog" });
    } else { setPixels([]); }
  }, [selectedBusiness]);

  // Load filter businesses on component mount
  useEffect(() => {
    if (isConnected && filterBusiness === "all" && businesses.length === 0) {
      setIsLoadingFilterBusinesses(true);
      fetcher.submit({ intent: "fetch-filter-businesses" }, { method: "POST", action: "/api/catalog" });
    }
  }, [isConnected]);

  const openCreateModal = () => {
    setShowCreateModal(true);
    setIsLoadingBusinesses(true);
    fetcher.submit({ intent: "fetch-businesses" }, { method: "POST", action: "/api/catalog" });
  };

  const handleCreate = () => {
    if (!selectedBusiness || !catalogName.trim()) return;
    fetcher.submit({
      intent: "create-catalog",
      businessId: selectedBusiness,
      businessName: selectedBusinessName,
      pixelIds: JSON.stringify(selectedPixels),
      catalogName: catalogName.trim(),
      variantSubmission,
    }, { method: "POST", action: "/api/catalog" });
    setShowCreateModal(false);
    resetForm();
  };

  const handleSync = (id: string) => {
    fetcher.submit({ intent: "sync-catalog", id }, { method: "POST", action: "/api/catalog" });
    setActivePopover(null);
  };

  const handleToggleAutosync = (id: string, enabled: boolean) => {
    // Optimistic update - instant UI feedback
    setCatalogs(prev => prev.map(cat => 
      cat.id === id ? { ...cat, autoSync: !enabled } : cat
    ));
    
    fetcher.submit({ intent: "toggle-autosync", id, enabled: String(!enabled) }, { method: "POST", action: "/api/catalog" });
  };

  const handleTogglePixel = (id: string, enabled: boolean) => {
    // Optimistic update - instant UI feedback
    setCatalogs(prev => prev.map(cat => 
      cat.id === id ? { ...cat, pixelEnabled: !enabled } : cat
    ));
    
    fetcher.submit({ intent: "toggle-pixel", id, enabled: String(!enabled) }, { method: "POST", action: "/api/catalog" });
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this catalog?")) {
      fetcher.submit({ intent: "delete-catalog", id }, { method: "POST", action: "/api/catalog" });
      setActivePopover(null);
    }
  };

  const handleRefreshCount = (id: string) => {
    fetcher.submit({ intent: "refresh-count", id }, { method: "POST", action: "/api/catalog" });
    setActivePopover(null);
  };

  const handleConnectPixel = (id: string) => {
    fetcher.submit({ intent: "connect-pixel-to-catalog", id }, { method: "POST", action: "/api/catalog" });
    setActivePopover(null);
  };

  const resetForm = () => {
    setSelectedBusiness(""); setSelectedBusinessName(""); setSelectedPixels([]); setCatalogName("");
    setProductSelection("all"); setVariantSubmission("separate");
  };

  const formatDate = (d: string | null) => d ? new Date(d).toLocaleString("en-US", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).replace(",", "") : "-";

  if (!hasToken) {
    return (
      <Page title="Catalog manager" fullWidth>
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400" inlineAlign="center">
                <div style={{ 
                  width: "80px", 
                  height: "80px", 
                  borderRadius: "50%", 
                  backgroundColor: "#f3f4f6", 
                  display: "flex", 
                  alignItems: "center", 
                  justifyContent: "center",
                  fontSize: "40px"
                }}>
                  🔌
                </div>
                <BlockStack gap="200" inlineAlign="center">
                  <Text as="h2" variant="headingLg">Facebook Not Connected</Text>
                  <Text as="p" tone="subdued" alignment="center">
                    Connect your Facebook account in Dashboard to create and manage product catalogs.
                  </Text>
                </BlockStack>
                <Button variant="primary" size="large" onClick={() => navigate("/app/dashboard")}>
                  Connect Facebook
                </Button>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return (
    <Page title="Catalog manager" fullWidth primaryAction={{ content: "Create catalog", onAction: openCreateModal }}>
      <Layout>
        {fetcher.data?.message && <Layout.Section><Banner tone="success" onDismiss={() => {}}>{fetcher.data.message}</Banner></Layout.Section>}
        {fetcher.data?.error && (
          <Layout.Section>
            <Banner 
              tone="critical" 
              onDismiss={() => {}}
              action={fetcher.data?.tokenExpired ? { content: "Reconnect Facebook", url: "/app/dashboard" } : undefined}
            >
              {fetcher.data.error}
            </Banner>
          </Layout.Section>
        )}

        {/* Product Stats */}
        <Layout.Section>
          <Card>
            <BlockStack gap="100">
              <Text as="p">Total published products: <Text as="span" fontWeight="bold">{productCount} products</Text></Text>
              <Text as="p" tone="subdued">Products synced to Pixelify: <Text as="span" fontWeight="bold">{syncedProductCount}/{productCount} products</Text></Text>
            </BlockStack>
          </Card>
        </Layout.Section>


        {/* Connected Account */}
        <Layout.Section>
          <FacebookConnectionStatus
            isConnected={isConnected}
            facebookUser={facebookUser}
            onConnect={() => navigate("/app/dashboard")}
            onDisconnect={() => navigate("/app/dashboard")}
            showActions={true}
          />
        </Layout.Section>

        {/* Filters */}
        <Layout.Section>
          <InlineStack align="space-between" blockAlign="end">
            <InlineStack gap="400">
              <Box minWidth="250px">
                <Select 
                  label="Choose Business account" 
                  options={[
                    { label: "All", value: "all" },
                    ...businesses.map(b => ({ label: b.name, value: b.id }))
                  ]} 
                  value={filterBusiness} 
                  onChange={setFilterBusiness}
                  disabled={isLoadingFilterBusinesses}
                />
              </Box>
              <Box minWidth="300px"><TextField label="Search" value={searchQuery} onChange={setSearchQuery} placeholder="Search by catalog name" autoComplete="off" clearButton onClearButtonClick={() => setSearchQuery("")} /></Box>
            </InlineStack>
            <Button icon={RefreshIcon} onClick={() => window.location.reload()}>Refresh</Button>
          </InlineStack>
        </Layout.Section>

        {/* Catalogs Table */}
        <Layout.Section>
          <Card padding="0">
            <IndexTable
              itemCount={filteredCatalogs.length}
              headings={[{ title: "Autosync" }, { title: "Catalog name" }, { title: "Created upload" }, { title: "Next update" }, { title: "Tracking pixel" }, { title: "Action" }]}
              selectable={false}
            >
              {filteredCatalogs.map((cat, i) => (
                <IndexTable.Row id={cat.id} key={cat.id} position={i}>
                  <IndexTable.Cell>
                    <div onClick={() => handleToggleAutosync(cat.id, cat.autoSync)} style={{ width: "44px", height: "24px", borderRadius: "12px", backgroundColor: cat.autoSync ? "#000" : "#ccc", position: "relative", cursor: "pointer", display: "flex", alignItems: "center", paddingLeft: cat.autoSync ? "6px" : "24px" }}>
                      <Text as="span" variant="bodySm" fontWeight="bold" tone={cat.autoSync ? "text-inverse" : "subdued"}>{cat.autoSync ? "ON" : "OFF"}</Text>
                      <div style={{ width: "18px", height: "18px", borderRadius: "50%", backgroundColor: "#fff", position: "absolute", top: "3px", right: cat.autoSync ? "3px" : "23px", transition: "right 0.2s" }} />
                    </div>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <BlockStack gap="050">
                      <Link url={`https://business.facebook.com/commerce/catalogs/${cat.catalogId}/products`} external>{cat.name}</Link>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Products synced: <Text as="span" fontWeight="bold">{cat.productCount}/{productCount}</Text> | Catalog ID: {cat.catalogId}
                      </Text>
                    </BlockStack>
                  </IndexTable.Cell>
                  <IndexTable.Cell><Text as="p">{formatDate(cat.lastSync)}</Text></IndexTable.Cell>
                  <IndexTable.Cell><Text as="p">{formatDate(cat.nextSync)}</Text></IndexTable.Cell>
                  <IndexTable.Cell>
                    <InlineStack gap="200" blockAlign="center">
                      <Text as="p">{cat.pixelId || "-"}</Text>
                      {cat.pixelId && (
                        <div onClick={() => handleTogglePixel(cat.id, cat.pixelEnabled)} style={{ width: "36px", height: "20px", borderRadius: "10px", backgroundColor: cat.pixelEnabled ? "#000" : "#ccc", position: "relative", cursor: "pointer" }}>
                          <div style={{ width: "16px", height: "16px", borderRadius: "50%", backgroundColor: "#fff", position: "absolute", top: "2px", right: cat.pixelEnabled ? "2px" : "18px", transition: "right 0.2s" }} />
                        </div>
                      )}
                    </InlineStack>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <InlineStack gap="200" blockAlign="center">
                      <Button icon={ExternalIcon} variant="plain" url={`https://business.facebook.com/commerce/catalogs/${cat.catalogId}/products`} external accessibilityLabel="View" />
                      <Popover active={activePopover === cat.id} activator={<Button icon={MenuHorizontalIcon} variant="plain" onClick={() => setActivePopover(activePopover === cat.id ? null : cat.id)} accessibilityLabel="More" />} onClose={() => setActivePopover(null)}>
                        <ActionList items={[
                          { content: "Connect pixel to catalog", onAction: () => handleConnectPixel(cat.id) },
                          { content: "Sync Now", onAction: () => handleSync(cat.id) },
                          { content: "Refresh product count", onAction: () => handleRefreshCount(cat.id) },
                          { content: "Delete", destructive: true, onAction: () => handleDelete(cat.id) },
                        ]} />
                      </Popover>
                      <Badge tone={cat.syncStatus === "synced" ? "success" : cat.syncStatus === "error" ? "critical" : "attention"}>
                        {cat.syncStatus === "synced" ? `${cat.productCount} synced` : cat.syncStatus === "syncing" ? "Syncing..." : cat.syncStatus === "error" ? "Error" : "Pending"}
                      </Badge>
                    </InlineStack>
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
            {filteredCatalogs.length === 0 && <Box padding="600"><Text as="p" tone="subdued" alignment="center">No catalogs found. Create one to get started.</Text></Box>}
            {filteredCatalogs.length > 0 && (
              <Box padding="400">
                <InlineStack align="center" gap="200">
                  <Select label="" labelHidden options={[{ label: "5", value: "5" }, { label: "10", value: "10" }]} value="5" onChange={() => {}} />
                  <Pagination hasPrevious={false} hasNext={false} label="1/1" />
                </InlineStack>
              </Box>
            )}
          </Card>
        </Layout.Section>

        {/* Footer */}
        <Layout.Section>
          <Box padding="400">
            <InlineStack align="center" gap="200">
              <Text as="p" tone="subdued">ⓘ For more guidance, visit our</Text>
              <Link url="https://pixelify-red.vercel.app/docs" external>knowledge base</Link>
              <Text as="p" tone="subdued">or contact us on our mail</Text>
              <Link url="mailto:support@warewe.online">support@warewe.online</Link>
            </InlineStack>
          </Box>
        </Layout.Section>
      </Layout>

      {/* Create Modal */}
      <Modal open={showCreateModal} onClose={() => { setShowCreateModal(false); resetForm(); }} title="Create catalog"
        primaryAction={{ content: "Create Catalog", onAction: handleCreate, disabled: !selectedBusiness || !catalogName.trim(), loading: isLoading }}
        secondaryActions={[{ content: "Cancel", onAction: () => { setShowCreateModal(false); resetForm(); } }]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <BlockStack gap="200">
              <Text variant="headingSm" as="h3">Choose Business Account</Text>
              {isLoadingBusinesses ? <InlineStack gap="200"><Spinner size="small" /><Text as="span">Loading...</Text></InlineStack> : (
                <Select label="" labelHidden options={[{ label: "Choose 1 Business account here", value: "" }, ...businesses.map(b => ({ label: b.name, value: b.id }))]} value={selectedBusiness} onChange={setSelectedBusiness} />
              )}
            </BlockStack>

            {selectedBusiness && (
              <BlockStack gap="200">
                <Text variant="headingSm" as="h3">Choose Pixels (Optional - Multiple allowed)</Text>
                {isLoadingPixels ? (
                  <InlineStack gap="200"><Spinner size="small" /><Text as="span">Loading pixels...</Text></InlineStack>
                ) : pixels.length === 0 ? (
                  <Text as="p" tone="subdued">No pixels available for this business account</Text>
                ) : (
                  <BlockStack gap="200">
                    {pixels.map(pixel => (
                      <div key={pixel.id}>
                        <Checkbox
                          label={`${pixel.name} (${pixel.id})`}
                          checked={selectedPixels.includes(pixel.id)}
                          onChange={(checked) => {
                            if (checked) {
                              setSelectedPixels([...selectedPixels, pixel.id]);
                            } else {
                              setSelectedPixels(selectedPixels.filter(id => id !== pixel.id));
                            }
                          }}
                        />
                      </div>
                    ))}
                  </BlockStack>
                )}
              </BlockStack>
            )}

            <BlockStack gap="200">
              <Text variant="headingSm" as="h3">Name your catalog</Text>
              <TextField label="" labelHidden value={catalogName} onChange={setCatalogName} placeholder="Type name your catalog" autoComplete="off" />
            </BlockStack>

            <BlockStack gap="200">
              <Text variant="headingSm" as="h3">Product on Feed</Text>
              <InlineStack gap="400">
                <RadioButton label="All products" checked={productSelection === "all"} onChange={() => setProductSelection("all")} />
                <RadioButton label="Selected products" checked={productSelection === "selected"} onChange={() => setProductSelection("selected")} />
              </InlineStack>
            </BlockStack>

            <BlockStack gap="200">
              <Text variant="headingSm" as="h3">Variant submission</Text>
              <BlockStack gap="100">
                <RadioButton label="Export all variants as separate items on a Facebook Catalog" checked={variantSubmission === "separate"} onChange={() => setVariantSubmission("separate")} />
                <RadioButton label="Export variants as grouped items on a Facebook Catalog" checked={variantSubmission === "grouped"} onChange={() => setVariantSubmission("grouped")} />
                <RadioButton label="Export only the first variant" checked={variantSubmission === "first"} onChange={() => setVariantSubmission("first")} />
              </BlockStack>
            </BlockStack>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
