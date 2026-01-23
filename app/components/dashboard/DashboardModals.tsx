import { useState } from "react";
import { useFetcher } from "react-router";
import {
  Modal,
  BlockStack,
  Text,
  TextField,
  Button,
  Banner,
} from "@shopify/polaris";

interface RenameModalProps {
  open: boolean;
  app: any;
  onClose: () => void;
}

export function RenameModal({ open, app, onClose }: RenameModalProps) {
  const fetcher = useFetcher();
  const [renameValue, setRenameValue] = useState(app?.name || "");
  const isLoading = fetcher.state !== "idle";

  const handleRename = () => {
    if (!renameValue.trim()) return;

    fetcher.submit(
      { intent: "rename", appId: app.id, newName: renameValue },
      { method: "POST" }
    );
    onClose();
  };

  if (!open) return null;

  return (
    <Modal
      open={true}
      onClose={onClose}
      title="Rename Pixel"
      primaryAction={{
        content: "Save",
        onAction: handleRename,
        loading: isLoading,
        disabled: !renameValue.trim(),
      }}
      secondaryActions={[
        {
          content: "Cancel",
          onAction: onClose,
        },
      ]}
    >
      <Modal.Section>
        <TextField
          label="New Name"
          value={renameValue}
          onChange={setRenameValue}
          autoComplete="off"
          autoFocus
        />
      </Modal.Section>
    </Modal>
  );
}

interface DeleteModalProps {
  open: boolean;
  app: any;
  onClose: () => void;
}

