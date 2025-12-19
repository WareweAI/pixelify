// Meta Conversions API (CAPI) Service
import * as crypto from "node:crypto";

const META_GRAPH_API_VERSION = "v19.0";
const META_GRAPH_API_URL = "https://graph.facebook.com";

export interface MetaEventData {
  event_name: string;
  event_time: number;
  event_id?: string;
  event_source_url?: string;
  action_source: "website" | "app" | "email" | "phone_call" | "chat" | "physical_store" | "system_generated" | "other";
  user_data: {
    em?: string; // Hashed email
    ph?: string; // Hashed phone
    fn?: string; // Hashed first name
    ln?: string; // Hashed last name
    ct?: string; // Hashed city
    st?: string; // Hashed state
    zp?: string; // Hashed zip
    country?: string; // Hashed country code
    external_id?: string; // Hashed external ID
    client_ip_address?: string;
    client_user_agent?: string;
    fbc?: string; // Facebook click ID
    fbp?: string; // Facebook browser ID
  };
  custom_data?: {
    value?: number;
    currency?: string;
    content_name?: string;
    content_category?: string;
    content_ids?: string[];
    content_type?: string;
    contents?: Array<{ id: string; quantity: number; item_price?: number }>;
    num_items?: number;
    order_id?: string;
    predicted_ltv?: number;
    search_string?: string;
    status?: string;
    [key: string]: unknown;
  };
  opt_out?: boolean;
}

export interface MetaSendResult {
  success: boolean;
  events_received?: number;
  fbtrace_id?: string;
  error?: string;
  error_code?: number;
}

// Hash function for PII data (SHA256)
function hashData(data: string): string {
  return crypto
    .createHash("sha256")
    .update(data.toLowerCase().trim())
    .digest("hex");
}

