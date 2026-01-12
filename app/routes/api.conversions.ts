import type { LoaderFunctionArgs } from "react-router";
import { getShopifyInstance } from "../shopify.server";
import prisma from "../db.server";
import { ConversionsService } from "../services/conversions.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const shopify = getShopifyInstance();
  const { session } = await shopify.authenticate.admin(request);
  const shop = session.shop;

  const user = await prisma.user.findUnique({
    where: { storeUrl: shop },
  });

  if (!user) {
    return { error: "User not found" };
  }

  const url = new URL(request.url);
  const timeRange = url.searchParams.get('range') || '30d';
  const pixelFilter = url.searchParams.get('pixel') || 'all';
  const page = parseInt(url.searchParams.get('page') || '1', 10);

  try {
    const conversionData = await ConversionsService.getConversionData(user.id, timeRange, pixelFilter, page, 15);
    return conversionData;
  } catch (error) {
    console.error("Error fetching conversion data:", error);
    return { error: "Failed to fetch conversion data" };
  }
};