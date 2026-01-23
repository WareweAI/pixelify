import { Modal, BlockStack, Text, TextField, Banner } from "@shopify/polaris";

interface WebsiteModalProps {
  showWebsiteModal: { id: string; name: string; websiteDomain?: string } | null;
  websiteDomain: string;
  isLoading: boolean;
  onClose: () => void;
  onWebsiteDomainChange: (value: string) => void;
  onAssignWebsite: () => void;
}

export function WebsiteModal({
  showWebsiteModal,
  websiteDomain,
  isLoading,
  onClose,
  onWebsiteDomainChange,
  onAssignWebsite,
}: WebsiteModalProps) {
  if (!showWebsiteModal) return null;

  return (
    <Modal
      open={true}
      onClose={onClose}
      title="Assign Website Domain"
      primaryAction={{
        content: "Assign Website",
        onAction: onAssignWebsite,
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
            onChange={onWebsiteDomainChange}
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
