// Facebook Catalog API Service
import { META_GRAPH_API_VERSION, META_GRAPH_API_URL } from "./meta-capi.server";
import { FacebookTokenService } from "./facebook-token.server";

export interface FacebookCatalogProduct {
  id: string;
  title: string;
  description?: string;
  image_link?: string;
  link: string;
  price: string;
  currency: string;
  availability: 'in stock' | 'out of stock' | 'pending' | 'discontinued';
  condition: 'new' | 'refurbished' | 'used';
  brand?: string;
  category?: string;
  gtin?: string;
  mpn?: string;
  additional_image_links?: string[];
  sale_price?: string;
  sale_price_effective_date?: string;
  item_group_id?: string;
  color?: string;
  size?: string;
  gender?: string;
  age_group?: string;
  material?: string;
  pattern?: string;
  custom_label_0?: string;
  custom_label_1?: string;
  custom_label_2?: string;
  custom_label_3?: string;
  custom_label_4?: string;
}

export interface CatalogSyncResult {
  success: boolean;
  catalogId?: string;
  productsProcessed?: number;
  productsCreated?: number;
  productsUpdated?: number;
  productsDeleted?: number;
  errors?: string[];
}

export class FacebookCatalogService {
  private static async makeApiCall(
    endpoint: string,
    accessToken: string,
    method: 'GET' | 'POST' | 'DELETE' = 'GET',
    body?: any
  ): Promise<any> {
    // Don't validate token before API call - let Facebook API respond
    // This allows the token from Dashboard OAuth to work without strict validation
    const url = `${META_GRAPH_API_URL}/${META_GRAPH_API_VERSION}/${endpoint}?access_token=${accessToken}`;

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();

    if (data.error) {
      // Handle token expiration errors
      if (data.error.code === 190) {
        throw new Error(`Facebook access token has expired. Please reconnect Facebook in Dashboard. Error: ${data.error.message}`);
      }
      
      // Provide more helpful error messages for permission issues
      if (data.error.code === 100 || data.error.message?.includes('Permission') || data.error.message?.includes('permission')) {
        throw new Error(`Facebook API Error: Missing Permission - ${data.error.message}. Your token may not have 'catalog_management' permission. You can use the Feed URL method instead.`);
      }
      throw new Error(`Facebook API Error: ${data.error.message} (Code: ${data.error.code || 'N/A'})`);
    }

    return data;
  }

  // Create a new product catalog
  static async createCatalog(accessToken: string, name: string): Promise<string> {
    try {
      // First, get the user's business accounts
      const businessData = await this.makeApiCall('me/businesses', accessToken);

      if (!businessData.data || businessData.data.length === 0) {
        throw new Error('No business accounts found. You need a Facebook Business Manager account to create catalogs.');
      }

      // Use the first business account
      const businessId = businessData.data[0].id;

      // Create catalog under the business
      const data = await this.makeApiCall(
        `${businessId}/owned_product_catalogs`,
        accessToken,
        'POST',
        {
          name,
          catalog_type: 'commerce',
        }
      );

      return data.id;
    } catch (error) {
      console.error('Error creating Facebook catalog:', error);
      throw error;
    }
  }

  // Get catalog details
  static async getCatalog(catalogId: string, accessToken: string): Promise<any> {
    try {
      return await this.makeApiCall(`${catalogId}`, accessToken);
    } catch (error) {
      console.error('Error getting Facebook catalog:', error);
      throw error;
    }
  }

  // Delete catalog
  static async deleteCatalog(catalogId: string, accessToken: string): Promise<void> {
    try {
      await this.makeApiCall(`${catalogId}`, accessToken, 'DELETE');
    } catch (error) {
      console.error('Error deleting Facebook catalog:', error);
      throw error;
    }
  }

  // Batch upload products to catalog
  static async uploadProducts(
    catalogId: string,
    accessToken: string,
    products: FacebookCatalogProduct[]
  ): Promise<CatalogSyncResult> {
    try {
      const result: CatalogSyncResult = {
        success: true,
        productsProcessed: products.length,
        productsCreated: 0,
        productsUpdated: 0,
        productsDeleted: 0,
        errors: [],
      };

      // Facebook allows batch operations with up to 5000 items
      const batchSize = 1000;
      for (let i = 0; i < products.length; i += batchSize) {
        const batch = products.slice(i, i + batchSize);

        const batchData = {
          requests: batch.map(product => ({
            method: 'CREATE',
            retailer_id: product.id,
            data: product,
          })),
        };

        try {
          const response = await this.makeApiCall(
            `${catalogId}/batch`,
            accessToken,
            'POST',
            batchData
          );

          // Process batch response
          if (response.handles) {
            result.productsCreated! += response.handles.length;
          }
        } catch (batchError) {
          console.error('Error in product batch upload:', batchError);
          result.errors!.push(`Batch ${Math.floor(i / batchSize) + 1} failed: ${batchError}`);
        }
      }

      return result;
    } catch (error) {
      console.error('Error uploading products to Facebook catalog:', error);
      return {
        success: false,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      };
    }
  }

