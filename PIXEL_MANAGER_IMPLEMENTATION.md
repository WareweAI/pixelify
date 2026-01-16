# Facebook Pixel Manager Implementation

## Overview
Created a comprehensive Facebook Pixel Manager page at `/app/pixel` that matches the provided screenshot, with table layout, server-side API toggle, and test event functionality using Facebook's Conversions API.

## New Files Created

### 1. `app/routes/app.pixel.tsx`
Main pixel manager page with:
- **Table Layout**: Displays all pixels with columns for Status, Pixel ID, Title, Pages, Server-Side API, Test Server Events, and Action
- **Search Functionality**: Filter pixels by title or pixel ID
- **Server-Side API Toggle**: Enable/disable Conversions API per pixel
- **Test Event Modal**: Send test events to Facebook for verification
- **Responsive Design**: Matches the screenshot layout

### 2. `app/routes/api.pixel.ts`
Backend API handling:
- **Toggle Server-Side API**: Enable/disable metaPixelEnabled setting
- **Send Test Events**: Send test events to Facebook Conversions API
- **Email Hashing**: SHA256 hashing for user data privacy
- **Error Handling**: Comprehensive error messages and validation

## Features Implemented

### Table Columns
1. **Status**: Badge showing Active/Inactive
2. **Pixel ID**: Display app ID
3. **Title**: Pixel name
4. **Pages**: Badge showing tracking scope (All pages/Selected pages/Excluded pages)
5. **Server-Side API**: Toggle switch for enabling Conversions API
6. **Test Server Events**: "Set up" button (only visible when server-side API is enabled and test code exists)
7. **Action**: Edit button linking to dashboard

### Test Event Functionality
Implements Facebook's Conversions API test event format:
```javascript
{
  data: [{
    event_name: "TestEvent",
    event_time: 1768550138,
    event_id: "test_12345",
    action_source: "website",
    user_data: {
      em: "hashed_email",
      client_ip_address: "254.254.254.254",
      client_user_agent: "Mozilla/5.0..."
    }
  }],
  test_event_code: "TEST37808"
}
```

### API Endpoint
**POST** `/api/pixel`

#### Actions:
1. **toggle-server-side**
   - Parameters: `pixelId`, `enabled`
   - Toggles `metaPixelEnabled` in AppSettings

2. **send-test-event**
   - Parameters: `pixelId`, `eventName`, `email`
   - Sends test event to Facebook Conversions API
   - Returns success/failure with trace ID

## How to Use

### Access the Page
Navigate to `/app/pixel` in your app

### Send Test Events
1. Ensure pixel has:
   - Meta Pixel ID configured
   - Access Token configured
   - Test Event Code set
   - Server-Side API enabled

2. Click "Set up" button in Test Server Events column
3. Enter event name (e.g., "TestEvent")
4. Enter test email (will be hashed)
5. Click "Send Test Event"
6. Verify in Meta Events Manager → Test Events tab

### Verify Test Events
1. Go to [Meta Events Manager](https://business.facebook.com/events_manager2)
2. Select your pixel
3. Click "Test Events" tab
4. Enter your test event code (e.g., TEST37808)
5. You should see the test event appear within seconds

## Facebook Conversions API Integration

### Endpoint
```
POST https://graph.facebook.com/v18.0/{pixel-id}/events
```

### Required Fields
- `event_name`: Name of the event
- `event_time`: Unix timestamp
- `event_id`: Unique event identifier
- `action_source`: "website"
- `user_data`: Object with hashed user information
- `test_event_code`: Test code from Meta Events Manager
- `access_token`: Conversions API access token

### User Data Hashing
Email addresses are hashed using SHA256 before sending:
```typescript
const hashedEmail = crypto
  .createHash("sha256")
  .update(email.toLowerCase().trim())
  .digest("hex");
```

## Database Schema

Uses existing `AppSettings` model fields:
- `metaPixelId`: Facebook Pixel ID (Dataset ID)
- `metaAccessToken`: Conversions API access token
- `metaPixelEnabled`: Server-side API toggle
- `metaTestEventCode`: Test event code for verification
- `trackingPages`: Page tracking scope (all/selected/excluded)

## UI Components

### Table Features
- Search bar for filtering
- Status badges (Active/Inactive)
- Toggle switches for server-side API
- Action buttons (Edit, Set up)
- Pagination controls
- Responsive layout

### Modal Features
- Test event configuration
- Real-time feedback
- Success/error banners
- Help text and instructions
- Loading states

## Error Handling

### Validation
- Checks for required fields (pixel ID, access token, test code)
- Validates user permissions
- Handles missing configurations

### API Errors
- Facebook API error messages
- Network error handling
- Trace ID logging for debugging

## Testing

### Manual Testing
1. Create a pixel in dashboard
2. Configure Meta Pixel ID and Access Token
3. Generate test event code in Meta Events Manager
4. Navigate to `/app/pixel`
5. Enable Server-Side API toggle
6. Click "Set up" and send test event
7. Verify in Meta Events Manager

### Expected Response
```json
{
  "testResult": {
    "success": true,
    "message": "✅ Test event sent successfully! Events received: 1. Trace ID: ABC123..."
  }
}
```

## Next Steps

1. **Add Test Event Code Field**: Add UI in dashboard to set `metaTestEventCode`
2. **Batch Test Events**: Support sending multiple test events
3. **Event Templates**: Pre-configured test events (Purchase, AddToCart, etc.)
4. **Event History**: Log test events sent
5. **Advanced User Data**: Support more user data fields (phone, address, etc.)

## Links

- [Facebook Conversions API Documentation](https://developers.facebook.com/docs/marketing-api/conversions-api)
- [Test Events Guide](https://developers.facebook.com/docs/marketing-api/conversions-api/using-the-api#test-events)
- [Meta Events Manager](https://business.facebook.com/events_manager2)

## Files Modified

- Created: `app/routes/app.pixel.tsx`
- Created: `app/routes/api.pixel.ts`
- Created: `PIXEL_MANAGER_IMPLEMENTATION.md`
