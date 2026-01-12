// Shopify Products Service
import { FacebookCatalogProduct } from "./facebook-catalog.server";

export interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  description: string;
  vendor: string;
  product_type: string;
  tags: string[];
  variants: ShopifyVariant[];
  images: ShopifyImage[];
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ShopifyVariant {
  id: number;
  title: string;
  sku: string;
  price: string;
  compare_at_price: string | null;
  inventory_quantity: number;
  weight: number;
  weight_unit: string;
  option1: string | null;
  option2: string | null;
  option3: string | null;
  barcode: string | null;
  image_id: number | null;
}

export interface ShopifyImage {
  id: number;
  src: string;
  alt: string | null;
  position: number;
}

export class ShopifyProductsService {
  private static async makeShopifyRequest(
    shop: string,
    accessToken: string,
    endpoint: string,
    method: 'GET' | 'POST' = 'GET',
    body?: any
  ): Promise<any> {
    const url = `https://${shop}/admin/api/2024-10/${endpoint}`;

    const response = await fetch(url, {
      method,
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  // Fetch all products from Shopify
  static async getAllProducts(shop: string, accessToken: string): Promise<ShopifyProduct[]> {
    const products: ShopifyProduct[] = [];
    let url = 'products.json?limit=250';

    while (url) {
      const response = await this.makeShopifyRequest(shop, accessToken, url);
      products.push(...response.products);

      // Check for next page
      const linkHeader = response.headers?.get('link');
      if (linkHeader) {
        const nextLink = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        if (nextLink) {
          url = nextLink[1].replace(`https://${shop}/admin/api/2024-10/`, '');
        } else {
          url = '';
        }
      } else {
        url = '';
      }
    }

    return products;
  }

  // Convert Shopify product to Facebook catalog format
  static convertToFacebookCatalogProduct(
    shopifyProduct: ShopifyProduct,
    shopDomain: string
  ): FacebookCatalogProduct[] {
    const catalogProducts: FacebookCatalogProduct[] = [];

    // Get the main image
    const mainImage = shopifyProduct.images.find(img => img.position === 1) || shopifyProduct.images[0];
    const additionalImages = shopifyProduct.images.filter(img => img.id !== mainImage?.id).map(img => img.src);

    // Process each variant
    for (const variant of shopifyProduct.variants) {
      const catalogProduct: FacebookCatalogProduct = {
        id: variant.id.toString(),
        title: shopifyProduct.title,
        description: shopifyProduct.description || shopifyProduct.title,
        link: `https://${shopDomain}/products/${shopifyProduct.handle}?variant=${variant.id}`,
        price: variant.price,
        currency: 'USD', // Assuming USD, could be made configurable
        availability: variant.inventory_quantity > 0 ? 'in stock' : 'out of stock',
        condition: 'new',
        brand: shopifyProduct.vendor || undefined,
        category: shopifyProduct.product_type || undefined,
        gtin: variant.barcode || undefined,
        mpn: variant.sku || undefined,
      };

      // Add main image
      if (mainImage) {
        catalogProduct.image_link = mainImage.src;
        catalogProduct.additional_image_links = additionalImages;
      }

      // Add variant-specific fields
      if (variant.title !== 'Default Title') {
        catalogProduct.title = `${shopifyProduct.title} - ${variant.title}`;
      }

      // Add variant options as custom labels
      if (variant.option1) {
        catalogProduct.custom_label_0 = variant.option1;
      }
      if (variant.option2) {
        catalogProduct.custom_label_1 = variant.option2;
      }
      if (variant.option3) {
        catalogProduct.custom_label_2 = variant.option3;
      }

      // Add size/color if applicable
      if (variant.option1 && ['size', 'color'].includes(variant.option1.toLowerCase())) {
        if (variant.option1.toLowerCase() === 'size') {
          catalogProduct.size = variant.option1;
        } else if (variant.option1.toLowerCase() === 'color') {
          catalogProduct.color = variant.option1;
        }
      }

      // Add sale price if compare_at_price exists
      if (variant.compare_at_price && parseFloat(variant.compare_at_price) > parseFloat(variant.price)) {
        catalogProduct.sale_price = variant.price;
        catalogProduct.price = variant.compare_at_price;
      }

      // Add item group ID for variants
      if (shopifyProduct.variants.length > 1) {
        catalogProduct.item_group_id = shopifyProduct.id.toString();
      }

      catalogProducts.push(catalogProduct);
    }

    return catalogProducts;
  }

  // Sync all products from Shopify to Facebook catalog
  static async syncProductsToCatalog(
    shop: string,
    accessToken: string,
    catalogId: string,
    facebookToken: string,
    shopDomain: string
  ): Promise<{ processed: number; created: number; updated: number; errors: string[] }> {
    const { FacebookCatalogService } = await import('./facebook-catalog.server');

    const result = {
      processed: 0,
      created: 0,
      updated: 0,
      errors: [] as string[],
    };

    try {
      // Get all products from Shopify
      const shopifyProducts = await this.getAllProducts(shop, accessToken);

      // Convert to Facebook catalog format
      const catalogProducts: FacebookCatalogProduct[] = [];
      for (const product of shopifyProducts) {
        if (product.status === 'active') { // Only sync active products
          const converted = this.convertToFacebookCatalogProduct(product, shopDomain);
          catalogProducts.push(...converted);
        }
      }

      result.processed = catalogProducts.length;

      // Upload to Facebook catalog
      const uploadResult = await FacebookCatalogService.uploadProducts(
        catalogId,
        facebookToken,
        catalogProducts
      );

      result.created = uploadResult.productsCreated ?? 0;
      result.updated = uploadResult.productsUpdated ?? 0;
      result.errors = uploadResult.errors ?? [];

    } catch (error) {
      result.errors.push(`Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }
}