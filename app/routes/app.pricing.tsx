import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { useState, useEffect } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  Page,
  Layout,
  Card,
  Text,
  Box,
  Button,
  Banner,
  InlineStack,
  ButtonGroup,
  Spinner,
  TextField,
  FormLayout
} from "@shopify/polaris";
import { CheckIcon, StarIcon } from "@shopify/polaris-icons";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  const shop = session.shop;

  try {
    const response = await admin.graphql(`
      query {
        appInstallation {
          activeSubscriptions {
            id
            name
            status
          }
        }
      }
    `);

    const data = await response.json() as any;
    const activeSubscriptions = data?.data?.appInstallation?.activeSubscriptions || [];

    let currentPlanName = 'free';
    let activeSubscription = null;

    if (activeSubscriptions.length > 0) {
      activeSubscription = activeSubscriptions.find((sub: any) =>
        sub.status === 'ACTIVE' || sub.status === 'active'
      );

      if (activeSubscription) {
        const planMap: Record<string, string> = {
          'Free': 'free',
          'Basic': 'basic',
          'Advance': 'advance'
        };
        currentPlanName = planMap[activeSubscription.name] || 'free';
      }
    }

    return {
      userPlan: { planName: currentPlanName, shopifyPlanName: activeSubscription?.name || 'Free' },
      shop: shop,
      appHandle: "pixelify-tracker",
      hasActivePayment: currentPlanName !== 'free',
      error: null
    };
  } catch (error: any) {
    console.error('Error in pricing loader:', error);
    return {
      userPlan: { planName: 'free' },
      shop: shop,
      appHandle: "pixelify-tracker",
      hasActivePayment: false,
      error: error.message
    };
  }
};

