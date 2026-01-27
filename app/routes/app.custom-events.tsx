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
  Badge,
  Modal,
  FormLayout,
  Checkbox,
  Collapsible,
  Text,
} from "@shopify/polaris";
import { useState, useCallback, useEffect } from "react";
import { getShopifyInstance } from "~/shopify.server";
import db from "../db.server";
import { checkThemeExtensionStatus } from "~/services/theme-extension-check.server";
import { cache } from "~/lib/cache.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const shopify = getShopifyInstance();
  if (!shopify?.authenticate) {
    throw new Response("Shopify configuration not found", { status: 500 });
  }
  
  const { session, admin } = await shopify.authenticate.admin(request);
  const shop = session.shop;

  // Check theme extension status
  const extensionStatus = await checkThemeExtensionStatus(admin);
  
  return Response.json({
    shop,
    extensionStatus,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  try {
  const shopify = getShopifyInstance();
  if (!shopify?.authenticate) {
    return Response.json({ success: false, error: "Shopify configuration not found" }, { status: 500 });
  }
  const { session } = await shopify.authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const action = formData.get("action");

    console.log(`[Custom Events] Action: ${action}, Shop: ${shop}`);

  // Helper function to invalidate custom events cache for this shop
  const invalidateCustomEventsCache = () => {
    const invalidated = cache.invalidatePattern(`custom-events:${shop}`);
    console.log(`[Custom Events] Invalidated ${invalidated} cache entries for ${shop}`);
  };

  try {
    const user = await db.user.findUnique({ where: { storeUrl: shop } });
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

      // Get current plan from Shopify GraphQL API (source of truth)
      let currentPlan = app.plan || 'Free';
      
      try {
        const { admin } = await shopify.authenticate.admin(request);
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

        if (activeSubscriptions.length > 0) {
          const activeSubscription = activeSubscriptions.find((sub: any) =>
            sub.status === 'ACTIVE' || sub.status === 'active'
          );

          if (activeSubscription) {
            const shopifyPlanName = activeSubscription.name;
            
            // Normalize plan name - only accept exact matches for Free, Basic, or Advance
            if (shopifyPlanName === 'Free' || shopifyPlanName === 'Basic' || shopifyPlanName === 'Advance') {
              currentPlan = shopifyPlanName;
            } else {
              // Any other plan name defaults to Free
              currentPlan = 'Free';
            }
            
            // Update database if plan changed
            if (currentPlan !== app.plan) {
              await db.app.update({
                where: { id: app.id },
                data: { plan: currentPlan },
              });
            }
          } else {
            currentPlan = 'Free';
          }
        } else {
          currentPlan = 'Free';
        }
      } catch (error: any) {
        console.error('⚠️ Failed to fetch plan from Shopify GraphQL in action, using database plan:', error);
        currentPlan = app.plan || 'Free';
      }

      // Ensure plan is one of the three valid plans (Free, Basic, Advance)
      if (currentPlan !== 'Free' && currentPlan !== 'Basic' && currentPlan !== 'Advance') {
        currentPlan = 'Free';
      }
      
      // Block Free plan users from all actions
      if (currentPlan === 'Free') {
        return Response.json({ 
          success: false, 
          error: "Custom events are only available for Basic and Advance plans. Please upgrade to access this feature." 
        }, { status: 403 });
      }

    if (action === "create") {
      const name = formData.get("name") as string;
      const displayName = formData.get("displayName") as string;
      const description = formData.get("description") as string;
      const pageType = formData.get("pageType") as string;
      const pageUrl = formData.get("pageUrl") as string;
      const eventType = formData.get("eventType") as string;
      const selector = formData.get("selector") as string;
      const metaEventName = formData.get("metaEventName") as string;
      const eventData = formData.get("eventData") as string;

      // Validate JSON if provided
      if (eventData && eventData.trim() !== "") {
        try {
          JSON.parse(eventData);
        } catch (e: any) {
          return Response.json({ success: false, error: `Invalid JSON in event data: ${e.message}` }, { status: 400 });
        }
      }

      if (!name || name.trim() === "") {
        return Response.json({ success: false, error: "Event name is required" }, { status: 400 });
      }

      if (!displayName || displayName.trim() === "") {
        return Response.json({ success: false, error: "Display name is required" }, { status: 400 });
      }

      // Check if event name already exists for this app
      const existingEvent = await db.customEvent.findUnique({
        where: {
          appId_name: {
            appId: app.id,
            name: name.toLowerCase().replace(/\s+/g, '_'),
          }
        }
      });

      if (existingEvent) {
        return Response.json({ success: false, error: "An event with this name already exists" }, { status: 400 });
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
          selector: selector || null,
          eventData: eventData || null,
          metaEventName: metaEventName || null,
          isActive: true,
        }
      });

      // Invalidate cache after creating event
      invalidateCustomEventsCache();

      return Response.json({ success: true, message: "Custom event created successfully!" });
    }

    if (action === "toggle") {
      const eventId = formData.get("eventId") as string;
      const isActive = formData.get("isActive") === "true";

      if (!eventId) {
        return Response.json({ success: false, error: "Event ID is required" }, { status: 400 });
      }

      // Check if the event exists and belongs to this app
      const existingEvent = await db.customEvent.findFirst({
        where: { 
          id: eventId,
          appId: app.id 
        }
      });

      if (!existingEvent) {
        return Response.json({ success: false, error: "Event not found or access denied" }, { status: 404 });
      }

      await db.customEvent.update({
        where: { id: eventId },
        data: { isActive: !isActive }
      });

      // Invalidate cache after toggling event
      invalidateCustomEventsCache();

      return Response.json({ success: true, message: "Event status updated!" });
    }

    if (action === "delete") {
      const eventId = formData.get("eventId") as string;

      if (!eventId) {
        return Response.json({ success: false, error: "Event ID is required" }, { status: 400 });
      }

      // Check if the event exists and belongs to this app before deleting
      const existingEvent = await db.customEvent.findFirst({
        where: { 
          id: eventId,
          appId: app.id 
        }
      });

      if (!existingEvent) {
        return Response.json({ success: false, error: "Event not found or access denied" }, { status: 404 });
      }

      await db.customEvent.delete({
        where: { id: eventId }
      });

      // Invalidate cache after deleting event
      invalidateCustomEventsCache();

      return Response.json({ success: true, message: "Event deleted!" });
    }

    if (action === "update") {
      const eventId = formData.get("eventId") as string;
      const name = formData.get("name") as string;
      const displayName = formData.get("displayName") as string;
      const description = formData.get("description") as string;
      const pageType = formData.get("pageType") as string;
      const pageUrl = formData.get("pageUrl") as string;
      const eventType = formData.get("eventType") as string;
      const selector = formData.get("selector") as string;
      const metaEventName = formData.get("metaEventName") as string;
      const eventData = formData.get("eventData") as string;

      // Validate JSON if provided
      if (eventData && eventData.trim() !== "") {
        try {
          JSON.parse(eventData);
        } catch (e: any) {
          return Response.json({ success: false, error: `Invalid JSON in event data: ${e.message}` }, { status: 400 });
        }
      }

      if (!eventId || eventId.trim() === "") {
        return Response.json({ success: false, error: "Event ID is required" }, { status: 400 });
      }

      if (!name || name.trim() === "") {
        return Response.json({ success: false, error: "Event name is required" }, { status: 400 });
      }

      if (!displayName || displayName.trim() === "") {
        return Response.json({ success: false, error: "Display name is required" }, { status: 400 });
      }

      // Check if the event exists and belongs to this app
      const currentEvent = await db.customEvent.findFirst({
        where: { 
          id: eventId,
          appId: app.id 
        }
      });

      if (!currentEvent) {
        return Response.json({ success: false, error: "Event not found or access denied" }, { status: 404 });
      }

      // Check if event name already exists for this app (excluding current event)
      const existingEvent = await db.customEvent.findFirst({
        where: {
          appId: app.id,
          name: name.toLowerCase().replace(/\s+/g, '_'),
          id: { not: eventId }
        }
      });

      if (existingEvent) {
        return Response.json({ success: false, error: "An event with this name already exists" }, { status: 400 });
      }

      await db.customEvent.update({
        where: { id: eventId },
        data: {
          name: name.toLowerCase().replace(/\s+/g, '_'),
          displayName,
          description: description || null,
          pageType: pageType || "all",
          pageUrl: pageUrl || null,
          eventType: eventType || "click",
          selector: selector || null,
          eventData: eventData || null,
          metaEventName: metaEventName || null,
          updatedAt: new Date(),
        }
      });

      // Invalidate cache after updating event
      invalidateCustomEventsCache();

      return Response.json({ success: true, message: "Custom event updated successfully!" });
    }

    if (action === "bulk_enable") {
      const eventIds = JSON.parse(formData.get("eventIds") as string);

      await db.customEvent.updateMany({
        where: {
          id: { in: eventIds },
          appId: app.id
        },
        data: { isActive: true }
      });

      // Invalidate cache after bulk enable
      invalidateCustomEventsCache();

      return Response.json({ success: true, message: `${eventIds.length} event(s) enabled successfully!` });
    }

    if (action === "bulk_disable") {
      const eventIds = JSON.parse(formData.get("eventIds") as string);

      await db.customEvent.updateMany({
        where: {
          id: { in: eventIds },
          appId: app.id
        },
        data: { isActive: false }
      });

      // Invalidate cache after bulk disable
      invalidateCustomEventsCache();

      return Response.json({ success: true, message: `${eventIds.length} event(s) disabled successfully!` });
    }

    if (action === "bulk_delete") {
      const eventIdsString = formData.get("eventIds") as string;
      
      if (!eventIdsString) {
        return Response.json({ success: false, error: "Event IDs are required" }, { status: 400 });
      }

      let eventIds;
      try {
        eventIds = JSON.parse(eventIdsString);
      } catch (parseError) {
        return Response.json({ success: false, error: "Invalid event IDs format" }, { status: 400 });
      }

      if (!Array.isArray(eventIds) || eventIds.length === 0) {
        return Response.json({ success: false, error: "No events selected for deletion" }, { status: 400 });
      }

      // Only delete events that belong to this app
      const deleteResult = await db.customEvent.deleteMany({
        where: {
          id: { in: eventIds },
          appId: app.id
        }
      });

      // Invalidate cache after bulk delete
      invalidateCustomEventsCache();

      return Response.json({ 
        success: true, 
        message: `${deleteResult.count} event(s) deleted successfully!`,
        deletedCount: deleteResult.count
      });
    }

  } catch (error) {
    console.error("Custom events action error:", error);
      
      // Handle specific Prisma errors
      if (error instanceof Error) {
        if (error.message.includes('P2025')) {
          return Response.json({ 
            success: false, 
            error: "Record not found. The event may have already been deleted." 
          }, { status: 404 });
        }
        
        if (error.message.includes('P2002')) {
          return Response.json({ 
            success: false, 
            error: "A custom event with this name already exists." 
          }, { status: 409 });
        }
      }
      
      return Response.json({ 
        success: false, 
        error: "Failed to process request. Please try again." 
      }, { status: 500 });
  }

  return Response.json({ success: false, error: "Invalid action" }, { status: 400 });
  } catch (outerError) {
    // Catch any authentication or other outer errors
    console.error("Custom events outer error:", outerError);
    return Response.json({ 
      success: false, 
      error: "Authentication or server error. Please try again." 
    }, { status: 500 });
  }
}

