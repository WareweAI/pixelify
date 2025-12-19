// Meta Pixel validation API endpoint
import type { ActionFunctionArgs } from "react-router";
import { validateMetaCredentials } from "~/services/meta-capi.server";
import prisma from "~/db.server";

// Server-only route - no client bundle needed
export const clientLoader = undefined;

export async function action({ request }: ActionFunctionArgs) {
  // Always reply with JSON (never fall back to HTML error pages)
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
  }

  try {
    const body = await request.json();
    const { datasetId, accessToken, appSettingsId } = body;

    if (!datasetId) {
      return Response.json(
        { error: "Dataset ID (App ID) is required" },
        { status: 400, headers: corsHeaders }
      );
    }

    if (!accessToken) {
      return Response.json(
        { error: "Access Token is required" },
        { status: 400, headers: corsHeaders }
      );
    }

    // Validate credentials with Meta using Dataset ID and Access Token
    const result = await validateMetaCredentials(datasetId, accessToken);

    if (!result.valid) {
      return Response.json(
        {
          valid: false,
          error: result.error || "Invalid credentials",
        },
        { status: 200, headers: corsHeaders }
      );
    }

    // If appSettingsId provided, update the verification status
    if (appSettingsId) {
      await prisma.appSettings.update({
        where: { id: appSettingsId },
        data: {
          metaPixelId: datasetId,
          metaAccessToken: accessToken,
          metaVerified: true,
          metaPixelEnabled: true,
        },
      });
    }

    return Response.json({
      valid: true,
      datasetName: result.datasetName,
      message: "Credentials verified successfully",
    }, { headers: corsHeaders });
  } catch (error) {
    console.error("Meta validation API error:", error);
    const errorMessage = error instanceof Error ? error.message : "Validation failed";
    return Response.json(
      { valid: false, error: `Validation error: ${errorMessage}` },
      { status: 500, headers: corsHeaders }
    );
  }
}

// Also export loader to ensure route is recognized
export async function loader({ request }: ActionFunctionArgs) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };
  return Response.json({ error: 'Use POST method' }, { status: 405, headers: corsHeaders });
}
