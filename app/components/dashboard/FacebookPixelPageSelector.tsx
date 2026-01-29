import { useState, useCallback, useEffect } from "react";
import { useFetcher } from "react-router";
import {
  Card,
  Button,
  InlineStack,
  BlockStack,
  Text,
  Badge,
  Banner,
  Select,
  Divider,
} from "@shopify/polaris";
import { PageSelector } from "../PageSelector";

interface Page {
  label: string;
  value: string;
  type: string;
  productId?: string;
  collectionId?: string;
}

interface FacebookPixelPageSelectorProps {
  appId: string;
  initialTrackingPages?: string;
  initialSelectedPages?: string[];
  onSettingsChange?: (settings: { trackingPages: string; selectedPages: string[] }) => void;
}

export function FacebookPixelPageSelector({
  appId,
  initialTrackingPages = "all",
  initialSelectedPages = [],
  onSettingsChange,
}: FacebookPixelPageSelectorProps) {
  const fetcher = useFetcher();
  const [trackingPages, setTrackingPages] = useState(initialTrackingPages);
  const [selectedPages, setSelectedPages] = useState(initialSelectedPages);
  const [pageSelectorOpen, setPageSelectorOpen] = useState(false);
  const [availablePages, setAvailablePages] = useState<Page[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Fetch available pages from Shopify
  useEffect(() => {
    const fetchPages = async () => {
      try {
        setIsLoading(true);
        const response = await fetch("/api/shopify-pages");
        const data = await response.json();
        
        if (data.success) {
          setAvailablePages(data.pages || []);
          console.log(`[FacebookPixelPageSelector] Loaded ${data.pages?.length || 0} pages`);
        } else {
          console.error("[FacebookPixelPageSelector] Failed to fetch pages:", data);
          setError("Failed to load pages from Shopify");
        }
      } catch (error) {
        console.error("[FacebookPixelPageSelector] Error fetching pages:", error);
        setError("Error loading pages");
      } finally {
        setIsLoading(false);
      }
    };

    fetchPages();
  }, []);

  // Load current settings when component mounts or appId changes
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await fetch(`/api/page-tracking-settings?appId=${appId}`);
        const data = await response.json();
        
        if (data.success) {
          setTrackingPages(data.data.trackingPages);
          setSelectedPages(data.data.selectedPages);
          console.log(`[FacebookPixelPageSelector] Loaded settings for ${appId}:`, data.data);
        }
      } catch (error) {
        console.error("[FacebookPixelPageSelector] Error loading settings:", error);
      }
    };

    if (appId) {
      loadSettings();
    }
  }, [appId]);

  // Handle fetcher response
  useEffect(() => {
    if (fetcher.data?.success) {
      setSuccess("Page tracking settings updated successfully");
      setTimeout(() => setSuccess(""), 3000);
      
      if (onSettingsChange) {
        onSettingsChange({
          trackingPages: fetcher.data.data.trackingPages,
          selectedPages: fetcher.data.data.selectedPages,
        });
      }
    } else if (fetcher.data?.error) {
      setError(fetcher.data.error);
      setTimeout(() => setError(""), 5000);
    }
  }, [fetcher.data, onSettingsChange]);

  const handleTrackingPagesChange = useCallback((value: string) => {
    setTrackingPages(value);
    setError("");
    setSuccess("");
  }, []);

  const handleOpenPageSelector = useCallback(() => {
    setPageSelectorOpen(true);
    setError("");
    setSuccess("");
  }, []);

  const handleSelectPages = useCallback((pageValues: string[]) => {
    setSelectedPages(pageValues);
    setPageSelectorOpen(false);
    
    // Save settings immediately
    const formData = new FormData();
    formData.append("appId", appId);
    formData.append("trackingPages", trackingPages);
    formData.append("selectedPages", JSON.stringify(pageValues));
    
    fetcher.submit(formData, {
      method: "POST",
      action: "/api/page-tracking-settings",
    });
    
    console.log(`[FacebookPixelPageSelector] Selected ${pageValues.length} pages for tracking`);
  }, [appId, trackingPages, fetcher]);

  const handleSaveSettings = useCallback(() => {
    const formData = new FormData();
    formData.append("appId", appId);
    formData.append("trackingPages", trackingPages);
    formData.append("selectedPages", JSON.stringify(selectedPages));
    
    fetcher.submit(formData, {
      method: "POST",
      action: "/api/page-tracking-settings",
    });
    
    console.log(`[FacebookPixelPageSelector] Saving settings: ${trackingPages}, ${selectedPages.length} pages`);
  }, [appId, trackingPages, selectedPages, fetcher]);

  const options = [
    { label: "Track All Pages", value: "all" },
    { label: "Track Selected Pages Only", value: "selected" },
    { label: "Track All Pages Except Selected", value: "excluded" },
  ];

  const getSelectedPagesDescription = useCallback(() => {
    if (selectedPages.length === 0) {
      return trackingPages === "all" ? "All pages will be tracked" : "No pages selected";
    }

    const systemPages = selectedPages.filter(p => availablePages.find(page => page.value === p)?.type === "system");
    const collectionPages = selectedPages.filter(p => availablePages.find(page => page.value === p)?.type === "collection");
    const productPages = selectedPages.filter(p => availablePages.find(page => page.value === p)?.type === "product");

    const parts = [];
    if (systemPages.length > 0) parts.push(`${systemPages.length} system`);
    if (collectionPages.length > 0) parts.push(`${collectionPages.length} collections`);
    if (productPages.length > 0) parts.push(`${productPages.length} products`);

    return parts.length > 0 ? parts.join(", ") : `${selectedPages.length} pages`;
  }, [selectedPages, availablePages]);

  return (
    <Card>
      <BlockStack gap="400">
        <Text variant="headingMd" as="h3">Page Tracking Settings</Text>
        
        {error && (
          <Banner tone="critical" onDismiss={() => setError("")}>
            <p>{error}</p>
          </Banner>
        )}
        
        {success && (
          <Banner tone="success" onDismiss={() => setSuccess("")}>
            <p>{success}</p>
          </Banner>
        )}

        <BlockStack gap="200">
          <Text as="p" variant="bodySm">
            Choose which pages should trigger Facebook pixel events. This helps you track specific user journeys and optimize your ad campaigns.
          </Text>
        </BlockStack>

        <BlockStack gap="300">
          <div>
            <Text as="p" variant="bodySm" fontWeight="semibold">Tracking Mode</Text>
            <Select
              label="Tracking Mode"
              options={options}
              value={trackingPages}
              onChange={handleTrackingPagesChange}
              disabled={isLoading}
            />
          </div>

          {trackingPages !== "all" && (
            <div>
              <InlineStack align="space-between" blockAlign="center">
                <Text as="p" variant="bodySm" fontWeight="semibold">
                  {trackingPages === "selected" ? "Pages to Track" : "Pages to Exclude"}
                </Text>
                <Button onClick={handleOpenPageSelector} disabled={isLoading}>
                  {selectedPages.length === 0 ? "Select Pages" : "Edit Selection"}
                </Button>
              </InlineStack>
              
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">
                  {getSelectedPagesDescription()}
                </Text>
                
                {selectedPages.length > 0 && (
                  <InlineStack gap="100" wrap>
                    {selectedPages.slice(0, 5).map((pageValue) => {
                      const page = availablePages.find(p => p.value === pageValue);
                      if (!page) return null;
                      
                      return (
                        <Badge key={pageValue} tone={page.type === "system" ? "info" as const : page.type === "collection" ? "attention" as const : "success" as const}>
                          {page.label}
                        </Badge>
                      );
                    })}
                    {selectedPages.length > 5 && (
                      <Badge tone="info">{"+" + String(selectedPages.length - 5) + " more"}</Badge>
                    )}
                  </InlineStack>
                )}
              </BlockStack>
            </div>
          )}

          <Divider />

          <InlineStack align="space-between">
            <Text as="p" variant="bodySm" tone="subdued">
              {trackingPages === "all" 
                ? "All pages will trigger Facebook pixel events" 
                : trackingPages === "selected"
                ? `Only selected pages will trigger Facebook pixel events`
                : `All pages except selected ones will trigger Facebook pixel events`
              }
            </Text>
            
            {(trackingPages !== "all" || selectedPages.length > 0) && (
              <Button
                variant="primary"
                onClick={handleSaveSettings}
                loading={fetcher.state === "loading"}
                disabled={isLoading}
              >
                Save Settings
              </Button>
            )}
          </InlineStack>
        </BlockStack>

        <PageSelector
          open={pageSelectorOpen}
          onClose={() => setPageSelectorOpen(false)}
          onSelectPages={handleSelectPages}
          initialSelectedPages={selectedPages}
          availablePages={availablePages}
        />
      </BlockStack>
    </Card>
  );
}
