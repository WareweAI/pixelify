import type { ActionFunctionArgs } from "react-router";
import { getShopifyInstance } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
    const shopify = getShopifyInstance();
    if (!shopify?.authenticate) {
      throw new Response("Shopify configuration not found", { status: 500 });
    }
    const { payload, session, topic, shop } = await shopify.authenticate.webhook(request);
    console.log(`Received ${topic} webhook for ${shop}`);

    const current = payload.current as string[];
    if (session) {
        await db.session.update({   
            where: {
                id: session.id
            },
            data: {
                scope: current.toString(),
            },
        });
    }
    return new Response();
};

export default function WebhookScopesUpdate() {
    return null;
}