  // Update existing products
  static async updateProducts(
    catalogId: string,
    accessToken: string,
    products: FacebookCatalogProduct[]
  ): Promise<CatalogSyncResult> {
    try {
      const result: CatalogSyncResult = {
        success: true,
        productsProcessed: products.length,
        productsUpdated: 0,
        errors: [],
      };

      const batchSize = 1000;
      for (let i = 0; i < products.length; i += batchSize) {
        const batch = products.slice(i, i + batchSize);

        const batchData = {
          requests: batch.map(product => ({
            method: 'UPDATE',
            retailer_id: product.id,
            data: product,
          })),
        };

        try {
          const response = await this.makeApiCall(
            `${catalogId}/batch`,
            accessToken,
            'POST',
            batchData
          );

          if (response.handles) {
            result.productsUpdated! += response.handles.length;
          }
        } catch (batchError) {
          console.error('Error in product batch update:', batchError);
          result.errors!.push(`Batch ${Math.floor(i / batchSize) + 1} failed: ${batchError}`);
        }
      }

      return result;
    } catch (error) {
      console.error('Error updating products in Facebook catalog:', error);
      return {
        success: false,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      };
    }
  }

  // Delete products from catalog
  static async deleteProducts(
    catalogId: string,
    accessToken: string,
    productIds: string[]
  ): Promise<CatalogSyncResult> {
    try {
      const result: CatalogSyncResult = {
        success: true,
        productsProcessed: productIds.length,
        productsDeleted: 0,
        errors: [],
      };

      const batchSize = 1000;
      for (let i = 0; i < productIds.length; i += batchSize) {
        const batch = productIds.slice(i, i + batchSize);

        const batchData = {
          requests: batch.map(productId => ({
            method: 'DELETE',
            retailer_id: productId,
          })),
        };

        try {
          const response = await this.makeApiCall(
            `${catalogId}/batch`,
            accessToken,
            'POST',
            batchData
          );

          if (response.handles) {
            result.productsDeleted! += response.handles.length;
          }
        } catch (batchError) {
          console.error('Error in product batch delete:', batchError);
          result.errors!.push(`Batch ${Math.floor(i / batchSize) + 1} failed: ${batchError}`);
        }
      }

      return result;
    } catch (error) {
      console.error('Error deleting products from Facebook catalog:', error);
      return {
        success: false,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      };
    }
  }

  // Get products from catalog
  static async getProducts(catalogId: string, accessToken: string): Promise<any[]> {
    try {
      const data = await this.makeApiCall(`${catalogId}/products`, accessToken);
      return data.data || [];
    } catch (error) {
      console.error('Error getting products from Facebook catalog:', error);
      throw error;
    }
  }

  // Validate catalog access
  static async validateCatalogAccess(catalogId: string, accessToken: string): Promise<boolean> {
    try {
      await this.getCatalog(catalogId, accessToken);
      return true;
    } catch (error) {
      console.error('Error validating Facebook catalog access:', error);
      return false;
    }
  }

  // Get all catalogs for the user's business accounts
  static async getCatalogs(accessToken: string): Promise<any[]> {
    try {
      // First, get the user's business accounts
      const businessData = await this.makeApiCall('me/businesses', accessToken);

      if (!businessData.data || businessData.data.length === 0) {
        return [];
      }

      const allCatalogs: any[] = [];

      // Get catalogs from each business
      for (const business of businessData.data) {
        try {
          const catalogsData = await this.makeApiCall(
            `${business.id}/owned_product_catalogs`,
            accessToken
          );

          if (catalogsData.data) {
            allCatalogs.push(...catalogsData.data.map((catalog: any) => ({
              ...catalog,
              businessId: business.id,
              businessName: business.name,
            })));
          }
        } catch (error) {
          console.error(`Error fetching catalogs for business ${business.id}:`, error);
        }
      }

      return allCatalogs;
    } catch (error) {
      console.error('Error getting Facebook catalogs:', error);
      return [];
    }
  }

  // Get catalog product count
  static async getCatalogProductCount(catalogId: string, accessToken: string): Promise<number> {
    try {
      const data = await this.makeApiCall(
        `${catalogId}?fields=product_count`,
        accessToken
      );
      return data.product_count || 0;
    } catch (error) {
      console.error('Error getting catalog product count:', error);
      return 0;
    }
  }

  // Connect pixel to catalog
  static async connectPixelToCatalog(
    catalogId: string,
    pixelId: string,
    accessToken: string
  ): Promise<boolean> {
    try {
      await this.makeApiCall(
        `${catalogId}/external_event_sources`,
        accessToken,
        'POST',
        { external_event_sources: [pixelId] }
      );
      return true;
    } catch (error) {
      console.error('Error connecting pixel to catalog:', error);
      return false;
    }
  }

  // Get connected pixels for a catalog
  static async getConnectedPixels(catalogId: string, accessToken: string): Promise<string[]> {
    try {
      const data = await this.makeApiCall(
        `${catalogId}/external_event_sources`,
        accessToken
      );
      return data.data?.map((source: any) => source.id) || [];
    } catch (error) {
      console.error('Error getting connected pixels:', error);
      return [];
    }
  }
}