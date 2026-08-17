const nextConfig = {
  reactStrictMode: true,
  async headers() {
    const headers = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=()' },
      { key: 'Content-Security-Policy', value: "base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'" },
      { key: 'X-DNS-Prefetch-Control', value: 'on' },
      { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
    ];

    if (process.env.NODE_ENV === 'production') {
      headers.push({ key: 'Strict-Transport-Security', value: 'max-age=31536000' });
    }

    return [{ source: '/(.*)', headers }];
  },
  images: {
    // Limit responsive variants to the widths used by the application’s cards,
    // boards, and icons. This bounds the number of Vercel image cache keys.
    deviceSizes: [360, 640, 960, 1280],
    imageSizes: [32, 48, 64, 96, 160, 240, 320],
    formats: ['image/webp'],
    // Riot/CDN assets and hashed Riftbound catalogue assets are effectively
    // immutable. A month keeps normal revisits from re-transforming them.
    minimumCacheTTL: 60 * 60 * 24 * 31,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'ddragon.leagueoflegends.com',
        pathname: '/cdn/**',
      },
      {
        protocol: 'https',
        hostname: 'raw.communitydragon.org',
        pathname: '/latest/**',
      },
      {
        protocol: 'https',
        hostname: 'cmsassets.rgpub.io',
        pathname: '/sanity/images/**',
      },
      {
        protocol: 'https',
        hostname: 'tcgplayer-cdn.tcgplayer.com',
        pathname: '/product/**',
      },
      {
        protocol: 'https',
        hostname: 'openrift.app',
        pathname: '/media/cards/**',
      },
    ],
  },
};

export default nextConfig;
