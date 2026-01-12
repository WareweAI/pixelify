import prisma from '~/db.server';

export interface UtmCampaignMetrics {
  campaign: string;
  sessions: number;
  pageviews: number;
  events: number;
  conversions: number;
  revenue: number;
  conversionRate: number;
  averageOrderValue: number;
}

export interface UtmSourceMediumMetrics {
  source: string;
  medium: string;
  sessions: number;
  pageviews: number;
  events: number;
  conversions: number;
  revenue: number;
  conversionRate: number;
}

export interface FacebookAdsMetrics {
  totalSessions: number;
  totalPageviews: number;
  totalEvents: number;
  totalConversions: number;
  totalRevenue: number;
  campaigns: UtmCampaignMetrics[];
  sourceMediumBreakdown: UtmSourceMediumMetrics[];
  topCampaigns: UtmCampaignMetrics[];
}

export class AnalyticsService {
  /**
   * Get Facebook Ads performance metrics based on UTM tracking
   */
  static async getFacebookAdsAnalytics(
    appId: string,
    dateRange: string = '30d'
  ): Promise<FacebookAdsMetrics> {
    const startDate = this.getStartDate(dateRange);

    // Get all events with Facebook UTM parameters
    const facebookEvents = await prisma.event.findMany({
      where: {
        appId,
        createdAt: { gte: startDate },
        OR: [
          { utmSource: 'facebook' },
          { utmSource: 'instagram' },
          { utmSource: 'fb' },
          { utmSource: 'ig' }
        ]
      },
      select: {
        id: true,
        eventName: true,
        utmSource: true,
        utmMedium: true,
        utmCampaign: true,
        utmTerm: true,
        utmContent: true,
        value: true,
        currency: true,
        sessionId: true,
        createdAt: true
      }
    });

    // Calculate metrics
    const sessions = new Set(facebookEvents.map(e => e.sessionId).filter(Boolean));
    const pageviews = facebookEvents.filter(e => e.eventName === 'pageview').length;
    const conversions = facebookEvents.filter(e =>
      ['purchase', 'checkout_completed', 'lead'].includes(e.eventName)
    ).length;

    const revenue = facebookEvents
      .filter(e => e.eventName === 'purchase' && e.value)
      .reduce((sum, e) => sum + (e.value || 0), 0);

    // Campaign breakdown
    const campaignMap = new Map<string, UtmCampaignMetrics>();

    facebookEvents.forEach(event => {
      const campaign = event.utmCampaign || 'unknown';
      if (!campaignMap.has(campaign)) {
        campaignMap.set(campaign, {
          campaign,
          sessions: 0,
          pageviews: 0,
          events: 0,
          conversions: 0,
          revenue: 0,
          conversionRate: 0,
          averageOrderValue: 0
        });
      }

      const metrics = campaignMap.get(campaign)!;
      metrics.events++;

      if (event.eventName === 'pageview') metrics.pageviews++;
      if (['purchase', 'checkout_completed', 'lead'].includes(event.eventName)) {
        metrics.conversions++;
        if (event.value) metrics.revenue += event.value;
      }
    });

    // Calculate conversion rates and AOV
    const campaigns = Array.from(campaignMap.values()).map(campaign => {
      const sessionsForCampaign = facebookEvents
        .filter(e => e.utmCampaign === campaign.campaign)
        .reduce((sessions, e) => sessions.add(e.sessionId!), new Set()).size;

      campaign.sessions = sessionsForCampaign;
      campaign.conversionRate = campaign.sessions > 0 ? (campaign.conversions / campaign.sessions) * 100 : 0;
      campaign.averageOrderValue = campaign.conversions > 0 ? campaign.revenue / campaign.conversions : 0;

      return campaign;
    });

    // Source/Medium breakdown
    const sourceMediumMap = new Map<string, UtmSourceMediumMetrics>();

    facebookEvents.forEach(event => {
      const key = `${event.utmSource || 'unknown'}:${event.utmMedium || 'unknown'}`;
      if (!sourceMediumMap.has(key)) {
        sourceMediumMap.set(key, {
          source: event.utmSource || 'unknown',
          medium: event.utmMedium || 'unknown',
          sessions: 0,
          pageviews: 0,
          events: 0,
          conversions: 0,
          revenue: 0,
          conversionRate: 0
        });
      }

      const metrics = sourceMediumMap.get(key)!;
      metrics.events++;

      if (event.eventName === 'pageview') metrics.pageviews++;
      if (['purchase', 'checkout_completed', 'lead'].includes(event.eventName)) {
        metrics.conversions++;
        if (event.value) metrics.revenue += event.value;
      }
    });

    // Calculate sessions for source/medium
    const sourceMediumBreakdown = Array.from(sourceMediumMap.values()).map(sm => {
      const sessionsForSM = facebookEvents
        .filter(e => e.utmSource === sm.source && e.utmMedium === sm.medium)
        .reduce((sessions, e) => sessions.add(e.sessionId!), new Set()).size;

      sm.sessions = sessionsForSM;
      sm.conversionRate = sm.sessions > 0 ? (sm.conversions / sm.sessions) * 100 : 0;

      return sm;
    });

    // Top campaigns by revenue
    const topCampaigns = campaigns
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    return {
      totalSessions: sessions.size,
      totalPageviews: pageviews,
      totalEvents: facebookEvents.length,
      totalConversions: conversions,
      totalRevenue: revenue,
      campaigns,
      sourceMediumBreakdown,
      topCampaigns
    };
  }

