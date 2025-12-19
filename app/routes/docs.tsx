import type { MetaFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";

export const meta: MetaFunction = () => {
  return [
    { title: "Pixel Tracker - Documentation" },
    { name: "description", content: "Complete guide to implementing Pixel Tracker analytics on your Shopify store" },
  ];
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const baseUrl = process.env.SHOPIFY_APP_URL || "https://pixel-warewe.vercel.app";
  return { baseUrl };
};

export default function DocsPage() {
  const { baseUrl } = useLoaderData<typeof loader>();

  return (
    <div style={{
      minHeight: "100vh",
      background: "#fafafa",
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        
        .docs-container {
          max-width: 800px;
          margin: 0 auto;
          padding: 80px 24px;
        }
        
        .docs-header {
          text-align: center;
          margin-bottom: 64px;
        }
        
        .docs-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: white;
          border: 1px solid #e2e8f0;
          padding: 8px 16px;
          border-radius: 100px;
          font-size: 13px;
          color: #64748b;
          margin-bottom: 24px;
        }
        
        .docs-title {
          font-size: 48px;
          font-weight: 700;
          color: #0f172a;
          margin: 0 0 16px;
          letter-spacing: -0.03em;
        }
        
        .docs-subtitle {
          font-size: 18px;
          color: #64748b;
          margin: 0 auto;
          max-width: 500px;
          line-height: 1.6;
        }
        
        .section {
          margin-bottom: 48px;
        }
        
        .section-title {
          font-size: 24px;
          font-weight: 600;
          color: #0f172a;
          margin: 0 0 20px;
          padding-bottom: 12px;
          border-bottom: 1px solid #e2e8f0;
        }
        
        .section-intro {
          font-size: 16px;
          color: #475569;
          line-height: 1.7;
          margin-bottom: 24px;
        }
        
        .info-card {
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 24px;
          margin-bottom: 16px;
        }
        
        .info-card-title {
          font-size: 16px;
          font-weight: 600;
          color: #0f172a;
          margin: 0 0 16px;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        
        .info-card-title svg {
          width: 20px;
          height: 20px;
          color: #6366f1;
        }
        
        .info-card ul {
          margin: 0;
          padding-left: 20px;
          color: #475569;
        }
        
        .info-card li {
          margin-bottom: 10px;
          line-height: 1.6;
          font-size: 15px;
        }
        
        .info-card li strong {
          color: #0f172a;
        }
        
        .info-card p {
          margin: 0;
          color: #475569;
          line-height: 1.7;
          font-size: 15px;
        }
        
        .code-block {
          background: #1e293b;
          border-radius: 8px;
          padding: 20px;
          overflow-x: auto;
          margin: 16px 0;
        }
        
        .code-block code {
          font-family: 'JetBrains Mono', monospace;
          font-size: 13px;
          color: #e2e8f0;
          line-height: 1.6;
        }
        
        .code-block .comment {
          color: #64748b;
        }
        
        .code-block .string {
          color: #a5f3fc;
        }
        
        .code-block .keyword {
          color: #c4b5fd;
        }
        
        .code-block .function {
          color: #fde68a;
        }
        
        .step-number {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          background: #6366f1;
          color: white;
          border-radius: 50%;
          font-size: 14px;
          font-weight: 600;
          margin-right: 12px;
        }
        
        .note {
          margin-top: 16px;
          padding: 12px 16px;
          background: #f0fdf4;
          border-left: 3px solid #22c55e;
          border-radius: 0 8px 8px 0;
          font-size: 14px;
          color: #166534;
        }
        
        .toc {
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 24px;
          margin-bottom: 48px;
        }
        
        .toc-title {
          font-size: 14px;
          font-weight: 600;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin: 0 0 16px;
        }
        
        .toc-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
        }
        
        .toc-list li a {
          color: #475569;
          text-decoration: none;
          font-size: 14px;
          display: block;
          padding: 6px 0;
        }
        
        .toc-list li a:hover {
          color: #6366f1;
        }
        
        .footer-note {
          text-align: center;
          padding: 40px 0;
          border-top: 1px solid #e2e8f0;
          margin-top: 64px;
          color: #94a3b8;
          font-size: 14px;
        }
        
        @media (max-width: 640px) {
          .toc-list {
            grid-template-columns: 1fr;
          }
          .docs-title {
            font-size: 36px;
          }
        }
      `}</style>

      <div className="docs-container">
        <header className="docs-header">
          <div className="docs-badge">
            <svg viewBox="0 0 20 20" fill="none" style={{width: 16, height: 16}}>
              <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" fill="currentColor"/>
            </svg>
            Documentation
          </div>
          <h1 className="docs-title">Pixel Tracker</h1>
          <p className="docs-subtitle">
            Complete guide to implementing analytics and tracking on your Shopify store
          </p>
        </header>

        <nav className="toc">
          <h2 className="toc-title">Contents</h2>
          <ul className="toc-list">
            <li><a href="#quick-start">Quick Start</a></li>
            <li><a href="#installation">Installation</a></li>
            <li><a href="#dashboard">Dashboard Overview</a></li>
            <li><a href="#meta-pixel">Meta Pixel Integration</a></li>
            <li><a href="#automatic-tracking">Automatic Tracking</a></li>
            <li><a href="#custom-events">Custom Events</a></li>
            <li><a href="#ecommerce">E-commerce Tracking</a></li>
            <li><a href="#api">JavaScript API</a></li>
            <li><a href="#troubleshooting">Troubleshooting</a></li>
            <li><a href="#faq">FAQ</a></li>
          </ul>
        </nav>

        <section className="section" id="quick-start">
          <h2 className="section-title">Quick Start</h2>
          <p className="section-intro">
            Get started with Pixel Tracker in under 5 minutes.
          </p>

          <div className="info-card">
            <h3 className="info-card-title">
              <span className="step-number">1</span>
              Install the App
            </h3>
            <p>Install Pixel Tracker from the Shopify App Store.</p>
          </div>

          <div className="info-card">
            <h3 className="info-card-title">
              <span className="step-number">2</span>
              Enable Theme Extension
            </h3>
            <p>
              Go to <strong>Online Store → Themes → Customize</strong>, then enable "Pixel Tracker" in App Embeds.
            </p>
          </div>

          <div className="info-card">
            <h3 className="info-card-title">
              <span className="step-number">3</span>
              Configure Settings
            </h3>
            <p>Open the app dashboard and configure your tracking preferences.</p>
          </div>

          <div className="note">
            <strong>Done!</strong> Pixel Tracker will automatically start capturing events.
          </div>
        </section>

        <section className="section" id="installation">
          <h2 className="section-title">Installation</h2>
          
          <div className="info-card">
            <h3 className="info-card-title">
              <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd"/></svg>
              Theme App Extension (Recommended)
            </h3>
            <ol style={{marginTop: 16, paddingLeft: 20, color: '#475569'}}>
              <li style={{marginBottom: 8}}>Go to <strong>Online Store → Themes</strong></li>
              <li style={{marginBottom: 8}}>Click <strong>Customize</strong></li>
              <li style={{marginBottom: 8}}>Open <strong>App embeds</strong></li>
              <li style={{marginBottom: 8}}>Toggle on <strong>Pixel Tracker</strong></li>
              <li>Click <strong>Save</strong></li>
            </ol>
          </div>

          <div className="info-card">
            <h3 className="info-card-title">
              <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd"/></svg>
              Manual Installation
            </h3>
            <p>Add this script to your theme:</p>
            <div className="code-block">
              <code>
                <span className="keyword">&lt;script</span> <span className="function">src</span>=<span className="string">"{baseUrl}/apps/pixel-api/pixel.js"</span><span className="keyword">&gt;&lt;/script&gt;</span>
              </code>
            </div>
          </div>
        </section>

        <section className="section" id="dashboard">
          <h2 className="section-title">Dashboard Overview</h2>

          <div className="info-card">
            <h3 className="info-card-title">
              <svg viewBox="0 0 20 20" fill="currentColor"><path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"/></svg>
              Key Metrics
            </h3>
            <ul>
              <li><strong>Total Visitors:</strong> Unique visitors</li>
              <li><strong>Page Views:</strong> Total pages viewed</li>
              <li><strong>Active Now:</strong> Real-time count</li>
              <li><strong>Bounce Rate:</strong> Single-page sessions</li>
            </ul>
          </div>

          <div className="info-card">
            <h3 className="info-card-title">
              <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"/></svg>
              Visitor Insights
            </h3>
            <ul>
              <li><strong>Geographic Data:</strong> Country, region, city</li>
              <li><strong>Device Info:</strong> Browser, OS, device type</li>
              <li><strong>Traffic Sources:</strong> Referrers, UTM params</li>
            </ul>
          </div>
        </section>

        <section className="section" id="meta-pixel">
          <h2 className="section-title">Meta Pixel Integration</h2>

          <div className="info-card">
            <h3 className="info-card-title">
              <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd"/></svg>
              Setup Steps
            </h3>
            <ol style={{paddingLeft: 20, color: '#475569'}}>
              <li style={{marginBottom: 8}}>Go to <strong>Settings → Meta Pixel</strong></li>
              <li style={{marginBottom: 8}}>Enter your <strong>Pixel ID</strong></li>
              <li style={{marginBottom: 8}}>Add <strong>Conversions API Token</strong></li>
              <li>Click <strong>Save</strong></li>
            </ol>
          </div>

          <div className="info-card">
            <h3 className="info-card-title">Supported Events</h3>
            <ul>
              <li><strong>PageView</strong> - Every page</li>
              <li><strong>ViewContent</strong> - Product views</li>
              <li><strong>AddToCart</strong> - Cart additions</li>
              <li><strong>InitiateCheckout</strong> - Checkout starts</li>
              <li><strong>Purchase</strong> - Orders (server-side)</li>
            </ul>
          </div>

          <div className="note">
            Server-side events ensure 100% capture, even with ad blockers.
          </div>
        </section>

        <section className="section" id="automatic-tracking">
          <h2 className="section-title">Automatic Tracking</h2>

          <div className="info-card">
            <ul>
              <li><strong>Page Views:</strong> Every page load</li>
              <li><strong>Clicks:</strong> User clicks with element info</li>
              <li><strong>Scroll Depth:</strong> 25%, 50%, 75%, 100%</li>
              <li><strong>Session Duration:</strong> Time on site</li>
            </ul>
          </div>
        </section>

        <section className="section" id="custom-events">
          <h2 className="section-title">Custom Events</h2>

          <div className="info-card">
            <h3 className="info-card-title">Track Custom Event</h3>
            <div className="code-block">
              <code>
                <span className="keyword">window</span>.<span className="function">PixelTracker</span>.<span className="function">track</span>(<span className="string">'button_click'</span>, {'{'}<br/>
                &nbsp;&nbsp;button_name: <span className="string">'Subscribe'</span><br/>
                {'}'});
              </code>
            </div>
          </div>
        </section>

        <section className="section" id="ecommerce">
          <h2 className="section-title">E-commerce Tracking</h2>

          <div className="info-card">
            <h3 className="info-card-title">
              <svg viewBox="0 0 20 20" fill="currentColor"><path d="M3 1a1 1 0 000 2h1.22l.305 1.222a.997.997 0 00.01.042l1.358 5.43-.893.892C3.74 11.846 4.632 14 6.414 14H15a1 1 0 000-2H6.414l1-1H14a1 1 0 00.894-.553l3-6A1 1 0 0017 3H6.28l-.31-1.243A1 1 0 005 1H3zM16 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM6.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"/></svg>
              Tracked Events
            </h3>
            <ul>
              <li><strong>Product View</strong></li>
              <li><strong>Add to Cart</strong></li>
              <li><strong>Begin Checkout</strong></li>
              <li><strong>Purchase</strong> (server-side)</li>
            </ul>
          </div>
        </section>

        <section className="section" id="api">
          <h2 className="section-title">JavaScript API</h2>

          <div className="info-card">
            <h3 className="info-card-title">Available Methods</h3>
            <div className="code-block">
              <code>
                <span className="comment">// Track event</span><br/>
                <span className="keyword">window</span>.<span className="function">PixelTracker</span>.<span className="function">track</span>(eventName, properties)<br/><br/>
                <span className="comment">// Identify user</span><br/>
                <span className="keyword">window</span>.<span className="function">PixelTracker</span>.<span className="function">identify</span>(userId, traits)<br/><br/>
                <span className="comment">// Track page view</span><br/>
                <span className="keyword">window</span>.<span className="function">PixelTracker</span>.<span className="function">page</span>(pageName, properties)
              </code>
            </div>
          </div>
        </section>

        <section className="section" id="troubleshooting">
          <h2 className="section-title">Troubleshooting</h2>

          <div className="info-card">
            <h3 className="info-card-title">Events not appearing?</h3>
            <ul>
              <li>Ensure theme extension is enabled</li>
              <li>Check browser console for errors</li>
              <li>Disable ad blockers temporarily</li>
              <li>Clear browser cache</li>
            </ul>
          </div>

          <div className="info-card">
            <h3 className="info-card-title">Meta Pixel not firing?</h3>
            <ul>
              <li>Verify Pixel ID is correct</li>
              <li>Check Conversions API token</li>
              <li>Use Facebook Pixel Helper</li>
            </ul>
          </div>
        </section>

        <section className="section" id="faq">
          <h2 className="section-title">FAQ</h2>

          <div className="info-card">
            <h3 className="info-card-title">Does this work with ad blockers?</h3>
            <p>Yes! Server-side tracking captures events even when client-side is blocked.</p>
          </div>

          <div className="info-card">
            <h3 className="info-card-title">Is purchase tracking automatic?</h3>
            <p>Yes. Purchases are tracked via Shopify webhooks for 100% capture.</p>
          </div>

          <div className="info-card">
            <h3 className="info-card-title">How do I get support?</h3>
            <p>
              Email <a href="mailto:support@warewe.online" style={{color: '#6366f1'}}>support@warewe.online</a>
            </p>
          </div>
        </section>

        <footer className="footer-note">
          Pixel Tracker • Warewe Consultancy Private Limited • © 2025
        </footer>
      </div>
    </div>
  );
}
