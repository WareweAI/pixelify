import { useState, useEffect } from "react";
import { useFetcher } from "react-router";
import { ThemeExtensionBlocker } from "./ThemeExtensionBlocker";
import { Spinner, Page } from "@shopify/polaris";

interface ThemeExtensionGuardProps {
  children: React.ReactNode;
  shop: string;
  bypassCheck?: boolean; // For routes that don't need extension
  enableStrictMode?: boolean; // Enable strict checking (default: false for better UX)
}

interface ExtensionStatus {
  isEnabled: boolean;
  themeName?: string;
  error?: string;
  loading?: boolean;
}

export function ThemeExtensionGuard({ 
  children, 
  shop, 
  bypassCheck = false,
  enableStrictMode = false // Default to false for better UX
}: ThemeExtensionGuardProps) {
  const fetcher = useFetcher<ExtensionStatus>();
  const [status, setStatus] = useState<ExtensionStatus>({ 
    isEnabled: false, 
    loading: true 
  });
  const [pollCount, setPollCount] = useState(0);

  // Check extension status on mount and poll for changes
  useEffect(() => {
    if (bypassCheck || !enableStrictMode) {
      // If bypass is enabled OR strict mode is disabled, allow access
      setStatus({ isEnabled: true, loading: false });
      return;
    }

    // Initial check
    if (fetcher.state === "idle" && pollCount === 0) {
      fetcher.submit(
        { intent: "check-theme-extension" },
        { method: "POST", action: "/api/theme-extension-status" }
      );
      setPollCount(1);
    }
  }, [bypassCheck, enableStrictMode, fetcher, pollCount]);

  // Poll every 3 seconds if extension is not enabled (for real-time updates)
  useEffect(() => {
    if (bypassCheck || !enableStrictMode) return;
    
    if (!status.isEnabled && !status.loading && pollCount > 0) {
      const pollInterval = setInterval(() => {
        console.log('[ThemeExtensionGuard] Polling for extension status...');
        fetcher.submit(
          { intent: "check-theme-extension" },
          { method: "POST", action: "/api/theme-extension-status" }
        );
      }, 3000); // Poll every 3 seconds

      return () => clearInterval(pollInterval);
    }
  }, [status.isEnabled, status.loading, bypassCheck, enableStrictMode, fetcher, pollCount]);

  // Update status when fetcher data changes
  useEffect(() => {
    if (fetcher.data) {
      const newStatus = { ...fetcher.data, loading: fetcher.state === "loading" };
      setStatus(newStatus);
      
      // Log status for debugging
      console.log('[ThemeExtensionGuard] Extension status:', newStatus);
      
      // If enabled, stop polling
      if (newStatus.isEnabled) {
        console.log('[ThemeExtensionGuard] ✅ Extension enabled, allowing access');
      }
    } else if (fetcher.state === "loading") {
      setStatus(prev => ({ ...prev, loading: true }));
    }
  }, [fetcher.data, fetcher.state]);

  const handleRefresh = () => {
    console.log('[ThemeExtensionGuard] Manual refresh requested');
    setStatus(prev => ({ ...prev, loading: true }));
    fetcher.submit(
      { intent: "check-theme-extension" },
      { method: "POST", action: "/api/theme-extension-status" }
    );
  };

  // Show loading state only on initial load
  if (status.loading && pollCount <= 1) {
    return (
      <Page>
        <div style={{ 
          display: "flex", 
          justifyContent: "center", 
          alignItems: "center", 
          minHeight: "200px",
          flexDirection: "column",
          gap: "16px"
        }}>
          <Spinner size="large" />
          <p>Checking theme extension status...</p>
        </div>
      </Page>
    );
  }

  // Show blocker if extension is not enabled AND strict mode is enabled
  if (!status.isEnabled && enableStrictMode && !bypassCheck) {
    return (
      <ThemeExtensionBlocker
        shop={shop}
        themeName={status.themeName}
        onRefresh={handleRefresh}
      />
    );
  }

  // Extension is enabled or check is bypassed, show children
  return <>{children}</>;
}