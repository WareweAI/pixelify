// Catalog Event Handler - Omega-Pixel Style
// Unified pipeline for all events with catalog field injection
import prisma from "~/db.server";
import crypto from "crypto";

/**
 * Internal data model for catalog mapping
 */
interface CatalogMapping {
  pixelId: string;
  catalogId: string;
  accessToken: string;
}

/**
 * Product data for catalog events
 */
interface ProductData {
  id: string;
  quantity: number;
  price: number;
}

/**
 * Event classification result
 */
interface EventClassification {
  isCatalogEvent: boolean;
  catalogId?: string;
  contentIds?: string[];
  contents?: Array<{ id: string; quantity: number; item_price: number }>;
  totalValue?: number;
  currency?: string;
}

/**
 * 1️⃣ Get catalog mapping for store
 * Returns: pixel_id, catalog_id, access_token
 */
export async function getCatalogMapping(userId: string, pixelId: string): Promise<CatalogMapping | null> {
  try {
    const catalog = await prisma.facebookCatalog.findFirst({
      where: {
        userId,
        pixelId,
        pixelEnabled: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!catalog) {
      return null;
    }

    // Get access token from app settings
    const app = await prisma.app.findFirst({
      where: { userId },
      include: { settings: true },
    });

    if (!app?.settings?.metaAccessToken) {
      return null;
    }

    return {
      pixelId,
      catalogId: catalog.catalogId,
      accessToken: app.settings.metaAccessToken,
    };
  } catch (error) {
    console.error('[Catalog Handler] Error fetching catalog mapping:', error);
    return null;
  }
}

/**
 * 2️⃣ Event Classification Logic
 * IF event contains products[] → treat as Catalog Event
 * ELSE → treat as Normal Event
 */
export function classifyEvent(
  eventName: string,
  products: ProductData[] | null | undefined,
  currency: string | null | undefined,
  catalogId: string | null | undefined
): EventClassification {
  // Check if this is a catalog-eligible event
  const catalogEventNames = ['ViewContent', 'AddToCart', 'InitiateCheckout', 'Purchase'];
  const isCatalogEligible = catalogEventNames.includes(eventName);

  // If not catalog-eligible or no products, treat as normal event
  if (!isCatalogEligible || !products || products.length === 0) {
    return { isCatalogEvent: false };
  }

  // 3️⃣ Validate catalog event requirements
  if (!catalogId) {
    console.log('[Catalog Handler] No catalog ID, downgrading to normal event');
    return { isCatalogEvent: false };
  }

  if (!currency) {
    console.log('[Catalog Handler] No currency, downgrading to normal event');
    return { isCatalogEvent: false };
  }

  // Extract product IDs and validate
  const contentIds = products.map(p => String(p.id)).filter(id => id && id !== 'undefined');
  
  if (contentIds.length === 0) {
    console.log('[Catalog Handler] No valid product IDs, downgrading to normal event');
    return { isCatalogEvent: false };
  }

  // Build contents array with proper structure
  const contents = products
    .filter(p => p.id && p.id !== 'undefined')
    .map(p => ({
      id: String(p.id),
      quantity: p.quantity || 1,
      item_price: p.price || 0,
    }));

  // Calculate total value
  const totalValue = contents.reduce((sum, item) => sum + (item.item_price * item.quantity), 0);

  return {
    isCatalogEvent: true,
    catalogId,
    contentIds,
    contents,
    totalValue,
    currency,
  };
}

/**
 * 4️⃣ Build Catalog Event Payload
 * Strict rules for catalog events
 */
export function buildCatalogEventPayload(
  eventName: string,
  classification: EventClassification,
  baseCustomData: Record<string, any> = {}
): Record<string, any> {
  if (!classification.isCatalogEvent) {
    // Normal event - return base custom data only
    return baseCustomData;
  }

  // Catalog event - inject required fields
  return {
    ...baseCustomData,
    // Required fields for catalog events
    content_type: "product",
    content_ids: classification.contentIds,
    contents: classification.contents,
    value: classification.totalValue,
    currency: classification.currency,
    num_items: classification.contents?.length || 0,
    // DO NOT add catalog_id here - Meta infers from pixel-catalog link
  };
}

/**
 * 5️⃣ Generate Event ID for Deduplication
 * Same event_id for browser + server events
 */
export function generateEventId(
  storeId: string,
  orderId: string | null | undefined,
  eventName: string,
  timestamp?: number
): string {
  const components = [
    storeId,
    orderId || 'no-order',
    eventName,
    timestamp ? Math.floor(timestamp / 1000) : '', // Round to second for dedup window
  ].filter(Boolean);

  return crypto
    .createHash('sha256')
    .update(components.join('_'))
    .digest('hex')
    .substring(0, 32);
}

/**
 * 6️⃣ Validate Catalog Event
 * Returns validation result and error message
 */
export async function validateCatalogEvent(
  userId: string,
  catalogId: string,
  productIds: string[]
): Promise<{ valid: boolean; error?: string }> {
  try {
    // Check if catalog exists and belongs to user
    const catalog = await prisma.facebookCatalog.findFirst({
      where: {
        userId,
        catalogId,
        pixelEnabled: true,
      },
    });

    if (!catalog) {
      return { valid: false, error: 'Catalog not found or not enabled' };
    }

    // Basic validation - product IDs should be non-empty strings
    const invalidIds = productIds.filter(id => !id || id === 'undefined' || id === 'null');
    if (invalidIds.length > 0) {
      return { valid: false, error: `Invalid product IDs: ${invalidIds.join(', ')}` };
    }

    return { valid: true };
  } catch (error) {
    console.error('[Catalog Handler] Validation error:', error);
    return { valid: false, error: 'Validation failed' };
  }
}

/**
 * 7️⃣ Fallback Strategy
 * If catalog event fails validation, downgrade to normal event
 */
export function applyFallbackStrategy(
  eventName: string,
  classification: EventClassification,
  validationError: string
): Record<string, any> {
  console.log(`[Catalog Handler] Fallback triggered for ${eventName}: ${validationError}`);
  console.log('[Catalog Handler] Sending event WITHOUT catalog fields');
  console.log('[Catalog Handler] Reason: Conversion still counted, ads optimization continues, DPA temporarily skipped');

  // Return minimal custom data for normal event
  return {
    value: classification.totalValue,
    currency: classification.currency,
    // Remove catalog-specific fields
  };
}

/**
 * 8️⃣ Log Event for Debugging
 * Persist every outbound event
 */
export async function logCatalogEvent(data: {
  eventId: string;
  userId: string;
  eventName: string;
  isCatalogEvent: boolean;
  status: 'sent' | 'failed' | 'fallback';
  metaResponse?: any;
  error?: string;
}): Promise<void> {
  try {
    // Store in database for debugging
    await prisma.event.create({
      data: {
        appId: data.userId, // Using userId as appId for now
        eventName: data.eventName,
        customData: {
          event_id: data.eventId,
          is_catalog_event: data.isCatalogEvent,
          status: data.status,
          meta_response: data.metaResponse,
          error: data.error,
          logged_at: new Date().toISOString(),
        },
      },
    });
  } catch (error) {
    console.error('[Catalog Handler] Error logging event:', error);
  }
}

/**
 * 9️⃣ Handle Failure Modes
 */
export function handleFailureMode(
  statusCode: number,
  responseData: any,
  eventId: string
): { action: 'drop' | 'retry' | 'log'; shouldRetry: boolean } {
  // Meta 200 OK but no product match
  if (statusCode === 200 && responseData.events_received === 0) {
    console.error(`[Catalog Handler] Event ${eventId}: Meta 200 OK but no product match - catalog mismatch`);
    return { action: 'log', shouldRetry: false };
  }

  // Meta 400 - Bad request
  if (statusCode === 400) {
    console.error(`[Catalog Handler] Event ${eventId}: Meta 400 - dropping event and logging`);
    return { action: 'drop', shouldRetry: false };
  }

  // Meta 5xx - Server error
  if (statusCode >= 500) {
    console.error(`[Catalog Handler] Event ${eventId}: Meta 5xx - will retry`);
    return { action: 'retry', shouldRetry: true };
  }

  // Duplicate event
  if (responseData.error?.code === 100 && responseData.error?.message?.includes('duplicate')) {
    console.log(`[Catalog Handler] Event ${eventId}: Duplicate event - dropping`);
    return { action: 'drop', shouldRetry: false };
  }

  return { action: 'log', shouldRetry: false };
}

/**
 * 🔟 Absolute Rules Enforcement
 */
export function enforceAbsoluteRules(
  storeId: string,
  pixelId: string,
  catalogId: string | undefined,
  eventStoreId: string
): { valid: boolean; error?: string } {
  // ❌ Never allow: store A event → catalog B
  if (storeId !== eventStoreId) {
    return { 
      valid: false, 
      error: `Store mismatch: event from ${eventStoreId} cannot use catalog from ${storeId}` 
    };
  }

  // ❌ Never allow: store A event → pixel B
  // This is enforced by getCatalogMapping which requires matching userId

  return { valid: true };
}

/**
 * Main Handler: Process Event with Catalog Logic
 * Unified pipeline - one function for all events
 */
export async function processEventWithCatalog(params: {
  userId: string;
  pixelId: string;
  eventName: string;
  products?: ProductData[];
  currency?: string;
  orderId?: string;
  customData?: Record<string, any>;
}): Promise<{
  isCatalogEvent: boolean;
  customData: Record<string, any>;
  eventId: string;
  catalogId?: string;
}> {
  const { userId, pixelId, eventName, products, currency, orderId, customData = {} } = params;

  // Step 1: Get catalog mapping
  const mapping = await getCatalogMapping(userId, pixelId);
  const catalogId = mapping?.catalogId;

  // Step 2: Classify event
  const classification = classifyEvent(eventName, products, currency, catalogId);

  // Step 3: Generate event ID for deduplication
  const eventId = generateEventId(userId, orderId, eventName, Date.now());

  // Step 4: If not catalog event, return normal event
  if (!classification.isCatalogEvent) {
    return {
      isCatalogEvent: false,
      customData: { ...customData, value: customData.value, currency: customData.currency },
      eventId,
    };
  }

  // Step 5: Validate catalog event
  const validation = await validateCatalogEvent(
    userId,
    catalogId!,
    classification.contentIds!
  );

  // Step 6: Apply fallback if validation fails
  if (!validation.valid) {
    const fallbackData = applyFallbackStrategy(eventName, classification, validation.error!);
    return {
      isCatalogEvent: false,
      customData: { ...customData, ...fallbackData },
      eventId,
    };
  }

  // Step 7: Build catalog event payload
  const catalogCustomData = buildCatalogEventPayload(eventName, classification, customData);

  return {
    isCatalogEvent: true,
    customData: catalogCustomData,
    eventId,
    catalogId,
  };
}
