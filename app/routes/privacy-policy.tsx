import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const baseUrl = process.env.SHOPIFY_APP_URL || "https://pixel-warewe.vercel.app";
  return { baseUrl };
};

export default function PrivacyPolicy() {
  const { baseUrl } = useLoaderData<typeof loader>();

  return (
    <div style={{
      minHeight: "100vh",
      background: "#fafafa",
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        
        .privacy-container {
          max-width: 800px;
          margin: 0 auto;
          padding: 80px 24px;
        }
        
        .privacy-header {
          text-align: center;
          margin-bottom: 64px;
        }
        
        .privacy-badge {
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
        
        .privacy-title {
          font-size: 48px;
          font-weight: 700;
          color: #0f172a;
          margin: 0 0 16px;
          letter-spacing: -0.03em;
        }
        
        .privacy-subtitle {
          font-size: 18px;
          color: #64748b;
          margin: 0;
        }
        
        .compliance-badges {
          display: flex;
          justify-content: center;
          gap: 12px;
          margin-top: 32px;
          flex-wrap: wrap;
        }
        
        .compliance-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #f0fdf4;
          color: #166534;
          padding: 8px 14px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 500;
        }
        
        .compliance-badge svg {
          width: 16px;
          height: 16px;
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
        
        .note {
          margin-top: 16px;
          padding: 12px 16px;
          background: #f8fafc;
          border-radius: 8px;
          font-size: 14px;
          color: #64748b;
          font-style: italic;
        }
        
        .contact-card {
          background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 32px;
          text-align: center;
        }
        
        .contact-card h3 {
          font-size: 20px;
          font-weight: 600;
          color: #0f172a;
          margin: 0 0 8px;
        }
        
        .contact-card .company {
          font-size: 14px;
          color: #64748b;
          margin-bottom: 20px;
        }
        
        .contact-link {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: #6366f1;
          text-decoration: none;
          font-size: 15px;
          font-weight: 500;
          margin: 8px 16px;
        }
        
        .contact-link:hover {
          text-decoration: underline;
        }
        
        .resources-list {
          list-style: none;
          padding: 0;
          margin: 0;
        }
        
        .resources-list li {
          margin-bottom: 12px;
        }
        
        .resources-list a {
          color: #6366f1;
          text-decoration: none;
          font-size: 15px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        
        .resources-list a:hover {
          text-decoration: underline;
        }
        
        .footer-note {
          text-align: center;
          padding: 40px 0;
          border-top: 1px solid #e2e8f0;
          margin-top: 64px;
          color: #94a3b8;
          font-size: 14px;
        }
      `}</style>

      <div className="privacy-container">
        <header className="privacy-header">
          <div className="privacy-badge">
            <svg viewBox="0 0 20 20" fill="none" style={{width: 16, height: 16}}>
              <path d="M10 1L3 4v5c0 5 3 8 7 10 4-2 7-5 7-10V4l-7-3z" stroke="currentColor" strokeWidth="1.5" fill="none"/>
              <path d="M7 10l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Privacy Policy
          </div>
          <h1 className="privacy-title">Your Privacy Matters</h1>
          <p className="privacy-subtitle">Last updated: January 2025</p>
          
          <div className="compliance-badges">
            <span className="compliance-badge">
              <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>
              GDPR Compliant
            </span>
            <span className="compliance-badge">
              <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>
              CCPA Compliant
            </span>
            <span className="compliance-badge">
              <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd"/></svg>
              Encrypted
            </span>
          </div>
        </header>

        <section className="section">
          <p className="section-intro">
            This Privacy Policy describes how Pixel Tracker ("we", "our", or "us") collects, uses, 
            and protects your information when you use our analytics and tracking services. 
            By using our services, you agree to the collection and use of information in accordance 
            with this policy.
          </p>
        </section>

        <section className="section">
          <h2 className="section-title">1. Information We Collect</h2>
          <p className="section-intro">
            When you visit a website that uses Pixel Tracker, we automatically collect the following types of information:
          </p>

          <div className="info-card">
            <h3 className="info-card-title">
              <svg viewBox="0 0 20 20" fill="currentColor"><path d="M3 12v3c0 1.657 3.134 3 7 3s7-1.343 7-3v-3c0 1.657-3.134 3-7 3s-7-1.343-7-3z"/><path d="M3 7v3c0 1.657 3.134 3 7 3s7-1.343 7-3V7c0 1.657-3.134 3-7 3S3 8.657 3 7z"/><path d="M17 5c0 1.657-3.134 3-7 3S3 6.657 3 5s3.134-3 7-3 7 1.343 7 3z"/></svg>
              Technical Information
            </h3>
            <ul>
              <li><strong>IP Address:</strong> Your Internet Protocol address (may be anonymized)</li>
              <li><strong>User Agent:</strong> Information about your browser and device</li>
              <li><strong>Device Information:</strong> Browser type, OS, device type, vendor</li>
              <li><strong>Screen Information:</strong> Screen dimensions, viewport size</li>
              <li><strong>Device Fingerprint:</strong> Unique identifier from browser characteristics</li>
            </ul>
          </div>

          <div className="info-card">
            <h3 className="info-card-title">
              <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"/></svg>
              Location Information (Optional)
            </h3>
            <ul>
              <li><strong>Country:</strong> Derived from IP address</li>
              <li><strong>Region/City:</strong> Geographic location (if enabled)</li>
              <li><strong>Timezone:</strong> Your timezone</li>
              <li><strong>ISP:</strong> Internet Service Provider</li>
            </ul>
            <div className="note">Location tracking can be disabled by the website owner.</div>
          </div>

          <div className="info-card">
            <h3 className="info-card-title">
              <svg viewBox="0 0 20 20" fill="currentColor"><path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"/></svg>
              Browsing Information
            </h3>
            <ul>
              <li><strong>Page URLs:</strong> Pages you visit</li>
              <li><strong>Referrer:</strong> Source website</li>
              <li><strong>UTM Parameters:</strong> Campaign tracking data</li>
              <li><strong>Scroll Depth:</strong> How far you scroll</li>
              <li><strong>Click Coordinates:</strong> Where you click</li>
            </ul>
          </div>

          <div className="info-card">
            <h3 className="info-card-title">
              <svg viewBox="0 0 20 20" fill="currentColor"><path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z"/><path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd"/></svg>
              E-commerce Information
            </h3>
            <ul>
              <li><strong>Product Information:</strong> IDs, names, quantities</li>
              <li><strong>Transaction Data:</strong> Purchase values, order IDs</li>
              <li><strong>Cart Information:</strong> Items added, cart values</li>
            </ul>
          </div>
        </section>

        <section className="section">
          <h2 className="section-title">2. Meta Pixel Integration</h2>
          <p className="section-intro">
            When Facebook Pixel integration is enabled, we send event data to Meta's Conversions API for advertising optimization.
          </p>

          <div className="info-card">
            <h3 className="info-card-title">
              <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd"/></svg>
              Events Sent to Meta
            </h3>
            <ul>
              <li>PageView, ViewContent, AddToCart</li>
              <li>InitiateCheckout, Purchase</li>
              <li>Lead, CompleteRegistration</li>
              <li>Custom events configured by website owner</li>
            </ul>
          </div>

          <div className="info-card">
            <h3 className="info-card-title">
              <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd"/></svg>
              Data Security
            </h3>
            <p>
              All personally identifiable information (PII) is hashed using SHA-256 encryption 
              before being sent to Meta, in accordance with Meta's data processing requirements.
            </p>
          </div>
        </section>

        <section className="section">
          <h2 className="section-title">3. How We Use Your Information</h2>
          <div className="info-card">
            <ul>
              <li><strong>Analytics:</strong> Provide insights about visitor behavior and traffic</li>
              <li><strong>Performance:</strong> Track website performance and identify issues</li>
              <li><strong>Conversion Tracking:</strong> Measure marketing campaign effectiveness</li>
              <li><strong>E-commerce Analytics:</strong> Analyze shopping behavior and patterns</li>
              <li><strong>Session Analysis:</strong> Understand user journeys</li>
            </ul>
          </div>
        </section>

        <section className="section">
          <h2 className="section-title">4. Data Storage & Security</h2>
          <div className="info-card">
            <p>
              All data is stored securely in our cloud infrastructure with industry-standard security measures:
            </p>
            <ul style={{marginTop: 16}}>
              <li>Encryption of data in transit using HTTPS/TLS</li>
              <li>Secure database storage with access controls</li>
              <li>Regular security audits and updates</li>
              <li>Hashing of sensitive information before transmission</li>
            </ul>
          </div>
        </section>

        <section className="section">
          <h2 className="section-title">5. Your Rights</h2>
          
          <div className="info-card">
            <h3 className="info-card-title">
              <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>
              Opt-Out Options
            </h3>
            <ul>
              <li>Disable JavaScript in your browser</li>
              <li>Use "Do Not Track" browser settings</li>
              <li>Clear browser cookies and storage</li>
              <li>Use privacy browser extensions</li>
            </ul>
          </div>

          <div className="info-card">
            <h3 className="info-card-title">
              <svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z"/></svg>
              GDPR Rights (EU)
            </h3>
            <ul>
              <li>Right to access, rectify, and erase your data</li>
              <li>Right to restrict processing</li>
              <li>Right to data portability</li>
              <li>Right to withdraw consent</li>
            </ul>
          </div>

          <div className="info-card">
            <h3 className="info-card-title">
              <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd"/></svg>
              CCPA Rights (California)
            </h3>
            <p>
              Right to know what information is collected, right to delete, and right to opt-out. 
              We do not sell personal information.
            </p>
          </div>
        </section>

        <section className="section">
          <h2 className="section-title">6. Contact Us</h2>
          <div className="contact-card">
            <h3>Pixel Tracker</h3>
            <p className="company">Warewe Consultancy Private Limited</p>
            <div>
              <a href="mailto:support@warewe.online" className="contact-link">
                <svg viewBox="0 0 20 20" fill="currentColor" style={{width: 18, height: 18}}><path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/><path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/></svg>
                support@warewe.online
              </a>
              <a href="https://pixelify.warewe.online" target="_blank" rel="noopener noreferrer" className="contact-link">
                <svg viewBox="0 0 20 20" fill="currentColor" style={{width: 18, height: 18}}><path fillRule="evenodd" d="M4.083 9h1.946c.089-1.546.383-2.97.837-4.118A6.004 6.004 0 004.083 9zM10 2a8 8 0 100 16 8 8 0 000-16zm0 2c-.076 0-.232.032-.465.262-.238.234-.497.623-.737 1.182-.389.907-.673 2.142-.766 3.556h3.936c-.093-1.414-.377-2.649-.766-3.556-.24-.56-.5-.948-.737-1.182C10.232 4.032 10.076 4 10 4zm3.971 5c-.089-1.546-.383-2.97-.837-4.118A6.004 6.004 0 0115.917 9h-1.946zm-2.003 2H8.032c.093 1.414.377 2.649.766 3.556.24.56.5.948.737 1.182.233.23.389.262.465.262.076 0 .232-.032.465-.262.238-.234.498-.623.737-1.182.389-.907.673-2.142.766-3.556zm1.166 4.118c.454-1.147.748-2.572.837-4.118h1.946a6.004 6.004 0 01-2.783 4.118zm-6.268 0C6.412 13.97 6.118 12.546 6.03 11H4.083a6.004 6.004 0 002.783 4.118z" clipRule="evenodd"/></svg>
                pixelify.warewe.online
              </a>
            </div>
          </div>
        </section>

        <section className="section">
          <h2 className="section-title">Additional Resources</h2>
          <div className="info-card">
            <ul className="resources-list">
              <li>
                <a href="https://www.facebook.com/privacy/explanation" target="_blank" rel="noopener noreferrer">
                  → Meta Privacy Policy
                </a>
              </li>
              <li>
                <a href="https://developers.facebook.com/docs/marketing-apis/conversions-api" target="_blank" rel="noopener noreferrer">
                  → Meta Conversions API Documentation
                </a>
              </li>
              <li>
                <a href="https://gdpr.eu/" target="_blank" rel="noopener noreferrer">
                  → GDPR Information
                </a>
              </li>
              <li>
                <a href="https://oag.ca.gov/privacy/ccpa" target="_blank" rel="noopener noreferrer">
                  → CCPA Information
                </a>
              </li>
            </ul>
          </div>
        </section>

        <footer className="footer-note">
          This Privacy Policy is effective as of January 2025 and applies to all users of Pixel Tracker services.
        </footer>
      </div>
    </div>
  );
}
