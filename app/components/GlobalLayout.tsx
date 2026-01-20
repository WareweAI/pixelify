import { useLocation } from "react-router";
import { lazy, Suspense } from "react";

// Lazy load TopNavigation to reduce initial bundle
const TopNavigation = lazy(() => 
  import("./TopNavigation").then(module => ({ default: module.TopNavigation }))
);

interface GlobalLayoutProps {
  children: React.ReactNode;
}

export function GlobalLayout({ children }: GlobalLayoutProps) {
  const location = useLocation();
  
  // Determine if we should show the top navigation
  // Show on all pages except landing page, docs, and privacy policy which have their own nav
  const showTopNav = !['/', '/docs', '/privacy-policy', '/catalog-docs'].includes(location.pathname) 
    && !location.pathname.startsWith('/auth')
    && !location.pathname.startsWith('/api')
    && !location.pathname.startsWith('/apps')
    && !location.pathname.startsWith('/webhooks')
    && !location.pathname.startsWith('/track')
    && !location.pathname.startsWith('/pixel');
  
  if (showTopNav) {
    return (
      <div className="app-layout-container">
        <Suspense fallback={
          <nav style={{
            backgroundColor: "#ffffff",
            borderBottom: "1px solid #e1e3e5",
            height: "56px",
            display: "flex",
            alignItems: "center",
            padding: "0 16px"
          }}>
            <div style={{ fontWeight: "700", fontSize: "20px", color: "#202223" }}>
              Loading...
            </div>
          </nav>
        }>
          <TopNavigation />
        </Suspense>
        <div className="app-content-wrapper">
          {children}
        </div>
      </div>
    );
  }
  
  return <>{children}</>;
}
