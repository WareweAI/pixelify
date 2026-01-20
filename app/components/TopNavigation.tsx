import { useState, memo } from "react";
import { useLocation, Link } from "react-router";

// Inline SVG icons - reduces bundle size
const HomeIcon = () => <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />;
const ChartVerticalIcon = () => <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />;
const SettingsIcon = () => <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />;
const OrderIcon = () => <path fillRule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm2 10a1 1 0 10-2 0v3a1 1 0 102 0v-3zm2-3a1 1 0 011 1v5a1 1 0 11-2 0v-5a1 1 0 011-1zm4-1a1 1 0 10-2 0v7a1 1 0 102 0V8z" clipRule="evenodd" />;
const ProductIcon = () => <path fillRule="evenodd" d="M10 2a4 4 0 00-4 4v1H5a1 1 0 00-.994.89l-1 9A1 1 0 004 18h12a1 1 0 00.994-1.11l-1-9A1 1 0 0015 7h-1V6a4 4 0 00-4-4zm2 5V6a2 2 0 10-4 0v1h4zm-6 3a1 1 0 112 0 1 1 0 01-2 0zm7-1a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" />;
const ViewIcon = () => (
  <>
    <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
    <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
  </>
);
const StarIcon = () => <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />;
const MenuIcon = () => <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />;
const XIcon = () => <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />;

interface NavItem {
  href: string;
  label: string;
  icon: any;
  badge?: string;
}

const navItems: NavItem[] = [
  {
    href: "/app/dashboard",
    label: "Dashboard",
    icon: HomeIcon,
  },
  {
    href: "/app/pixels",
    label: "Pixels",
    icon: ViewIcon,
  },
  {
    href: "/app/custom-events",
    label: "Custom Events",
    icon: StarIcon,
  },
  {
    href: "/app/events",
    label: "Event Logs",
    icon: OrderIcon,
  },
  {
    href: "/app/catalog",
    label: "Catalog",
    icon: ProductIcon,
  },
  {
    href: "/app/analytics",
    label: "Analytics",
    icon: ChartVerticalIcon,
  },
  {
    href: "/app/settings",
    label: "Settings",
    icon: SettingsIcon,
  },
];

// Memoize navigation to prevent unnecessary re-renders
export const TopNavigation = memo(function TopNavigation() {
  const location = useLocation();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const isActive = (href: string) => {
    return location.pathname === href || location.pathname.startsWith(href + "/");
  };

  return (
    <>
      {/* Desktop Navbar */}
      <nav
        style={{
          backgroundColor: "#ffffff",
          borderBottom: "1px solid #e1e3e5",
          position: "sticky",
          top: 0,
          zIndex: 100,
          width: "100%",
          maxWidth: "100vw",
          overflow: "hidden",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "100%",
            margin: "0 auto",
            padding: "0 16px",
            boxSizing: "border-box",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              height: "56px",
              width: "100%",
              maxWidth: "100%",
              overflow: "hidden",
            }}
          >
            {/* Logo */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontWeight: "700",
                fontSize: "20px",
                color: "#202223",
                flexShrink: 0,
                minWidth: "140px",
              }}
            >
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                  borderRadius: "8px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#ffffff",
                  fontSize: "18px",
                  fontWeight: "bold",
                  flexShrink: 0,
                }}
              >
                P
              </div>
              <span style={{ whiteSpace: "nowrap" }}>Pixelify</span>
            </div>

            {/* Desktop Navigation */}
            <div
              style={{
                display: "flex",
                gap: "4px",
                flex: 1,
                justifyContent: "center",
                overflow: "hidden",
                padding: "0 16px",
                minWidth: 0,
              }}
              className="desktop-nav"
            >
              <div
                style={{
                  display: "flex",
                  gap: "4px",
                  alignItems: "center",
                  overflow: "auto",
                  scrollbarWidth: "none",
                  msOverflowStyle: "none",
                  maxWidth: "100%",
                }}
              >
                {navItems.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      to={item.href}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "8px 12px",
                        borderRadius: "8px",
                        fontSize: "14px",
                        fontWeight: active ? "600" : "500",
                        color: active ? "#2c6ecb" : "#6d7175",
                        backgroundColor: active ? "#f1f7ff" : "transparent",
                        textDecoration: "none",
                        transition: "all 0.2s ease",
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                      }}
                      onMouseEnter={(e) => {
                        if (!active) {
                          e.currentTarget.style.backgroundColor = "#f6f6f7";
                          e.currentTarget.style.color = "#202223";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!active) {
                          e.currentTarget.style.backgroundColor = "transparent";
                          e.currentTarget.style.color = "#6d7175";
                        }
                      }}
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        style={{ flexShrink: 0 }}
                      >
                        <item.icon />
                      </svg>
                      <span>{item.label}</span>
                      {item.badge && (
                        <span
                          style={{
                            backgroundColor: "#ff6b6b",
                            color: "#ffffff",
                            fontSize: "11px",
                            fontWeight: "600",
                            padding: "2px 6px",
                            borderRadius: "10px",
                            flexShrink: 0,
                          }}
                        >
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMobileOpen(!isMobileOpen)}
              style={{
                display: "none",
                alignItems: "center",
                justifyContent: "center",
                width: "40px",
                height: "40px",
                borderRadius: "8px",
                border: "none",
                backgroundColor: "transparent",
                cursor: "pointer",
                color: "#202223",
                flexShrink: 0,
              }}
              className="mobile-menu-btn"
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#f6f6f7";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                {isMobileOpen ? <XIcon /> : <MenuIcon />}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMobileOpen && (
          <div
            style={{
              display: "block",
              borderTop: "1px solid #e1e3e5",
              backgroundColor: "#ffffff",
              padding: "8px",
              width: "100%",
              boxSizing: "border-box",
            }}
            className="mobile-nav"
          >
            {navItems.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  onClick={() => setIsMobileOpen(false)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "12px 16px",
                    borderRadius: "8px",
                    fontSize: "14px",
                    fontWeight: active ? "600" : "500",
                    color: active ? "#2c6ecb" : "#202223",
                    backgroundColor: active ? "#f1f7ff" : "transparent",
                    textDecoration: "none",
                    marginBottom: "4px",
                  }}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <item.icon />
                  </svg>
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {item.badge && (
                    <span
                      style={{
                        backgroundColor: "#ff6b6b",
                        color: "#ffffff",
                        fontSize: "11px",
                        fontWeight: "600",
                        padding: "2px 6px",
                        borderRadius: "10px",
                      }}
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </nav>


    </>
  );
});
