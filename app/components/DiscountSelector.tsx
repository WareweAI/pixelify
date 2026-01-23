import { useState, useEffect } from "react";
import { useFetcher } from "react-router";
import {
  Modal,
  TextField,
  IndexTable,
  Text,
  InlineStack,
  Checkbox,
  Box,
  Spinner,
  BlockStack,
  Badge,
} from "@shopify/polaris";

interface Discount {
  id: string;
  title: string;
  codes?: string[];
  status: string;
  startsAt?: string;
  endsAt?: string;
  discountValue?: string;
  discountType?: string;
  usageLimit?: number;
  appliesOncePerCustomer?: boolean;
  isAutomatic?: boolean;
}

interface DiscountSelectorProps {
  open: boolean;
  onClose: () => void;
  onSelectDiscounts: (discountCodes: string[]) => void;
  initialSelectedDiscounts?: string[];
}

export function DiscountSelector({
  open,
  onClose,
  onSelectDiscounts,
  initialSelectedDiscounts = [],
}: DiscountSelectorProps) {
  const fetcher = useFetcher();
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [selectedDiscounts, setSelectedDiscounts] = useState<string[]>(initialSelectedDiscounts);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Fetch discounts when modal opens
  useEffect(() => {
    if (open && discounts.length === 0) {
      setIsLoading(true);
      const formData = new FormData();
      formData.append("intent", "fetch-discounts");
      fetcher.submit(formData, { method: "POST", action: "/api/shopify-discounts" });
    }
  }, [open]);

  // Handle fetcher response
  useEffect(() => {
    if (fetcher.data?.success && fetcher.data?.discounts) {
      setDiscounts(fetcher.data.discounts);
      setIsLoading(false);
    }
  }, [fetcher.data]);

  const handleToggleDiscount = (discountCode: string) => {
    setSelectedDiscounts((prev) =>
      prev.includes(discountCode)
        ? prev.filter((code) => code !== discountCode)
        : [...prev, discountCode]
    );
  };

  const handleSave = () => {
    onSelectDiscounts(selectedDiscounts);
    onClose();
  };

  const handleCancel = () => {
    setSelectedDiscounts(initialSelectedDiscounts);
    onClose();
  };

  const filteredDiscounts = discounts.filter((discount) =>
    discount.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    discount.codes?.some(code => code.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Filter active discounts
  const activeDiscounts = filteredDiscounts.filter(d => d.status === "ACTIVE");
  const inactiveDiscounts = filteredDiscounts.filter(d => d.status !== "ACTIVE");

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return <Badge tone="success">Active</Badge>;
      case "EXPIRED":
        return <Badge tone="critical">Expired</Badge>;
      case "SCHEDULED":
        return <Badge tone="info">Scheduled</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleCancel}
      title="Select Discount Code(s)"
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
            placeholder="Filter discounts"
            autoComplete="off"
            clearButton
            onClearButtonClick={() => setSearchQuery("")}
          />

          {isLoading ? (
            <Box padding="600">
              <InlineStack align="center" gap="200">
                <Spinner size="small" />
                <Text as="span">Loading discounts...</Text>
              </InlineStack>
            </Box>
          ) : (
            <>
              {/* Active Discounts */}
              {activeDiscounts.length > 0 && (
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm">Active Discounts</Text>
                  <IndexTable
                    itemCount={activeDiscounts.length}
                    headings={[
                      { title: "" },
                      { title: "Title" },
                      { title: "Code(s)" },
                      { title: "Value" },
                      { title: "Status" },
                    ]}
                    selectable={false}
                  >
                    {activeDiscounts.map((discount, index) => (
                      discount.codes?.map((code, codeIndex) => (
                        <IndexTable.Row
                          id={`${discount.id}-${code}`}
                          key={`${discount.id}-${code}`}
                          position={index * 10 + codeIndex}
                        >
                          <IndexTable.Cell>
                            <Checkbox
                              label=""
                              labelHidden
                              checked={selectedDiscounts.includes(code)}
                              onChange={() => handleToggleDiscount(code)}
                            />
                          </IndexTable.Cell>
                          <IndexTable.Cell>
                            <Text as="p" fontWeight="semibold">
                              {discount.title}
                            </Text>
                          </IndexTable.Cell>
                          <IndexTable.Cell>
                            <Text as="p" fontWeight="bold">
                              {code}
                            </Text>
                          </IndexTable.Cell>
                          <IndexTable.Cell>
                            <Text as="p" tone="subdued">
                              {discount.discountValue || "N/A"}
                            </Text>
                          </IndexTable.Cell>
                          <IndexTable.Cell>
                            {getStatusBadge(discount.status)}
                          </IndexTable.Cell>
                        </IndexTable.Row>
                      ))
                    ))}
                  </IndexTable>
                </BlockStack>
              )}

              {/* Inactive Discounts */}
              {inactiveDiscounts.length > 0 && (
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm">Inactive Discounts</Text>
                  <IndexTable
                    itemCount={inactiveDiscounts.length}
                    headings={[
                      { title: "" },
                      { title: "Title" },
                      { title: "Code(s)" },
                      { title: "Value" },
                      { title: "Status" },
                    ]}
                    selectable={false}
                  >
                    {inactiveDiscounts.map((discount, index) => (
                      discount.codes?.map((code, codeIndex) => (
                        <IndexTable.Row
                          id={`${discount.id}-${code}`}
                          key={`${discount.id}-${code}`}
                          position={index * 10 + codeIndex}
                        >
                          <IndexTable.Cell>
                            <Checkbox
                              label=""
                              labelHidden
                              checked={selectedDiscounts.includes(code)}
                              onChange={() => handleToggleDiscount(code)}
                              disabled
                            />
                          </IndexTable.Cell>
                          <IndexTable.Cell>
                            <Text as="p" tone="subdued">
                              {discount.title}
                            </Text>
                          </IndexTable.Cell>
                          <IndexTable.Cell>
                            <Text as="p" tone="subdued">
                              {code}
                            </Text>
                          </IndexTable.Cell>
                          <IndexTable.Cell>
                            <Text as="p" tone="subdued">
                              {discount.discountValue || "N/A"}
                            </Text>
                          </IndexTable.Cell>
                          <IndexTable.Cell>
                            {getStatusBadge(discount.status)}
                          </IndexTable.Cell>
                        </IndexTable.Row>
                      ))
                    ))}
                  </IndexTable>
                </BlockStack>
              )}

              {filteredDiscounts.length === 0 && !isLoading && (
                <Box padding="600">
                  <Text as="p" tone="subdued" alignment="center">
                    No discount codes found. Create discount codes in your Shopify admin.
                  </Text>
                </Box>
              )}

              {filteredDiscounts.length > 0 && (
                <Box padding="400">
                  <InlineStack align="center" gap="200">
                    <Text as="span" variant="bodySm">
                      {selectedDiscounts.length} selected
                    </Text>
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
