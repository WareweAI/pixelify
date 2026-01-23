import { Modal, BlockStack, Banner } from "@shopify/polaris";

interface DeleteModalProps {
  showDeleteModal: { id: string; name: string } | null;
  isLoading: boolean;
  onClose: () => void;
  onDelete: () => void;
}

export function DeleteModal({
  showDeleteModal,
  isLoading,
  onClose,
  onDelete,
}: DeleteModalProps) {
  if (!showDeleteModal) return null;

  return (
    <Modal
      open={true}
      onClose={onClose}
      title="Delete Pixel"
      primaryAction={{
        content: "Delete Permanently",
        onAction: onDelete,
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
              Are you sure you want to delete "{showDeleteModal.name}"? This will permanently delete all associated events, sessions, and data. This action cannot be undone.
            </p>
          </Banner>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
