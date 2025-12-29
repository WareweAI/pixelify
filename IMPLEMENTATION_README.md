# Implementing Custom Event Tracking System (Like Omega Pixel)

This guide provides a complete implementation roadmap for building a custom event tracking system similar to Pixelify's custom events functionality. This system allows server-side event tracking that bypasses adblockers and provides flexible event management.

## Overview

The custom event tracking system consists of:
- **Dashboard Interface**: Admin panel for creating/managing events
- **Database Schema**: Storage for event configurations and tracking data
- **API Endpoints**: Server-side event processing and management
- **Theme Integration**: Client-side event triggering and data collection
- **Analytics Engine**: Event logging and reporting

## Architecture Components

### 1. Database Schema

Create the following database tables/models:

```sql
-- Custom Events Configuration
CREATE TABLE custom_events (
  id SERIAL PRIMARY KEY,
  app_id VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL, -- unique identifier (e.g., 'wishlist_add')
  display_name VARCHAR(255) NOT NULL, -- human readable (e.g., 'Add to Wishlist')
  description TEXT,
  meta_event_name VARCHAR(255), -- Facebook standard event mapping
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Triggering configuration
  page_type VARCHAR(50) DEFAULT 'all', -- all, product, cart, checkout, etc.
  page_url TEXT, -- for custom page type
  event_type VARCHAR(50) DEFAULT 'click', -- click, submit, change, focus, scroll, load
  selector TEXT, -- CSS selector for auto-triggering
  event_data JSONB, -- default data to send with event

  UNIQUE(app_id, name)
);

-- Event Tracking Logs
CREATE TABLE events (
  id SERIAL PRIMARY KEY,
  app_id VARCHAR(255) NOT NULL,
  event_name VARCHAR(255) NOT NULL,
  url TEXT,
  user_agent TEXT,
  ip_address INET,
  country VARCHAR(100),
  city VARCHAR(100),
  device_type VARCHAR(50),
  browser VARCHAR(50),
  session_id VARCHAR(255),
  fingerprint VARCHAR(255),
  utm_source VARCHAR(255),
  utm_medium VARCHAR(255),
  utm_campaign VARCHAR(255),
  value DECIMAL(10,2),
  currency VARCHAR(3),
  custom_data JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_app_event (app_id, event_name),
  INDEX idx_created_at (created_at)
);

-- App Settings
CREATE TABLE app_settings (
  id SERIAL PRIMARY KEY,
  app_id VARCHAR(255) UNIQUE NOT NULL,
  pixel_id VARCHAR(255),
  access_token TEXT,
  token_expires_at TIMESTAMP,
  custom_events_enabled BOOLEAN DEFAULT true,
  track_pageviews BOOLEAN DEFAULT true,
  track_clicks BOOLEAN DEFAULT true,
  record_location BOOLEAN DEFAULT true
);
```

### 2. Backend API Implementation

#### Event Configuration API

```javascript
// GET /api/custom-events?appId={appId}
app.get('/api/custom-events', async (req, res) => {
  const { appId } = req.query;

  try {
    const events = await db.query(`
      SELECT id, name, display_name, selector, event_type, page_type, page_url,
             event_data as data
      FROM custom_events
      WHERE app_id = $1 AND is_active = true
      ORDER BY created_at DESC
    `, [appId]);

    res.json({
      success: true,
      events: events.rows
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// POST /api/custom-events (Create/Update/Delete)
app.post('/api/custom-events', async (req, res) => {
  const { action, appId, eventData } = req.body;

  try {
    if (action === 'create') {
      // Validate unique name
      const existing = await db.query(
        'SELECT id FROM custom_events WHERE app_id = $1 AND name = $2',
        [appId, eventData.name.toLowerCase().replace(/\s+/g, '_')]
      );

      if (existing.rows.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Event name already exists'
        });
      }

        INSERT INTO custom_events
        (app_id, name, display_name, description, page_type, page_url,
         event_type, selector, meta_event_name, event_data, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true)
      `, [
