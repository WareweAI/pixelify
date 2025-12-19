// Application constants
export const APP_ID_PREFIX = "px_";
export const SESSION_DURATION_MS = 30 * 60 * 1000; // 30 minutes
export const DEFAULT_DATE_RANGES = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "90d": 90 * 24 * 60 * 60 * 1000,
} as const;

export type DateRange = keyof typeof DEFAULT_DATE_RANGES;
