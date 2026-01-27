import { checkDatabaseHealth } from "./db.server";
import { getShopifyInstance } from "./shopify.server";

// Connection pool metrics
interface ConnectionMetrics {
  timestamp: number;
  databaseConnected: boolean;
  sessionHealthy: boolean;
  circuitBreakerOpen: boolean;
  queueSize: number;
  responseTime: number;
  errorCount: number;
}

class DatabaseMonitor {
  private metrics: ConnectionMetrics[] = [];
  private maxMetrics = 100; // Keep last 100 metrics
  private monitoringInterval: NodeJS.Timeout | null = null;
  private errorCount = 0;
  private readonly monitoringIntervalMs = 30000; // 30 seconds

  start() {
    if (this.monitoringInterval) {
      return; // Already monitoring
    }

    console.log("[DB Monitor] Starting database connection monitoring");
    
    this.monitoringInterval = setInterval(async () => {
      await this.collectMetrics();
    }, this.monitoringIntervalMs);

    // Collect initial metrics
    this.collectMetrics();
  }

  stop() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      console.log("[DB Monitor] Stopped database connection monitoring");
    }
  }

  private async collectMetrics() {
    const startTime = Date.now();
    
    try {
      // Check database health
      const dbHealth = await checkDatabaseHealth();
      
      // Check session storage health
      let sessionHealthy = false;
      let circuitBreakerOpen = false;
      let queueSize = 0;
      
      try {
        const shopify = getShopifyInstance();
        const sessionStorage = shopify.sessionStorage;
        if (sessionStorage && typeof sessionStorage.healthCheck === 'function') {
          const sessionHealth = await sessionStorage.healthCheck();
          sessionHealthy = sessionHealth.healthy;
          circuitBreakerOpen = sessionHealth.circuitBreaker?.isOpen || false;
          queueSize = sessionHealth.queueSize || 0;
        } else {
          sessionHealthy = true;
        }
      } catch (sessionError) {
        sessionHealthy = false;
        circuitBreakerOpen = true;
        this.errorCount++;
      }

      const responseTime = Date.now() - startTime;
      
      const metric: ConnectionMetrics = {
        timestamp: Date.now(),
        databaseConnected: dbHealth.connected,
        sessionHealthy,
        circuitBreakerOpen,
        queueSize,
        responseTime,
        errorCount: this.errorCount,
      };

      this.addMetric(metric);

      // Log warnings for unhealthy states
      if (!dbHealth.connected) {
        console.error("[DB Monitor] ⚠️ Database connection lost");
      }
      
      if (!sessionHealthy) {
        console.error("[DB Monitor] ⚠️ Session storage unhealthy");
      }
      
      if (circuitBreakerOpen) {
        console.error("[DB Monitor] ⚠️ Circuit breaker is open");
      }
      
      if (queueSize > 10) {
        console.warn(`[DB Monitor] ⚠️ High session queue size: ${queueSize}`);
      }
      
      if (responseTime > 1000) {
        console.warn(`[DB Monitor] ⚠️ High response time: ${responseTime}ms`);
      }

    } catch (error) {
      this.errorCount++;
      console.error("[DB Monitor] Error collecting metrics:", error);
      
      const metric: ConnectionMetrics = {
        timestamp: Date.now(),
        databaseConnected: false,
        sessionHealthy: false,
        circuitBreakerOpen: true,
        queueSize: 0,
        responseTime: Date.now() - startTime,
        errorCount: this.errorCount,
      };
      
      this.addMetric(metric);
    }
  }

  private addMetric(metric: ConnectionMetrics) {
    this.metrics.push(metric);
    
    // Keep only the last N metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift();
    }
  }

  getMetrics(): ConnectionMetrics[] {
    return [...this.metrics];
  }

  getLatestMetric(): ConnectionMetrics | null {
    return this.metrics.length > 0 ? this.metrics[this.metrics.length - 1] : null;
  }

  getHealthSummary() {
    const latest = this.getLatestMetric();
    if (!latest) {
      return {
        status: 'unknown',
        databaseConnected: false,
        sessionHealthy: false,
        circuitBreakerOpen: false,
        averageResponseTime: 0,
        errorRate: 0,
      };
    }

    const recentMetrics = this.metrics.slice(-10); // Last 10 metrics
    const averageResponseTime = recentMetrics.reduce((sum, m) => sum + m.responseTime, 0) / recentMetrics.length;
    const errorRate = recentMetrics.filter(m => !m.databaseConnected || !m.sessionHealthy).length / recentMetrics.length;

    return {
      status: latest.databaseConnected && latest.sessionHealthy ? 'healthy' : 'unhealthy',
      databaseConnected: latest.databaseConnected,
      sessionHealthy: latest.sessionHealthy,
      circuitBreakerOpen: latest.circuitBreakerOpen,
      averageResponseTime: Math.round(averageResponseTime),
      errorRate: Math.round(errorRate * 100),
      queueSize: latest.queueSize,
      totalErrors: latest.errorCount,
    };
  }

  resetErrors() {
    this.errorCount = 0;
    console.log("[DB Monitor] Error count reset");
  }
}

// Global monitor instance
export const dbMonitor = new DatabaseMonitor();

// Auto-start monitoring in production
if (process.env.NODE_ENV === "production") {
  dbMonitor.start();
}

// Graceful shutdown
process.on('SIGTERM', () => {
  dbMonitor.stop();
});

process.on('SIGINT', () => {
  dbMonitor.stop();
});