type LoaderData = {
  shop: string;
  extensionStatus: any;
};

type ApiData = {
  app: any;
  customEvents: any[];
  shop: string;
  plan: string;
  isFreePlan: boolean;
  hasAccess: boolean;
};

type ActionData = {
  success?: boolean;
  error?: string;
  message?: string;
} | undefined;

export default function CustomEvents() {
  const { shop, extensionStatus } = useLoaderData<LoaderData>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const isLoading = navigation.state === "submitting";

  // State for API data
  const [apiData, setApiData] = useState<ApiData | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  // All other hooks must be declared before any conditional returns
  const [modalActive, setModalActive] = useState(false);
  const [editingEvent, setEditingEvent] = useState<any>(null);
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set());
  const [showTemplates, setShowTemplates] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    displayName: "",
    description: "",
    pageType: "all",
    pageUrl: "",
    eventType: "click",
    selector: "",
    metaEventName: "",
    eventData: JSON.stringify({
      value: 29.99,
      currency: "USD",
      content_name: "Product Name",
      content_type: "product"
    }, null, 2)
  });
  const [jsonError, setJsonError] = useState<string>("");
  const [testLoading, setTestLoading] = useState(false);

  // Fetch data from API on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        setDataLoading(true);
        const response = await fetch('/api/custom-events');
        if (!response.ok) {
          throw new Error('Failed to fetch custom events data');
        }
        const data = await response.json();
        setApiData(data);
        setDataError(null);
      } catch (error: any) {
        console.error('[Custom Events] Error fetching data:', error);
        setDataError(error.message);
      } finally {
        setDataLoading(false);
      }
    };

    fetchData();
  }, []);

  // Refetch data after successful action
  useEffect(() => {
    if (actionData?.success) {
      const refetchData = async () => {
        try {
          const response = await fetch('/api/custom-events?refresh=true');
          if (response.ok) {
            const data = await response.json();
            setApiData(data);
          }
        } catch (error) {
          console.error('[Custom Events] Error refetching data:', error);
        }
      };
      refetchData();
    }
  }, [actionData]);

  // Close modal when event is successfully created/updated
  useEffect(() => {
    if (actionData?.success && modalActive) {
      setModalActive(false);
      setEditingEvent(null);
      // Reset form data
      setFormData({
        name: "",
        displayName: "",
        description: "",
        pageType: "all",
        pageUrl: "",
        eventType: "click",
        selector: "",
        metaEventName: "",
        eventData: JSON.stringify({
          value: 29.99,
          currency: "USD",
          content_name: "Product Name",
          content_type: "product"
        }, null, 2)
      });
    }
  }, [actionData, modalActive]);

  const validateJson = useCallback((jsonString: string): boolean => {
    if (!jsonString || jsonString.trim() === "") {
      setJsonError("");
      return true;
    }
    try {
      JSON.parse(jsonString);
      setJsonError("");
      return true;
    } catch (e: any) {
      setJsonError(e.message);
      return false;
    }
  }, []);

  const handleModalToggle = useCallback(() => {
    setModalActive(!modalActive);
    if (!modalActive) {
      // Reset form when opening for create
      setEditingEvent(null);
      setFormData({
        name: "",
        displayName: "",
        description: "",
        pageType: "all",
        pageUrl: "",
        eventType: "click",
        selector: "",
        metaEventName: "",
        eventData: JSON.stringify({
          value: 29.99,
          currency: "USD",
          content_name: "Product Name",
          content_type: "product"
        }, null, 2)
      });
    }
  }, [modalActive]);

  const handleEditEvent = useCallback((event: any) => {
    setEditingEvent(event);
    setFormData({
      name: event.name,
      displayName: event.displayName,
      description: event.description || "",
      pageType: event.pageType || "all",
      pageUrl: event.pageUrl || "",
      eventType: event.eventType || "click",
      selector: event.selector || "",
      metaEventName: event.metaEventName || "",
      eventData: event.eventData || "{}"
    });
    setModalActive(true);
  }, []);

  const handleSelectEvent = useCallback((eventId: string, checked: boolean) => {
    setSelectedEvents(prev => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(eventId);
      } else {
        newSet.delete(eventId);
      }
      return newSet;
    });
  }, []);

  const handleSelectAll = useCallback((checked: boolean) => {
    if (checked && apiData?.customEvents) {
      setSelectedEvents(new Set(apiData.customEvents.map(event => event.id)));
    } else {
      setSelectedEvents(new Set());
    }
  }, [apiData?.customEvents]);

  const handleBulkAction = useCallback((action: string) => {
    if (selectedEvents.size === 0) {
      alert("Please select at least one event");
      return;
    }

    const confirmMessage = action === 'bulk_delete'
      ? `Are you sure you want to delete ${selectedEvents.size} event(s)?`
      : action === 'bulk_enable'
      ? `Are you sure you want to enable ${selectedEvents.size} event(s)?`
      : `Are you sure you want to disable ${selectedEvents.size} event(s)?`;

    if (!confirm(confirmMessage)) return;

    // Create a hidden form and submit it using React Router's form submission
    const form = document.createElement('form');
    form.method = 'POST';
    form.style.display = 'none';
    
    // Add action input
    const actionInput = document.createElement('input');
    actionInput.type = 'hidden';
    actionInput.name = 'action';
    actionInput.value = action;
    form.appendChild(actionInput);
    
    // Add appId input
    const appIdInput = document.createElement('input');
    appIdInput.type = 'hidden';
    appIdInput.name = 'appId';
    appIdInput.value = apiData?.app?.appId || '';
    form.appendChild(appIdInput);
    
    // Add eventIds input
    const eventIdsInput = document.createElement('input');
    eventIdsInput.type = 'hidden';
    eventIdsInput.name = 'eventIds';
    eventIdsInput.value = JSON.stringify(Array.from(selectedEvents));
    form.appendChild(eventIdsInput);
    
    // Add form to document and submit
    document.body.appendChild(form);
    form.submit();
    
    // Clean up
    document.body.removeChild(form);
    
    // Clear selected events
    setSelectedEvents(new Set());
  }, [selectedEvents, apiData?.app?.appId]);

  const handleUseTemplate = useCallback((template: any) => {
    setFormData({
      name: template.name,
      displayName: template.displayName,
      description: template.description,
      pageType: template.pageType,
      pageUrl: template.pageUrl || "",
      eventType: template.eventType,
      selector: template.selector,
      metaEventName: template.metaEventName,
      eventData: template.eventData
    });
    validateJson(template.eventData);
  }, [validateJson]);

  const handleTestEvent = useCallback(async () => {
    if (!formData.name || !formData.displayName || !formData.metaEventName) {
      alert("⚠️ Please fill in: Event Name, Display Name, and Meta Event Type");
      return;
    }

    if (jsonError) {
      alert("⚠️ Please fix the JSON validation error before testing");
      return;
    }

    setTestLoading(true);

    try {
      // Parse event data if provided
      let eventData = {};
      if (formData.eventData && formData.eventData.trim() !== "" && formData.eventData !== "{}") {
        eventData = JSON.parse(formData.eventData);
      }

      const testData = {
        appId: apiData?.app?.appId || '',
        eventName: formData.name,
        url: window.location.href,
        referrer: document.referrer,
        pageTitle: document.title,
        sessionId: `test_${Date.now()}`,
        visitorId: `test_visitor_${Date.now()}`,
        timestamp: new Date().toISOString(),
        screenWidth: window.screen.width,
        screenHeight: window.screen.height,
        language: navigator.language,
        ...eventData,
        customData: {
          ...eventData,
          test_event: true,
          test_timestamp: new Date().toISOString()
        }
      };

      const response = await fetch('/api/track', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testData),
      });

      const result = await response.json();

      if (result.success) {
        alert(`✅ SUCCESS!\n\nTest event "${formData.name}" was sent to Facebook.\n\n📍 Check your Facebook Events Manager:\n- Look for event: "${formData.metaEventName}"\n- It will have a "TEST" prefix\n- Should appear within 15-30 minutes\n\n🔍 Test events help you verify everything works before going live!`);
      } else {
        alert(`❌ TEST FAILED\n\nError: ${result.error || 'Unknown error'}\n\n💡 Common issues:\n- Check your Facebook Pixel connection\n- Verify Meta event mapping\n- Ensure JSON data is valid`);
      }
    } catch (error: any) {
      alert(`❌ TEST ERROR\n\n${error.message}\n\n💡 Try again or check your internet connection.`);
    } finally {
      setTestLoading(false);
    }
  }, [formData, jsonError, apiData?.app?.appId]);

  const handleInputChange = useCallback((field: string) => (value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (field === 'eventData') {
      validateJson(value);
    }
  }, [validateJson]);

  const redirectToShopifyPricing = () => {
    const storeHandle = shop.replace('.myshopify.com', '');
    const appHandle = "pixelify-tracker";
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

  const EVENT_TEMPLATES = [
    {
      name: "add_to_cart",
      displayName: "Add to Cart",
      description: "Tracks when users add products to their shopping cart",
      pageType: "product",
      eventType: "click",
      selector: ".add-to-cart, .product-form__cart-submit, [name=\"add\"], .btn-add-to-cart",
      metaEventName: "AddToCart",
      eventData: JSON.stringify({
        content_type: "product",
        content_ids: ["{{ product.id }}"],
        value: "{{ product.price | money_without_currency }}",
        currency: "{{ shop.currency }}"
      })
    },
    {
      name: "wishlist_add",
      displayName: "Add to Wishlist",
      description: "Tracks when users add items to their wishlist",
      pageType: "product",
      eventType: "click",
      selector: ".wishlist-btn, .add-to-wishlist",
      metaEventName: "AddToCart",
      eventData: JSON.stringify({
        content_type: "product",
        content_name: "Product Name",
        value: 29.99,
        currency: "USD"
      })
    },
    {
      name: "newsletter_signup",
      displayName: "Newsletter Signup",
      description: "Tracks newsletter form submissions",
      pageType: "all",
      eventType: "submit",
      selector: "#newsletter-form, .newsletter-form",
      metaEventName: "Lead",
      eventData: JSON.stringify({
        content_name: "Newsletter Signup",
        content_category: "engagement",
        value: 1,
        currency: "USD"
      })
    },
    {
      name: "contact_form_submit",
      displayName: "Contact Form Submission",
      description: "Tracks contact form submissions",
      pageType: "custom",
      pageUrl: "/pages/contact",
      eventType: "submit",
      selector: "#contact-form",
      metaEventName: "Contact",
      eventData: JSON.stringify({
        content_name: "Contact Form",
        content_category: "inquiry"
      })
    },
    {
      name: "product_quick_view",
      displayName: "Product Quick View",
      description: "Tracks when users view product quick view modals",
      pageType: "collection",
      eventType: "click",
      selector: ".quick-view-btn, .product-quick-view",
      metaEventName: "ViewContent",
      eventData: JSON.stringify({
        content_name: "Product Quick View",
        content_type: "product",
        value: 49.99,
        currency: "USD"
      })
    },
    {
      name: "size_guide_view",
      displayName: "Size Guide View",
      description: "Tracks when users view size guides",
      pageType: "product",
      eventType: "click",
      selector: ".size-guide-btn, .size-guide-link",
      metaEventName: "ViewContent",
      eventData: JSON.stringify({
        content_name: "Size Guide",
        content_category: "product_info"
      })
    },
    {
      name: "scroll_engagement",
      displayName: "Content Scroll Engagement",
      description: "Tracks when users scroll through content",
      pageType: "all",
      eventType: "scroll",
      selector: ".blog-content, .article-content, .product-description",
      metaEventName: "ViewContent",
      eventData: JSON.stringify({
        content_category: "engagement",
        scroll_depth: 75
      })
    }
  ];

  // Show loading state
  if (dataLoading) {
    return (
      <Page title="Custom Events">
        <Layout>
          <Layout.Section>
            <Card>
              <div style={{ padding: '60px', textAlign: 'center' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>⏳</div>
                <Text variant="headingMd" as="h3">Loading custom events...</Text>
              </div>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  // Show error state
  if (dataError || !apiData) {
    return (
      <Page title="Custom Events">
        <Layout>
          <Layout.Section>
            <Card>
              <div style={{ padding: '60px', textAlign: 'center' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>❌</div>
                <Text variant="headingMd" as="h3">Error loading custom events</Text>
                <p style={{ marginTop: '8px', color: '#64748b' }}>{dataError || 'Unknown error'}</p>
              </div>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  const { app, customEvents, plan, isFreePlan, hasAccess } = apiData;

  // Demo data for free plan users
  const demoCustomEvents = [
    {
      id: "demo-1",
      displayName: "Add to Wishlist",
      name: "wishlist_add",
      description: "Tracks when users add items to their wishlist",
      eventType: "click",
      selector: ".wishlist-btn, .add-to-wishlist",
      pageType: "product",
      metaEventName: "AddToCart",
      isActive: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: "demo-2",
      displayName: "Newsletter Signup",
      name: "newsletter_signup",
      description: "Tracks newsletter form submissions",
      eventType: "submit",
      selector: "#newsletter-form, .newsletter-form",
      pageType: "all",
      metaEventName: "Lead",
      isActive: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: "demo-3",
      displayName: "Size Guide View",
      name: "size_guide_view",
      description: "Tracks when users view size guides",
      eventType: "click",
      selector: ".size-guide-btn, .size-guide-link",
      pageType: "product",
      metaEventName: "ViewContent",
      isActive: false,
      createdAt: new Date().toISOString(),
    },
  ];

  // Show demo view for Free plan users
  if (isFreePlan || !hasAccess) {
    return (
      <Page
        title="Custom Events - Premium Feature"
        subtitle="Track user interactions and send them to Facebook (adblocker-proof!)"
      >
        <Layout>
          {/* Demo Banner */}
          <Layout.Section>
            <div style={{
              background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
              border: '2px solid #0ea5e9',
              borderRadius: '12px',
              padding: '24px',
              textAlign: 'center',
              marginBottom: '24px'
            }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎯</div>
              <h2 style={{ margin: '0 0 8px 0', color: '#0c4a6e', fontSize: '24px', fontWeight: '700' }}>
                Custom Events - Premium Feature
              </h2>
              <p style={{ margin: '0 0 20px 0', color: '#0369a1', fontSize: '16px' }}>
                Complete the onboarding and select a plan to unlock the features.
              </p>
              <p style={{ margin: '0 0 24px 0', color: '#64748b', fontSize: '14px', fontStyle: 'italic' }}>
                Note: The data shown in this demo is simulated for demonstration purposes only.
              </p>
              <Button
                variant="primary"
                size="large"
                onClick={redirectToShopifyPricing}
              >
                Continue to Pricing Plans
              </Button>
            </div>
          </Layout.Section>

          {/* Demo Stats */}
          <Layout.Section>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
              <div style={{
                background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                padding: '20px',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                textAlign: 'center',
                opacity: 0.7
              }}>
                <div style={{ fontSize: '32px', fontWeight: '700', color: '#1e40af', marginBottom: '4px' }}>
                  3
                </div>
                <div style={{ fontSize: '14px', color: '#64748b', fontWeight: '500' }}>Total Events</div>
              </div>

              <div style={{
                background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
                padding: '20px',
                borderRadius: '12px',
                border: '1px solid #10b981',
                textAlign: 'center',
                opacity: 0.7
              }}>
                <div style={{ fontSize: '32px', fontWeight: '700', color: '#059669', marginBottom: '4px' }}>
                  2
                </div>
                <div style={{ fontSize: '14px', color: '#065f46', fontWeight: '500' }}>Active Events</div>
              </div>

              <div style={{
                background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                padding: '20px',
                borderRadius: '12px',
                border: '1px solid #f59e0b',
                textAlign: 'center',
                opacity: 0.7
              }}>
                <div style={{ fontSize: '32px', fontWeight: '700', color: '#d97706', marginBottom: '4px' }}>
                  3
                </div>
                <div style={{ fontSize: '14px', color: '#92400e', fontWeight: '500' }}>Auto Events</div>
              </div>

              <div style={{
                background: 'linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)',
                padding: '20px',
                borderRadius: '12px',
                border: '1px solid #6366f1',
                textAlign: 'center',
                opacity: 0.7
              }}>
                <div style={{ fontSize: '32px', fontWeight: '700', color: '#4f46e5', marginBottom: '4px' }}>
                  0
                </div>
                <div style={{ fontSize: '14px', color: '#3730a3', fontWeight: '500' }}>Manual Events</div>
              </div>
            </div>
          </Layout.Section>

          {/* Demo Events Table */}
          <Layout.Section>
            <Card>
              <div style={{ padding: '0' }}>
                <div style={{
                  padding: '20px 24px',
                  borderBottom: '1px solid #e2e8f0',
                  background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', fontWeight: '600', color: '#1e293b' }}>
                        📊 Demo Custom Events
                      </h3>
                      <p style={{ margin: 0, fontSize: '14px', color: '#64748b' }}>
                        Preview of what you can achieve with custom events
                      </p>
                    </div>
                  </div>
                </div>

                <div style={{ overflow: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Event
                        </th>
                        <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Type</th>
                        <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Trigger</th>
                        <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Facebook Event</th>
                        <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {demoCustomEvents.map((event: any, index: number) => (
                        <tr key={event.id} style={{
                          borderBottom: '1px solid #f1f5f9',
                          backgroundColor: index % 2 === 0 ? 'white' : '#fafafa',
                          opacity: 0.8
                        }}>
                          <td style={{ padding: '20px 24px' }}>
                            <div>
                              <div style={{ fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>
                                {event.displayName}
                              </div>
                              <div style={{ fontSize: '13px', color: '#64748b', fontFamily: 'monospace' }}>
                                {event.name}
                              </div>
                              {event.description && (
                                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                                  {event.description}
                                </div>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: '20px 24px' }}>
                            <div style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '4px 8px',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: '500',
                              backgroundColor: '#dbeafe',
                              color: '#1e40af'
                            }}>
                              <span>🎯</span>
                              Auto
                            </div>
                          </td>
                          <td style={{ padding: '20px 24px' }}>
                            <div>
                              <div style={{ fontSize: '13px', color: '#1e293b', fontWeight: '500' }}>
                                {event.eventType}
                              </div>
                              <div style={{ fontSize: '12px', color: '#64748b', fontFamily: 'monospace', marginTop: '2px' }}>
                                {event.selector}
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '20px 24px' }}>
                            <div style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '4px 8px',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: '500',
                              backgroundColor: '#f0f9ff',
                              color: '#0369a1'
                            }}>
                              <span>📘</span>
                              {event.metaEventName}
                            </div>
                          </td>
                          <td style={{ padding: '20px 24px' }}>
                            <div style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '6px 10px',
                              borderRadius: '20px',
                              fontSize: '12px',
                              fontWeight: '600',
                              backgroundColor: event.isActive ? '#dcfce7' : '#fee2e2',
                              color: event.isActive ? '#166534' : '#991b1b'
                            }}>
                              <div style={{
                                width: '6px',
                                height: '6px',
                                borderRadius: '50%',
                                backgroundColor: event.isActive ? '#22c55e' : '#ef4444'
                              }}></div>
                              {event.isActive ? 'Active' : 'Inactive'}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </Card>
          </Layout.Section>

          {/* Call to Action */}
          <Layout.Section>
            <Card>
              <div style={{
                padding: '32px',
                textAlign: 'center',
                background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)'
              }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>🚀</div>
                <h3 style={{ margin: '0 0 16px 0', color: '#1e293b', fontSize: '20px', fontWeight: '600' }}>
                  Ready to Unlock Custom Events?
                </h3>
                <p style={{ margin: '0 0 24px 0', color: '#64748b', fontSize: '16px' }}>
                  Upgrade to a paid plan to create unlimited custom events and track any user interaction on your store.
                </p>
                <Button
                  variant="primary"
                  size="large"
                  onClick={redirectToShopifyPricing}
                >
                  View Pricing Plans
                </Button>
              </div>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  // Only show full UI for Basic/Advance plan users
  if (!hasAccess) {
    return null;
  }

  return (
    <Page
      title="Custom Events"
      subtitle={`Track user interactions and send them to Facebook (adblocker-proof!) - ${plan} Plan`}
      primaryAction={{
        content: "✨ Create Event",
        onAction: handleModalToggle
      }}
    >
      {/* Hero Section */}
      <div style={{
        background: 'linear-gradient(135deg, #1e40af 0%, #7c3aed 100%)',
        color: 'white',
        padding: '24px',
        borderRadius: '12px',
        marginBottom: '24px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.1)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                backgroundColor: 'rgba(255,255,255,0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: '16px'
              }}>
                <span style={{ fontSize: '24px' }}>🎯</span>
              </div>
              <div>
                <h2 style={{ margin: '0 0 4px 0', fontSize: '24px', fontWeight: '700' }}>
                  Advanced Event Tracking
                </h2>
                <p style={{ margin: 0, fontSize: '16px', opacity: 0.9 }}>
                  Create custom events for wishlist adds, form submissions, scroll tracking, and more
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '24px', marginTop: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px' }}>🛡️</span>
                <span style={{ fontSize: '14px', opacity: 0.9 }}>Adblocker-Proof</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px' }}>⚡</span>
                <span style={{ fontSize: '14px', opacity: 0.9 }}>Server-Side CAPI</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px' }}>📊</span>
                <span style={{ fontSize: '14px', opacity: 0.9 }}>Real-Time Analytics</span>
              </div>
            </div>
          </div>
          <div style={{ 
            fontSize: '64px', 
            opacity: 0.3,
            transform: 'rotate(-10deg)'
          }}>📈</div>
        </div>
      </div>
      <Layout>
        {/* Success/Error Messages */}
        {actionData?.success && (
          <Layout.Section>
            <div style={{
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: 'white',
              padding: '16px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              marginBottom: '16px'
            }}>
              <span style={{ fontSize: '20px', marginRight: '12px' }}>✅</span>
              <span style={{ fontSize: '16px', fontWeight: '500' }}>{actionData.message}</span>
            </div>
          </Layout.Section>
        )}

        {actionData?.error && (
          <Layout.Section>
            <div style={{
              background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
              color: 'white',
              padding: '16px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              marginBottom: '16px'
            }}>
              <span style={{ fontSize: '20px', marginRight: '12px' }}>❌</span>
              <span style={{ fontSize: '16px', fontWeight: '500' }}>{actionData.error}</span>
            </div>
          </Layout.Section>
        )}

        {/* Quick Stats Dashboard */}
        <Layout.Section>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            <div style={{
              background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
              padding: '20px',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '32px', fontWeight: '700', color: '#1e40af', marginBottom: '4px' }}>
                {customEvents.length}
              </div>
              <div style={{ fontSize: '14px', color: '#64748b', fontWeight: '500' }}>Total Events</div>
            </div>
            
            <div style={{
              background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
              padding: '20px',
              borderRadius: '12px',
              border: '1px solid #10b981',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '32px', fontWeight: '700', color: '#059669', marginBottom: '4px' }}>
                {customEvents.filter(e => e.isActive).length}
              </div>
              <div style={{ fontSize: '14px', color: '#065f46', fontWeight: '500' }}>Active Events</div>
            </div>
            
            <div style={{
              background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
              padding: '20px',
              borderRadius: '12px',
              border: '1px solid #f59e0b',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '32px', fontWeight: '700', color: '#d97706', marginBottom: '4px' }}>
                {customEvents.filter(e => e.eventType !== 'custom').length}
              </div>
              <div style={{ fontSize: '14px', color: '#92400e', fontWeight: '500' }}>Auto Events</div>
            </div>
            
            <div style={{
              background: 'linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)',
              padding: '20px',
              borderRadius: '12px',
              border: '1px solid #6366f1',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '32px', fontWeight: '700', color: '#4f46e5', marginBottom: '4px' }}>
                {customEvents.filter(e => e.eventType === 'custom').length}
              </div>
              <div style={{ fontSize: '14px', color: '#3730a3', fontWeight: '500' }}>Manual Events</div>
            </div>
          </div>
        </Layout.Section>

        {/* How It Works Section */}
        <Layout.Section>
          <Card>
            <div style={{ padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  backgroundColor: '#1e40af',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: '16px'
                }}>
                  <span style={{ color: 'white', fontSize: '24px' }}>💡</span>
                </div>
                <div>
                  <h3 style={{ margin: '0 0 4px 0', color: '#1a1a1a', fontSize: '20px', fontWeight: '600' }}>
                    How Custom Events Work
                  </h3>
                  <p style={{ margin: 0, color: '#6b7280', fontSize: '16px' }}>
                    Track any user interaction and send it to Facebook for better ad optimization
                  </p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginBottom: '24px' }}>
                <div style={{ 
                  background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)', 
                  padding: '20px', 
                  borderRadius: '12px', 
                  border: '1px solid #0ea5e9',
                  position: 'relative',
                  overflow: 'hidden'
                }}>
                  <div style={{ position: 'absolute', top: '-10px', right: '-10px', fontSize: '40px', opacity: 0.1 }}>📝</div>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ fontSize: '20px', marginRight: '12px' }}>📝</span>
                    <strong style={{ color: '#0c4a6e', fontSize: '16px' }}>1. Create Event</strong>
                  </div>
                  <p style={{ margin: 0, fontSize: '14px', color: '#0369a1', lineHeight: '1.5' }}>
                    Name your event and choose where it should trigger. Use templates for common e-commerce events.
                  </p>
                </div>

                <div style={{ 
                  background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)', 
                  padding: '20px', 
                  borderRadius: '12px', 
                  border: '1px solid #10b981',
                  position: 'relative',
                  overflow: 'hidden'
                }}>
                  <div style={{ position: 'absolute', top: '-10px', right: '-10px', fontSize: '40px', opacity: 0.1 }}>🔗</div>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ fontSize: '20px', marginRight: '12px' }}>🔗</span>
                    <strong style={{ color: '#065f46', fontSize: '16px' }}>2. Map to Facebook</strong>
                  </div>
                  <p style={{ margin: 0, fontSize: '14px', color: '#047857', lineHeight: '1.5' }}>
                    Connect to Facebook events like Purchase, AddToCart, Lead for better ad optimization.
                  </p>
                </div>

                <div style={{ 
                  background: 'linear-gradient(135deg, #fefce8 0%, #fef3c7 100%)', 
                  padding: '20px', 
                  borderRadius: '12px', 
                  border: '1px solid #f59e0b',
                  position: 'relative',
                  overflow: 'hidden'
                }}>
                  <div style={{ position: 'absolute', top: '-10px', right: '-10px', fontSize: '40px', opacity: 0.1 }}>⚡</div>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ fontSize: '20px', marginRight: '12px' }}>⚡</span>
                    <strong style={{ color: '#92400e', fontSize: '16px' }}>3. Choose Trigger</strong>
                  </div>
                  <p style={{ margin: 0, fontSize: '14px', color: '#a16207', lineHeight: '1.5' }}>
                    Manual code triggers or automatic CSS selectors that detect user interactions.
                  </p>
                </div>

                <div style={{ 
                  background: 'linear-gradient(135deg, #f3e8ff 0%, #e9d5ff 100%)', 
                  padding: '20px', 
                  borderRadius: '12px', 
                  border: '1px solid #8b5cf6',
                  position: 'relative',
                  overflow: 'hidden'
                }}>
                  <div style={{ position: 'absolute', top: '-10px', right: '-10px', fontSize: '40px', opacity: 0.1 }}>🛡️</div>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ fontSize: '20px', marginRight: '12px' }}>🛡️</span>
                    <strong style={{ color: '#6b21a8', fontSize: '16px' }}>4. Adblocker-Proof</strong>
                  </div>
                  <p style={{ margin: 0, fontSize: '14px', color: '#7c2d92', lineHeight: '1.5' }}>
                    All events are sent server-side via Facebook CAPI, bypassing adblockers completely.
                  </p>
                </div>
              </div>

              <div style={{ 
                background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)', 
                padding: '20px', 
                borderRadius: '12px', 
                border: '1px solid #10b981', 
                borderLeft: '6px solid #10b981' 
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                  <span style={{ color: '#10b981', fontSize: '24px', marginRight: '12px', marginTop: '2px' }}>💡</span>
                  <div>
                    <strong style={{ color: '#065f46', fontSize: '16px' }}>Pro Tips:</strong>
                    <div style={{ marginTop: '8px', color: '#047857', fontSize: '14px', lineHeight: '1.6' }}>
                      <p style={{ margin: '0 0 8px 0' }}>
                        • Use <code style={{ background: '#bbf7d0', padding: '2px 6px', borderRadius: '4px', fontSize: '13px' }}>PixelAnalytics.track('event_name', data)</code> in your theme code for manual triggers
                      </p>
                      <p style={{ margin: '0 0 8px 0' }}>
                        • Set up automatic triggers with CSS selectors like <code style={{ background: '#bbf7d0', padding: '2px 6px', borderRadius: '4px', fontSize: '13px' }}>.add-to-cart-btn</code>
                      </p>
                      <p style={{ margin: 0 }}>
                        • Test events before going live using the built-in test functionality
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Add to Cart Debugging Section */}
              <div style={{
                background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                padding: '20px',
                borderRadius: '12px',
                border: '1px solid #f59e0b',
                borderLeft: '6px solid #f59e0b',
                marginTop: '20px'
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                  <span style={{ color: '#d97706', fontSize: '24px', marginRight: '12px', marginTop: '2px' }}>🔍</span>
                  <div>
                    <strong style={{ color: '#92400e', fontSize: '16px' }}>Add to Cart Selector Troubleshooting:</strong>
                    <div style={{ marginTop: '12px', color: '#78350f', fontSize: '14px', lineHeight: '1.6' }}>
                      <p style={{ margin: '0 0 12px 0' }}><strong>Common Shopify Add-to-Cart Selectors:</strong></p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px', marginBottom: '12px' }}>
                        <div style={{ background: '#fffbeb', padding: '8px', borderRadius: '6px', border: '1px solid #fed7aa' }}>
                          <code style={{ background: '#fef3c7', padding: '2px 6px', borderRadius: '4px', fontSize: '13px', fontWeight: 'bold' }}>.add-to-cart</code>
                          <div style={{ fontSize: '12px', color: '#9a3412', marginTop: '4px' }}>Most common selector</div>
                        </div>
                        <div style={{ background: '#fffbeb', padding: '8px', borderRadius: '6px', border: '1px solid #fed7aa' }}>
                          <code style={{ background: '#fef3c7', padding: '2px 6px', borderRadius: '4px', fontSize: '13px', fontWeight: 'bold' }}>.product-form__cart-submit</code>
                          <div style={{ fontSize: '12px', color: '#9a3412', marginTop: '4px' }}>Dawn theme</div>
                        </div>
                        <div style={{ background: '#fffbeb', padding: '8px', borderRadius: '6px', border: '1px solid #fed7aa' }}>
                          <code style={{ background: '#fef3c7', padding: '2px 6px', borderRadius: '4px', fontSize: '13px', fontWeight: 'bold' }}>[name="add"]</code>
                          <div style={{ fontSize: '12px', color: '#9a3412', marginTop: '4px' }}>Form input attribute</div>
                        </div>
                        <div style={{ background: '#fffbeb', padding: '8px', borderRadius: '6px', border: '1px solid #fed7aa' }}>
                          <code style={{ background: '#fef3c7', padding: '2px 6px', borderRadius: '4px', fontSize: '13px', fontWeight: 'bold' }}>.btn-add-to-cart</code>
                          <div style={{ fontSize: '12px', color: '#9a3412', marginTop: '4px' }}>Custom themes</div>
                        </div>
                      </div>
                      <div style={{ background: '#fefce8', padding: '12px', borderRadius: '8px', border: '1px solid #fbbf24' }}>
                        <strong style={{ color: '#92400e' }}>How to find the correct selector:</strong>
                        <ol style={{ margin: '8px 0 0 20px', padding: 0 }}>
                          <li style={{ marginBottom: '4px' }}>Open your product page in a browser</li>
                          <li style={{ marginBottom: '4px' }}>Right-click the "Add to Cart" button → "Inspect"</li>
                          <li style={{ marginBottom: '4px' }}>Copy the class name or ID from the HTML</li>
                          <li style={{ marginBottom: '4px' }}>Use "🧪 Test Event" to verify it works</li>
                          <li>Check Facebook Events Manager for test events</li>
                        </ol>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </Layout.Section>

        {/* Events Table Section */}
        <Layout.Section>
          <Card>
            <div style={{ padding: '0' }}>
              {/* Table Header */}
              <div style={{ 
                padding: '20px 24px', 
                borderBottom: '1px solid #e2e8f0',
                background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', fontWeight: '600', color: '#1e293b' }}>
                      📊 Your Custom Events
                    </h3>
                    <p style={{ margin: 0, fontSize: '14px', color: '#64748b' }}>
                      Manage and monitor all your custom tracking events
                    </p>
                  </div>
                  {customEvents.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ fontSize: '14px', color: '#64748b' }}>
                        {selectedEvents.size} of {customEvents.length} selected
                      </div>
                      <Button variant="primary" onClick={handleModalToggle} size="slim">
                        ➕ Add Event
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Bulk Actions Bar */}
              {customEvents.length > 0 && (
                <div style={{ 
                  padding: '16px 24px', 
                  borderBottom: '1px solid #e2e8f0', 
                  backgroundColor: selectedEvents.size > 0 ? '#f0f9ff' : '#fafafa',
                  transition: 'all 0.2s ease'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <Checkbox
                        label=""
                        checked={selectedEvents.size === customEvents.length && customEvents.length > 0}
                        onChange={handleSelectAll}
                      />
                      <Text variant="bodyMd" as="span" tone={selectedEvents.size > 0 ? "base" : "subdued"}>
                        {selectedEvents.size > 0 
                          ? `${selectedEvents.size} event${selectedEvents.size > 1 ? 's' : ''} selected`
                          : 'Select events for bulk actions'
                        }
                      </Text>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <Button
                        size="slim"
                        disabled={selectedEvents.size === 0}
                        onClick={() => handleBulkAction('bulk_enable')}
                        tone="success"
                      >
                        {`✅ Enable (${selectedEvents.size})`}
                      </Button>
                      <Button
                        size="slim"
                        disabled={selectedEvents.size === 0}
                        onClick={() => handleBulkAction('bulk_disable')}
                        tone="critical"
                      >
                        {`⏸️ Disable (${selectedEvents.size})`}
                      </Button>
                      <Button
                        size="slim"
                        tone="critical"
                        disabled={selectedEvents.size === 0}
                        onClick={() => handleBulkAction('bulk_delete')}
                      >
                        {`🗑️ Delete (${selectedEvents.size})`}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Empty State */}
              {customEvents.length === 0 ? (
                <div style={{
                  padding: '80px 40px',
                  textAlign: 'center',
                  background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)'
                }}>
                  <div style={{ 
                    width: '120px', 
                    height: '120px', 
                    margin: '0 auto 24px', 
                    borderRadius: '50%', 
                    background: 'linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '48px'
                  }}>🎯</div>
                  <div style={{ marginBottom: '12px', color: '#1e293b' }}>
                    <Text variant="headingLg" as="h3">
                      No Custom Events Yet
                    </Text>
                  </div>
                  <div style={{ marginBottom: '32px', maxWidth: '500px', margin: '0 auto 32px' }}>
                    <Text variant="bodyLg" as="p" tone="subdued">
                      Create your first custom event to start tracking user interactions and sending them to Facebook for better ad optimization.
                    </Text>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                    <Button variant="primary" onClick={handleModalToggle} size="large">
                      🚀 Create Your First Event
                    </Button>
                    <Button onClick={() => setShowTemplates(true)} size="large">
                      📋 Browse Templates
                    </Button>
                  </div>
                  
                  {/* Quick Start Guide */}
                  <div style={{ 
                    marginTop: '40px', 
                    padding: '24px', 
                    background: 'white', 
                    borderRadius: '12px', 
                    border: '1px solid #e2e8f0',
                    textAlign: 'left',
                    maxWidth: '600px',
                    margin: '40px auto 0'
                  }}>
                    <h4 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600', color: '#1e293b' }}>
                      🚀 Quick Start Guide
                    </h4>
                    <div style={{ display: 'grid', gap: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                        <div style={{ 
                          width: '24px', 
                          height: '24px', 
                          borderRadius: '50%', 
                          backgroundColor: '#1e40af', 
                          color: 'white', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          fontSize: '12px', 
                          fontWeight: 'bold',
                          flexShrink: 0
                        }}>1</div>
                        <div>
                          <strong style={{ color: '#1e293b' }}>Choose a template</strong> - Start with pre-built events like "Add to Wishlist" or "Newsletter Signup"
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                        <div style={{ 
                          width: '24px', 
                          height: '24px', 
                          borderRadius: '50%', 
                          backgroundColor: '#1e40af', 
                          color: 'white', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          fontSize: '12px', 
                          fontWeight: 'bold',
                          flexShrink: 0
                        }}>2</div>
                        <div>
                          <strong style={{ color: '#1e293b' }}>Configure triggers</strong> - Set up CSS selectors or manual code triggers
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                        <div style={{ 
                          width: '24px', 
                          height: '24px', 
                          borderRadius: '50%', 
                          backgroundColor: '#1e40af', 
                          color: 'white', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          fontSize: '12px', 
                          fontWeight: 'bold',
                          flexShrink: 0
                        }}>3</div>
                        <div>
                          <strong style={{ color: '#1e293b' }}>Test & deploy</strong> - Use the built-in test feature to verify everything works
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Events Table */
                <div style={{ overflow: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          <Checkbox
                            label="Select all events"
                            checked={selectedEvents.size === customEvents.length && customEvents.length > 0}
                            onChange={handleSelectAll}
                          />
                        </th>
                        <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Event</th>
                        <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Name</th>
                        <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Type</th>
                        <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Trigger</th>
                        <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Page</th>
                        <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Facebook Event</th>
                        <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</th>
                        <th style={{ padding: '16px 24px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customEvents.map((event: any, index: number) => (
                        <tr key={event.id} style={{ 
                          borderBottom: '1px solid #f1f5f9',
                          backgroundColor: selectedEvents.has(event.id) ? '#f0f9ff' : 'white',
                          transition: 'all 0.2s ease'
                        }}>
                          <td style={{ padding: '20px 24px' }}>
                            <Checkbox
                              checked={selectedEvents.has(event.id)}
                              onChange={(checked) => handleSelectEvent(event.id, checked)}
                              label=""
                            />
                          </td>
                          <td style={{ padding: '20px 24px' }}>
                            <div>
                              <div style={{ fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>
                                {event.displayName}
                              </div>
                              <div style={{ fontSize: '13px', color: '#64748b', fontFamily: 'monospace' }}>
                                {event.name}
                              </div>
                              {event.description && (
                                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                                  {event.description}
                                </div>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: '20px 24px' }}>
                            <div style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '4px 8px',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: '500',
                              backgroundColor: event.eventType === 'custom' ? '#fef3c7' : '#dbeafe',
                              color: event.eventType === 'custom' ? '#92400e' : '#1e40af'
                            }}>
                              <span>{event.eventType === 'custom' ? '✏️' : '🎯'}</span>
                              {event.eventType === 'custom' ? 'Manual' : 'Auto'}
                            </div>
                          </td>
                          <td style={{ padding: '20px 24px' }}>
                            {event.eventType === 'custom' ? (
                              <div style={{ fontSize: '13px', color: '#64748b', fontFamily: 'monospace' }}>
                                PixelAnalytics.track()
                              </div>
                            ) : (
                              <div>
                                <div style={{ fontSize: '13px', color: '#1e293b', fontWeight: '500' }}>
                                  {event.eventType || 'click'}
                                </div>
                                <div style={{ fontSize: '12px', color: '#64748b', fontFamily: 'monospace', marginTop: '2px' }}>
                                  {event.selector || '-'}
                                </div>
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '20px 24px' }}>
                            <div style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '4px 8px',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: '500',
                              backgroundColor: '#f0f9ff',
                              color: '#0369a1'
                            }}>
                              <span>📘</span>
                              {event.metaEventName || 'Not Set'}
                            </div>
                          </td>
                          <td style={{ padding: '20px 24px' }}>
                            <div style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '6px 10px',
                              borderRadius: '20px',
                              fontSize: '12px',
                              fontWeight: '600',
                              backgroundColor: event.isActive ? '#dcfce7' : '#fee2e2',
                              color: event.isActive ? '#166534' : '#991b1b'
                            }}>
                              <div style={{
                                width: '6px',
                                height: '6px',
                                borderRadius: '50%',
                                backgroundColor: event.isActive ? '#22c55e' : '#ef4444'
                              }}></div>
                              {event.isActive ? 'Active' : 'Inactive'}
                            </div>
                          </td>
                          <td style={{ padding: '20px 24px', textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                              <Button size="slim" onClick={() => handleEditEvent(event)}>
                                ✏️ Edit
                              </Button>
                              <Form method="post" style={{ display: 'inline' }}>
                                <input type="hidden" name="action" value="toggle" />
                                <input type="hidden" name="eventId" value={event.id} />
                                <input type="hidden" name="isActive" value={event.isActive.toString()} />
                                <Button 
                                  submit 
                                  size="slim"
                                  tone={event.isActive ? "critical" : "success"}
                                >
                                  {event.isActive ? '⏸️ Disable' : '▶️ Enable'}
                                </Button>
                              </Form>
                              <Form method="post" style={{ display: 'inline' }}>
                                <input type="hidden" name="action" value="delete" />
                                <input type="hidden" name="eventId" value={event.id} />
                                <Button submit tone="critical" size="slim">
                                  🗑️ Delete
                                </Button>
                              </Form>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Card>
        </Layout.Section>
      </Layout>

      {/* Enhanced Modal */}
      <Modal
        open={modalActive}
        onClose={handleModalToggle}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              backgroundColor: editingEvent ? '#f59e0b' : '#1e40af',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <span style={{ color: 'white', fontSize: '20px' }}>
                {editingEvent ? '✏️' : '✨'}
              </span>
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '600' }}>
                {editingEvent ? "Edit Custom Event" : "Create Custom Event"}
              </h2>
              <p style={{ margin: 0, fontSize: '14px', color: '#64748b' }}>
                {editingEvent ? "Update your event configuration" : "Set up a new tracking event"}
              </p>
            </div>
          </div>
        }
        primaryAction={{
          content: editingEvent ? "💾 Update Event" : "🚀 Create Event",
          loading: isLoading,
          onAction: () => {
            if (!formData.name || formData.name.trim() === "") {
              alert("Event name is required");
              return;
            }
            if (!formData.displayName || formData.displayName.trim() === "") {
              alert("Display name is required");
              return;
            }
            if (!formData.metaEventName || formData.metaEventName.trim() === "") {
              alert("Meta event mapping is required");
              return;
            }
            if (formData.eventType !== "custom" && (!formData.selector || formData.selector.trim() === "")) {
              alert("CSS selector is required for automatic events");
              return;
            }
            if (jsonError) {
              alert("Please fix the JSON validation error before submitting");
              return;
            }
            const form = document.getElementById('create-event-form') as HTMLFormElement;
            form.requestSubmit();
          },
          disabled: !formData.name || !formData.displayName || !formData.metaEventName || (formData.eventType !== "custom" && !formData.selector) || jsonError !== ""
        }}
        secondaryActions={[
          {
            content: testLoading ? "🧪 Testing..." : "🧪 Test Event",
            onAction: handleTestEvent,
            loading: testLoading,
            disabled: testLoading || !formData.name || !formData.displayName || !formData.metaEventName
          },
          {
            content: "❌ Cancel",
          onAction: handleModalToggle
          }
        ]}
      >
        <Modal.Section>
          {/* Template Selector */}
          <div style={{ 
            marginBottom: '32px', 
            padding: '20px', 
            background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)', 
            borderRadius: '12px', 
            border: '1px solid #0ea5e9' 
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  backgroundColor: '#0ea5e9',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: '12px'
                }}>
                  <span style={{ color: 'white', fontSize: '16px' }}>🚀</span>
                </div>
                <div style={{ margin: 0, color: '#0c4a6e' }}>
                  <Text variant="headingMd" as="h4">
                    Quick Start Templates
                  </Text>
                </div>
                <div style={{ margin: 0, color: '#0369a1' }}>
                  <Text variant="bodySm" as="p">
                    Choose from popular e-commerce event templates
                  </Text>
                </div>
              </div>
              <Button
                variant="plain"
                onClick={() => setShowTemplates(!showTemplates)}
                size="slim"
              >
                {showTemplates ? '▲ Hide Templates' : '▼ Show Templates'}
              </Button>
            </div>

            <Collapsible open={showTemplates} id="templates-collapsible">
              <div style={{ marginTop: '16px' }}>
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', 
                  gap: '12px', 
                  maxHeight: '400px', 
                  overflowY: 'auto',
                  padding: '4px'
                }}>
                  {EVENT_TEMPLATES.map((template, index) => (
                    <div key={index} style={{
                      padding: '16px',
                      border: '1px solid #e0e7ff',
                      borderRadius: '8px',
                      backgroundColor: 'white',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#6366f1';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#e0e7ff';
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
                    }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ marginBottom: '6px', color: '#1e293b' }}>
                            <Text variant="bodyLg" as="p" fontWeight="semibold">
                              {template.displayName}
                            </Text>
                          </div>
                          <div style={{ marginBottom: '8px', lineHeight: '1.4' }}>
                            <Text variant="bodySm" as="p" tone="subdued">
                              {template.description}
                            </Text>
                          </div>
                        </div>
                        <Button size="slim" onClick={() => handleUseTemplate(template)} variant="primary">
                          Use Template
                        </Button>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ 
                          fontSize: '11px', 
                          padding: '4px 8px', 
                          backgroundColor: '#dbeafe', 
                          color: '#1e40af', 
                          borderRadius: '4px',
                          fontWeight: '500'
                        }}>
                          📘 {template.metaEventName}
                        </span>
                        <span style={{ 
                          fontSize: '11px', 
                          padding: '4px 8px', 
                          backgroundColor: '#f3f4f6', 
                          color: '#374151', 
                          borderRadius: '4px',
                          fontWeight: '500'
                        }}>
                          ⚡ {template.eventType}
                        </span>
                        <span style={{ 
                          fontSize: '11px', 
                          padding: '4px 8px', 
                          backgroundColor: '#fef3c7', 
                          color: '#92400e', 
                          borderRadius: '4px',
                          fontWeight: '500'
                        }}>
                          🎯 {template.pageType}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Collapsible>
          </div>

          <Form method="post" id="create-event-form">
            <FormLayout>
              <input type="hidden" name="action" value={editingEvent ? "update" : "create"} />
              {editingEvent && <input type="hidden" name="eventId" value={editingEvent.id} />}
              <input type="hidden" name="appId" value={app.appId} />
              
              {/* Basic Information Section */}
              <div style={{ 
                marginBottom: '32px', 
                padding: '24px', 
                background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', 
                borderRadius: '12px',
                border: '1px solid #e2e8f0'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    backgroundColor: '#1e40af',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: '12px'
                  }}>
                    <span style={{ color: 'white', fontSize: '16px' }}>📝</span>
                  </div>
                  <div>
                    <div style={{ margin: 0, color: '#1e293b' }}>
                      <Text variant="headingMd" as="h4">
                        Basic Information
                      </Text>
                    </div>
                    <div style={{ margin: 0, color: '#64748b' }}>
                      <Text variant="bodySm" as="p">
                        Give your event a name and description
                      </Text>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <TextField
                    label="Display Name"
                value={formData.displayName}
                onChange={handleInputChange('displayName')}
                name="displayName"
                placeholder="e.g., Add to Wishlist"
                    helpText="Human-friendly name shown in your dashboard"
                autoComplete="off"
                requiredIndicator
              />

              <TextField
                    label="Event Name (API)"
                value={formData.name}
                onChange={handleInputChange('name')}
                name="name"
                placeholder="e.g., wishlist_add"
                    helpText="Technical identifier used in code"
                autoComplete="off"
                requiredIndicator
              />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <Select
                    label="Page Context"
                options={[
                      { label: "🌐 All Pages", value: "all" },
                      { label: "🏠 Home Page", value: "index" },
                      { label: "📦 Product Pages", value: "product" },
                      { label: "📚 Collection Pages", value: "collection" },
                      { label: "🛒 Cart Page", value: "cart" },
                      { label: "💳 Checkout Page", value: "checkout" },
                      { label: "🔍 Search Page", value: "search" },
                      { label: "🎯 Specific URL", value: "custom" }
                ]}
                value={formData.pageType}
                onChange={(value) => setFormData(prev => ({ ...prev, pageType: value }))}
                name="pageType"
                    helpText="Where this event typically occurs"
              />

              {formData.pageType === "custom" && (
                <TextField
                      label="Specific URL"
                  value={formData.pageUrl}
                  onChange={handleInputChange('pageUrl')}
                  name="pageUrl"
                      placeholder="/pages/contact"
                      helpText="URL path where this event should trigger"
                  autoComplete="off"
                />
              )}
                </div>

                <TextField
                  label="Description (Optional)"
                  value={formData.description}
                  onChange={handleInputChange('description')}
                  name="description"
                  placeholder="What does this event track? Who triggers it?"
                  multiline={2}
                  helpText="Help your team understand what this event measures"
                  autoComplete="off"
                />
              </div>

              {/* Trigger Configuration Section */}
              <div style={{ 
                marginBottom: '32px', 
                padding: '24px', 
                background: 'linear-gradient(135deg, #fefce8 0%, #fef3c7 100%)', 
                borderRadius: '12px', 
                border: '1px solid #f59e0b' 
              }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    backgroundColor: '#f59e0b',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: '12px'
                  }}>
                    <span style={{ color: 'white', fontSize: '16px' }}>⚡</span>
                  </div>
                  <div style={{ margin: 0, color: '#92400e' }}>
                    <Text variant="headingMd" as="h4">
                      Trigger Configuration
                    </Text>
                  </div>
                  <div style={{ margin: 0, color: '#a16207' }}>
                    <Text variant="bodySm" as="p">
                      How should this event be triggered?
                    </Text>
                  </div>
                </div>

                <div style={{ marginBottom: '20px' }}>
              <Select
                    label="Trigger Method"
                options={[
                      { label: "✏️ Manual Code Trigger", value: "manual" },
                      { label: "🎯 Automatic CSS Selector", value: "auto" }
                ]}
                value={formData.eventType === "custom" ? "manual" : "auto"}
                onChange={(value) => setFormData(prev => ({
                  ...prev,
                  eventType: value === "manual" ? "custom" : "click",
                  selector: value === "manual" ? "" : prev.selector
                }))}
                name="triggerType"
                    helpText="Manual: Use PixelAnalytics.track() in code. Automatic: CSS selectors detect user actions."
              />
                </div>

                {formData.eventType !== "custom" ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px' }}>
                  <Select
                      label="DOM Event"
                    options={[
                        { label: "🖱️ Click", value: "click" },
                        { label: "📝 Form Submit", value: "submit" },
                        { label: "⌨️ Input Change", value: "change" },
                        { label: "👁️ Focus", value: "focus" },
                        { label: "📜 Scroll", value: "scroll" },
                        { label: "📄 Page Load", value: "load" }
                    ]}
                    value={formData.eventType}
                    onChange={(value) => setFormData(prev => ({ ...prev, eventType: value }))}
                    name="eventType"
                      helpText="The user action that triggers this event"
                  />

                  <TextField
                      label="CSS Selector"
                    value={formData.selector}
                    onChange={handleInputChange('selector')}
                    name="selector"
                      placeholder=".add-to-cart-btn, #wishlist-button, .product-card .btn"
                      helpText="CSS selector for target elements (use browser dev tools to find)"
                    autoComplete="off"
                    requiredIndicator
                  />
                  </div>
                ) : (
                  <div style={{ 
                    padding: '16px', 
                    background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)', 
                    borderRadius: '8px', 
                    border: '1px solid #10b981' 
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                      <span style={{ color: '#10b981', fontSize: '20px', marginTop: '2px' }}>💡</span>
                      <div style={{ margin: '0 0 8px 0', color: '#065f46', fontWeight: '600' }}>
                        <Text variant="bodyMd" as="p">
                          Manual Trigger Setup
                        </Text>
                      </div>
                      <div style={{ margin: '0 0 12px 0', color: '#047857' }}>
                        <Text variant="bodySm" as="p">
                          Use this code in your theme to trigger the event:
                        </Text>
                        <div style={{ 
                          background: '#f0fdf4', 
                          padding: '12px', 
                          borderRadius: '6px', 
                          border: '1px solid #bbf7d0',
                          fontFamily: 'monospace',
                          fontSize: '13px',
                          color: '#166534'
                        }}>
                          PixelAnalytics.track('{formData.name || 'your_event'}', {`{`}<br/>
                          &nbsp;&nbsp;value: 99.99,<br/>
                          &nbsp;&nbsp;currency: 'USD',<br/>
                          &nbsp;&nbsp;// ... additional data<br/>
                          {`}`});
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Facebook Integration Section */}
              <div style={{ 
                marginBottom: '24px', 
                padding: '24px', 
                background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)', 
                borderRadius: '12px', 
                border: '1px solid #0ea5e9' 
              }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    backgroundColor: '#0ea5e9',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: '12px'
                  }}>
                    <span style={{ color: 'white', fontSize: '16px' }}>📘</span>
                  </div>
                  <div style={{ margin: 0, color: '#0c4a6e' }}>
                    <Text variant="headingMd" as="h4">
                      Facebook Integration
                    </Text>
                  </div>
                  <div style={{ margin: 0, color: '#0369a1' }}>
                    <Text variant="bodySm" as="p">
                      Map to Facebook events for better ad optimization
                    </Text>
                  </div>
                </div>

                <div style={{ marginBottom: '20px' }}>
              <Select
                    label="Facebook Event Type"
                options={[
                      { label: "Choose Facebook event type...", value: "" },
                      { label: "🛒 Purchase (completed sales)", value: "Purchase" },
                      { label: "➕ AddToCart (add to cart actions)", value: "AddToCart" },
                      { label: "👁️ ViewContent (content views)", value: "ViewContent" },
                      { label: "💳 InitiateCheckout (checkout start)", value: "InitiateCheckout" },
                      { label: "💳 AddPaymentInfo (payment details)", value: "AddPaymentInfo" },
                      { label: "📧 Lead (potential customers)", value: "Lead" },
                      { label: "✅ CompleteRegistration (signups)", value: "CompleteRegistration" },
                      { label: "📞 Contact (contact forms)", value: "Contact" },
                      { label: "🔍 Search (search actions)", value: "Search" },
                      { label: "🎯 CustomEventName (other events)", value: "CustomEventName" }
                ]}
                value={formData.metaEventName}
                onChange={(value) => setFormData(prev => ({ ...prev, metaEventName: value }))}
                name="metaEventName"
                    helpText="Map to Facebook's standard events for better ad optimization"
                requiredIndicator
              />
                </div>

              <TextField
                  label="Event Data (JSON)"
                value={formData.eventData}
                onChange={handleInputChange('eventData')}
                name="eventData"
                  multiline={6}
                  placeholder={`{
  "value": 99.99,
  "currency": "USD",
  "content_name": "Premium Product",
  "content_ids": ["product_123"],
  "content_type": "product"
}`}
                  helpText="Optional data sent to Facebook (value, currency, product info, etc.). Use actual values for testing, not Liquid templates."
                autoComplete="off"
                  error={jsonError}
              />

                {jsonError && (
                  <div style={{ 
                    marginTop: '12px',
                    padding: '12px', 
                    background: '#fef2f2', 
                    borderRadius: '6px', 
                    border: '1px solid #fecaca' 
                  }}>
                    <div style={{ margin: 0, color: '#991b1b' }}>
                      <Text variant="bodySm" as="p">
                        ❌ JSON Error: {jsonError}
                      </Text>
                    </div>
                  </div>
                )}

                {/* Testing Note */}
                <div style={{ 
                  marginTop: '16px',
                  padding: '16px', 
                  background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)', 
                  borderRadius: '8px', 
                  border: '1px solid #f59e0b' 
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <span style={{ color: '#f59e0b', fontSize: '20px', marginTop: '2px' }}>⚠️</span>
                    <div>
                      <div style={{ margin: '0 0 8px 0', color: '#92400e', fontWeight: '600' }}>
                        <Text variant="bodyMd" as="p">
                          Testing vs Production Data
                        </Text>
                      </div>
                      <div style={{ margin: '0 0 8px 0', color: '#a16207' }}>
                        <Text variant="bodySm" as="p">
                          • <strong>For Testing:</strong> Use actual values like <code style={{ background: '#fbbf24', padding: '2px 4px', borderRadius: '3px', color: '#92400e' }}>29.99</code> and <code style={{ background: '#fbbf24', padding: '2px 4px', borderRadius: '3px', color: '#92400e' }}>"USD"</code>
                        </Text>
                      </div>
                      <div style={{ margin: 0, color: '#a16207' }}>
                        <Text variant="bodySm" as="p">
                          • <strong>For Production:</strong> Use Liquid templates like <code style={{ background: '#fbbf24', padding: '2px 4px', borderRadius: '3px', color: '#92400e' }}>{`"{{ product.price | money_without_currency }}"`}</code>
                        </Text>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </FormLayout>
          </Form>
        </Modal.Section>
      </Modal>
    </Page>
  );
}