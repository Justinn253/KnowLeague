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
 * Internal, version-controlled changelog entries. Keep this list empty until
 * the first future impactful patch is ready to be documented.
 */
export const STAFF_CHANGELOG_ENTRIES: readonly StaffChangelogEntry[] = [];
