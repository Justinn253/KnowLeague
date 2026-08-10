export type StaffChangelogEntry = {
  id: string;
  patch: string;
  /** ISO 8601 timestamp in UTC for when the patch was made. */
  timestamp: string;
  title: string;
  summary: string;
  details: readonly string[];
  impact: readonly string[];
  files: readonly string[];
  verification: readonly string[];
};

/**
 * Internal, version-controlled changelog entries. New impactful patches must
 * be appended with a precise UTC timestamp and operational/security detail.
 */
export const STAFF_CHANGELOG_ENTRIES: readonly StaffChangelogEntry[] = [
  {
    id: 'patch-2026-08-10-api-metrics',
    patch: '2026.08.10-api-metrics',
    timestamp: '2026-08-10T20:16:51.763Z',
    title: 'Added staff-only aggregate API metrics',
    summary: 'Added lightweight per-route API telemetry and a staff dashboard for troubleshooting request volume, errors, and slow responses without retaining request data.',
    details: [
      'Wrapped all 142 current app/api route files with withApiMetrics and assigned each handler a static route template, preserving Next.js dynamic segment names such as [id] and [code] instead of recording runtime values.',
      'Recorded only method, 2xx/3xx/4xx/5xx status class, one of five duration buckets, and an incrementing count in hourly Upstash Redis hashes under the versioned metrics prefix.',
      'Applied a 35-day Redis key expiration and limited staff reporting windows to a maximum of seven days so the operational dataset remains bounded.',
      'Added the staff API metrics endpoint and dashboard with one-hour, 24-hour, and seven-day windows, route totals, method counts, error totals, and 1-second-plus response counts.',
      'Marked every staff metrics response private and no-store, including successful responses and authentication/authorization errors, to prevent intermediary caching of operational data.',
      'Added explicit privacy messaging and implementation rules prohibiting storage or display of request bodies, query values, headers, tokens, IP addresses, user IDs, and raw dynamic identifiers.',
      'Metrics write failures are swallowed so telemetry cannot change the API response or make a product endpoint unavailable.',
    ],
    impact: [
      'Moderator and admin staff can open API metrics from the header or mobile Miscellaneous navigation controls.',
      'Unauthenticated users and non-staff accounts receive no metrics data from the staff endpoint.',
      'Applications using the existing Upstash Redis environment variables receive aggregate telemetry; environments without those variables show a staff-only not-configured state.',
    ],
    files: [
      'lib/api-metrics.ts',
      'app/api/staff/api-metrics/route.ts',
      'app/staff/api-metrics/page.tsx',
      'components/staff-api-metrics-screen.tsx',
      'components/app-header.tsx',
      'AGENTS.md',
      'all app/api/**/route.ts handler exports',
    ],
    verification: [
      'npm run typecheck passed after all route wrappers were applied.',
      'npm run check passed: lint completed with the repository\'s existing img-element warnings, typecheck passed, and 34 tests passed across 12 test files.',
    ],
  },
];
