import { Modal, BlockStack, Text } from "@shopify/polaris";

interface SnippetModalProps {
  showSnippet: string | null;
  snippetText: string;
  onClose: () => void;
  onCopyToClipboard: () => void;
}

export function SnippetModal({
  showSnippet,
  snippetText,
  onClose,
  onCopyToClipboard,
}: SnippetModalProps) {
  if (!showSnippet) return null;

  return (
    <Modal
      open={true}
      onClose={onClose}
      title="Install Tracking Code"
      primaryAction={{
        content: "Copy Code",
        onAction: onCopyToClipboard,
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
