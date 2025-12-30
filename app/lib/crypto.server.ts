import * as crypto from "node:crypto";

export function generateRandomPassword(): string {
  return crypto.randomBytes(32).toString("hex");
}

