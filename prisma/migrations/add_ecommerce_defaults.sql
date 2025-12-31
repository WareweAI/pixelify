-- Add default values for existing AppSettings records
UPDATE "AppSettings" 
SET 
  "autoTrackViewContent" = true,
  "autoTrackAddToCart" = true,
  "autoTrackInitiateCheckout" = true,
  "autoTrackPurchase" = true
WHERE 
  "autoTrackViewContent" IS NULL 
  OR "autoTrackAddToCart" IS NULL 
  OR "autoTrackInitiateCheckout" IS NULL 
  OR "autoTrackPurchase" IS NULL;