// Validate Meta credentials using Dataset ID (Pixel ID) and Access Token
export async function validateMetaCredentials(
  datasetId: string,
  accessToken: string
): Promise<{ valid: boolean; error?: string; datasetName?: string; errorCode?: number }> {
  try {
    // Method 1: Try to access the pixel/dataset directly
    let response = await fetch(
      `${META_GRAPH_API_URL}/${META_GRAPH_API_VERSION}/${datasetId}?fields=id,name&access_token=${accessToken}`
    );

    let data = await response.json();

    // If direct access fails, try the events endpoint
    if (data.error) {
      console.log("Direct access failed, trying events endpoint...", data.error);

      // Method 2: Try the events endpoint - validates pixel ID and token work together
      const testResponse = await fetch(
        `${META_GRAPH_API_URL}/${META_GRAPH_API_VERSION}/${datasetId}/events?access_token=${accessToken}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            data: [{
              event_name: "TestEvent",
              event_time: Math.floor(Date.now() / 1000),
              action_source: "website",
              user_data: {
                client_ip_address: "0.0.0.0",
                client_user_agent: "Test"
              }
            }],
            test_event_code: "TEST_VALIDATION_" + Date.now()
          })
        }
      );

      const testData = await testResponse.json();

      if (testData.error) {
        const errorCode = testData.error.code;
        let errorMessage = testData.error.message || "Invalid credentials";

        if (errorCode === 100) {
          errorMessage = "Invalid Dataset ID (Pixel ID). Please check your Dataset ID from Meta Events Manager.";
        } else if (errorCode === 190) {
          errorMessage = "Invalid or expired access token. Please generate a new token from Meta Events Manager.";
        } else if (errorCode === 803 || errorCode === 104) {
          errorMessage = "Dataset ID not found. Please verify your Dataset ID (Pixel ID) from Meta Events Manager.";
        } else if (errorCode === 200) {
          errorMessage = "Permission denied. Your access token doesn't have permission for this pixel.";
        } else if (errorCode === 10) {
          errorMessage = "Application permission error. Please check your access token permissions.";
        } else if (errorCode === 2500) {
          errorMessage = "Invalid access token format. Please copy the full access token from Meta Events Manager.";
        }

        return { valid: false, error: errorMessage, errorCode };
      }

      // Events endpoint worked
      return { valid: true, datasetName: `Pixel ${datasetId}` };
    }

    // Direct access worked
    return { valid: true, datasetName: data.name || `Pixel ${datasetId}` };
  } catch (error) {
    console.error("Meta validation error:", error);
    return { valid: false, error: "Failed to connect to Meta API. Check your internet connection." };
  }
}

// Forward event to Meta Conversions API
export async function forwardToMeta(params: {
  pixelId: string;
  accessToken: string;
  testEventCode?: string;
  event: {
    eventName: string;
    eventTime: number;
    eventSourceUrl?: string;
    actionSource: string;
    userData: {
      clientIpAddress?: string;
      clientUserAgent?: string;
      externalId?: string;
    };
    customData?: Record<string, unknown>;
  };
}): Promise<void> {
  const { pixelId, accessToken, testEventCode, event } = params;

  const metaEvent: MetaEventData = {
    event_name: mapEventName(event.eventName),
    event_time: event.eventTime,
    event_id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    event_source_url: event.eventSourceUrl,
    action_source: "website",
    user_data: {
      client_ip_address: event.userData.clientIpAddress,
      client_user_agent: event.userData.clientUserAgent,
      external_id: event.userData.externalId ? hashData(event.userData.externalId) : undefined,
    },
    custom_data: event.customData,
  };

  await sendToMetaCAPI(pixelId, accessToken, [metaEvent], testEventCode);
}

// Map event names to Meta standard events
function mapEventName(eventName: string): string {
  const eventNameMap: Record<string, string> = {
    pageview: "PageView",
    page_view: "PageView",
    view_content: "ViewContent",
    add_to_cart: "AddToCart",
    add_to_wishlist: "AddToWishlist",
    initiate_checkout: "InitiateCheckout",
    add_payment_info: "AddPaymentInfo",
    purchase: "Purchase",
    lead: "Lead",
    complete_registration: "CompleteRegistration",
    search: "Search",
    contact: "Contact",
    subscribe: "Subscribe",
    start_trial: "StartTrial",
  };
  return eventNameMap[eventName.toLowerCase()] || eventName;
}

// Send events to Meta Conversions API
export async function sendToMetaCAPI(
  pixelId: string,
  accessToken: string,
  events: MetaEventData[],
  testEventCode?: string
): Promise<MetaSendResult> {
  try {
    const url = `${META_GRAPH_API_URL}/${META_GRAPH_API_VERSION}/${pixelId}/events`;

    const body: { data: MetaEventData[]; test_event_code?: string } = {
      data: events,
    };

    // Add test event code for debugging if provided
    if (testEventCode) {
      body.test_event_code = testEventCode;
    }

    const response = await fetch(`${url}?access_token=${accessToken}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (data.error) {
      console.error("Meta CAPI error:", data.error);
      return {
        success: false,
        error: data.error.message,
        error_code: data.error.code,
      };
    }

    return {
      success: true,
      events_received: data.events_received,
      fbtrace_id: data.fbtrace_id,
    };
  } catch (error) {
    console.error("Meta CAPI send error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Map our event data to Meta event format
export function mapToMetaEvent(eventData: {
  eventName: string;
  url?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  countryCode?: string | null;
  fingerprint?: string | null;
  fbc?: string | null;
  fbp?: string | null;
  value?: number | null;
  currency?: string | null;
  productId?: string | null;
  productName?: string | null;
  quantity?: number | null;
  customData?: Record<string, unknown> | null;
}): MetaEventData {
  // Map our event names to Meta standard events
  const eventNameMap: Record<string, string> = {
    pageview: "PageView",
    page_view: "PageView",
    view_content: "ViewContent",
    add_to_cart: "AddToCart",
    add_to_wishlist: "AddToWishlist",
    initiate_checkout: "InitiateCheckout",
    add_payment_info: "AddPaymentInfo",
    purchase: "Purchase",
    lead: "Lead",
    complete_registration: "CompleteRegistration",
    search: "Search",
    contact: "Contact",
    subscribe: "Subscribe",
    start_trial: "StartTrial",
  };

  const metaEventName = eventNameMap[eventData.eventName.toLowerCase()] || eventData.eventName;

  // Build user data with hashed PII
  const userData: MetaEventData["user_data"] = {};

  if (eventData.email) {
    userData.em = hashData(eventData.email);
  }
  if (eventData.phone) {
    userData.ph = hashData(eventData.phone.replace(/\D/g, ""));
  }
  if (eventData.firstName) {
    userData.fn = hashData(eventData.firstName);
  }
  if (eventData.lastName) {
    userData.ln = hashData(eventData.lastName);
  }
  if (eventData.city) {
    userData.ct = hashData(eventData.city);
  }
  if (eventData.state) {
    userData.st = hashData(eventData.state);
  }
  if (eventData.zip) {
    userData.zp = hashData(eventData.zip);
  }
  if (eventData.countryCode) {
    userData.country = hashData(eventData.countryCode.toLowerCase());
  }
  if (eventData.fingerprint) {
    userData.external_id = hashData(eventData.fingerprint);
  }
  if (eventData.ipAddress) {
    userData.client_ip_address = eventData.ipAddress;
  }
  if (eventData.userAgent) {
    userData.client_user_agent = eventData.userAgent;
  }
  if (eventData.fbc) {
    userData.fbc = eventData.fbc;
  }
  if (eventData.fbp) {
    userData.fbp = eventData.fbp;
  }

  // Build custom data
  const customData: MetaEventData["custom_data"] = {};

  if (eventData.value) {
    customData.value = eventData.value;
  }
  if (eventData.currency) {
    customData.currency = eventData.currency.toUpperCase();
  }
  if (eventData.productName) {
    customData.content_name = eventData.productName;
  }
  if (eventData.productId) {
    customData.content_ids = [eventData.productId];
    customData.content_type = "product";
  }
  if (eventData.quantity) {
    customData.num_items = eventData.quantity;
  }

  // Merge any additional custom data
  if (eventData.customData) {
    Object.assign(customData, eventData.customData);
  }

  return {
    event_name: metaEventName,
    event_time: Math.floor(Date.now() / 1000),
    event_id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    event_source_url: eventData.url || undefined,
    action_source: "website",
    user_data: userData,
    custom_data: Object.keys(customData).length > 0 ? customData : undefined,
  };
}


