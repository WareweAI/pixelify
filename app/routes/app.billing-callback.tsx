// Handle billing callback after charge approval
// This route receives the charge_id from Shopify and redirects to dashboard
import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const chargeId = url.searchParams.get('charge_id');
  
  console.log(`[Billing Callback] Received charge_id: ${chargeId}`);
  
  // The webhook (APP_SUBSCRIPTIONS_UPDATE) handles the plan update
  // Just redirect to dashboard
  throw redirect("/app/dashboard");
};

export default function BillingCallback() {
  return (
    <div style={{ padding: "40px", textAlign: "center" }}>
      <p>Processing your subscription...</p>
    </div>
  );
}
