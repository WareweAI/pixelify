/**
 * Client-safe code generation utilities
 * These functions don't import server-only modules
 */

export function generateThemeIntegrationCode(
  pixelId: string,
  baseUrl: string,
  options: {
    autoTrackPageviews?: boolean;
    autoTrackClicks?: boolean;
    autoTrackScroll?: boolean;
    customEvents?: Array<{
      name: string;
      selector: string;
      eventType: string;
    }>;
  } = {}
): string {
  return `<!-- Pixel Analytics -->
<script>
  window.PIXEL_APP_ID = "${pixelId}";
  window.PIXEL_CONFIG = {
    autoTrackPageviews: ${options.autoTrackPageviews ?? true},
    autoTrackClicks: ${options.autoTrackClicks ?? true},
    autoTrackScroll: ${options.autoTrackScroll ?? false},
    customEvents: ${JSON.stringify(options.customEvents || [])}
  };
</script>
<script async src="${baseUrl}/pixel.js?id=${pixelId}"></script>

<!-- Theme Editor Helper -->
<script>
  // Enable drag & drop event creation in theme editor
  if (window.Shopify && window.Shopify.designMode) {
    document.addEventListener('DOMContentLoaded', function() {
      // Add visual indicators for trackable elements
      document.querySelectorAll('[data-pixel-event]').forEach(function(el) {
        el.style.outline = '2px dashed #00ff00';
        el.title = 'Pixel Event: ' + el.getAttribute('data-pixel-event');
      });
    });
  }
</script>`;
}

// Provide a default export to avoid bundler interop issues where the named
// export might be tree-shaken or imported as default in SSR.
export default generateThemeIntegrationCode;
