// Facebook Catalog API endpoints
import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { getShopifyInstance } from "~/shopify.server";
import prisma from "~/db.server";
import { FacebookCatalogService } from "~/services/facebook-catalog.server";

// Server-only route - no client bundle needed
export const clientLoader = undefined;

export async function loader({ request }: LoaderFunctionArgs) {
  const shopify = getShopifyInstance();
  const { session } = await shopify.authenticate.admin(request);
  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { storeUrl: session.shop },
  });

  if (!user) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  const app = await prisma.app.findFirst({
    where: { userId: user.id },
    include: { settings: true }
  });

  if (!app) {
    return Response.json({ error: "App not found" }, { status: 404 });
  }

  const settings = app.settings;
  if (!settings?.metaAccessToken) {
    return Response.json({ error: "Facebook access token not configured" }, { status: 400 });
  }

  try {
    switch (action) {
      case 'create_catalog': {
        const name = url.searchParams.get('name') || `${app.name} Catalog`;
        const catalogId = await FacebookCatalogService.createCatalog(
          settings.metaAccessToken,
          name
        );

        // Update settings with catalog ID
        // TODO: Re-enable after migration is applied to production
        /*
        await prisma.appSettings.update({
          where: { appId: app.appId },
          data: {
            facebookCatalogId: catalogId,
            facebookCatalogEnabled: true,
            facebookCatalogSyncStatus: 'created',
            facebookCatalogLastSync: new Date(),
          }
        });
        */

        return Response.json({ success: true, catalogId });
      }

      case 'get_catalog': {
        // TODO: Re-enable after migration is applied to production
        return Response.json({ error: "Catalog feature temporarily disabled" }, { status: 400 });
        /*
        if (!settings.facebookCatalogId) {
          return Response.json({ error: "Catalog not configured" }, { status: 400 });
        }

        const catalog = await FacebookCatalogService.getCatalog(
          settings.facebookCatalogId,
          settings.metaAccessToken
        );

        return Response.json({ success: true, catalog });
        */
      }
      case 'validate_catalog': {
        return Response.json({ error: "Catalog feature temporarily disabled" }, { status: 400 });
        /*
        if (!settings.facebookCatalogId) {
          return Response.json({ error: "Catalog not configured" }, { status: 400 });
        }

        const valid = await FacebookCatalogService.validateCatalogAccess(
          settings.facebookCatalogId,
          settings.metaAccessToken
        );

        return Response.json({ success: true, valid });
        */
      }

      case 'get_products': {
        // TODO: Re-enable after migration is applied to production
        return Response.json({ error: "Catalog feature temporarily disabled" }, { status: 400 });
        /*
        if (!settings.facebookCatalogId) {
          return Response.json({ error: "Catalog not configured" }, { status: 400 });
        }

        const products = await FacebookCatalogService.getProducts(
          settings.facebookCatalogId,
          settings.metaAccessToken
        );

        return Response.json({ success: true, products });
        */
      }

      default:
        return Response.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error) {
    console.error('Facebook Catalog API error:', error);
    return Response.json({
      error: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const shopify = getShopifyInstance();
  const { session } = await shopify.authenticate.admin(request);

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { storeUrl: session.shop },
  });

  if (!user) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  const app = await prisma.app.findFirst({
    where: { userId: user.id },
    include: { settings: true }
  });

  if (!app) {
    return Response.json({ error: "App not found" }, { status: 404 });
  }

  const settings = app.settings;
  if (!settings?.metaAccessToken) {
    return Response.json({ error: "Facebook access token not configured" }, { status: 400 });
  }

  const formData = await request.formData();
  const action = formData.get('action') as string;

  try {
    switch (action) {
      case 'enable_catalog': {
        const enabled = formData.get('enabled') === 'true';

        // TODO: Re-enable after migration is applied to production
        /*
        await prisma.appSettings.update({
          where: { appId: app.appId },
          data: {
            facebookCatalogEnabled: enabled,
          }
        });
        */

        return Response.json({ success: true });
      }

      case 'sync_products': {
        // TODO: Re-enable after migration is applied to production
        return Response.json({ error: "Catalog feature temporarily disabled" }, { status: 400 });
        /*
        if (!settings.facebookCatalogId) {
          return Response.json({ error: "Catalog not configured" }, { status: 400 });
        }

        // Update sync status
        await prisma.appSettings.update({
          where: { appId: app.appId },
          data: {
            facebookCatalogSyncStatus: 'syncing',
          }
        });

        try {
          if (!session.accessToken) {
            throw new Error('Shopify access token not available');
          }

          // Import the service
          const { ShopifyProductsService } = await import('~/services/shopify-products.server');

          // Sync products
          const syncResult = await ShopifyProductsService.syncProductsToCatalog(
            session.shop,
            session.accessToken,
            settings.facebookCatalogId,
            settings.metaAccessToken,
            session.shop
          );

          // Update sync status
          await prisma.appSettings.update({
            where: { appId: app.appId },
            data: {
              facebookCatalogSyncStatus: syncResult.errors.length > 0 ? 'error' : 'synced',
              facebookCatalogLastSync: new Date(),
            }
          });

          return Response.json({
            success: true,
            message: `Sync completed. Processed: ${syncResult.processed}, Created: ${syncResult.created}, Updated: ${syncResult.updated}`,
            result: syncResult
          });
        } catch (syncError) {
          console.error('Product sync error:', syncError);

          // Update sync status on error
          await prisma.appSettings.update({
            where: { appId: app.appId },
            data: {
              facebookCatalogSyncStatus: 'error',
            }
          });

          throw syncError;
        }
        */
      }

      case 'delete_catalog': {
        // TODO: Re-enable after migration is applied to production
        return Response.json({ error: "Catalog feature temporarily disabled" }, { status: 400 });
        /*
        if (!settings.facebookCatalogId) {
          return Response.json({ error: "Catalog not configured" }, { status: 400 });
        }

        await FacebookCatalogService.deleteCatalog(
          settings.facebookCatalogId,
          settings.metaAccessToken
        );

        // Clear catalog settings
        await prisma.appSettings.update({
          where: { appId: app.appId },
          data: {
            facebookCatalogId: null,
            facebookCatalogEnabled: false,
            facebookCatalogSyncStatus: null,
            facebookCatalogLastSync: null,
          }
        });

        return Response.json({ success: true });
        */
      }

      default:
        return Response.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error) {
    console.error('Facebook Catalog API error:', error);

    // Update sync status on error
    // TODO: Re-enable after migration is applied to production
    /*
    if (action === 'sync_products') {
      await prisma.appSettings.update({
        where: { appId: app.appId },
        data: {
          facebookCatalogSyncStatus: 'error',
        }
      });
    }
    */

    return Response.json({
      error: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
}