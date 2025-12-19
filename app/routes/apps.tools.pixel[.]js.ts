import type { LoaderFunctionArgs } from "react-router";

// Proxy /apps/tools/pixel.js -> /pixel.js with same query params.
export async function loader({ request }: LoaderFunctionArgs) {
  const newUrl = new URL(request.url);
  newUrl.pathname = "/pixel.js";
  return Response.redirect(newUrl.toString(), 302);
}

export default function PixelProxy() {
  return null;
}

