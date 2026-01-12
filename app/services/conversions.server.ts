import prisma from '~/db.server';

export interface ConversionEvent {
  id: string;
  eventName: string;
  url?: string;
  pixelName: string;
  createdAt: Date;
  value?: number | null;
  currency?: string | null;
}

export interface ConversionStats {
  eventName: string;
  count: number;
}

export interface ConversionData {
  conversions: ConversionEvent[];
  conversionStats: ConversionStats[];
  totalPurchases: number;
  totalAddToCarts: number;
  totalCheckouts: number;
  totalViewContent: number;
  conversionRate: string;
  totalCount: number;
}

export class ConversionsService {
  private static readonly CONVERSION_EVENT_NAMES = [
    'purchase', 'Purchase',
    'addToCart', 'add_to_cart', 'AddToCart',
    'initiateCheckout', 'initiate_checkout', 'InitiateCheckout',
    'add_payment_info', 'AddPaymentInfo',
    'viewContent', 'view_content', 'ViewContent',
    'pageview', 'page_view'
  ];

  /**
   * Get conversion data for a user with optimized single query
   */
  static async getConversionData(
    userId: string,
    dateRange: string = '30d',
    pixelFilter?: string,
    page: number = 1,
    limit: number = 15
  ): Promise<ConversionData> {
    const startDate = this.getStartDate(dateRange);

    const whereClause = {
      app: {
        userId,
      },
      eventName: {
        in: this.CONVERSION_EVENT_NAMES
      },
      createdAt: { gte: startDate },
      ...(pixelFilter && pixelFilter !== 'all' ? {
        app: {
          userId,
          appId: pixelFilter
        }
      } : {})
    };

    // Get total count for pagination
    const totalCount = await prisma.event.count({
      where: whereClause
    });

    // Optimized: Use aggregation queries instead of fetching all events
    const [statsResult, events] = await Promise.all([
      // Get stats using groupBy aggregation
      prisma.event.groupBy({
        by: ['eventName'],
        where: whereClause,
        _count: {
          eventName: true,
        },
      }),
      // Get paginated conversions
      prisma.event.findMany({
        where: whereClause,
        select: {
          id: true,
          eventName: true,
          url: true,
          value: true,
          currency: true,
          createdAt: true,
          app: {
            select: {
              name: true,
              appId: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      })
    ]);

    // Process aggregated stats
    let totalPurchases = 0;
    let totalAddToCarts = 0;
    let totalCheckouts = 0;
    let totalViewContent = 0;

    const conversionStats: ConversionStats[] = statsResult.map(stat => {
      const eventName = stat.eventName;
      const count = stat._count.eventName;

      // Aggregate totals
      if (this.isPurchaseEvent(eventName)) totalPurchases += count;
      if (this.isAddToCartEvent(eventName)) totalAddToCarts += count;
      if (this.isCheckoutEvent(eventName)) totalCheckouts += count;
      if (this.isViewContentEvent(eventName)) totalViewContent += count;

      return {
        eventName,
        count
      };
    });

    // Calculate conversion rate
    const conversionRate = totalViewContent > 0 ? ((totalPurchases / totalViewContent) * 100).toFixed(2) : "0.00";

    // Format conversions for frontend
    const conversions: ConversionEvent[] = events.map(event => ({
      id: event.id,
      eventName: event.eventName,
      url: event.url || '',
      pixelName: event.app?.name || 'Unknown',
      createdAt: event.createdAt,
      value: event.value || null,
      currency: event.currency || null,
    }));

    return {
      conversions,
      conversionStats,
      totalPurchases,
      totalAddToCarts,
      totalCheckouts,
      totalViewContent,
      conversionRate,
      totalCount
    };
  }

  /**
   * Get pixels for a user
   */
  static async getUserPixels(userId: string) {
    return await prisma.app.findMany({
      where: { userId },
      include: { settings: true },
    });
  }

  private static isPurchaseEvent(eventName: string): boolean {
    return ['purchase', 'Purchase'].includes(eventName);
  }

  private static isAddToCartEvent(eventName: string): boolean {
    return ['addToCart', 'add_to_cart', 'AddToCart'].includes(eventName);
  }

  private static isCheckoutEvent(eventName: string): boolean {
    return ['initiateCheckout', 'initiate_checkout', 'InitiateCheckout'].includes(eventName);
  }

  private static isViewContentEvent(eventName: string): boolean {
    return ['viewContent', 'view_content', 'ViewContent', 'pageview', 'page_view'].includes(eventName);
  }

  /**
   * Helper method to get start date from range string
   */
  private static getStartDate(range: string): Date {
    const now = new Date();
    const startDate = new Date();

    switch (range) {
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(now.getDate() - 90);
        break;
      default:
        startDate.setDate(now.getDate() - 30);
    }

    return startDate;
  }
}