import { redirect } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
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
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { getShopifyInstance } from "~/shopify.server";
import db from "../db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const shopify = getShopifyInstance();
  if (!shopify?.authenticate) {
    throw new Response("Shopify configuration not found", { status: 500 });
  }
  const { session } = await shopify.authenticate.admin(request);
  const shop = session.shop;

  const user = await db.user.findUnique({ where: { email: shop } });
  if (!user) {
    throw new Response("User not found for this shop", { status: 404 });
  }

  const app = await db.app.findFirst({
    where: { userId: user.id },
    include: { 
      customEvents: {
        select: {
          id: true,
          name: true,
          displayName: true,
          description: true,
          metaEventName: true,
          isActive: true,
          createdAt: true,
          // Only select fields that exist in the database
          // pageType, pageUrl, eventType, selector, eventData will be added after migration
        }
      }
    },
    orderBy: { createdAt: "desc" },
  });

  if (!app) {
    throw new Response("App not found for this shop", { status: 404 });
  }

  return Response.json({
    app,
    customEvents: app.customEvents,
    shop,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const shopify = getShopifyInstance();
  if (!shopify?.authenticate) {
    return Response.json({ success: false, error: "Shopify configuration not found" }, { status: 500 });
  }
  const { session } = await shopify.authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const action = formData.get("action");

  try {
    const user = await db.user.findUnique({ where: { email: shop } });
    if (!user) {
      return Response.json({ success: false, error: "User not found for this shop" }, { status: 404 });
    }

    const appIdFromForm = formData.get("appId") as string | null;
    const app =
      appIdFromForm
        ? await db.app.findFirst({ where: { appId: appIdFromForm, userId: user.id } })
        : await db.app.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });

    if (!app) {
      return Response.json({ success: false, error: "App not found for this shop" }, { status: 404 });
    }

    if (action === "create") {
      const name = formData.get("name") as string;
      const displayName = formData.get("displayName") as string;
      const description = formData.get("description") as string;
      const pageType = formData.get("pageType") as string;
      const pageUrl = formData.get("pageUrl") as string;
      const eventType = formData.get("eventType") as string;
      const selector = formData.get("selector") as string;
      const eventData = formData.get("eventData") as string;
      const metaEventName = formData.get("metaEventName") as string;

      if (!selector || selector.trim() === "") {
        return Response.json({ success: false, error: "CSS Selector is required to trigger the event" }, { status: 400 });
      }

      await db.customEvent.create({
        data: {
          appId: app.id,
          name: name.toLowerCase().replace(/\s+/g, '_'),
          displayName,
          description: description || null,
          pageType: pageType || "all",
          pageUrl: pageUrl || null,
          eventType: eventType || "click",
          selector: selector.trim(),
          eventData: eventData || null,
          metaEventName: metaEventName || null,
          isActive: true,
        }
      });

      return Response.json({ success: true, message: "Custom event created successfully!" });
    }

    if (action === "toggle") {
      const eventId = formData.get("eventId") as string;
      const isActive = formData.get("isActive") === "true";

      await db.customEvent.update({
        where: { id: eventId },
        data: { isActive: !isActive }
      });

      return Response.json({ success: true, message: "Event status updated!" });
    }

    if (action === "delete") {
      const eventId = formData.get("eventId") as string;

      await db.customEvent.delete({
        where: { id: eventId }
      });

      return Response.json({ success: true, message: "Event deleted!" });
    }

  } catch (error) {
    console.error("Custom events action error:", error);
    return Response.json({ success: false, error: "Failed to process request" }, { status: 500 });
  }

  return Response.json({ success: false, error: "Invalid action" }, { status: 400 });
}

