import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { getShopifyInstance } from "../shopify.server";

// Generate XML product feed for Facebook Catalog
export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const { appId } = params;

  if (!appId || appId === "default") {
    return new Response(generateEmptyFeed(), {
      headers: {
        "Content-Type": "application/xml",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  try {
    // Find the app
    const app = await prisma.app.findUnique({
      where: { appId },
      include: {
        user: true,
        settings: true,
      },
    });

    if (!app || !app.user) {
      return new Response(generateEmptyFeed(), {
        headers: { "Content-Type": "application/xml" },
      });
    }

    const shop = app.user.storeUrl;

    // Get session for this shop
    const session = await prisma.session.findFirst({
      where: { shop },
    });

    if (!session?.accessToken) {
      console.error(`No session found for shop: ${shop}`);
      return new Response(generateEmptyFeed(), {
        headers: { "Content-Type": "application/xml" },
      });
    }

    // Fetch products from Shopify using Admin API
    const shopify = getShopifyInstance();
    const products = await fetchShopifyProducts(shop, session.accessToken);

    // Generate XML feed
    const xml = generateProductFeed(products, shop, app.settings?.metaPixelId || null);

    return new Response(xml, {
      headers: {
        "Content-Type": "application/xml",
        "Cache-Control": "public, max-age=3600", // Cache for 1 hour
      },
    });
  } catch (error) {
    console.error("Error generating catalog feed:", error);
    return new Response(generateEmptyFeed(), {
      headers: { "Content-Type": "application/xml" },
      status: 500,
    });
  }
};

async function fetchShopifyProducts(shop: string, accessToken: string) {
  const products: any[] = [];
  let hasNextPage = true;
  let cursor: string | null = null;

  while (hasNextPage && products.length < 5000) {
    const query = `
      query($cursor: String) {
        products(first: 250, after: $cursor) {
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            node {
              id
              title
              description
              handle
              vendor
              productType
              status
              onlineStoreUrl
              featuredImage {
                url
              }
              images(first: 10) {
                edges {
                  node {
                    url
                  }
                }
              }
              variants(first: 100) {
                edges {
                  node {
                    id
                    title
                    sku
                    price
                    compareAtPrice
                    inventoryQuantity
                    barcode
                    selectedOptions {
                      name
                      value
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    try {
      const response: Response = await fetch(
        `https://${shop}/admin/api/2024-01/graphql.json`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": accessToken,
          },
          body: JSON.stringify({ query, variables: { cursor } }),
        }
      );

      const data: any = await response.json();
      
      if (data.errors) {
        console.error("GraphQL errors:", data.errors);
        break;
      }

      const productEdges = data.data?.products?.edges || [];
      products.push(...productEdges.map((edge: any) => edge.node));

      hasNextPage = data.data?.products?.pageInfo?.hasNextPage || false;
      cursor = data.data?.products?.pageInfo?.endCursor || null;
    } catch (error) {
      console.error("Error fetching products:", error);
      break;
    }
  }

  return products;
}

function generateProductFeed(products: any[], shop: string, pixelId: string | null): string {
  const shopDomain = shop.includes(".myshopify.com") 
    ? shop 
    : `${shop}.myshopify.com`;
  
  const brandName = shop.replace(".myshopify.com", "").replace(/-/g, " ");

  let items = "";

  for (const product of products) {
    if (product.status !== "ACTIVE") continue;

    for (const variantEdge of product.variants?.edges || []) {
      const variant = variantEdge.node;
      const variantId = variant.id.split("/").pop();
      const productId = product.id.split("/").pop();
      const retailerId = variant.sku || `shopify_${shop.split(".")[0]}_${productId}_${variantId}`;

      const title = variant.title !== "Default Title"
        ? `${escapeXml(product.title)} - ${escapeXml(variant.title)}`
        : escapeXml(product.title);

      const description = escapeXml(
        (product.description || product.title || "").substring(0, 5000)
      );

      const imageUrl = product.featuredImage?.url || 
        product.images?.edges?.[0]?.node?.url || "";

      const link = product.onlineStoreUrl || 
        `https://${shopDomain}/products/${product.handle}?variant=${variantId}`;

      const price = `${variant.price} USD`;
      const salePrice = variant.compareAtPrice && 
        parseFloat(variant.compareAtPrice) > parseFloat(variant.price)
        ? `${variant.price} USD`
        : "";

      const availability = (variant.inventoryQuantity || 0) > 0 
        ? "in stock" 
        : "out of stock";

      const additionalImages = (product.images?.edges || [])
        .slice(1, 10)
        .map((img: any) => `<additional_image_link>${escapeXml(img.node.url)}</additional_image_link>`)
        .join("\n      ");

      // Extract variant options
      const options = variant.selectedOptions || [];
      const color = options.find((o: any) => 
        o.name.toLowerCase() === "color" || o.name.toLowerCase() === "colour"
      )?.value || "";
      const size = options.find((o: any) => 
        o.name.toLowerCase() === "size"
      )?.value || "";

      items += `
    <item>
      <id>${escapeXml(retailerId)}</id>
      <title>${title}</title>
      <description>${description}</description>
      <link>${escapeXml(link)}</link>
      <image_link>${escapeXml(imageUrl)}</image_link>
      ${additionalImages}
      <price>${price}</price>
      ${salePrice ? `<sale_price>${salePrice}</sale_price>` : ""}
      <availability>${availability}</availability>
      <condition>new</condition>
      <brand>${escapeXml(product.vendor || brandName)}</brand>
      <item_group_id>${productId}</item_group_id>
      ${variant.barcode ? `<gtin>${escapeXml(variant.barcode)}</gtin>` : ""}
      ${variant.sku ? `<mpn>${escapeXml(variant.sku)}</mpn>` : ""}
      ${product.productType ? `<product_type>${escapeXml(product.productType)}</product_type>` : ""}
      ${color ? `<color>${escapeXml(color)}</color>` : ""}
      ${size ? `<size>${escapeXml(size)}</size>` : ""}
      <custom_label_0>${escapeXml(product.productType || "Uncategorized")}</custom_label_0>
      <custom_label_1>${availability}</custom_label_1>
    </item>`;
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${escapeXml(brandName)} Product Feed</title>
    <link>https://${shopDomain}</link>
    <description>Product feed for ${escapeXml(brandName)}</description>
    ${items}
  </channel>
</rss>`;
}

function generateEmptyFeed(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Product Feed</title>
    <link></link>
    <description>No products available</description>
  </channel>
</rss>`;
}

function escapeXml(str: string): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ""); // Remove invalid XML chars
}