import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import styles from "./style.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const hostname = url.hostname;
  const shopDomain = request.headers.get("x-shopify-shop-domain");
  const referer = request.headers.get("referer") || "";
  const userAgent = request.headers.get("user-agent") || "";
  
  // Check for Shopify admin context indicators
  const hasAppLoadId = url.searchParams.has("appLoadId");
  const hasShopParam = url.searchParams.has("shop");
  const hasShopifyShop = url.searchParams.has("shopify-shop");
  const hasEmbedded = url.searchParams.has("embedded");
  const hasHmac = url.searchParams.has("hmac");
  const hasTimestamp = url.searchParams.has("timestamp");
  const isFromShopifyAdmin = referer.includes("admin.shopify.com");
  const isShopifyUserAgent = userAgent.includes("Shopify");
  
  // Check if this is an embedded app context (Shopify admin)
  const isEmbeddedContext = 
    hostname.includes("admin.shopify.com") ||
    hostname.endsWith(".myshopify.com") ||
    shopDomain ||
    hasAppLoadId ||
    hasShopParam ||
    hasShopifyShop ||
    hasEmbedded ||
    hasHmac ||
    hasTimestamp ||
    isFromShopifyAdmin ||
    isShopifyUserAgent ||
    request.headers.get("sec-fetch-dest") === "iframe" ||
    request.headers.get("x-shopify-api-request-failure-reauthorize") ||
    request.headers.get("x-shopify-hmac-sha256");
  
  // If this is a Shopify admin context, redirect to /app dashboard
  if (isEmbeddedContext) {
    // Preserve any query parameters that might be needed for authentication
    const searchParams = url.searchParams.toString();
    const redirectUrl = searchParams ? `/app/dashboard?${searchParams}` : "/app/dashboard";
    return redirect(redirectUrl);
  }
  
  // Otherwise show public landing page
  return null;
};

