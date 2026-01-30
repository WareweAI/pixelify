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

interface  {
  id: string;
  title: string;
  codes?: string[];
  status: string;
  startsAt?: string;
  endsAt?: string;
  Value?: string;
  Type?: string;
  usageLimit?: number;
  appliesOncePerCustomer?: boolean;
  isAutomatic?: boolean;
}

interface SelectorProps {
  open: boolean;
  onClose: () => void;
  onSelects: (Codes: string[]) => void;
  initialSelecteds?: string[];
}

export function Selector({
  open,
  onClose,
  onSelects,
  initialSelecteds = [],
}: SelectorProps) {
  const fetcher = useFetcher();
  const [s, sets] = useState<[]>([]);
  const [selecteds, setSelecteds] = useState<string[]>(initialSelecteds);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Fetch s when modal opens
  useEffect(() => {
    if (open && s.length === 0) {
      setIsLoading(true);
      const formData = new FormData();
      formData.append("intent", "fetch-s");
      fetcher.submit(formData, { method: "POST", action: "/api/shopify-s" });
    }
  }, [open]);

  // Handle fetcher response
  useEffect(() => {
    if (fetcher.data?.success && fetcher.data?.s) {
      sets(fetcher.data.s);
      setIsLoading(false);
    }
  }, [fetcher.data]);

  const handleToggle = (Code: string) => {
    setSelecteds((prev) =>
      prev.includes(Code)
        ? prev.filter((code) => code !== Code)
        : [...prev, Code]
    );
  };

  const handleSave = () => {
    onSelects(selecteds);
    onClose();
  };

  const handleCancel = () => {
    setSelecteds(initialSelecteds);
    onClose();
  };

  const filtereds = s.filter(() =>
    .title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    .codes?.some(code => code.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Filter active s
  const actives = filtereds.filter(d => d.status === "ACTIVE");
  const inactives = filtereds.filter(d => d.status !== "ACTIVE");

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
      title="Select  Code(s)"
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
            placeholder="Filter s"
            autoComplete="off"
            clearButton
            onClearButtonClick={() => setSearchQuery("")}
          />

          {isLoading ? (
            <Box padding="600">
              <InlineStack align="center" gap="200">
                <Spinner size="small" />
                <Text as="span">Loading s...</Text>
              </InlineStack>
            </Box>
          ) : (
            <>
              {/* Active s */}
              {actives.length > 0 && (
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm">Active s</Text>
                  <IndexTable
                    itemCount={actives.length}
                    headings={[
                      { title: "" },
                      { title: "Title" },
                      { title: "Code(s)" },
                      { title: "Value" },
                      { title: "Status" },
                    ]}
                    selectable={false}
                  >
                    {actives.map((, index) => (
                      .codes?.map((code, codeIndex) => (
                        <IndexTable.Row
                          id={`${.id}-${code}`}
                          key={`${.id}-${code}`}
                          position={index * 10 + codeIndex}
                        >
                          <IndexTable.Cell>
                            <Checkbox
                              label=""
                              labelHidden
                              checked={selecteds.includes(code)}
                              onChange={() => handleToggle(code)}
                            />
                          </IndexTable.Cell>
                          <IndexTable.Cell>
                            <Text as="p" fontWeight="semibold">
                              {.title}
                            </Text>
                          </IndexTable.Cell>
                          <IndexTable.Cell>
                            <Text as="p" fontWeight="bold">
                              {code}
                            </Text>
                          </IndexTable.Cell>
                          <IndexTable.Cell>
                            <Text as="p" tone="subdued">
                              {.Value || "N/A"}
                            </Text>
                          </IndexTable.Cell>
                          <IndexTable.Cell>
                            {getStatusBadge(.status)}
                          </IndexTable.Cell>
                        </IndexTable.Row>
                      ))
                    ))}
                  </IndexTable>
                </BlockStack>
              )}

              {/* Inactive s */}
              {inactives.length > 0 && (
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm">Inactive s</Text>
                  <IndexTable
                    itemCount={inactives.length}
                    headings={[
                      { title: "" },
                      { title: "Title" },
                      { title: "Code(s)" },
                      { title: "Value" },
                      { title: "Status" },
                    ]}
                    selectable={false}
                  >
                    {inactives.map((, index) => (
                      .codes?.map((code, codeIndex) => (
                        <IndexTable.Row
                          id={`${.id}-${code}`}
                          key={`${.id}-${code}`}
                          position={index * 10 + codeIndex}
                        >
                          <IndexTable.Cell>
                            <Checkbox
                              label=""
                              labelHidden
                              checked={selecteds.includes(code)}
                              onChange={() => handleToggle(code)}
                              disabled
                            />
                          </IndexTable.Cell>
                          <IndexTable.Cell>
                            <Text as="p" tone="subdued">
                              {.title}
                            </Text>
                          </IndexTable.Cell>
                          <IndexTable.Cell>
                            <Text as="p" tone="subdued">
                              {code}
                            </Text>
                          </IndexTable.Cell>
                          <IndexTable.Cell>
                            <Text as="p" tone="subdued">
                              {.Value || "N/A"}
                            </Text>
                          </IndexTable.Cell>
                          <IndexTable.Cell>
                            {getStatusBadge(.status)}
                          </IndexTable.Cell>
                        </IndexTable.Row>
                      ))
                    ))}
                  </IndexTable>
                </BlockStack>
              )}

              {filtereds.length === 0 && !isLoading && (
                <Box padding="600">
                  <Text as="p" tone="subdued" alignment="center">
                    No  codes found. Create  codes in your Shopify admin.
                  </Text>
                </Box>
              )}

              {filtereds.length > 0 && (
                <Box padding="400">
                  <InlineStack align="center" gap="200">
                    <Text as="span" variant="bodySm">
                      {selecteds.length} selected
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
