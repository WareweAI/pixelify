/**
 * Enhanced Disconnect Button Component
 * 
 * Provides complete Facebook disconnect with proper UI feedback.
 * 
 * Task 8: Implement enhanced disconnect UI handling
 * Requirements: 8.1, 8.2, 8.3, 8.4
 * Property 6: UI State Consistency and Feedback
 * Property 12: Disconnect Error Recovery
 */

import { useState, useCallback } from 'react';
import { Button, Banner, Modal, TextContainer, BlockStack } from '@shopify/polaris';
import { useEnhancedFacebookConnection } from '~/hooks/useEnhancedFacebookConnection';
import { stateSynchronization } from '~/services/stateSynchronization.service';

interface EnhancedDisconnectButtonProps {
  onDisconnectComplete?: () => void;
  variant?: 'primary' | 'plain';
}

export function EnhancedDisconnectButton({
  onDisconnectComplete,
  variant = 'plain',
}: EnhancedDisconnectButtonProps) {
  const { state, disconnect } = useEnhancedFacebookConnection();
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);
  const [showSuccessBanner, setShowSuccessBanner] = useState(false);

  // Property 6: UI State Consistency and Feedback
  const handleDisconnect = useCallback(async () => {
    setIsDisconnecting(true);
    setDisconnectError(null);

    try {
      console.log('[EnhancedDisconnectButton] Starting disconnect...');

      // Property 2: Complete Disconnect Cleanup
      const success = await disconnect();

      if (success) {
        console.log('[EnhancedDisconnectButton] Disconnect successful');
        
        // Requirement 8.2: Display success confirmation
        setShowSuccessBanner(true);
        setShowConfirmModal(false);

        // Requirement 8.3: Immediately hide Facebook-connected UI elements
        // This is handled by the state synchronization service
        stateSynchronization.notifyFacebookConnectionChange(false);

        // Auto-hide success banner after 3 seconds
        setTimeout(() => {
          setShowSuccessBanner(false);
        }, 3000);

        if (onDisconnectComplete) {
          onDisconnectComplete();
        }
      } else {
        throw new Error('Disconnect failed');
      }
    } catch (error) {
      // Property 12: Disconnect Error Recovery
      const errorMessage = error instanceof Error ? error.message : 'Failed to disconnect';
      console.error('[EnhancedDisconnectButton] Disconnect error:', errorMessage);
      
      // Requirement 8.4: Display error message and allow retry
      setDisconnectError(errorMessage);
    } finally {
      setIsDisconnecting(false);
    }
  }, [disconnect, onDisconnectComplete]);

  // Don't show button if not connected
  if (!state.isConnected) {
    return null;
  }

  return (
    <>
      {/* Success Banner */}
      {showSuccessBanner && (
        <Banner
          tone="success"
          title="Facebook disconnected successfully"
          onDismiss={() => setShowSuccessBanner(false)}
        >
          All Facebook data has been removed from your account.
        </Banner>
      )}

      {/* Error Banner with Retry */}
      {disconnectError && (
        <Banner
          tone="critical"
          title="Disconnect failed"
          action={{
            content: 'Retry',
            onAction: handleDisconnect,
          }}
          onDismiss={() => setDisconnectError(null)}
        >
          {disconnectError}
        </Banner>
      )}

      {/* Disconnect Button */}
      <Button
        variant={variant}
        tone="critical"
        onClick={() => setShowConfirmModal(true)}
        loading={isDisconnecting}
        disabled={isDisconnecting}
      >
        Disconnect Facebook
      </Button>

      {/* Confirmation Modal */}
      <Modal
        open={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        title="Disconnect from Facebook?"
        primaryAction={{
          content: 'Disconnect',
          destructive: true,
          loading: isDisconnecting,
          onAction: handleDisconnect,
        }}
        secondaryActions={[
          {
            content: 'Cancel',
            onAction: () => setShowConfirmModal(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <TextContainer>
              <p>
                This will remove all Facebook connection data from your account, including:
              </p>
              <ul>
                <li>Access tokens</li>
                <li>User information</li>
                <li>Pixel configurations</li>
                <li>Cached data</li>
              </ul>
              <p>
                You'll need to reconnect to Facebook to use Facebook Pixel features again.
              </p>
            </TextContainer>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </>
  );
}
