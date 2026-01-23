import { useEffect, useState } from "react";

/**
 * Component to handle hydration mismatches caused by browser-specific attributes
 * like fdprocessedid that are added by browsers during client-side rendering
 */
export function HydrationFix({ children }: { children: React.ReactNode }) {
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    // Wait for hydration to complete
    setIsHydrated(true);
    
    // Remove any browser-added attributes that cause hydration warnings
    const removeBrowserAttributes = () => {
      const elements = document.querySelectorAll('[fdprocessedid]');
      elements.forEach((el) => {
        if (el instanceof HTMLElement) {
          el.removeAttribute('fdprocessedid');
        }
      });
    };

    // Run after a short delay to ensure DOM is ready
    const timer = setTimeout(removeBrowserAttributes, 100);
    
    return () => clearTimeout(timer);
  }, []);

  // Render children only after hydration is complete
  return <>{isHydrated ? children : null}</>;
}
