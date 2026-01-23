import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";

// Global hydration fix for browser-specific attributes like fdprocessedid
const removeBrowserAttributes = () => {
  // Remove fdprocessedid and other browser-added attributes
  const attributesToRemove = ['fdprocessedid'];
  
  attributesToRemove.forEach(attr => {
    const elements = document.querySelectorAll(`[${attr}]`);
    elements.forEach((el) => {
      if (el instanceof HTMLElement) {
        el.removeAttribute(attr);
      }
    });
  });
};

// Start hydration and clean up browser attributes
hydrateRoot(document, <HydratedRouter />);

// Remove browser attributes after hydration
if (typeof window !== 'undefined') {
  // Run immediately and also after a short delay to catch dynamically added elements
  removeBrowserAttributes();
  setTimeout(removeBrowserAttributes, 100);
  setTimeout(removeBrowserAttributes, 500);
  
  // Also observe for DOM changes to catch late-added attributes
  const observer = new MutationObserver((mutations) => {
    mutations.forEach(() => {
      removeBrowserAttributes();
    });
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['fdprocessedid']
  });
}