  /**
   * Get UTM campaign performance for all campaigns
   */
  static async getUtmCampaignPerformance(
    appId: string,
    dateRange: string = '30d'
  ): Promise<UtmCampaignMetrics[]> {
    const startDate = this.getStartDate(dateRange);

    const events = await prisma.event.findMany({
      where: {
        appId,
        createdAt: { gte: startDate },
        utmCampaign: { not: null }
      },
      select: {
        eventName: true,
        utmCampaign: true,
        value: true,
        sessionId: true
      }
    });

    const campaignMap = new Map<string, UtmCampaignMetrics>();

    events.forEach(event => {
      const campaign = event.utmCampaign!;
      if (!campaignMap.has(campaign)) {
        campaignMap.set(campaign, {
          campaign,
          sessions: 0,
          pageviews: 0,
          events: 0,
          conversions: 0,
          revenue: 0,
          conversionRate: 0,
          averageOrderValue: 0
        });
      }

      const metrics = campaignMap.get(campaign)!;
      metrics.events++;

      if (event.eventName === 'pageview') metrics.pageviews++;
      if (['purchase', 'checkout_completed', 'lead'].includes(event.eventName)) {
        metrics.conversions++;
        if (event.value) metrics.revenue += event.value;
      }
    });

    // Calculate sessions and rates
    return Array.from(campaignMap.values()).map(campaign => {
      const sessionsForCampaign = events
        .filter(e => e.utmCampaign === campaign.campaign)
        .reduce((sessions, e) => sessions.add(e.sessionId!), new Set()).size;

      campaign.sessions = sessionsForCampaign;
      campaign.conversionRate = campaign.sessions > 0 ? (campaign.conversions / campaign.sessions) * 100 : 0;
      campaign.averageOrderValue = campaign.conversions > 0 ? campaign.revenue / campaign.conversions : 0;

      return campaign;
    }).sort((a, b) => b.revenue - a.revenue);
  }

  /**
   * Get UTM source/medium breakdown
   */
  static async getUtmSourceMediumBreakdown(
    appId: string,
    dateRange: string = '30d'
  ): Promise<UtmSourceMediumMetrics[]> {
    const startDate = this.getStartDate(dateRange);

    const events = await prisma.event.findMany({
      where: {
        appId,
        createdAt: { gte: startDate }
      },
      select: {
        eventName: true,
        utmSource: true,
        utmMedium: true,
        value: true,
        sessionId: true
      }
    });

    const sourceMediumMap = new Map<string, UtmSourceMediumMetrics>();

    events.forEach(event => {
      const source = event.utmSource || 'direct';
      const medium = event.utmMedium || 'none';
      const key = `${source}:${medium}`;

      if (!sourceMediumMap.has(key)) {
        sourceMediumMap.set(key, {
          source,
          medium,
          sessions: 0,
          pageviews: 0,
          events: 0,
          conversions: 0,
          revenue: 0,
          conversionRate: 0
        });
      }

      const metrics = sourceMediumMap.get(key)!;
      metrics.events++;

      if (event.eventName === 'pageview') metrics.pageviews++;
      if (['purchase', 'checkout_completed', 'lead'].includes(event.eventName)) {
        metrics.conversions++;
        if (event.value) metrics.revenue += event.value;
      }
    });

    // Calculate sessions and rates
    return Array.from(sourceMediumMap.values()).map(sm => {
      const sessionsForSM = events
        .filter(e => e.utmSource === sm.source && e.utmMedium === sm.medium)
        .reduce((sessions, e) => sessions.add(e.sessionId!), new Set()).size;

      sm.sessions = sessionsForSM;
      sm.conversionRate = sm.sessions > 0 ? (sm.conversions / sm.sessions) * 100 : 0;

      return sm;
    }).sort((a, b) => b.revenue - a.revenue);
  }

  /**
   * Helper method to get start date from range string
   */
  private static getStartDate(range: string): Date {
    const now = new Date();
    const startDate = new Date();

    switch (range) {
      case '24h':
        startDate.setHours(now.getHours() - 24);
        break;
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
