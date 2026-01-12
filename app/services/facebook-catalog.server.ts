// Facebook Catalog API Service
import { META_GRAPH_API_VERSION, META_GRAPH_API_URL } from "./meta-capi.server";

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
      // Provide more helpful error messages for permission issues
      if (data.error.code === 100 || data.error.message?.includes('Permission') || data.error.message?.includes('permission')) {
        throw new Error(`Facebook API Error: (#100) Missing Permission - ${data.error.message}. Please ensure your access token has the 'catalog_management' permission. Go to Facebook App Settings > Permissions and add 'catalog_management', then regenerate your access token.`);
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
}