/**
 * Per-endpoint request limits for anonymous game inputs.
 *
 * These stay outside App Router route modules because route modules may only
 * export supported Next.js configuration and HTTP methods.
 */
export const CARVING_REVELATION_DRAW_MAX_BODY_BYTES = 128 * 1024;
export const CARVING_REVELATION_MAX_DRAW_POINTS = 160;
export const SKINDLE_STATS_MAX_BODY_BYTES = 256 * 1024;
export const SPLASH_SCRAMBLE_STATS_MAX_BODY_BYTES = 8_192;
