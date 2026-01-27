import { useState, useEffect } from "react";
import { useFetcher } from "react-router";
import { Banner, Button, InlineStack } from "@shopify/polaris";
import { ExternalIcon } from "@shopify/polaris-icons";

interface ThemeExtensionReminderProps {
  shop: string;
  onDismiss?: () => void;
}

export function ThemeExtensionReminder({ shop, onDismiss }: ThemeExtensionReminderProps) {
  const fetcher = useFetcher();
  const [isChecking, setIsChecking] = useState(false);
  const [showReminder, setShowReminder] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  // Check if reminder was previously dismissed
  useEffect(() => {
    const dismissed = localStorage.getItem('theme-extension-reminder-dismissed');
    if (dismissed === 'true') {
      setIsDismissed(true);
      return;
    }

    // Check extension status
    setIsChecking(true);
    fetcher.submit(
      { intent: "check-theme-extension" },
      { method: "POST", action: "/api/theme-extension-status" }
    );
  }, [fetcher]);

  // Handle fetcher response
  useEffect(() => {
    if (fetcher.data && isChecking) {
      setIsChecking(false);
      
      // Show reminder if extension is not enabled
      if (!fetcher.data.isEnabled) {
        setShowReminder(true);
      }
    }
  }, [fetcher.data, isChecking]);

  const handleDismiss = () => {
    setShowReminder(false);
    setIsDismissed(true);
    localStorage.setItem('theme-extension-reminder-dismissed', 'true');
    onDismiss?.();
  };

  const handleOpenThemeEditor = () => {
    const themeEditorUrl = `https://${shop}/admin/themes/current/editor?context=apps`;
    window.open(themeEditorUrl, '_blank');
  };

  // Don't show if dismissed or still checking
  if (isDismissed || !showReminder || isChecking) {
    return null;
  }

  return (
    <Banner
      tone="info"
      onDismiss={handleDismiss}
      action={{
        content: "Enable Extension",
        onAction: handleOpenThemeEditor,
        icon: ExternalIcon
      }}
    >
      <p>
        <strong>Improve your tracking accuracy:</strong> Enable the Pixelify theme extension 
        in your theme editor to ensure all customer events are captured properly.
      </p>
    </Banner>
  );
}