import { useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { getShopifyInstance } from "../shopify.server";
import {
  Page,
  Card,
  Button,
  Layout,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  Divider,
  Select,
} from "@shopify/polaris";
import { CheckIcon } from "@shopify/polaris-icons";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const shopify = getShopifyInstance();
  
  if (!shopify?.authenticate) {
    throw new Response("Shopify configuration not found", { status: 500 });
  }

  const { session } = await shopify.authenticate.admin(request);
  
  return {
    shop: session.shop,
  };
};

interface PricingPlan {
  id: string;
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  yearlySavings: number;
  badge?: string;
  popular?: boolean;
  features: string[];
  cta: string;
  ctaVariant: "primary" | "secondary";
  feedOptions?: { label: string; value: string }[];
}

const pricingPlans: PricingPlan[] = [
  {
    id: "free",
    name: "Free",
    description: "Perfect for testing and small stores",
    monthlyPrice: 0,
    yearlyPrice: 0,
    yearlySavings: 0,
    features: [
      "1 Pixel, Conversion API",
      "Event reports / Purchase report",
      "5 orders per month (unlimited events within order quota)",
      "Basic analytics",
      "24/7 Support",
      "Facebook product feed (100 products, 1 feed, sync 1 time per week)",
    ],
    cta: "Current Plan",
    ctaVariant: "secondary",
  },
  {
    id: "basic",
    name: "Shopify basic Plan",
    description: "Ideal for growing businesses",
    monthlyPrice: 20.99,
    yearlyPrice: 176.28,
    yearlySavings: 30, 
    badge: "Popular",
    popular: true,
    features: [
      "Multiple browser pixels",
      "1 Conversion API tracking",
      "Custom events",
      "Event reports / Purchase report",
      "Expert analytics and export available",
      "Facebook Ads Report via UTM tracking",
      "Standard Facebook product feed (sync anytime)",
      "Facebook product feed (100 published products, 2 feeds)",
      "Facebook Catalog manager (100 published products, 2 feeds)",
      "3 days free trial",
    ],
    cta: "Current Plan",
    ctaVariant: "primary",
    feedOptions: [
      { label: "100 published products, 2 feeds ($20.99)", value: "100-2" },
      { label: "1000 published products, 5 feeds ($25.99)", value: "1000-5" },
      { label: "5000 published products, 6 feeds ($30.99)", value: "5000-6" },
      { label: ">5000 published products, 10 feeds ($35.99)", value: "5000+-10" },
    ],
  },
  {
    id: "pro",
    name: "Advanced plan",
    description: "For advanced marketing needs",
    monthlyPrice: 55.99,
    yearlyPrice: 470.28, // $39.19 * 12
    yearlySavings: 30, // Save 30%
    features: [
      "Multiple browser pixels, 5 conversion API included",
      "All future updates and features",
      "Custom events",
      "Event reports / Purchase report",
      "Expert analytics and export available",
      "Facebook Ads Report via UTM tracking",
      "Advanced Facebook product feed for matching rate",
      "3 days free trial",
    ],
    cta: "Current Plan",
    ctaVariant: "primary",
    feedOptions: [
      { label: "100 published products, 2 feeds ($20.99)", value: "100-2" },
      { label: "1000 published products, 5 feeds ($25.99)", value: "1000-5" },
      { label: "5000 published products, 6 feeds ($30.99)", value: "5000-6" },
      { label: ">5000 published products, 10 feeds ($35.99)", value: "5000+-10" },
    ],
  },
];

