import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation, useFetcher } from "react-router";
import {
  Page,
  Layout,
  Card,
  Button,
  TextField,
  Select,
  Banner,
  DataTable,
  Badge,
  ButtonGroup,
  Modal,
  FormLayout,
  EmptyState,
  BlockStack,
  Text,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { getShopifyInstance } from "../shopify.server";
import db from "../db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const shopify = getShopifyInstance();
  if (!shopify?.authenticate) {
    throw new Response("Shopify configuration not found", { status: 500 });
  }
  const { session } = await shopify.authenticate.admin(request);
  const shop = session.shop;

  const user = await db.user.findUnique({ where: { storeUrl: shop } });
  if (!user) {
    return { app: null, customEvents: [], shop };
  }

  const app = await db.app.findFirst({
    where: { userId: user.id },
    include: { 
      customEvents: {
        orderBy: { createdAt: "desc" }
      }
    },
    orderBy: { createdAt: "desc" },
  });

  if (!app) {
    return { app: null, customEvents: [], shop };
  }

  return {
    app: {
      id: app.id,
      appId: app.appId,
      name: app.name,
    },
    customEvents: app.customEvents || [],
    shop,
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const shopify = getShopifyInstance();
  if (!shopify?.authenticate) {
    return { success: false, error: "Shopify configuration not found" };
  }
  const { session } = await shopify.authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const actionType = formData.get("action") as string;

  try {
    const user = await db.user.findUnique({ where: { storeUrl: shop } });
    if (!user) {
      return { success: false, error: "User not found for this shop" };
    }

    const appIdFromForm = formData.get("appId") as string | null;
    const app =
      appIdFromForm
        ? await db.app.findFirst({ where: { appId: appIdFromForm, userId: user.id } })
        : await db.app.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });

    if (!app) {
      return { success: false, error: "App not found for this shop" };
    }

    if (actionType === "create") {
      const name = (formData.get("name") as string) || "";
      const displayName = (formData.get("displayName") as string) || "";
      const description = formData.get("description") as string;
      const pageType = (formData.get("pageType") as string) || "all";
      const pageUrl = formData.get("pageUrl") as string;
      const eventType = (formData.get("eventType") as string) || "click";
      const selector = (formData.get("selector") as string) || "";
      const eventData = formData.get("eventData") as string;
      const metaEventName = formData.get("metaEventName") as string;

      if (!selector || selector.trim() === "") {
        return { success: false, error: "CSS Selector is required" };
      }

      if (!displayName || displayName.trim() === "") {
        return { success: false, error: "Display Name is required" };
      }

      const eventName = name.trim() 
        ? name.toLowerCase().replace(/\s+/g, '_')
        : displayName.toLowerCase().replace(/\s+/g, '_');

      await db.customEvent.create({
        data: {
          appId: app.id,
          name: eventName,
          displayName: displayName.trim(),
          description: description?.trim() || null,
          pageType: pageType,
          pageUrl: pageUrl?.trim() || null,
          eventType: eventType,
          selector: selector.trim(),
          eventData: eventData?.trim() || null,
          metaEventName: metaEventName || null,
          isActive: true,
        }
      });

      return { success: true, message: "Custom event created successfully!" };
    }

    if (actionType === "toggle") {
      const eventId = formData.get("eventId") as string;
      const isActive = formData.get("isActive") === "true";

      await db.customEvent.update({
        where: { id: eventId },
        data: { isActive: !isActive }
      });

      return { success: true, message: "Event status updated!" };
    }

    if (actionType === "delete") {
      const eventId = formData.get("eventId") as string;

      await db.customEvent.delete({
        where: { id: eventId }
      });

      return { success: true, message: "Event deleted!" };
    }

  } catch (error: any) {
    console.error("Custom events action error:", error);
    return { success: false, error: error.message || "Failed to process request" };
  }

  return { success: false, error: "Invalid action" };
}

type LoaderData = {
  app: { id: string; appId: string; name: string } | null;
  customEvents: Array<{
    id: string;
    name: string;
    displayName: string;
    description: string | null;
    pageType: string;
    pageUrl: string | null;
    eventType: string;
    selector: string | null;
    eventData: string | null;
    metaEventName: string | null;
    isActive: boolean;
    createdAt: Date;
  }>;
  shop: string;
};

