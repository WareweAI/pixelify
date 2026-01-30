import type { LoaderFunctionArgs } from "react-router";
import { getShopifyInstance } from "../shopify.server";
import { SHOPIFY_PAGES_QUERY, SEARCH_PAGES_QUERY } from "../lib/queries";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const shopify = getShopifyInstance();

  if (!shopify?.authenticate) {
    return Response.json({ error: "Shopify not configured" }, { status: 500 });
  }

  try {
    const { admin, session } = await shopify.authenticate.admin(request);
    const url = new URL(request.url);
    const searchQuery = url.searchParams.get("query") || "";
    const first = parseInt(url.searchParams.get("first") || "50");
    const after = url.searchParams.get("after") || null;

    console.log(`[Shopify Pages API] Fetching pages for shop: ${session.shop}`);
    console.log(`[Shopify Pages API] Query: "${searchQuery}", First: ${first}, After: ${after}`);

    // Use search query if provided, otherwise fetch all pages
    const query = searchQuery 
      ? SEARCH_PAGES_QUERY 
      : SHOPIFY_PAGES_QUERY;

    const variables: any = { first };
    if (after) variables.after = after;
    if (searchQuery) variables.query = searchQuery;

    const response = await admin.graphql(query, { variables });
    const data = await response.json();

    if (data.errors) {
      console.error("[Shopify Pages API] GraphQL errors:", data.errors);
      return Response.json({ error: "Failed to fetch pages", details: data.errors }, { status: 500 });
    }

    const pages = data.data.pages.edges.map((edge: any) => ({
      id: edge.node.id,
      handle: edge.node.handle,
      title: edge.node.title,
      bodySummary: edge.node.bodySummary,
      createdAt: edge.node.createdAt,
      updatedAt: edge.node.updatedAt,
      metafields: edge.node.metafields?.edges.map((mf: any) => ({
        key: mf.node.key,
        value: mf.node.value,
        namespace: mf.node.namespace,
      })) || [],
    }));

    const pageInfo = data.data.pages.pageInfo;

    console.log(`[Shopify Pages API] Found ${pages.length} pages`);

    return Response.json({
      pages,
      pageInfo,
      totalCount: pages.length,
    });
  } catch (error) {
    console.error("[Shopify Pages API] Error:", error);
    return Response.json(
      { error: "Failed to fetch pages", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
};
