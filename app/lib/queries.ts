// GraphQL queries for Shopify Admin API

export const COLLECTIONS_QUERY = `
  query GetCollections($first: Int!, $after: String) {
    collections(first: $first, after: $after, sortKey: TITLE) {
      edges {
        node {
          id
          title
          handle
          description
          productsCount
          image {
            url
            altText
          }
          updatedAt
        }
        cursor
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
    }
  }
`;

export const COLLECTION_PRODUCTS_QUERY = `
  query GetCollectionProducts($collectionId: ID!, $first: Int!, $after: String) {
    collection(id: $collectionId) {
      id
      title
      products(first: $first, after: $after) {
        edges {
          node {
            id
            title
            handle
            status
            featuredImage {
              url
              altText
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
          cursor
        }
        pageInfo {
          hasNextPage
          hasPreviousPage
          startCursor
          endCursor
        }
      }
    }
  }
`;

export const SEARCH_PRODUCTS_QUERY = `
  query SearchProducts($query: String!, $first: Int!) {
    products(first: $first, query: $query) {
      edges {
        node {
          id
          title
          handle
          status
          featuredImage {
            url
            altText
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
        cursor
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
    }
  }
`;

export const STORE_PAGES_QUERY = `
  query GetStoreContent {
    shop {
      name
    }
    collections(first: 250) {
      edges {
        node {
          id
          title
          handle
        }
      }
      pageInfo {
        hasNextPage
      }
    }
    products(first: 250, query: "status:active") {
      edges {
        node {
          id
          title
          handle
        }
      }
      pageInfo {
        hasNextPage
      }
    }
  }
`;

export const SHOPIFY_PAGES_QUERY = `
  query GetPages($first: Int!, $after: String, $query: String) {
    pages(first: $first, after: $after, query: $query, sortKey: TITLE) {
      edges {
        node {
          id
          handle
          title
          bodySummary
          createdAt
          updatedAt
          metafields(first: 5, namespace: "custom") {
            edges {
              node {
                id
                key
                value
                namespace
              }
            }
          }
        }
        cursor
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
    }
  }
`;

export const SEARCH_PAGES_QUERY = `
  query SearchPages($query: String!, $first: Int!, $after: String) {
    pages(first: $first, after: $after, query: $query) {
      edges {
        node {
          id
          handle
          title
          bodySummary
          createdAt
          updatedAt
        }
        cursor
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
    }
  }
`;