export function DeleteModal({ open, app, onClose }: DeleteModalProps) {
  const fetcher = useFetcher();
  const isLoading = fetcher.state !== "idle";

  const handleDelete = () => {
    fetcher.submit(
      { intent: "delete", appId: app.id },
      { method: "POST" }
    );
    onClose();
  };

  if (!open) return null;

  return (
    <Modal
      open={true}
      onClose={onClose}
      title="Delete Pixel"
      primaryAction={{
        content: "Delete Permanently",
        onAction: handleDelete,
        loading: isLoading,
        destructive: true,
      }}
      secondaryActions={[
        {
          content: "Cancel",
          onAction: onClose,
        },
      ]}
    >
      <Modal.Section>
        <BlockStack gap="400">
          <Banner tone="critical">
            <p>
              Are you sure you want to delete "{app.name}"? This will permanently delete all associated events, sessions, and data. This action cannot be undone.
            </p>
          </Banner>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

interface WebsiteModalProps {
  open: boolean;
  app: any;
  onClose: () => void;
}

export function WebsiteModal({ open, app, onClose }: WebsiteModalProps) {
  const fetcher = useFetcher();
  const [websiteDomain, setWebsiteDomain] = useState(app?.websiteDomain || "");
  const isLoading = fetcher.state !== "idle";

  const handleAssignWebsite = () => {
    if (!websiteDomain) return;
    
    fetcher.submit(
      {
        intent: "assign-website",
        appId: app.id,
        websiteDomain: websiteDomain,
      },
      { method: "POST" }
    );
    onClose();
  };

  if (!open) return null;

  return (
    <Modal
      open={true}
      onClose={onClose}
      title="Assign Website Domain"
      primaryAction={{
        content: "Assign Website",
        onAction: handleAssignWebsite,
        loading: isLoading,
        disabled: !websiteDomain,
      }}
      secondaryActions={[
        { content: "Cancel", onAction: onClose }
      ]}
    >
      <Modal.Section>
        <BlockStack gap="400">
          <Text as="p">
            Assign this pixel to a specific website domain. Only events from this domain will be tracked by this pixel.
          </Text>
          <TextField
            label="Website Domain"
            value={websiteDomain}
            onChange={setWebsiteDomain}
            placeholder="e.g., mystore.myshopify.com"
            helpText="Enter domain only. https://, www., and trailing / are automatically removed."
            autoComplete="off"
          />
          <Banner tone="warning">
            <BlockStack gap="200">
              <Text as="p" variant="bodyMd" fontWeight="semibold">
                ⚠️ Important: Strict Domain Matching
              </Text>
              <Text as="p" variant="bodySm">
                Pixels will ONLY fire on websites with matching domain assignments. 
                If no pixel is assigned to a domain, tracking will be disabled for that domain.
              </Text>
              <Text as="p" variant="bodySm">
                <strong>Accepted formats:</strong> mystore.myshopify.com, https://mystore.com/, www.mystore.com - all will be normalized to: mystore.myshopify.com or mystore.com
              </Text>
            </BlockStack>
          </Banner>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

interface SnippetModalProps {
  open: boolean;
  appId: string;
  onClose: () => void;
}

export function SnippetModal({ open, appId, onClose }: SnippetModalProps) {
  const [snippetText, setSnippetText] = useState("");

  const copyToClipboard = () => {
    if (snippetText) {
      navigator.clipboard.writeText(snippetText);
    }
  };

  // Generate snippet text when modal opens
  if (open && !snippetText && typeof window !== "undefined") {
    const origin = window.location.origin;
    setSnippetText(`<!-- Pixel Analytics -->
<script>
  window.PIXEL_APP_ID = "${appId}";
</script>
<script async src="${origin}/pixel.js?id=${appId}"></script>`);
  }

  if (!open) return null;

  return (
    <Modal
      open={true}
      onClose={onClose}
      title="Install Tracking Code"
      primaryAction={{
        content: "Copy Code",
        onAction: copyToClipboard,
      }}
      secondaryActions={[
        {
          content: "Close",
          onAction: onClose,
        },
      ]}
    >
      <Modal.Section>
        <BlockStack gap="400">
          <Text as="p">
            Add this code to your store's theme, just before the closing &lt;/head&gt; tag:
          </Text>
          <div
            style={{
              padding: "16px",
              backgroundColor: "#f6f6f7",
              borderRadius: "8px",
              fontFamily: "monospace",
              fontSize: "12px",
              whiteSpace: "pre-wrap",
              overflowX: "auto",
            }}
          >
            {snippetText}
          </div>
          <Text as="p" tone="subdued">
            For Shopify themes: Go to Online Store → Themes → Edit code → theme.liquid
          </Text>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

interface FacebookConnectionModalProps {
  open: boolean;
  onClose: () => void;
  facebookAccessToken: string;
  onAccessTokenChange: (value: string) => void;
  onConnectFacebook: () => void;
  fetcher: any;
}

export function FacebookConnectionModal({ 
  open, 
  onClose, 
  facebookAccessToken, 
  onAccessTokenChange, 
  onConnectFacebook,
  fetcher 
}: FacebookConnectionModalProps) {
  const [facebookError, setFacebookError] = useState("");
  const isLoading = fetcher.state !== "idle";

  const handleFetchPixels = () => {
    if (facebookAccessToken) {
      fetcher.submit(
        {
          intent: "fetch-facebook-pixels",
          accessToken: facebookAccessToken,
        },
        { method: "POST" }
      );
      onClose();
    }
  };

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={() => {
        onClose();
        onAccessTokenChange("");
        setFacebookError("");
      }}
      title="Connect to Facebook"
      primaryAction={{
        content: facebookAccessToken ? "Fetch Pixels" : "Connect with OAuth",
        onAction: facebookAccessToken ? handleFetchPixels : onConnectFacebook,
        loading: isLoading,
      }}
      secondaryActions={[
        {
          content: "Cancel",
          onAction: () => {
            onClose();
            onAccessTokenChange("");
            setFacebookError("");
          },
        },
      ]}
    >
      <Modal.Section>
        <BlockStack gap="400">
          {facebookError && (
            <Banner tone="critical">
              <p>{facebookError}</p>
            </Banner>
          )}

          <div>
            <Text variant="headingSm" as="h3">🚀 Recommended: OAuth Login</Text>
            <Text as="p" variant="bodyMd">
              Click "Connect with OAuth" above to automatically authenticate with Facebook and fetch your pixels.
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              This will open a popup window where you can log in to Facebook and grant permissions.
            </Text>
          </div>

          <div style={{ margin: "16px 0", borderBottom: "1px solid #e5e7eb" }}></div>

          <div>
            <Text variant="headingSm" as="h3">🔧 Alternative: Manual Token</Text>
            
            <TextField
              label="Facebook Pixel Access Token"
              value={facebookAccessToken}
              onChange={onAccessTokenChange}
              type="password"
              placeholder="Enter your Facebook Pixel access token..."
              helpText="Use this if OAuth doesn't work or you prefer manual setup"
              autoComplete="off"
            />

            <BlockStack gap="200">
              <Text as="p" variant="bodySm">
                <strong>To get a manual token:</strong>
              </Text>
              <Text as="p" variant="bodySm">
                1. Go to <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noopener noreferrer" style={{color: "#2563eb"}}>Facebook Graph API Explorer</a>
              </Text>
              <Text as="p" variant="bodySm">
                2. Select your app and generate a token with <code>ads_read</code>, <code>business_management</code>, <code>ads_management</code>, <code>pages_show_list</code>, <code>pages_read_engagement</code>, <code>catalog_management</code> permissions
              </Text>
              <Text as="p" variant="bodySm">
                3. Copy and paste the token above
              </Text>
            </BlockStack>
          </div>

          <Banner tone="info">
            <p><strong>Required Permissions:</strong> Your Facebook app needs <code>ads_read</code>, <code>business_management</code>, <code>ads_management</code>, <code>pages_show_list</code>, <code>pages_read_engagement</code>, <code>catalog_management</code> permissions to access pixel data and manage product catalogs.</p>
          </Banner>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
