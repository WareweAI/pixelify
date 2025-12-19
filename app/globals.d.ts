declare module "*.css";

// Type declarations for Shopify App Bridge web components
import "react";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      's-app-nav': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
      's-link': React.DetailedHTMLProps<React.AnchorHTMLAttributes<HTMLAnchorElement> & {
        href: string;
      }, HTMLAnchorElement>;
    }
  }
}