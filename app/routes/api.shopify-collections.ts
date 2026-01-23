import { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

// This is an API route - only POST requests are allowed
export const loader = async ({ request }: LoaderFunctionArgs) => {
  return new Response(JSON.stringify({ error: "Method not allowed. Use POST." }), {
    status: 405,
    headers: { "Content-Type": "application/json" }
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  try {
    if (intent === "fetch-collections") {
      const response = await admin.graphql(`
        query {
          collections(first: 50, sortKey: TITLE) {
            edges {
              node {
                id
                title
                handle
                productsCount {
                  count
                }
                image {
                  url
                }
              }
            }
          }
        }
      `);

      const data = await response.json();

      if ((data as any).errors) {
        console.error('GraphQL errors fetching collections:', (data as any).errors);
        return { success: false, message: 'Failed to fetch collections' };
      }

      const collections = data.data?.collections?.edges?.map((edge: any) => ({
        id: edge.node.id,
        title: edge.node.title,
        handle: edge.node.handle,
        productsCount: edge.node.productsCount?.count || 0,
        image: edge.node.image
      })) || [];

      return { success: true, collections };

    } else if (intent === "fetch-products") {
      const collectionId = formData.get("collectionId") as string;
      const cursor = formData.get("cursor") as string;

      if (!collectionId) {
        return { success: false, message: 'Collection ID is required' };
      }

      // Fetch products from a specific collection
      const response = await admin.graphql(`
        query GetCollectionProducts($collectionId: ID!, $cursor: String) {
          collection(id: $collectionId) {
            products(first: 50, after: $cursor) {
              edges {
                node {
                  id
                  title
                  handle
                  status
                  featuredImage {
                    url
                  }
                  variants(first: 1) {
                    edges {
                      node {
                        id
                        price
                        compareAtPrice
                        inventoryQuantity
                        sku
                      }
                    }
                  }
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
      `, {
        variables: { collectionId, cursor }
      });

      const data = await response.json();

      if ((data as any).errors) {
        console.error('GraphQL errors fetching products:', (data as any).errors);
        return { success: false, message: 'Failed to fetch products' };
      }

      const products = data.data?.collection?.products?.edges?.map((edge: any) => ({
        id: edge.node.id,
        title: edge.node.title,
        handle: edge.node.handle,
        status: edge.node.status,
        image: edge.node.featuredImage,
        variant: edge.node.variants?.edges?.[0]?.node
      })) || [];

      const pageInfo = data.data?.collection?.products?.pageInfo;

      return {
        success: true,
        products,
        pageInfo
      };

    } else if (intent === "search-products") {
      const query = formData.get("query") as string;

      if (!query || query.length < 2) {
        return { success: false, message: 'Search query must be at least 2 characters' };
      }

      // Search products
      const response = await admin.graphql(`
        query SearchProducts($query: String!) {
          products(first: 50, query: $query) {
            edges {
              node {
                id
                title
                handle
                status
                featuredImage {
                  url
                }
                variants(first: 1) {
                  edges {
                    node {
                      id
                      price
                      compareAtPrice
                      inventoryQuantity
                      sku
                    }
                  }
                }
              }
            }
          }
        }
      `, {
        variables: { query: `title:*${query}* OR handle:*${query}* OR sku:*${query}*` }
      });

      const data = await response.json();

      if ((data as any).errors) {
        console.error('GraphQL errors searching products:', (data as any).errors);
        return { success: false, message: 'Failed to search products' };
      }

      const products = data.data?.products?.edges?.map((edge: any) => ({
        id: edge.node.id,
        title: edge.node.title,
        handle: edge.node.handle,
        status: edge.node.status,
        image: edge.node.featuredImage,
        variant: edge.node.variants?.edges?.[0]?.node
      })) || [];

      return { success: true, products };
    }

    return { success: false, message: 'Invalid intent' };

  } catch (error: any) {
    console.error('Error in shopify-collections API:', error);
    return { success: false, message: error.message || 'An unexpected error occurred' };
  }
};