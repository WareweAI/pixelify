import { useState, useEffect } from "react";
import { useFetcher } from "react-router";
import {
  Modal,
  Text,
  Button,
  Card,
  BlockStack,
  InlineStack,
  Badge,
  TextField,
  Spinner,
  Thumbnail,
  Pagination,
  Checkbox,
  Banner
} from "@shopify/polaris";
import { SearchIcon } from "@shopify/polaris-icons";

interface Collection {
  id: string;
  title: string;
  handle: string;
  productsCount: number;
  image?: { url: string };
}

interface Product {
  id: string;
  title: string;
  handle: string;
  status: string;
  image?: { url: string };
  variant?: {
    id: string;
    price: string;
    compareAtPrice?: string;
    inventoryQuantity: number;
    sku?: string;
  };
}

interface ProductSelectorProps {
  open: boolean;
  onClose: () => void;
  onSelectProducts: (productIds: string[]) => void;
  initialSelectedProducts?: string[];
}

export function ProductSelector({
  open,
  onClose,
  onSelectProducts,
  initialSelectedProducts = []
}: ProductSelectorProps) {
  const [selectedProducts, setSelectedProducts] = useState<string[]>(initialSelectedProducts);
  const [currentView, setCurrentView] = useState<'collections' | 'products' | 'search'>('collections');
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [collections, setCollections] = useState<Collection[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [pageInfo, setPageInfo] = useState<{ hasNextPage: boolean; endCursor?: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const fetcher = useFetcher();

  // Load collections on mount
  useEffect(() => {
    if (open && collections.length === 0) {
      loadCollections();
    }
  }, [open]);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setSelectedProducts(initialSelectedProducts);
      setCurrentView('collections');
      setSelectedCollection(null);
      setSearchQuery('');
      setProducts([]);
      setPageInfo(null);
    }
  }, [open, initialSelectedProducts]);

  const loadCollections = () => {
    setLoading(true);
    fetcher.submit(
      { intent: 'fetch-collections' },
      { method: 'POST', action: '/api/shopify-collections' }
    );
  };

  const loadProducts = (collectionId: string, cursor?: string) => {
    setLoading(true);
    fetcher.submit(
      {
        intent: 'fetch-products',
        collectionId,
        ...(cursor && { cursor })
      },
      { method: 'POST', action: '/api/shopify-collections' }
    );
  };

  const searchProducts = (query: string) => {
    if (query.length < 2) return;

    setLoading(true);
    fetcher.submit(
      { intent: 'search-products', query },
      { method: 'POST', action: '/api/shopify-collections' }
    );
  };

  // Handle fetcher responses
  useEffect(() => {
    if (fetcher.data) {
      setLoading(false);

      if (fetcher.data.success) {
        if (fetcher.data.collections) {
          setCollections(fetcher.data.collections);
          setPageInfo(fetcher.data.pageInfo);
        } else if (fetcher.data.products) {
          setProducts(fetcher.data.products);
          setPageInfo(fetcher.data.pageInfo);
        }
      } else {
        // Handle API errors
        console.error('ProductSelector API error:', fetcher.data.message);
        // Could show error banner here if needed
      }
    }
  }, [fetcher.data]);

  const handleProductToggle = (productId: string) => {
    setSelectedProducts(prev =>
      prev.includes(productId)
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  const handleConfirm = () => {
    onSelectProducts(selectedProducts);
    onClose();
  };

  const renderCollections = () => (
    <BlockStack gap="400">
      <InlineStack align="space-between">
        <Text variant="headingMd" as="h3">Select a Collection</Text>
        <Button
          onClick={() => setCurrentView('search')}
          icon={SearchIcon}
          variant="secondary"
        >
          Search Products
        </Button>
      </InlineStack>

      <BlockStack gap="300">
        {collections.map(collection => (
          <Card key={collection.id}>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text variant="bodyMd" as="p" fontWeight="semibold">
                    {collection.title}
                  </Text>
                  <Text variant="bodySm" as="p" tone="subdued">
                    {collection.productsCount} products
                  </Text>
                </BlockStack>
                {collection.image && (
                  <Thumbnail
                    source={collection.image.url}
                    alt={collection.title}
                    size="small"
                  />
                )}
              </InlineStack>
              <Button
                onClick={() => {
                  setSelectedCollection(collection);
                  setCurrentView('products');
                  loadProducts(collection.id);
                }}
                fullWidth
              >
                Browse Products
              </Button>
            </BlockStack>
          </Card>
        ))}
      </BlockStack>
    </BlockStack>
  );

  const renderProducts = () => (
    <BlockStack gap="400">
      <InlineStack align="space-between">
        <BlockStack gap="100">
          <Button onClick={() => setCurrentView('collections')} variant="secondary">
            ← Back to Collections
          </Button>
          <Text variant="headingMd" as="h3">
            {selectedCollection?.title}
          </Text>
        </BlockStack>
        <Badge tone="info">{`${selectedProducts.length} selected`}</Badge>
      </InlineStack>

      <BlockStack gap="300">
        {products.map(product => (
          <Card key={product.id}>
            <InlineStack align="space-between" blockAlign="center">
              <InlineStack gap="300" blockAlign="center">
                <Checkbox
                  label=""
                  checked={selectedProducts.includes(product.id)}
                  onChange={() => handleProductToggle(product.id)}
                />
                {product.image && (
                  <Thumbnail
                    source={product.image.url}
                    alt={product.title}
                    size="small"
                  />
                )}
                <BlockStack gap="100">
                  <Text variant="bodyMd" as="p" fontWeight="semibold">
                    {product.title}
                  </Text>
                  {product.variant && (
                    <Text variant="bodySm" as="p" tone="subdued">
                      ${product.variant.price}
                      {product.variant.inventoryQuantity !== undefined &&
                        ` • ${product.variant.inventoryQuantity} in stock`
                      }
                    </Text>
                  )}
                  <Badge
                    tone={product.status === 'ACTIVE' ? 'success' : 'warning'}
                  >
                    {product.status}
                  </Badge>
                </BlockStack>
              </InlineStack>
            </InlineStack>
          </Card>
        ))}
      </BlockStack>

      {pageInfo?.hasNextPage && (
        <Pagination
          hasNext
          onNext={() => loadProducts(selectedCollection!.id, pageInfo.endCursor)}
        />
      )}
    </BlockStack>
  );

  const renderSearch = () => (
    <BlockStack gap="400">
      <InlineStack align="space-between">
        <Button onClick={() => setCurrentView('collections')} variant="secondary">
          ← Back to Collections
        </Button>
        <Badge tone="info">{`${selectedProducts.length} selected`}</Badge>
      </InlineStack>

      <TextField
        label="Search products"
        value={searchQuery}
        onChange={setSearchQuery}
        placeholder="Search by title, handle, or SKU..."
        autoComplete="off"
        connectedRight={
          <Button
            onClick={() => searchProducts(searchQuery)}
            loading={loading}
            disabled={searchQuery.length < 2}
          >
            Search
          </Button>
        }
      />

      <BlockStack gap="300">
        {products.map(product => (
          <Card key={product.id}>
            <InlineStack align="space-between" blockAlign="center">
              <InlineStack gap="300" blockAlign="center">
                <Checkbox
                  label=""
                  checked={selectedProducts.includes(product.id)}
                  onChange={() => handleProductToggle(product.id)}
                />
                {product.image && (
                  <Thumbnail
                    source={product.image.url}
                    alt={product.title}
                    size="small"
                  />
                )}
                <BlockStack gap="100">
                  <Text variant="bodyMd" as="p" fontWeight="semibold">
                    {product.title}
                  </Text>
                  {product.variant && (
                    <Text variant="bodySm" as="p" tone="subdued">
                      ${product.variant.price}
                      {product.variant.inventoryQuantity !== undefined &&
                        ` • ${product.variant.inventoryQuantity} in stock`
                      }
                    </Text>
                  )}
                  <Badge
                    tone={product.status === 'ACTIVE' ? 'success' : 'warning'}
                  >
                    {product.status}
                  </Badge>
                </BlockStack>
              </InlineStack>
            </InlineStack>
          </Card>
        ))}
      </BlockStack>
    </BlockStack>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Select Products"
      primaryAction={{
        content: `Select ${selectedProducts.length} Products`,
        onAction: handleConfirm,
        disabled: selectedProducts.length === 0
      }}
      secondaryActions={[
        {
          content: 'Cancel',
          onAction: onClose
        }
      ]}
      size="large"
    >
      <Modal.Section>
        {loading && <Spinner />}
        {!loading && (
          <>
            {currentView === 'collections' && renderCollections()}
            {currentView === 'products' && renderProducts()}
            {currentView === 'search' && renderSearch()}
          </>
        )}
      </Modal.Section>
    </Modal>
  );
}