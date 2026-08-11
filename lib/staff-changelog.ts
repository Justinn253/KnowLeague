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
  {
    id: 'patch-2026-08-10-lav-popularity-sharing-responsive',
    patch: '2026.08.10-lav-popularity-sharing-responsive',
    timestamp: '2026-08-10T21:36:50.0888194Z',
    title: 'Expanded League Account Viewer discovery and match sharing',
    summary: 'Added period-based popular-account rankings, official patch-note discovery, richer item tooltips, correct enemy-only rating summaries, shareable match links with deep-link scrolling, and a responsive match-history layout.',
    details: [
      'Removed the League Account Viewer card header Home control and added Most Popular Accounts and Patch Notes entries to the desktop LAV menu, mobile LAV menu, navigation drawer, and in-viewer tab navigation.',
      'Added a service-role-only daily search rollup and all-time aggregate table with an atomic record_riot_account_search RPC update, plus a bounded popularity RPC for day, seven-day, 30-day, and all-time top 10/25/50 results.',
      'Search counters now record successful viewer requests on memory-cache hits, durable snapshot hits, and fresh Riot loads; compressed profile snapshots continue to expire and scheduled-prune after 30 days of inactivity, while daily popularity rows are pruned after 400 days.',
      'Changed match-history Copy controls to Share controls with Web Share API support and clipboard fallback. Shared match URLs expand the target match and smoothly scroll it into view after the account data renders.',
      'Unknown queue matches no longer render the searched player position. Enemy-rank aggregation now explicitly excludes the searched player\'s team and the displayed weighted rank rounds upward into the displayed tier bucket, so three Challenger, one Grandmaster, and one Master enemies resolve to Challenger rather than Grandmaster.',
      'Extended Data Dragon item normalization with sanitized descriptions and short text, replacing native item title notes with keyboard-accessible custom hover/focus tooltips.',
      'Added a server-cached official League patch-note index endpoint and LAV tab; the UI lists discovered Riot releases and links to Riot for complete note content without duplicating long source articles.',
      'Reworked match participant rows and filter controls for small screens using responsive grid spans and shared AppSelectMenu controls while preserving desktop metrics and team sections.',
      'The new popularity migration was created locally and was not pushed to Supabase.',
    ],
    impact: [
      'Players can discover which accounts are currently searched most through KnowLeague and open a specific account directly from the ranking.',
      'Players sharing a match now get a true share action where supported, and recipients land at the shared match instead of the top of match history.',
      'Match history remains usable on narrow mobile screens, with item details available without browser-default hover notes.',
      'Search popularity retains one compact all-time aggregate per account/platform plus one compact row per account/platform/day; full profile payloads remain bounded by the existing 30-day snapshot retention policy.',
    ],
    files: [
      'components/riot-account-viewer.tsx',
      'components/app-header.tsx',
      'components/app-navigation-drawer.tsx',
      'lib/riot-account-viewer.ts',
      'app/api/riot-account/viewer/route.ts',
      'app/api/riot-account/popular/route.ts',
      'app/api/riot-account/patch-notes/route.ts',
      'supabase/migrations/112_riot_account_search_popularity.sql',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run typecheck passed.',
      'npm run lint passed with only the repository\'s existing img-element warnings in unrelated profile and Riftbound components.',
      'npm run test:run passed: 34 tests across 12 test files.',
      'git diff --check passed; only expected line-ending normalization warnings were reported by Git.',
    ],
  },
  {
    id: 'patch-2026-08-11-lav-standalone-discovery-pages',
    patch: '2026.08.11-lav-standalone-discovery-pages',
    timestamp: '2026-08-11T00:19:09.3826806Z',
    title: 'Moved LAV discovery views to standalone pages',
    summary: 'Separated Most Popular Accounts and Patch Notes from profile tabs and restored profile navigation to appear only while viewing an account.',
    details: [
      'Added /riot-account-viewer/popular and /riot-account-viewer/patch-notes pages with dedicated metadata and standalone responsive page shells.',
      'Moved the shared popularity and patch-note sections behind standalone page routes while preserving their existing API fetching, filters, official-source links, and fallback states.',
      'Removed both views from the ViewerTab union, tab definitions, URL tab validation, and profile content rendering.',
      'Restored the League Account Viewer profile tab navigation to render only when a Riot account profile is loaded.',
      'Updated desktop header menus, mobile header menus, and the navigation drawer to link directly to the new pages instead of profile query tabs.',
    ],
    impact: [
      'Players can open discovery and patch-note content without an account profile selected.',
      'Profile tabs now contain only Overview, Mastery Viewer, Match History, and Challenges.',
    ],
    files: [
      'app/riot-account-viewer/popular/page.tsx',
      'app/riot-account-viewer/patch-notes/page.tsx',
      'components/riot-account-viewer.tsx',
      'components/app-header.tsx',
      'components/app-navigation-drawer.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run typecheck passed.',
      'npm run lint passed with only the repository\'s existing img-element warnings in unrelated profile and Riftbound components.',
    ],
  },
  {
    id: 'patch-2026-08-11-lav-search-event-cache-tooltip-aer',
    patch: '2026.08.11-lav-search-event-cache-tooltip-aer',
    timestamp: '2026-08-11T00:49:26.7130289Z',
    title: 'Corrected LAV search events, item metadata, tooltips, and AER averaging',
    summary: 'Counted searches served from browser cache, made popularity failures visible, invalidated legacy item payloads, standardized LAV custom hover notes, and retained enemy-only AER without upward rounding.',
    details: [
      'Added a short-lived search-session dedupe key and POST /api/riot-account/search event path so browser sessionStorage hits are recorded as searches; viewer API hits use the same 30-second session/IP/account dedupe window to avoid duplicate counting from repeated requests.',
      'Added rate limiting and strict Riot ID/platform validation to the search-event route. Search-session identifiers are browser-scoped opaque values and are not stored in API metrics.',
      'Popularity RPC result parsing now accepts PostgreSQL bigint values returned as either JSON numbers or strings. Popularity database/RPC failures now return an explicit 503 setup message instead of silently rendering an empty ranking.',
      'Added item-detail freshness checks to browser session caches, server memory caches, and durable profile snapshots so legacy payloads without description/plaintext fields are refetched from Data Dragon.',
      'Replaced remaining native LAV title hover notes with the shared custom hover/focus tooltip treatment across AER, overview rankings, match metrics, champions, ranks, spells, runes, queue labels, actions, challenges, empty slots, and multikill badges.',
      'Kept AER restricted to participants on the opposing team while restoring ordinary weighted-average rank rounding.',
      'The Supabase popularity migration remains created locally and was not pushed.',
    ],
    impact: [
      'A search served from the browser profile cache now contributes to popularity, while rapid duplicate searches do not inflate counts.',
      'Users receive a visible setup error when popularity database objects are unavailable instead of a misleading empty state.',
      'Freshly loaded match data displays Data Dragon item descriptions and consistent custom hover notes throughout LAV.',
    ],
    files: [
      'components/riot-account-viewer.tsx',
      'lib/riot-account-viewer.ts',
      'app/api/riot-account/viewer/route.ts',
      'app/api/riot-account/popular/route.ts',
      'app/api/riot-account/search/route.ts',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run typecheck passed.',
      'npm run lint passed with only the repository\'s existing img-element warnings in unrelated profile and Riftbound components.',
    ],
  },
  {
    id: 'patch-2026-08-11-lav-profile-header-responsive-layout',
    patch: '2026.08.11-lav-profile-header-responsive-layout',
    timestamp: '2026-08-11T01:48:43.8886023Z',
    title: 'Stabilized the LAV profile header at responsive breakpoints',
    summary: 'Prevented the profile search controls from overlapping or allowing the Update action to escape the Riot ID field near the mobile/desktop breakpoint.',
    details: [
      'Changed the profile search grid to use a zero-minimum flexible Riot ID track and a bounded platform track, preserving explicit spacing before the Search action at narrower desktop widths.',
      'Made the Riot ID field wrapper and input explicitly block-level with min-width: 0 so the absolutely positioned Update control remains anchored inside the field instead of participating in layout flow.',
      'Made the profile summary card full-width below the desktop breakpoint and non-shrinking on larger layouts, while allowing the account title to truncate safely within the header row.',
      'Added whitespace and shrink protections to the Search action and min-width protection to the shared platform selector instance.',
    ],
    impact: [
      'Profile headers remain readable around tablet and narrow desktop widths without overlapping the platform selector, Search button, Update control, or last-updated timestamp.',
      'The mobile profile summary uses the available width without changing the account actions or search behavior.',
    ],
    files: [
      'components/riot-account-viewer.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint completed with the repository\'s existing img-element warnings, typecheck passed, and 34 tests passed across 12 test files.',
    ],
  },
  {
    id: 'patch-2026-08-11-lav-profile-header-normal-width-regression',
    patch: '2026.08.11-lav-profile-header-normal-width-regression',
    timestamp: '2026-08-11T16:42:08.3446656Z',
    title: 'Restored normal-width LAV header proportions',
    summary: 'Fixed the profile header regression where the Update control entered normal form flow and the custom platform selector overflowed into Search.',
    details: [
      'Removed the conflicting relative utility from absolutely positioned LAV controls; the Update action now uses a positioned wrapper for its custom hover note and remains anchored inside the Riot ID field.',
      'Restored the original large-screen form grid proportions of a flexible Riot ID field, 10rem platform selector, and auto-sized Search action.',
      'Applied min-width constraints to the LAV platform selector root and trigger so the custom AppSelectMenu truncates its selected label within the allocated column instead of expanding over Search.',
      'Removed the same relative/absolute conflict from the match champion-level badge so its responsive tooltip anchor remains positioned correctly.',
    ],
    impact: [
      'Normal-width profile headers retain the previous visual proportions while the existing stacked layout continues to reform below the large-screen breakpoint.',
      'The last-updated timestamp is no longer pushed underneath the Update control, and platform/Search controls remain separated.',
    ],
    files: [
      'components/riot-account-viewer.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint completed with the repository\'s existing img-element warnings, typecheck passed, and 34 tests passed across 12 test files.',
    ],
  },
  {
    id: 'patch-2026-08-11-lav-region-selector-fixed-width',
    patch: '2026.08.11-lav-region-selector-fixed-width',
    timestamp: '2026-08-11T16:46:06.6399447Z',
    title: 'Fixed LAV region selector width',
    summary: 'Reserved a fixed-width region selector column and allowed the Riot ID field to use the remaining header space.',
    details: [
      'Changed the large-screen profile search grid to use a minmax flexible Riot ID column, a fixed 12rem region selector column, and an auto-sized Search action.',
      'Applied a 12rem width to the LAV AppSelectMenu instance at the large-screen breakpoint while retaining the full-width stacked control below that breakpoint.',
      'The selected region label remains constrained within the fixed trigger instead of expanding into or overlapping the Search action.',
    ],
    impact: [
      'Region selection no longer changes the header geometry based on the selected option label length.',
      'The Riot ID search field becomes narrower as needed to preserve clean spacing between all controls.',
    ],
    files: [
      'components/riot-account-viewer.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint completed with the repository\'s existing img-element warnings, typecheck passed, and 34 tests passed across 12 test files.',
    ],
  },
  {
    id: 'patch-2026-08-11-lav-patch-note-details-search',
    patch: '2026.08.11-lav-patch-note-details-search',
    timestamp: '2026-08-11T17:16:49.6331297Z',
    title: 'Added cached patch-note details and change search',
    summary: 'Converted patch-note release rows into local detail views with official-source links, cached history navigation, and recent change search across champions, items, runes, systems, and game modes.',
    details: [
      'Normalized Riot release summaries into patch number, UTC publication date, article title, official URL, and safe article slug; the list now displays the requested patch/date/title format.',
      'Added /riot-account-viewer/patch-notes/[slug] with server-side cached article fetching, structured heading/paragraph/list extraction, a back-to-history control, and an official Riot patch-note button.',
      'Added a six-hour browser session cache for the patch history list so returning from a detail view does not issue another history API request; Riot listing and individual article fetches also use six-hour Next fetch revalidation.',
      'Added /riot-account-viewer/patch-notes/search and a rate-limited search API that checks the recent release set and returns matching section context and change excerpts for terms such as champions and items.',
      'The implementation does not persist full Riot article bodies in Supabase; detailed content is fetched on demand and served through public short-lived response caching.',
    ],
    impact: [
      'Users can read detailed patch changes inside KnowLeague while retaining a direct link to Riot as the official source.',
      'The patch history remains available through the back button without repeating the list request during the browser session cache lifetime.',
      'Users can search recent patch notes for specific champion, item, rune, system, and game-mode changes without manually opening each article.',
    ],
    files: [
      'lib/riot-account-viewer.ts',
      'components/riot-account-viewer.tsx',
      'app/api/riot-account/patch-notes/detail/route.ts',
      'app/api/riot-account/patch-notes/search/route.ts',
      'app/riot-account-viewer/patch-notes/[slug]/page.tsx',
      'app/riot-account-viewer/patch-notes/search/page.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run typecheck passed.',
      'Local patch-history API returned normalized 26.15 through 26.4 summaries.',
      'Local detail API returned Patch 26.15 with 377 parsed content blocks.',
      'Local search API returned matching Bel\'Veth and Riftmaker results across recent releases.',
      'npm run check passed: lint completed with the repository\'s existing img-element warnings, typecheck passed, and 34 tests passed across 12 test files.',
    ],
  },
  {
    id: 'patch-2026-08-11-lav-patch-search-inline-clear',
    patch: '2026.08.11-lav-patch-search-inline-clear',
    timestamp: '2026-08-11T17:38:42.2428522Z',
    title: 'Moved patch searching into the history screen',
    summary: 'Changed patch-note labels to use the full League of Legends Patch prefix and moved advanced change search inline with clear-and-restore behavior.',
    details: [
      'Patch release headings now begin with League of Legends Patch followed by the patch number, formatted UTC date, and article title.',
      'Added the change-search form directly to the main Patch Notes screen; successful results replace the release rows in place while the original history remains in the six-hour session cache.',
      'Added a Clear search action that clears the input, removes result cards and errors, and restores the cached patch release list without another history request.',
      'Changed the former standalone search route into a compatibility redirect to the main Patch Notes screen so there is only one user-facing search experience.',
    ],
    impact: [
      'Users can search and review targeted patch changes without navigating away from the patch history screen.',
      'Users can immediately return to the full release list with one clear action and no additional list API call.',
    ],
    files: [
      'components/riot-account-viewer.tsx',
      'app/riot-account-viewer/patch-notes/search/page.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run typecheck passed after the inline search and compatibility redirect changes.',
      'npm run check passed: lint completed with the repository\'s existing img-element warnings, typecheck passed, and 34 tests passed across 12 test files.',
    ],
  },
  {
    id: 'patch-2026-08-11-lav-title-and-runtime-optimization-pass',
    patch: '2026.08.11-lav-title-and-runtime-optimization-pass',
    timestamp: '2026-08-11T19:06:10.4773836Z',
    title: 'Restored patch release titles and optimized LAV delivery',
    summary: 'Restored Riot’s descriptive patch-release titles and reduced repeat parsing, duplicate requests, unnecessary image transformation work, and client-side patch-search races across the League Account Viewer.',
    details: [
      'Extended RiotPatchNoteSummary with a nullable descriptive title field parsed from the official release-list anchor while preserving normalized patch number, UTC publication date, article title, canonical href, and safe slug metadata. Patch list and search headings now render the descriptive release title after the requested League of Legends Patch/date prefix; the browser session-cache key was versioned so older incomplete summaries are not reused.',
      'Added bounded 15-minute server memoization and in-flight request deduplication for the Riot patch summary list and individual parsed article details, plus five-minute normalized-query memoization and in-flight deduplication for patch change searches. Existing six-hour Next fetch revalidation and short public response cache headers remain in place as the cross-instance cache layer.',
      'Kept the account-viewer response private and no-store, but removed client IP values from rate-limit and error telemetry payloads so API metrics remain aggregate-only. Profile analytics persistence is now best-effort and does not hold the primary Riot data response open.',
      'Converted the local LAV mastery crest and level-plate image elements to next/image with fixed dimensions, while retaining direct delivery for small immutable Data Dragon and CommunityDragon icons through the shared GameIconImage unoptimized contract. Added browser content-visibility for long patch detail bodies and abortable inline patch searches to prevent stale results and reduce offscreen rendering work.',
    ],
    impact: [
      'Patch history rows once again show Riot’s descriptive release tagline instead of repeating the generic “League of Legends Patch X Notes” label.',
      'Repeated patch history, detail, and search requests can reuse parsed server data without refetching or reparsing the same content within the bounded TTLs; concurrent requests for the same resource share one promise.',
      'LAV account payloads remain protected from shared HTTP caching, while non-sensitive patch-note content continues to use public caching. Small remote game icons avoid unnecessary Vercel transformation variants and local mastery assets now use the framework image pipeline.',
    ],
    files: [
      'lib/riot-account-viewer.ts',
      'components/riot-account-viewer.tsx',
      'app/api/riot-account/viewer/route.ts',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run typecheck passed after the title parser, patch caches, image conversion, telemetry, and client request-cancellation changes.',
      'Local patch-history API returned descriptive titles for Patch 26.15 through Patch 26.4; the first description contained proper U+2019 apostrophe and U+2026 ellipsis characters.',
      'Local Patch 26.15 detail API returned a null list description, the normalized article title, and 377 parsed content blocks.',
      'npm run check passed: lint completed with the repository\'s existing img-element warnings in profile/public-profile/Riftbound surfaces, typecheck passed, and 34 tests passed across 12 test files.',
    ],
  },
  {
    id: 'patch-2026-08-11-profile-achievement-social-auth-polish',
    patch: '2026.08.11-profile-achievement-social-auth-polish',
    timestamp: '2026-08-11T19:57:37.0589461Z',
    title: 'Polished profile requests, achievement notifications, and auth transitions',
    summary: 'Removed obsolete profile back controls, repositioned achievement toasts below the global header, added event-driven staff-grant notifications and request blocking, preserved safe post-login destinations, and gated the initial shell on auth resolution.',
    details: [
      'Removed the owner and visitor profile header back buttons while preserving the existing profile tab and navigation behavior.',
      'Moved achievement notifications below the 56px sticky header and added a user-scoped Supabase Realtime subscription for completed achievement rows, including staff-granted achievements; notification keys prevent duplicate local/Realtime toasts.',
      'Added the user_achievements Realtime publication migration without applying or pushing it to Supabase; row delivery remains restricted by the existing authenticated self-read policy.',
      'Added incoming friend-request controls beside Friends > Add Friend when requests exist, with accept, decline, profile-view, and block actions; the profile request popup remains available and now offers the same block behavior and profile chat-color/avatar presentation.',
      'Extended the friend dashboard requester projection with the profile fields required for consistent request styling, while reusing the existing authenticated block endpoint that cancels pending requests and removes friendships.',
      'Centralized session-storage return-path capture for login links, excluding login/reset/API and active-game routes; password, OAuth, and confirmed-email flows now return to the last eligible page or the home page fallback.',
      'Held the application shell behind an auth-resolution loading state until the shared Supabase initial session callback completes, preventing a transient logged-out header during first load.',
    ],
    impact: [
      'Users no longer see an obsolete profile back button, header-overlapped achievement toast, or transient logged-out account controls during initial session resolution.',
      'Online recipients see a staff-granted achievement toast through one filtered Realtime channel without periodic polling or additional request volume; the migration must be applied before production Realtime delivery is active.',
      'Users can process or block incoming friend requests from either the profile page or the global friends menu, and login returns them to eligible content such as the Riftbound community hub while avoiding active-game restoration.',
      'Staff retain the existing grant/revoke workflow; the change only adds recipient-side notification delivery and does not expose staff actions or service-role data to clients.',
    ],
    files: [
      'app/layout.tsx',
      'components/auth-screen.tsx',
      'components/achievement-toasts.tsx',
      'components/friends-widget.tsx',
      'components/global-actions.tsx',
      'components/profile-screen.tsx',
      'components/public-profile-screen.tsx',
      'lib/achievement-client.ts',
      'lib/auth-redirect.ts',
      'lib/friends.ts',
      'supabase/migrations/113_user_achievements_realtime.sql',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run typecheck passed.',
      'npm run lint passed with the repository\'s existing img-element warnings in profile/public-profile/Riftbound surfaces.',
      'npm run test:run passed: 34 tests across 12 test files.',
      'Supabase migration was created locally and was not pushed, as requested by the repository migration safety guidance.',
    ],
  },
  {
    id: 'patch-2026-08-11-profile-unblock-search-status',
    patch: '2026.08.11-profile-unblock-search-status',
    timestamp: '2026-08-11T20:17:49.8319260Z',
    title: 'Added profile unblocking and blocked-user search status',
    summary: 'Added an authenticated unblock action to the visitor profile menu and server-provided blocked indicators to Friends user search results.',
    details: [
      'Added DELETE /api/users/[id]/block with the same aggregate API metric route template as the existing block endpoint; it deletes only the authenticated viewer\'s block relationship and never accepts a blocker identity from the client.',
      'Extended public profile relationship data with blockedByViewer so the visitor menu shows Unblock User only when the current viewer owns the block; blocks created by the other user remain non-actionable.',
      'Added server-side blocked relationship lookup to friend candidate search and rendered a CircleSlash2 indicator beside blocked usernames, with blocked candidates no longer offering friend-request actions.',
      'Preserved the existing block cleanup behavior for friendships and pending requests; unblocking does not automatically recreate a friendship or prior request.',
    ],
    impact: [
      'Users can reverse their own profile blocks directly from the visitor-view triple-dot menu.',
      'Friends search clearly identifies blocked users and avoids presenting an Add Friend action that the block relationship would reject.',
      'The block direction is explicit in the profile response, preventing a user from being shown an unblock action for a block placed by someone else.',
    ],
    files: [
      'app/api/profile/public/[username]/route.ts',
      'app/api/users/[id]/block/route.ts',
      'components/friends-widget.tsx',
      'components/public-profile-screen.tsx',
      'lib/friends.ts',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint completed with the repository\'s existing img-element warnings, typecheck passed, and 34 tests passed across 12 test files.',
    ],
  },
  {
    id: 'patch-2026-08-11-compact-friend-request-popups',
    patch: '2026.08.11-compact-friend-request-popups',
    timestamp: '2026-08-11T20:23:44.3372061Z',
    title: 'Compacted incoming friend-request popups',
    summary: 'Changed profile and friends-menu incoming friend requests to single-line horizontal items and added explicit bounded scrolling for large request lists.',
    details: [
      'Converted each profile-page request item from a stacked name/actions layout to a non-wrapping horizontal row with compact requester identity and action controls.',
      'Converted each global friends-menu request item to the same single-line layout while retaining horizontal scrolling on narrow viewports instead of increasing item height.',
      'Added explicit max-height and vertical scrolling to the friends-menu incoming-request list, and tightened the profile request popup max-height while preserving vertical scrolling.',
    ],
    impact: [
      'Incoming requests consume substantially less vertical space and multiple requests no longer push the primary friends content down as quickly.',
      'Long request rows remain accessible on small screens through horizontal scrolling without causing the popup to overflow the viewport.',
    ],
    files: [
      'components/friends-widget.tsx',
      'components/profile-screen.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint completed with the repository\'s existing img-element warnings, typecheck passed, and 34 tests passed across 12 test files.',
    ],
  },
  {
    id: 'patch-2026-08-11-align-friend-request-actions',
    patch: '2026.08.11-align-friend-request-actions',
    timestamp: '2026-08-11T20:29:17.0437326Z',
    title: 'Aligned friend-request actions across menus',
    summary: 'Right-aligned incoming friend-request actions in both request surfaces and matched the profile request popup to the Friends menu styling.',
    details: [
      'Made requester identity content flexible and kept View, Accept, Decline, and Block controls in a non-wrapping action group aligned to the right edge of each request row.',
      'Updated the profile request popup to use the Friends menu amber request panel, heading, bounded request-list wrapper, row spacing, and matching control styles.',
      'Expanded the profile request popup width up to 42rem on larger screens so the complete single-line action group can remain visible while preserving viewport-bounded horizontal scrolling on narrow screens.',
    ],
    impact: [
      'The two incoming-request experiences now have consistent visual hierarchy and interaction placement.',
      'Requester names retain available flexible space while actions remain easy to scan and operate at the right side of each row.',
    ],
    files: [
      'components/friends-widget.tsx',
      'components/profile-screen.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint completed with the repository\'s existing img-element warnings, typecheck passed, and 34 tests passed across 12 test files.',
    ],
  },
  {
    id: 'patch-2026-08-11-neutral-profile-request-popup',
    patch: '2026.08.11-neutral-profile-request-popup',
    timestamp: '2026-08-11T20:31:47.4089188Z',
    title: 'Neutralized profile request popup styling',
    summary: 'Changed the profile-page incoming friend-request popup from amber styling to a solid dark panel with a neutral heading while leaving the Friends menu treatment unchanged.',
    details: [
      'Replaced the profile request popup amber border and translucent amber background with the standard solid slate panel and neutral border used by profile overlays.',
      'Changed the profile request section heading from amber text to neutral slate text; request rows and action controls remain consistent with the Friends menu.',
    ],
    impact: [
      'The profile request popup now has stronger contrast against the profile page and does not visually compete with the amber profile navigation state.',
      'The global Friends menu retains its existing amber request emphasis.',
    ],
    files: [
      'components/profile-screen.tsx',
      'lib/staff-changelog.ts',
    ],
    verification: [
      'npm run check passed: lint completed with the repository\'s existing img-element warnings, typecheck passed, and 34 tests passed across 12 test files.',
    ],
  },
];
