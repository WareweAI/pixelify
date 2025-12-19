// Server-only crypto utility
// This file should only be imported in server-side code
import * as crypto from "node:crypto";

export function generateRandomPassword(): string {
  return crypto.randomBytes(32).toString("hex");
}