export default function PricingPage() {
  const { userPlan, shop, appHandle, hasActivePayment, error } = useLoaderData<typeof loader>();
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'yearly'>('monthly');
  const [discountCode, setDiscountCode] = useState('');
  const [discountMessage, setDiscountMessage] = useState('');
  const discountFetcher = useFetcher();

  const hasActivePaidSubscription = userPlan?.planName !== 'free' && hasActivePayment;

  const storeHandle = process.env.STORE_HANDLE || shop.replace('.myshopify.com', '');

  // Handle discount application response
  useEffect(() => {
    if (discountFetcher.data) {
      if (discountFetcher.data.success) {
        setDiscountMessage(discountFetcher.data.message);
        setDiscountCode(''); // Clear the input

        // If there's a confirmation URL, redirect to it after a short delay
        if (discountFetcher.data.confirmationUrl) {
          setTimeout(() => {
            window.location.href = discountFetcher.data.confirmationUrl;
          }, 2000); // Give user time to read the success message
        }
      } else {
        setDiscountMessage(discountFetcher.data.message || 'An unexpected error occurred. Please try again.');
      }
    }
  }, [discountFetcher.data]);

  const redirectToShopifyPricing = (planName?: string) => {
    const baseUrl = `https://admin.shopify.com/store/${storeHandle}/charges/${appHandle}/pricing_plans`;

    try {
      if (window.top && window.top !== window) {
        window.top.location.href = baseUrl;
      } else {
        window.location.href = baseUrl;
      }
    } catch (e) {
      // Fallback if top access fails
      const form = document.createElement('form');
      form.method = 'GET';
      form.action = baseUrl;
      form.target = '_top';
      document.body.appendChild(form);
      form.submit();
    }
  };

  const getCurrentPlanName = () => {
    const planName = userPlan?.shopifyPlanName?.toLowerCase() || userPlan?.planName?.toLowerCase() || 'free';

    if (planName.includes('advance')) return 'Advance';
    if (planName.includes('basic')) return 'Basic';
    return 'Free';
  };

  const getPlanLevel = (plan: string): number => {
    const levels: Record<string, number> = {
      'Free': 0,
      'Basic': 1,
      'Advance': 2
    };
    return levels[plan] || 0;
  };

  const getButtonText = (planName: string) => {
    if (currentPlanName === planName) {
      return "Current Plan";
    }

    const currentLevel = getPlanLevel(currentPlanName);
    const targetLevel = getPlanLevel(planName);

    if (targetLevel > currentLevel) {
      return "Upgrade to " + planName;
    }

    if (targetLevel < currentLevel) {
      return "Downgrade to " + planName;
    }

    return "Change to " + planName;
  };

  const currentPlanName = getCurrentPlanName();

  const plans = [
    {
      id: "free",
      name: "Free",
      price: "$0",
      period: "forever",
      description: "Perfect for testing and small stores",
      features: [
        "1 Pixel",
        "Conversion API",
        "Event reports / Purchase report",
        "5 orders per month (unlimited events)",
        "Basic analytics",
        "24/7 Support"
      ],
      disabled: currentPlanName === 'Free',
      popular: false
    },
    {
      id: "basic",
      name: "Basic",
      price: billingInterval === 'monthly' ? "$20.99" : "$209.99",
      period: billingInterval === 'monthly' ? "per month" : "per year",
      description: "Great for growing stores",
      features: [
        "Multiple Browser pixels",
        "1 Conversion API Tracking",
        "Custom events",
        "Event reports / Purchase report",
        "Expert analytics and export available",
        "Facebook Ads Report via UTM tracking",
        "Standard Facebook product feed sync",
        "FB Product feed (100 products, 2 feeds)"
      ],
      disabled: currentPlanName === 'Basic',
      popular: false
    },
    {
      id: "advance",
      name: "Advance",
      price: billingInterval === 'monthly' ? "$55.99" : "$559.99",
      period: billingInterval === 'monthly' ? "per month" : "per year",
      description: "For high-traffic stores",
      features: [
        "Multi-browser pixels",
        "5 CAPI included",
        "All future updates and features",
        "Custom events",
        "Event reports / Purchase report",
        "Expert analytics and export available",
        "Facebook Ads Report via UTM Tracking",
        "Advanced FB feed for better match rate",
        "3 days free trial"
      ],
      disabled: currentPlanName === 'Advance',
      popular: true
    }
  ];

  return (
    <Page
      title="Pricing Plans"
      subtitle="Choose the perfect plan for your store's needs"
    >
      <Layout>
        {error && (
          <Layout.Section>
            <Banner tone="critical">
              <Text as="p" variant="bodyMd">
                Error loading pricing information: {error}
              </Text>
            </Banner>
          </Layout.Section>
        )}

        {currentPlanName !== 'Free' && (
          <Layout.Section>
            <Banner tone="info">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="p" variant="bodyMd">
                  You are currently on the <strong>{currentPlanName}</strong> plan.
                  Click any plan below to change your subscription.
                </Text>
                <Button onClick={() => redirectToShopifyPricing()}>Manage Subscription</Button>
              </InlineStack>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <Box padding="600">
              <Text variant="headingMd" as="h3">
                Have a discount code?
              </Text>
              <FormLayout>
                <InlineStack align="start" blockAlign="center" gap="400">
                  <div style={{ flex: 1 }}>
                    <TextField
                      label=""
                      placeholder="Enter discount code"
                      value={discountCode}
                      onChange={setDiscountCode}
                      disabled={discountFetcher.state === 'submitting'}
                      autoComplete="off"
                    />
                  </div>
                  <Button
                    onClick={() => {
                      const trimmedCode = discountCode.trim();
                      if (!trimmedCode) {
                        setDiscountMessage('Please enter a discount code');
                        return;
                      }

                      const formData = new FormData();
                      formData.append('code', trimmedCode);
                      discountFetcher.submit(formData, {
                        method: 'POST',
                        action: '/api/apply-discount'
                      });
                    }}
                    loading={discountFetcher.state === 'submitting'}
                    disabled={!discountCode.trim() || discountFetcher.state === 'submitting'}
                  >
                    Apply Discount
                  </Button>
                </InlineStack>
                {discountFetcher.state === 'submitting' && (
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Applying discount...
                  </Text>
                )}
                {discountMessage && discountFetcher.state !== 'submitting' && (
                  <Text as="p" variant="bodyMd" tone={discountMessage.includes('applied') || discountMessage.includes('successfully') ? "success" : "critical"}>
                    {discountMessage}
                  </Text>
                )}
              </FormLayout>
            </Box>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
            <ButtonGroup variant="segmented">
              <Button
                pressed={billingInterval === 'monthly'}
                onClick={() => setBillingInterval('monthly')}
              >
                Monthly
              </Button>
              <Button
                pressed={billingInterval === 'yearly'}
                onClick={() => setBillingInterval('yearly')}
              >
                Yearly (Save 17%)
              </Button>
            </ButtonGroup>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: '16px',
            alignItems: 'stretch'
          }}>
            {plans.map((plan) => (
              <Card key={plan.id}>
                {plan.popular && (
                  <div style={{
                    position: 'absolute',
                    top: '-1px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    backgroundColor: '#008060',
                    color: 'white',
                    padding: '6px 16px',
                    borderRadius: '16px',
                    fontSize: '12px',
                    fontWeight: '600',
                    zIndex: 1,
                    whiteSpace: 'nowrap',
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <StarIcon width={12} height={12} />
                      MOST POPULAR
                    </div>
                  </div>
                )}

                <Box padding="600">
                  <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                    <Text variant="headingLg" as="h3" fontWeight="bold">
                      {plan.name}
                    </Text>
                    <div style={{ margin: '16px 0' }}>
                      <Text variant="headingXl" as="span" fontWeight="bold">
                        {plan.price}
                      </Text>
                      <Text variant="bodySm" as="span" tone="subdued">
                        /{plan.period}
                      </Text>
                    </div>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      {plan.description}
                    </Text>
                  </div>

                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, flex: 1, minHeight: '170px' }}>
                    {plan.features.map((feature, index) => (
                      <li key={index} style={{ marginBottom: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ color: '#00a47c' }}>
                            <CheckIcon width={16} height={16} />
                          </div>
                          <Text as="span" variant="bodyMd">
                            {feature}
                          </Text>
                        </div>
                      </li>
                    ))}
                  </ul>

                  <div style={{
                    marginTop: 'auto',
                    paddingTop: '24px',
                    width: '100%'
                  }}>
                    <Button
                      fullWidth
                      size="large"
                      variant="primary"
                      disabled={plan.disabled}
                      onClick={() => redirectToShopifyPricing(plan.name)}
                    >
                      {getButtonText(plan.name)}
                    </Button>
                  </div>
                </Box>
              </Card>
            ))}
          </div>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <Box padding="600">
              <Text variant="headingLg" as="h2">
                Frequently Asked Questions
              </Text>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', marginTop: '16px' }}>
                <div>
                  <Text variant="headingSm" as="h3">
                    Can I change plans later?
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Yes! You can upgrade or downgrade your plan at any time through the Shopify billing portal.
                  </Text>
                </div>

                <div>
                  <Text variant="headingSm" as="h3">
                    What happens if I exceed my redirect limit?
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    You'll be notified you when you reach your limit. You can upgrade your plan or archive old redirects to stay within your limit.
                  </Text>
                </div>

                <div>
                  <Text variant="headingSm" as="h3">
                    How does billing work?
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    All billing is handled securely through Shopify. You can choose monthly or yearly billing - yearly plans save you 17%. You'll see charges on your Shopify bill, and you can manage your subscription directly in your Shopify admin.
                  </Text>
                </div>
              </div>
            </Box>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export const headers = (headersArgs: any) => boundary.headers(headersArgs);
