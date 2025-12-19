import { useEffect } from "react";

export function AppNavigation() {
  useEffect(() => {
    // Log when components are ready (for debugging)
    if (typeof window !== "undefined") {
      const checkComponents = () => {
        const navReady = customElements.get("s-app-nav");
        const linkReady = customElements.get("s-link");
        
        if (navReady && linkReady) {
          console.log("App Bridge navigation components ready");
          return true;
        }
        return false;
      };

      // Check immediately
      if (checkComponents()) {
        return;
      }

      // Poll for components (App Bridge loads asynchronously)
      const interval = setInterval(() => {
        if (checkComponents()) {
          clearInterval(interval);
        }
      }, 100);

      // Cleanup after 5 seconds
      setTimeout(() => clearInterval(interval), 5000);
    }
  }, []);

  // Always render - App Bridge will enhance these web components when ready
  return (
    <s-app-nav>
      <s-link href="/app">Dashboard</s-link>
      <s-link href="/app/analytics">Analytics</s-link>
      <s-link href="/app/custom-events">Custom Events</s-link>
      <s-link href="/app/events">Event Logs</s-link>
      <s-link href="/app/visitors">Visitors</s-link>
      <s-link href="/app/settings">Settings</s-link>
    </s-app-nav>
  );
}

