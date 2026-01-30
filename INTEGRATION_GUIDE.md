# Integration Guide: Using New Services in Dashboard

## Problem
The current dashboard uses localStorage directly, causing:
- Stale data display
- Incomplete Facebook disconnection
- Race conditions with multiple data fetches

## Solution
Use the new services that implement server-first architecture.

## Quick Integration Steps

### Step 1: Replace Direct localStorage Access

**BEFORE (Current Code):**
```typescript
// ❌ Direct localStorage access
const savedToken = localStorage.getItem("facebook_access_token");
localStorage.setItem("facebook_access_token", token);
```

**AFTER (Using Service):**
```typescript
// ✅ Use localStorage service
import { localStorageService } from '~/services/localStorage.service';

const savedData = localStorageService.getFacebookData();
localStorageService.setFacebookData({ accessToken: token });
```

### Step 2: Replace Data Fetching

**BEFORE (Current Code):**
```typescript
// ❌ Direct fetch without deduplication
const response = await fetch('/api/dashboard');
const data = await response.json();
```

**AFTER (Using Service):**
```typescript
// ✅ Use API client with deduplication
import { apiClient } from '~/services/api.client';

const data = await apiClient.getDashboardData();
```

### Step 3: Replace Disconnect Logic

**BEFORE (Current Code):**
```typescript
// ❌ Incomplete disconnect
fetcher.submit({ intent: "disconnect-facebook" }, { method: "POST" });
// localStorage not cleared!
```

**AFTER (Using Service):**
```typescript
// ✅ Complete disconnect with cleanup
import { disconnectFacebook } from '~/utils/facebookDisconnect.client';

await disconnectFacebook(fetcher, {
  onSuccess: () => {
    console.log('Disconnected successfully');
    // UI automatically updates via state synchronization
  },
  onError: (error) => {
    console.error('Disconnect failed:', error);
  }
});
```

### Step 4: Use Enhanced Hooks (Recommended)

**Option A: Minimal Changes - Use Hooks in Existing Component**
```typescript
import { useDashboardData } from '~/hooks/useDashboardData';
import { useEnhancedFacebookConnection } from '~/hooks/useEnhancedFacebookConnection';

export default function DashboardPage() {
  // Replace existing state with hooks
  const { data, isLoading, error, refresh } = useDashboardData();
  const { state: fbState, disconnect } = useEnhancedFacebookConnection();
  
  // Use data.apps, data.stats, etc.
  const apps = data?.apps || [];
  const isConnectedToFacebook = fbState.isConnected;
  
  // Rest of your component...
}
```

**Option B: Wrapper Component (Gradual Migration)**
```typescript
import { EnhancedDashboardData } from '~/components/dashboard/EnhancedDashboardData';

export default function DashboardPage() {
  return (
    <EnhancedDashboardData>
      {({ dashboardData, facebookState, disconnect }) => (
        // Your existing JSX here
        // Use dashboardData instead of local state
        <YourExistingDashboard 
          data={dashboardData}
          isConnected={facebookState.isConnected}
          onDisconnect={disconnect}
        />
      )}
    </EnhancedDashboardData>
  );
}
```

## Specific Fixes for Dashboard Issues

### Fix 1: Pixels Not Displaying
**Root Cause:** localStorage checked before server, showing stale data

**Fix:**
```typescript
// Replace this pattern:
useEffect(() => {
  const loadData = async () => {
    const response = await fetch('/api/dashboard');
    const data = await response.json();
    setDashboardData(data);
  };
  loadData();
}, []);

// With this:
const { data, isLoading } = useDashboardData();
// Data automatically comes from server first!
```

### Fix 2: Incomplete Facebook Disconnect
**Root Cause:** Server tokens cleared but localStorage remains

**Fix:**
```typescript
// Replace disconnect button handler:
const handleDisconnect = async () => {
  await disconnectFacebook(fetcher, {
    onSuccess: () => {
      // All data cleared automatically
      setShowSuccessMessage(true);
    }
  });
};

// Or use the component:
<EnhancedDisconnectButton 
  onDisconnectComplete={() => {
    // Refresh dashboard data
    refresh();
  }}
/>
```

### Fix 3: Continuous Data Fetching
**Root Cause:** localStorage changes trigger re-fetches

**Fix:**
```typescript
// The dataFetcher service automatically deduplicates requests
// No code changes needed - just use apiClient instead of fetch
```

## Migration Strategy

### Phase 1: Add Services (✅ DONE)
- Core services created
- Tests passing (65/65)

### Phase 2: Gradual Integration (CURRENT)
1. Start with disconnect functionality (highest impact)
2. Replace localStorage access with service
3. Replace fetch calls with apiClient
4. Add enhanced hooks gradually

### Phase 3: Full Migration
1. Remove all direct localStorage access
2. Remove duplicate data fetching logic
3. Use state synchronization for cross-component updates

## Testing Your Integration

```typescript
// Test 1: Verify server-first data
console.log('Data source:', data?.dataSource); // Should be 'server'

// Test 2: Verify disconnect cleanup
await disconnect();
console.log('localStorage cleared:', !localStorageService.getFacebookData());

// Test 3: Verify no duplicate requests
// Open Network tab - should see only 1 request even with multiple components
```

## Need Help?

All services are documented with JSDoc comments. Check:
- `app/services/dataFetcher.service.ts` - Data fetching
- `app/services/facebookConnection.service.ts` - Connection management
- `app/services/localStorage.service.ts` - Storage operations
- `app/hooks/useEnhancedFacebookConnection.ts` - React integration