export default function PricingPage() {
  const { shop } = useLoaderData<typeof loader>();
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [feedSelection, setFeedSelection] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    pricingPlans.forEach((plan) => {
      if (plan.feedOptions?.length) {
        initial[plan.id] = plan.feedOptions[0].value;
      }
    });
    return initial;
  });

  return (
    <div style={{ width: "100%", padding: "2rem", backgroundColor: "#f6f6f7" }}>
      <BlockStack gap="400">
              <div style={{ textAlign: "center", marginBottom: "2rem" }}>
                <Text variant="heading2xl" as="h2" fontWeight="bold">
                  Pricing Plans
                </Text>
                <div style={{ marginTop: "1rem", display: "flex", justifyContent: "center", alignItems: "center", gap: "1rem" }}>
                  <Button
                    variant={billingCycle === "monthly" ? "primary" : "secondary"}
                    onClick={() => setBillingCycle("monthly")}
                  >
                    Monthly
                  </Button>
                  <Button
                    variant={billingCycle === "yearly" ? "primary" : "secondary"}
                    onClick={() => setBillingCycle("yearly")}
                  >
                    {billingCycle === "yearly" ? "Yearly Save 30%" : "Yearly"}
                  </Button>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: "2rem",
                  marginTop: "2rem",
                  paddingTop: "1rem",
                  justifyContent: "space-around",
                }}
              >
                {pricingPlans.map((plan) => (
                  <div
                    key={plan.id}
                    style={{
                      position: "relative",
                      border: plan.popular ? "2px solid #008060" : "1px solid #e1e3e5",
                      borderRadius: "12px",
                      padding: "1.5rem",
                      minWidth: "280px",
                      flex: 1,
                      backgroundColor: "white",
                    }}
                  >
                    {plan.popular && (
                      <div
                        style={{
                          position: "absolute",
                          top: "1rem",
                          right: "1rem",
                        }}
                      >
                        <Badge tone="success" size="large">
                          {plan.badge}
                        </Badge>
                      </div>
                    )}

                    <BlockStack gap="400">
                      <div>
                        <Text variant="headingLg" as="h3">
                          {plan.name}
                        </Text>
                        <div style={{ marginTop: "0.5rem" }}>
                          <Text variant="bodyMd" tone="subdued" as="p">
                            {plan.description}
                          </Text>
                        </div>
                      </div>

                      <div>
                        {billingCycle === "yearly" && plan.monthlyPrice > 0 ? (
                          <>
                            <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", flexWrap: "wrap" }}>
                              <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
                                <div style={{ fontSize: "2.5rem", fontWeight: "bold" }}>
                                  <Text variant="heading2xl" as="span">
                                    ${(plan.yearlyPrice / 12).toFixed(2)}
                                  </Text>
                                </div>
                                <Text variant="bodyMd" tone="subdued" as="span">
                                  /month
                                </Text>
                                <div style={{ textDecoration: "line-through", color: "#94a3b8", marginLeft: "0.5rem" }}>
                                  <Text variant="bodyMd" as="span">
                                    ${plan.monthlyPrice.toFixed(2)}/month
                                  </Text>
                                </div>
                              </div>
                            </div>
                            <div style={{ marginTop: "0.5rem" }}>
                              <Text variant="bodySm" tone="subdued" as="p">
                                Billed monthly
                              </Text>
                            </div>
                          </>
                        ) : (
                          <>
                            <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
                              <div style={{ fontSize: "2.5rem", fontWeight: "bold" }}>
                                <Text variant="heading2xl" as="span">
                                  ${plan.monthlyPrice.toFixed(2)}
                                </Text>
                              </div>
                              <Text variant="bodyMd" tone="subdued" as="span">
                                /month
                              </Text>
                            </div>
                            {plan.monthlyPrice === 0 && (
                              <div style={{ marginTop: "0.5rem" }}>
                                <Text variant="bodySm" tone="subdued" as="p">
                                  Renew every month
                                </Text>
                              </div>
                            )}
                            {plan.monthlyPrice > 0 && (
                              <div style={{ marginTop: "0.5rem" }}>
                                <Text variant="bodySm" tone="subdued" as="p">
                                  Billed monthly
                                </Text>
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      <Divider />

                      <BlockStack gap="300">
                        <Text variant="bodyMd" fontWeight="semibold" as="h4">
                          Features:
                        </Text>
                        <BlockStack gap="200">
                          {plan.features.map((feature, index) => (
                            <InlineStack
                              key={index}
                              gap="200"
                              align="start"
                              blockAlign="center"
                            >
                              <div style={{ display: "flex", alignItems: "center" }}>
                                <CheckIcon width={16} height={16} fill="#008060" />
                              </div>
                              <Text variant="bodyMd" as="span">
                                {feature}
                              </Text>
                            </InlineStack>
                          ))}
                        </BlockStack>
                      </BlockStack>

                      {plan.feedOptions?.length ? (
                        <div style={{ marginTop: "1rem" }}>
                          <Select
                            label="Select plans with more products, feeds"
                            labelHidden
                            options={plan.feedOptions}
                            value={
                              feedSelection[plan.id] ??
                              plan.feedOptions[0]?.value ??
                              ""
                            }
                            onChange={(value) =>
                              setFeedSelection((prev) => ({
                                ...prev,
                                [plan.id]: value,
                              }))
                            }
                          />
                        </div>
                      ) : null}

                      <div style={{ marginTop: "auto", paddingTop: "1.5rem" }}>
                        <Button
                          variant="secondary"
                          size="large"
                          fullWidth
                          disabled
                        >
                          {plan.cta}
                        </Button>
                      </div>
                    </BlockStack>
                  </div>
                ))}
              </div>
      </BlockStack>
    </div>
  );
}

