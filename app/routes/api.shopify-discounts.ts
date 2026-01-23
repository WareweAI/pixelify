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
  const { admin } = await authenticate.admin(request);

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  try {
    if (intent === "fetch-discounts") {
      // Fetch discount codes from Shopify
      const response = await admin.graphql(`
        query {
          codeDiscountNodes(first: 50) {
            edges {
              node {
                id
                codeDiscount {
                  ... on DiscountCodeBasic {
                    title
                    codes(first: 10) {
                      edges {
                        node {
                          code
                        }
                      }
                    }
                    status
                    startsAt
                    endsAt
                    customerGets {
                      value {
                        ... on DiscountPercentage {
                          percentage
                        }
                        ... on DiscountAmount {
                          amount {
                            amount
                            currencyCode
                          }
                        }
                      }
                    }
                    usageLimit
                    appliesOncePerCustomer
                  }
                  ... on DiscountCodeBxgy {
                    title
                    codes(first: 10) {
                      edges {
                        node {
                          code
                        }
                      }
                    }
                    status
                    startsAt
                    endsAt
                    usageLimit
                    appliesOncePerCustomer
                  }
                  ... on DiscountCodeFreeShipping {
                    title
                    codes(first: 10) {
                      edges {
                        node {
                          code
                        }
                      }
                    }
                    status
                    startsAt
                    endsAt
                    usageLimit
                    appliesOncePerCustomer
                  }
                }
              }
            }
          }
        }
      `);

      const data = await response.json();

      if ((data as any).errors) {
        console.error('GraphQL errors fetching discounts:', (data as any).errors);
        return { success: false, message: 'Failed to fetch discounts' };
      }

      const discounts = data.data?.codeDiscountNodes?.edges?.map((edge: any) => {
        const discount = edge.node.codeDiscount;
        const codes = discount.codes?.edges?.map((c: any) => c.node.code) || [];
        
        // Extract discount value
        let discountValue = null;
        let discountType = null;
        
        if (discount.customerGets?.value) {
          if (discount.customerGets.value.percentage !== undefined) {
            discountValue = `${discount.customerGets.value.percentage}%`;
            discountType = 'percentage';
          } else if (discount.customerGets.value.amount) {
            discountValue = `${discount.customerGets.value.amount.amount} ${discount.customerGets.value.amount.currencyCode}`;
            discountType = 'fixed';
          }
        }

        return {
          id: edge.node.id,
          title: discount.title,
          codes: codes,
          status: discount.status,
          startsAt: discount.startsAt,
          endsAt: discount.endsAt,
          discountValue: discountValue,
          discountType: discountType,
          usageLimit: discount.usageLimit,
          appliesOncePerCustomer: discount.appliesOncePerCustomer,
        };
      }) || [];

      return { success: true, discounts };

    } else if (intent === "fetch-automatic-discounts") {
      // Fetch automatic discounts
      const response = await admin.graphql(`
        query {
          automaticDiscountNodes(first: 50) {
            edges {
              node {
                id
                automaticDiscount {
                  ... on DiscountAutomaticBasic {
                    title
                    status
                    startsAt
                    endsAt
                    customerGets {
                      value {
                        ... on DiscountPercentage {
                          percentage
                        }
                        ... on DiscountAmount {
                          amount {
                            amount
                            currencyCode
                          }
                        }
                      }
                    }
                  }
                  ... on DiscountAutomaticBxgy {
                    title
                    status
                    startsAt
                    endsAt
                  }
                  ... on DiscountAutomaticFreeShipping {
                    title
                    status
                    startsAt
                    endsAt
                  }
                }
              }
            }
          }
        }
      `);

      const data = await response.json();

      if ((data as any).errors) {
        console.error('GraphQL errors fetching automatic discounts:', (data as any).errors);
        return { success: false, message: 'Failed to fetch automatic discounts' };
      }

      const automaticDiscounts = data.data?.automaticDiscountNodes?.edges?.map((edge: any) => {
        const discount = edge.node.automaticDiscount;
        
        // Extract discount value
        let discountValue = null;
        let discountType = null;
        
        if (discount.customerGets?.value) {
          if (discount.customerGets.value.percentage !== undefined) {
            discountValue = `${discount.customerGets.value.percentage}%`;
            discountType = 'percentage';
          } else if (discount.customerGets.value.amount) {
            discountValue = `${discount.customerGets.value.amount.amount} ${discount.customerGets.value.amount.currencyCode}`;
            discountType = 'fixed';
          }
        }

        return {
          id: edge.node.id,
          title: discount.title,
          status: discount.status,
          startsAt: discount.startsAt,
          endsAt: discount.endsAt,
          discountValue: discountValue,
          discountType: discountType,
          isAutomatic: true,
        };
      }) || [];

      return { success: true, automaticDiscounts };
    }

    return { success: false, message: 'Invalid intent' };

  } catch (error: any) {
    console.error('Error in shopify-discounts API:', error);
    return { success: false, message: error.message || 'An unexpected error occurred' };
  }
};
