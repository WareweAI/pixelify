# Navigation Setup Documentation

## Overview
Your app now features a beautiful Shopify Polaris-style navigation system that appears on all pages (except landing, docs, and auth pages).

## What Was Added

### 1. TopNavigation Component (`app/components/TopNavigation.tsx`)
A clean, professional navigation bar with:
- **Shopify Polaris design** - Matches Shopify's design system
- **Logo with gradient** - Pixelify branding
- **Icon-based navigation** - Using Shopify Polaris icons
- **Active state highlighting** - Blue background for current page
- **Responsive mobile menu** - Hamburger menu for mobile devices
- **Smooth hover effects** - Professional interactions

### 2. GlobalLayout Component (`app/components/GlobalLayout.tsx`)
Smart layout wrapper that:
- Shows navigation on app pages
- Hides navigation on public pages (landing, docs, privacy)
- Automatically detects route and applies correct layout

### 3. Navigation Items
Current menu includes:
- Dashboard (HomeIcon)
- Pixels (ViewIcon)
- Custom Events (StarIcon)
- Event Logs (OrderIcon)
- Catalog (ProductIcon)
- Analytics (ChartVerticalIcon)
- Settings (SettingsIcon)

### 4. Styling Files
- `app/styles/top-navigation.css` - Minimal navigation styles
- `app/styles/app-layout.css` - Shopify Polaris-inspired layout utilities

### 5. Updated Files
- `app/root.tsx` - Integrated GlobalLayout wrapper
- `app/routes/app.tsx` - Kept sidebar navigation for Shopify embedded app

## Features

### Design Highlights
- **Clean white background** with subtle borders
- **Shopify Polaris color scheme** (#2c6ecb blue, #f1f7ff light blue)
- **Icon + text navigation** for clarity
- **Responsive design** - Desktop and mobile optimized
- **Smooth transitions** on hover and active states
- **Accessible** - Proper focus states and ARIA labels

### Responsive Behavior
- **Desktop (768px+)**: Horizontal navigation with all items visible
- **Mobile (<768px)**: Hamburger menu with dropdown navigation
- **Auto-scrolling**: Horizontal scroll on smaller desktops if needed

## Customization

### Add/Remove Navigation Items
Edit `navItems` array in `app/components/TopNavigation.tsx`:

```tsx
const navItems: NavItem[] = [
  {
    href: "/app/your-page",
    label: "Your Page",
    icon: YourIcon, // Import from @shopify/polaris-icons
    badge: "New", // Optional badge
  },
];
```

### Change Colors
Update inline styles in `TopNavigation.tsx`:
- Active state: `#2c6ecb` (blue) and `#f1f7ff` (light blue)
- Hover state: `#f6f6f7` (light gray)
- Text colors: `#202223` (dark) and `#6d7175` (gray)

### Modify Logo
Edit the logo section in `TopNavigation.tsx`:
```tsx
<div style={{ /* logo container */ }}>
  <div style={{ /* gradient box */ }}>P</div>
  <span>Pixelify</span>
</div>
```

### Add More Icons
Import from `@shopify/polaris-icons`:
```tsx
import {
  HomeIcon,
  CustomersIcon,
  // ... more icons
} from "@shopify/polaris-icons";
```

## Layout Structure

```
┌─────────────────────────────────────────────┐
│  Top Navigation Bar                         │
│  [Logo] [Nav Items...] [Mobile Menu]       │
├─────────────────────────────────────────────┤
│                                             │
│  Sidebar Nav (Shopify App Bridge)          │
│  ┌───────────────────────────────────────┐ │
│  │                                       │ │
│  │  Page Content (Outlet)                │ │
│  │                                       │ │
│  └───────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

## Pages with Navigation

Navigation appears on:
- All `/app/*` routes (Dashboard, Pixels, Events, etc.)
- Any other app pages you create

Navigation is hidden on:
- `/` (Landing page)
- `/docs` (Documentation)
- `/privacy-policy` (Privacy page)
- `/auth/*` (Authentication pages)
- `/api/*` (API routes)
- `/apps/*` (App proxy routes)
- `/webhooks/*` (Webhook handlers)

## Browser Support
- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Accessibility
- Keyboard navigation support
- Focus visible states
- ARIA labels on buttons
- Semantic HTML structure

Enjoy your new Shopify Polaris-style navigation! 🎉