export default function App() {
  return (
    <div className={styles.container}>
      {/* Navbar */}
      <nav className={styles.navbar}>
        <div className={styles.navbarContent}>
          <div className={styles.navbarLogo}>
            <div className={styles.logoIcon}>P</div>
            <div className={styles.logoTextContainer}>
              <span className={styles.logoTitle}>Pixel</span>
              <span className={styles.logoSubtitle}>
                Track your store's performance
              </span>
            </div>
          </div>

          <a
            href="/docs"
            className={styles.navLink}
          >
            Documentation
          </a>
          <a
            href="/auth/login"
            className={styles.navButton}
          >
            <img
              src="/assets/shopify.png"
              alt="Shopify"
              className={styles.shopifyIcon}
            />
            Install App
          </a>
        </div>
      </nav>

      {/* Hero Section */}
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <div className={styles.heroBadge}>
            <img
              src="/assets/shopify.png"
              alt="Shopify"
              className={styles.badgeIcon}
            />
            <span>Pixel Event Tracker for Shopify</span>
          </div>

          <div className={styles.heroText}>
            <h1 className={styles.heroTitle}>
              Track every event, everywhere it fires
              <span className={styles.heroGradient}>
                See what triggered, where it happened, and what it's worth
              </span>
            </h1>
            <p className={styles.heroSubtitle}>
              Drop in Pixel, capture page views, clicks, carts, purchases, and
              errors with full context—URLs, sources, and devices—in one
              dashboard.
            </p>
          </div>

          <div className={styles.ctaForm}>
            <div className={styles.inputGroup}>
              <input 
                className={styles.input} 
                type="text" 
                id="shopDomain"
                placeholder="your-store.myshopify.com"
                required
              />
              <button 
                className={styles.ctaButton} 
                onClick={() => {
                  const shopDomainElement = document.getElementById('shopDomain') as HTMLInputElement;
                  let shopDomain = shopDomainElement?.value || '';
                  
                  if (shopDomain.trim()) {
                    // Clean up the domain
                    shopDomain = shopDomain.trim().toLowerCase();
                    
                    // Remove protocol if present
                    shopDomain = shopDomain.replace(/^https?:\/\//, '');
                    
                    // Remove .myshopify.com if present, we'll add it back
                    shopDomain = shopDomain.replace(/\.myshopify\.com.*$/, '');
                    
                    // Remove any trailing slashes or paths
                    shopDomain = shopDomain.split('/')[0];
                    
                    // Validate domain format (basic check)
                    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(shopDomain) && shopDomain.length > 0) {
                      alert('Please enter a valid Shopify store domain (e.g., your-store or your-store.myshopify.com)');
                      return;
                    }
                    
                    // Redirect to their specific store's app installation page
                    const installUrl = `https://${shopDomain}.myshopify.com/admin/oauth/authorize?client_id=360b03eee304490f2fd1986a55ed0dd8&scope=read_analytics,read_customers,read_orders,read_products,read_checkouts,read_themes&redirect_uri=https://pixel-warewe.vercel.app/auth&state=${Date.now()}`;
                    window.open(installUrl, '_blank');
                  } else {
                    alert('Please enter your Shopify store domain');
                  }
                }}
              >
                <img
                  src="/assets/shopify.png"
                  alt="Shopify"
                  className={styles.shopifyIcon}
                />
                Install App
              </button>
            </div>
            <p className={styles.inputHint}>
              Enter your Shopify store domain to get started in seconds
            </p>
          </div>

          <div className={styles.featureCards}>
            <div className={styles.featureCard}>
              <p className={styles.featureCardTitle}>Reliability</p>
              <p className={styles.featureCardText}>
                Live health checks and event-delivery monitoring keep data
                flowing without gaps.
              </p>
            </div>
            <div className={styles.featureCard}>
              <p className={styles.featureCardTitle}>Security</p>
              <p className={styles.featureCardText}>
                Shopify-grade protections, scoped keys, and data minimization
                for safer tracking.
              </p>
            </div>
            <div className={styles.featureCard}>
              <p className={styles.featureCardTitle}>Support</p>
              <p className={styles.featureCardText}>
                Tracking specialists ready to help debug events, attribution,
                and theme rollouts.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section className={styles.about}>
        <div className={styles.aboutContent}>
          <div className={styles.aboutHeader}>
            <span className={styles.aboutBadge}>
              <img
                src="/assets/shopify.png"
                alt=""
                className={styles.badgeIconSmall}
              />
              About Pixel
            </span>
            <h2 className={styles.aboutTitle}>
              Track every event with the clarity of Meta Pixel—purpose-built for
              Shopify
            </h2>
            <p className={styles.aboutSubtitle}>
              Pixel shows what fired, where it fired, and why. Instrument once,
              see full-funnel analytics, and keep your theme clean without heavy
              engineering time.
            </p>
          </div>

          <div className={styles.featuresGrid}>
            <div className={styles.feature}>
              <p className={styles.featureTitle}>Event stream with context</p>
              <p className={styles.featureText}>
                Capture page views, clicks, carts, purchases, and errors with
                URLs, sources, and devices.
              </p>
            </div>
            <div className={styles.feature}>
              <p className={styles.featureTitle}>Where events fired</p>
              <p className={styles.featureText}>
                See exactly which page, theme block, or campaign triggered each
                event for faster fixes.
              </p>
            </div>
            <div className={styles.feature}>
              <p className={styles.featureTitle}>Themes & branding ready</p>
              <p className={styles.featureText}>
                Drop Pixel into any theme and keep your brand styling consistent
                with minimal changes.
              </p>
            </div>
            <div className={styles.feature}>
              <p className={styles.featureTitle}>Governed and safe</p>
              <p className={styles.featureText}>
                Role-aware controls, audit trails, and rollback-safe configs so
                teams can ship confidently.
              </p>
            </div>
          </div>

          <div className={styles.supportBanner}>
            <div className={styles.supportText}>
              <p className={styles.supportTitle}>Always-on support</p>
              <p className={styles.supportSubtitle}>
                Event-tracking specialists ready to help debug triggers,
                attribution, and rollouts.
              </p>
            </div>
            <button className={styles.supportButton}>Talk with us</button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerContent}>
          <span className={styles.footerText}>
            ©2025 Warewe Consultancy Private Limited
          </span>
          <a
            href="/privacy-policy"
            className={styles.footerLink}
            target="_blank"
            rel="noopener noreferrer"
          >
            Privacy Policy
          </a>
        </div>
      </footer>
    </div>
  );
}