type LoaderData = {
  app: any;
  customEvents: any[];
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
      // Reset form when opening
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

  const rows = customEvents.map((event: any) => [
    event.displayName,
    event.name,
    (event as any).pageType || "all",
    (event as any).selector || "-",
    <Badge tone={event.isActive ? "success" : "critical"}>
      {event.isActive ? "Active" : "Inactive"}
    </Badge>,
    <ButtonGroup>
      <Form method="post">
        <input type="hidden" name="action" value="toggle" />
        <input type="hidden" name="eventId" value={event.id} />
        <input type="hidden" name="isActive" value={event.isActive.toString()} />
        <Button submit size="slim">
          {event.isActive ? "Disable" : "Enable"}
        </Button>
      </Form>
      <Form method="post">
        <input type="hidden" name="action" value="delete" />
        <input type="hidden" name="eventId" value={event.id} />
        <Button submit tone="critical" size="slim">
          Delete
        </Button>
      </Form>
    </ButtonGroup>
  ]);

  return (
    <Page
      title="Custom Events"
      subtitle="Create events that trigger when users interact with specific elements on selected pages"
      primaryAction={{
        content: "Create Event",
        onAction: handleModalToggle
      }}
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
            <div style={{ padding: '16px', marginBottom: '16px' }}>
              <h3 style={{ marginBottom: '12px' }}>How Custom Events Work:</h3>
              <ol style={{ paddingLeft: '20px' }}>
                <li style={{ marginBottom: '8px' }}><strong>Select a Page:</strong> Choose where the event should trigger (Home, Product, Cart, etc.)</li>
                <li style={{ marginBottom: '8px' }}><strong>Set Event Type:</strong> Choose when to trigger (Click, Submit, Change, etc.)</li>
                <li style={{ marginBottom: '8px' }}><strong>Add CSS Selector:</strong> Target specific elements using CSS selectors (e.g., <code>.add-to-cart</code>, <code>#wishlist-btn</code>)</li>
                <li style={{ marginBottom: '8px' }}><strong>Enable Event:</strong> Toggle the event on/off to control when it fires</li>
                <li style={{ marginBottom: '8px' }}>The event will automatically track when users interact with the selected elements on the specified pages</li>
              </ol>
              <p style={{ marginTop: '12px', color: '#666' }}>
                <strong>Example:</strong> Create an event with selector <code>.add-to-wishlist</code> on Product pages with event type "click" to track when users click the wishlist button.
              </p>
            </div>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <DataTable
              columnContentTypes={['text', 'text', 'text', 'text', 'text', 'text']}
              headings={['Display Name', 'Event Name', 'Page Type', 'Selector', 'Status', 'Actions']}
              rows={rows}
            />
          </Card>
        </Layout.Section>
      </Layout>

      <Modal
        open={modalActive}
        onClose={handleModalToggle}
        title="Create Custom Event"
        primaryAction={{
          content: "Create Event",
          loading: isLoading,
          onAction: () => {
            if (!formData.selector || formData.selector.trim() === "") {
              alert("CSS Selector is required to trigger the event");
              return;
            }
            const form = document.getElementById('create-event-form') as HTMLFormElement;
            form.requestSubmit();
          },
          disabled: !formData.selector || formData.selector.trim() === ""
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
              <input type="hidden" name="appId" value={app.appId} />
              
              <TextField
                label="Display Name"
                value={formData.displayName}
                onChange={handleInputChange('displayName')}
                name="displayName"
                placeholder="e.g., Add to Wishlist"
                autoComplete="off"
              />

              <TextField
                label="Event Name (for tracking)"
                value={formData.name}
                onChange={handleInputChange('name')}
                name="name"
                placeholder="e.g., add_to_wishlist"
                helpText="Used for analytics. Will be auto-generated from display name if empty."
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
                label="CSS Selector *"
                value={formData.selector}
                onChange={handleInputChange('selector')}
                name="selector"
                placeholder=".add-to-cart, #wishlist-btn, button[data-add-to-wishlist]"
                helpText="Required: CSS selector to target elements that will trigger this event"
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
                helpText="Optional description of what this event tracks"
                autoComplete="off"
              />

              <Select
                label="Meta Event Mapping (Optional)"
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
                helpText="Map this event to a Meta standard event for better attribution"
              />

              <TextField
                label="Event Data (JSON - Optional)"
                value={formData.eventData}
                onChange={handleInputChange('eventData')}
                name="eventData"
                multiline={3}
                placeholder='{"product_id": "123", "category": "electronics", "value": 99.99}'
                helpText="Optional JSON data to send with the event when it's triggered"
                autoComplete="off"
              />
            </FormLayout>
          </Form>
        </Modal.Section>
      </Modal>
    </Page>
  );
}