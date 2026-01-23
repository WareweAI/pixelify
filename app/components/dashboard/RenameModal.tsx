import { Modal, TextField } from "@shopify/polaris";

interface RenameModalProps {
  showRenameModal: { id: string; name: string } | null;
  renameValue: string;
  isLoading: boolean;
  onClose: () => void;
  onRenameValueChange: (value: string) => void;
  onRename: () => void;
}

export function RenameModal({
  showRenameModal,
  renameValue,
  isLoading,
  onClose,
  onRenameValueChange,
  onRename,
}: RenameModalProps) {
  if (!showRenameModal) return null;

  return (
    <Modal
      open={true}
      onClose={onClose}
      title="Rename Pixel"
      primaryAction={{
        content: "Save",
        onAction: onRename,
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
          onChange={onRenameValueChange}
          autoComplete="off"
          autoFocus
        />
      </Modal.Section>
    </Modal>
  );
}
