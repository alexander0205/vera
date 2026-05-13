'use client';

import { useReportWebVitals } from 'next/web-vitals';

/**
 * Reports Core Web Vitals to /api/analytics/vitals in production.
 * In dev/preview it logs to console only.
 * Mounted near the app root so it captures metrics across all routes.
 */
export function WebVitals() {
  useReportWebVitals((metric) => {
    if (process.env.NODE_ENV !== 'production') {
      // Dev: just log; avoid noisy network requests
      // eslint-disable-next-line no-console
      console.log('[web-vitals]', metric.name, metric.value);
      return;
    }
    try {
      fetch('/api/analytics/vitals', {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(metric),
      }).catch(() => {});
    } catch {
      // Ignore — never break the app for telemetry
    }
  });

  return null;
}
