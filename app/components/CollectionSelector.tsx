import { useState, useEffect, useCallback } from "react";
import { useFetcher } from "react-router";
import {
  Modal,
  TextField,
  IndexTable,
  Thumbnail,
  Text,
  InlineStack,
  Checkbox,
  Pagination,
  Box,
  Spinner,
  BlockStack,
} from "@shopify/polaris";
import { ImageIcon } from "@shopify/polaris-icons";

interface Collection {
  id: string;
  title: string;
  handle: string;
  productsCount: number;
  image?: { url: string } | null;
}

interface CollectionSelectorProps {
  open: boolean;
  onClose: () => void;
  onSelectCollections: (collectionIds: string[]) => void;
  initialSelectedCollections?: string[];
}

export function CollectionSelector({
  open,
  onClose,
  onSelectCollections,
  initialSelectedCollections = [],
}: CollectionSelectorProps) {
  const fetcher = useFetcher();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollections, setSelectedCollections] = useState<string[]>(initialSelectedCollections);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Fetch collections when modal opens
  useEffect(() => {
    if (open && collections.length === 0) {
      setIsLoading(true);
      const formData = new FormData();
      formData.append("intent", "fetch-collections");
      fetcher.submit(formData, { method: "POST", action: "/api/shopify-collections" });
    }
  }, [open]);

  // Handle fetcher response
  useEffect(() => {
    if (fetcher.data?.success && fetcher.data?.collections) {
      setCollections(fetcher.data.collections);
      setIsLoading(false);
    }
  }, [fetcher.data]);

  const handleToggleCollection = useCallback((collectionId: string) => {
    setSelectedCollections((prev) =>
      prev.includes(collectionId)
        ? prev.filter((id) => id !== collectionId)
        : [...prev, collectionId]
    );
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selectedCollections.length === filteredCollections.length) {
      setSelectedCollections([]);
    } else {
      setSelectedCollections(filteredCollections.map((c) => c.id));
    }
  }, [selectedCollections, collections, searchQuery]);

  const handleSave = () => {
    onSelectCollections(selectedCollections);
    onClose();
  };

  const handleCancel = () => {
    setSelectedCollections(initialSelectedCollections);
    onClose();
  };

  const filteredCollections = collections.filter((collection) =>
    collection.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Modal
      open={open}
      onClose={handleCancel}
      title="Select Collection(s)"
      primaryAction={{
        content: "Add",
        onAction: handleSave,
      }}
      secondaryActions={[
        {
          content: "Cancel",
          onAction: handleCancel,
        },
      ]}
      large
    >
      <Modal.Section>
        <BlockStack gap="400">
          <TextField
            label=""
            labelHidden
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Filter items"
            autoComplete="off"
            clearButton
            onClearButtonClick={() => setSearchQuery("")}
          />

          {isLoading ? (
            <Box padding="600">
              <InlineStack align="center" gap="200">
                <Spinner size="small" />
                <Text as="span">Loading collections...</Text>
              </InlineStack>
            </Box>
          ) : (
            <>
              <IndexTable
                itemCount={filteredCollections.length}
                headings={[
                  { title: "" },
                  { title: "Image" },
                  { title: "Collection" },
                ]}
                selectable={false}
              >
                {filteredCollections.map((collection, index) => (
                  <IndexTable.Row
                    id={collection.id}
                    key={collection.id}
                    position={index}
                  >
                    <IndexTable.Cell>
                      <Checkbox
                        label=""
                        labelHidden
                        checked={selectedCollections.includes(collection.id)}
                        onChange={() => handleToggleCollection(collection.id)}
                      />
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Thumbnail
                        source={collection.image?.url || ImageIcon}
                        alt={collection.title}
                        size="small"
                      />
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <BlockStack gap="050">
                        <Text as="p" fontWeight="semibold">
                          {collection.title}
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          {collection.productsCount} products
                        </Text>
                      </BlockStack>
                    </IndexTable.Cell>
                  </IndexTable.Row>
                ))}
              </IndexTable>

              {filteredCollections.length === 0 && (
                <Box padding="600">
                  <Text as="p" tone="subdued" alignment="center">
                    No collections found
                  </Text>
                </Box>
              )}

              {filteredCollections.length > 0 && (
                <Box padding="400">
                  <InlineStack align="center" gap="200">
                    <Text as="span" variant="bodySm">
                      {selectedCollections.length} selected
                    </Text>
                    <Pagination
                      hasPrevious={false}
                      hasNext={false}
                      label="1/1"
                    />
                  </InlineStack>
                </Box>
              )}
            </>
          )}
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
