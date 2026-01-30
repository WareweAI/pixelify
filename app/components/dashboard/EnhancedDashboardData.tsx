
import { useEffect } from 'react';
import { useDashboardData } from '~/hooks/useDashboardData';
import { useEnhancedFacebookConnection } from '~/hooks/useEnhancedFacebookConnection';
import { Banner, Spinner, BlockStack } from '@shopify/polaris';

interface EnhancedDashboardDataProps {
  children: (data: {
    dashboardData: any;
    isLoading: boolean;
    error: string | null;
    facebookState: any;
    refresh: () => Promise<void>;
    disconnect: () => Promise<boolean>;
  }) => React.ReactNode;
}

export function EnhancedDashboardData({ children }: EnhancedDashboardDataProps) {
  const {
    data: dashboardData,
    isLoading: isDashboardLoading,
    error: dashboardError,
    refresh: refreshDashboard,
  } = useDashboardData();

  const {
    state: facebookState,
    disconnect,
  } = useEnhancedFacebookConnection();

  // Property 9: Server Validation on Startup
  useEffect(() => {
    console.log('[EnhancedDashboardData] Dashboard data loaded from:', dashboardData?.dataSource);
    console.log('[EnhancedDashboardData] Facebook connection validated:', facebookState.serverValidated);
  }, [dashboardData, facebookState]);

  const isLoading = isDashboardLoading || facebookState.isLoading;
  const error = dashboardError || facebookState.error;

  if (isLoading && !dashboardData) {
    return (
      <BlockStack gap="400">
        <Spinner size="large" />
      </BlockStack>
    );
  }

  if (error && !dashboardData) {
    return (
      <Banner tone="critical" title="Error loading dashboard">
        {error}
      </Banner>
    );
  }

  return (
    <>
      {children({
        dashboardData,
        isLoading,
        error,
        facebookState,
        refresh: refreshDashboard,
        disconnect,
      })}
    </>
  );
}