type ActionData = {
  success?: boolean;
  error?: string;
  message?: string;
} | undefined;

export default function CustomEvents() {
  const { app, customEvents } = useLoaderData<LoaderData>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const isLoading = navigation.state === "submitting";

  const [modalActive, setModalActive] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    displayName: "",
    description: "",
    pageType: "all",
    pageUrl: "",
    eventType: "click",
    selector: "",
    eventData: "{}",
    metaEventName: ""
  });

  const handleModalToggle = useCallback(() => {
    setModalActive(!modalActive);
    if (!modalActive) {
      setFormData({
        name: "",
        displayName: "",
        description: "",
        pageType: "all",
        pageUrl: "",
        eventType: "click",
        selector: "",
        eventData: "{}",
        metaEventName: ""
      });
    }
  }, [modalActive]);

  const handleInputChange = useCallback((field: string) => (value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  if (!app) {
    return (
      <Page title="Custom Events">
        <Layout>
          <Layout.Section>
            <Card>
              <EmptyState
                heading="No pixel app found"
                action={{ content: "Create a pixel first", url: "/app/pixels" }}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>You need to create a pixel app before you can set up custom events.</p>
              </EmptyState>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  const appId = app.appId;
  const rows = (customEvents || []).map((event) => [
    event.displayName,
    event.name,
    event.pageType || "all",
    event.selector || "-",
    <Badge tone={event.isActive ? "success" : "critical"}>
      {event.isActive ? "Active" : "Inactive"}
    </Badge>,
    <ButtonGroup>
      <Form method="post">
        <input type="hidden" name="action" value="toggle" />
        <input type="hidden" name="eventId" value={event.id} />
        <input type="hidden" name="isActive" value={event.isActive.toString()} />
        <Button submit size="slim" disabled={isLoading}>
          {event.isActive ? "Disable" : "Enable"}
        </Button>
      </Form>
      <Form method="post">
        <input type="hidden" name="action" value="delete" />
        <input type="hidden" name="eventId" value={event.id} />
        <Button submit tone="critical" size="slim" disabled={isLoading}>
          Delete
        </Button>
      </Form>
    </ButtonGroup>
  ]);

  return (
    <Page
      title="Custom Events"
      subtitle="Track custom interactions on your store"
      primaryAction={app ? {
        content: "Create Event",
        onAction: handleModalToggle
      } : undefined}
    >
      <Layout>
        {actionData?.success && (
          <Layout.Section>
            <Banner tone="success" onDismiss={() => {}}>
              {actionData.message}
            </Banner>
          </Layout.Section>
        )}

        {actionData?.error && (
          <Layout.Section>
            <Banner tone="critical" onDismiss={() => {}}>
              {actionData.error}
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">How Custom Events Work</Text>
              <BlockStack gap="200">
                <Text as="p">Custom events track user interactions with specific elements on your store.</Text>
                <Text as="p"><strong>1. Page Type:</strong> Choose where the event triggers (All Pages, Product, Cart, etc.)</Text>
                <Text as="p"><strong>2. Event Type:</strong> Choose the interaction (Click, Submit, Change, etc.)</Text>
                <Text as="p"><strong>3. CSS Selector:</strong> Target elements using CSS selectors like <code>.add-to-cart</code> or <code>#wishlist-btn</code></Text>
                <Text as="p"><strong>Example:</strong> Track clicks on <code>.add-to-wishlist</code> button on product pages</Text>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            {!customEvents || customEvents.length === 0 ? (
              <EmptyState
                heading="No custom events yet"
                action={{ content: "Create Event", onAction: handleModalToggle }}
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>Create your first custom event to start tracking specific user interactions.</p>
              </EmptyState>
            ) : (
              <DataTable
                columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text']}
                headings={['Display Name', 'Event Name', 'Page Type', 'Selector', 'Status', 'Actions']}
                rows={rows}
              />
            )}
          </Card>
        </Layout.Section>
      </Layout>

      <Modal
        open={modalActive && !!app}
        onClose={handleModalToggle}
        title="Create Custom Event"
        primaryAction={{
          content: "Create Event",
          loading: isLoading,
          onAction: () => {
            if (!formData.selector || formData.selector.trim() === "") {
              return;
            }
            const form = document.getElementById('create-event-form') as HTMLFormElement;
            if (form) {
              form.requestSubmit();
            }
          },
          disabled: !formData.selector || formData.selector.trim() === "" || !formData.displayName || formData.displayName.trim() === ""
        }}
        secondaryActions={[{
          content: "Cancel",
          onAction: handleModalToggle
        }]}
      >
        <Modal.Section>
          <Form method="post" id="create-event-form">
            <FormLayout>
              <input type="hidden" name="action" value="create" />
              <input type="hidden" name="appId" value={appId} />
              
              <TextField
                label="Display Name"
                value={formData.displayName}
                onChange={handleInputChange('displayName')}
                name="displayName"
                placeholder="e.g., Add to Wishlist"
                autoComplete="off"
                requiredIndicator
              />

              <TextField
                label="Event Name"
                value={formData.name}
                onChange={handleInputChange('name')}
                name="name"
                placeholder="e.g., add_to_wishlist"
                helpText="Auto-generated from display name if empty"
                autoComplete="off"
              />

              <Select
                label="Page Type"
                options={[
                  { label: "All Pages", value: "all" },
                  { label: "Home Page", value: "index" },
                  { label: "Product Page", value: "product" },
                  { label: "Collection Page", value: "collection" },
                  { label: "Cart Page", value: "cart" },
                  { label: "Checkout Page", value: "checkout" },
                  { label: "Search Page", value: "search" },
                  { label: "Custom URL", value: "custom" }
                ]}
                value={formData.pageType}
                onChange={(value) => setFormData(prev => ({ ...prev, pageType: value }))}
                name="pageType"
              />

              {formData.pageType === "custom" && (
                <TextField
                  label="Page URL"
                  value={formData.pageUrl}
                  onChange={handleInputChange('pageUrl')}
                  name="pageUrl"
                  placeholder="/pages/about-us"
                  helpText="Enter the URL path where this event should trigger"
                  autoComplete="off"
                />
              )}

              <Select
                label="Event Type"
                options={[
                  { label: "Click", value: "click" },
                  { label: "Submit", value: "submit" },
                  { label: "Change", value: "change" },
                  { label: "Focus", value: "focus" },
                  { label: "Scroll", value: "scroll" }
                ]}
                value={formData.eventType}
                onChange={(value) => setFormData(prev => ({ ...prev, eventType: value }))}
                name="eventType"
              />

              <TextField
                label="CSS Selector"
                value={formData.selector}
                onChange={handleInputChange('selector')}
                name="selector"
                placeholder=".add-to-cart, #wishlist-btn, button[data-add-to-wishlist]"
                helpText="Required: CSS selector to target elements"
                autoComplete="off"
                requiredIndicator
              />

              <TextField
                label="Description"
                value={formData.description}
                onChange={handleInputChange('description')}
                name="description"
                placeholder="Describe what this event tracks..."
                multiline={2}
                autoComplete="off"
              />

              <Select
                label="Meta Event Mapping"
                options={[
                  { label: "None", value: "" },
                  { label: "Purchase", value: "Purchase" },
                  { label: "Add to Cart", value: "AddToCart" },
                  { label: "View Content", value: "ViewContent" },
                  { label: "Initiate Checkout", value: "InitiateCheckout" },
                  { label: "Add Payment Info", value: "AddPaymentInfo" },
                  { label: "Lead", value: "Lead" },
                  { label: "Complete Registration", value: "CompleteRegistration" },
                  { label: "Contact", value: "Contact" },
                  { label: "Search", value: "Search" }
                ]}
                value={formData.metaEventName}
                onChange={(value) => setFormData(prev => ({ ...prev, metaEventName: value }))}
                name="metaEventName"
              />

              <TextField
                label="Event Data (JSON)"
                value={formData.eventData}
                onChange={handleInputChange('eventData')}
                name="eventData"
                multiline={3}
                placeholder='{"product_id": "123", "value": 99.99}'
                helpText="Optional JSON data to send with the event"
                autoComplete="off"
              />
            </FormLayout>
          </Form>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
