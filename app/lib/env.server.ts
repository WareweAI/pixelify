import { config } from "dotenv";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Possible .env locations
const envPaths = [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), ".env.local"),
  resolve(__dirname, "../../.env"),
  resolve(__dirname, "../../.env.local"),
  resolve(process.cwd(), "pixels/.env"),
  resolve(process.cwd(), "pixels/.env.local"),
];

for (const envPath of envPaths) {
  if (existsSync(envPath)) {
    const result = config({ path: envPath });
    if (!result.error) break;
  }
}

type Env = {
  SHOPIFY_API_KEY?: string;
  SHOPIFY_API_SECRET?: string;
  SHOPIFY_APP_URL?: string;
  SCOPES?: string;
  DATABASE_URL?: string;
  SHOP_CUSTOM_DOMAIN?: string;
};

export function getEnv(): Env {
  return {
    SHOPIFY_API_KEY: process.env.SHOPIFY_API_KEY,
    SHOPIFY_API_SECRET: process.env.SHOPIFY_API_SECRET,
    SHOPIFY_APP_URL: process.env.SHOPIFY_APP_URL,
    SCOPES: process.env.SCOPES,
    DATABASE_URL: process.env.DATABASE_URL,
    SHOP_CUSTOM_DOMAIN: process.env.SHOP_CUSTOM_DOMAIN,
  };
}

