import { useState, useCallback, useEffect } from "react";
import {
  Modal,
  TextField,
  IndexTable,
  Text,
  InlineStack,
  Checkbox,
  Pagination,
  Box,
  BlockStack,
  Badge,
} from "@shopify/polaris";

interface Page {
  label: string;
  value: string;
  type: string;
  productId?: string;
  collectionId?: string;
}

interface PageSelectorProps {
  open: boolean;
  onClose: () => void;
  onSelectPages: (pageValues: string[]) => void;
  initialSelectedPages?: string[];
  availablePages: Page[];
}

export function PageSelector({
  open,
  onClose,
  onSelectPages,
  initialSelectedPages = [],
  availablePages = [],
}: PageSelectorProps) {
  const [selectedPages, setSelectedPages] = useState<string[]>(initialSelectedPages);
  const [searchQuery, setSearchQuery] = useState("");

  // Sync with initialSelectedPages when they change
  useEffect(() => {
    setSelectedPages(initialSelectedPages);
  }, [initialSelectedPages]);

  // Log when modal opens
  useEffect(() => {
    if (open) {
      console.log('[PageSelector] Modal opened with', availablePages.length, 'available pages');
      console.log('[PageSelector] Initial selected:', initialSelectedPages);
    }
  }, [open, availablePages.length, initialSelectedPages]);

  const handleTogglePage = useCallback((pageValue: string) => {
    setSelectedPages((prev) =>
      prev.includes(pageValue)
        ? prev.filter((v) => v !== pageValue)
        : [...prev, pageValue]
    );
  }, []);

  const handleSave = () => {
    onSelectPages(selectedPages);
    onClose();
  };

  const handleCancel = () => {
    setSelectedPages(initialSelectedPages);
    onClose();
  };

  const filteredPages = availablePages.filter((page) =>
    page.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    page.value.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group pages by type
  const systemPages = filteredPages.filter(p => p.type === "system");
  const collectionPages = filteredPages.filter(p => p.type === "collection");
  const productPages = filteredPages.filter(p => p.type === "product");

  return (
    <Modal
      open={open}
      onClose={handleCancel}
      title="Select Page(s)"
      primaryAction={{
        content: "Add",
        onAction: handleSave,
        disabled: selectedPages.length === 0,
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
            placeholder="Filter pages"
            autoComplete="off"
            clearButton
            onClearButtonClick={() => setSearchQuery("")}
          />

          {availablePages.length === 0 && (
            <Box padding="600">
              <BlockStack gap="300" align="center">
                <Text as="p" variant="bodyLg" tone="subdued" alignment="center">
                  No pages available
                </Text>
                <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                  System pages will be used for tracking
                </Text>
              </BlockStack>
            </Box>
          )}

          {/* System Pages */}
          {systemPages.length > 0 && (
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">System Pages</Text>
              <IndexTable
                itemCount={systemPages.length}
                headings={[
                  { title: "" },
                  { title: "Page" },
                  { title: "Path" },
                ]}
                selectable={false}
              >
                {systemPages.map((page, index) => (
                  <IndexTable.Row
                    id={page.value}
                    key={page.value}
                    position={index}
                  >
                    <IndexTable.Cell>
                      <Checkbox
                        label=""
                        labelHidden
                        checked={selectedPages.includes(page.value)}
                        onChange={() => handleTogglePage(page.value)}
                      />
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="p" fontWeight="semibold">
                        {page.label}
                      </Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="p" tone="subdued">
                        {page.value}
                      </Text>
                    </IndexTable.Cell>
                  </IndexTable.Row>
                ))}
              </IndexTable>
            </BlockStack>
          )}

          {/* Collection Pages */}
          {collectionPages.length > 0 && (
            <BlockStack gap="200">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h3" variant="headingSm">Collection Pages</Text>
                <Badge tone="info">{collectionPages.length} collections</Badge>
              </InlineStack>
              <IndexTable
                itemCount={collectionPages.length}
                headings={[
                  { title: "" },
                  { title: "Collection" },
                  { title: "Path" },
                ]}
                selectable={false}
              >
                {collectionPages.map((page, index) => (
                  <IndexTable.Row
                    id={page.value}
                    key={page.value}
                    position={index}
                  >
                    <IndexTable.Cell>
                      <Checkbox
                        label=""
                        labelHidden
                        checked={selectedPages.includes(page.value)}
                        onChange={() => handleTogglePage(page.value)}
                      />
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="p" fontWeight="semibold">
                        {page.label}
                      </Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="p" tone="subdued">
                        {page.value}
                      </Text>
                    </IndexTable.Cell>
                  </IndexTable.Row>
                ))}
              </IndexTable>
            </BlockStack>
          )}

          {/* Product Pages */}
          {productPages.length > 0 && (
            <BlockStack gap="200">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h3" variant="headingSm">Product Pages</Text>
                <Badge tone="success">{productPages.length} products</Badge>
              </InlineStack>
              <IndexTable
                itemCount={productPages.length}
                headings={[
                  { title: "" },
                  { title: "Product" },
                  { title: "Path" },
                ]}
                selectable={false}
              >
                {productPages.map((page, index) => (
                  <IndexTable.Row
                    id={page.value}
                    key={page.value}
                    position={index}
                  >
                    <IndexTable.Cell>
                      <Checkbox
                        label=""
                        labelHidden
                        checked={selectedPages.includes(page.value)}
                        onChange={() => handleTogglePage(page.value)}
                      />
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="p" fontWeight="semibold">
                        {page.label}
                      </Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                      <Text as="p" tone="subdued">
                        {page.value}
                      </Text>
                    </IndexTable.Cell>
                  </IndexTable.Row>
                ))}
              </IndexTable>
            </BlockStack>
          )}

          {filteredPages.length === 0 && availablePages.length > 0 && (
            <Box padding="600">
              <Text as="p" tone="subdued" alignment="center">
                No pages match your search
              </Text>
            </Box>
          )}

          {filteredPages.length > 0 && (
            <Box padding="400">
              <InlineStack align="center" gap="200">
                <Text as="span" variant="bodySm">
                  {selectedPages.length} selected
                </Text>
              </InlineStack>
            </Box>
          )}
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
