// Test CAPI endpoint
import type { ActionFunctionArgs } from "react-router";

// Server-only route - no client bundle needed
export const clientLoader = undefined;

export async function action({ request }: ActionFunctionArgs) {
  return Response.json({ message: "Test CAPI endpoint" });
}