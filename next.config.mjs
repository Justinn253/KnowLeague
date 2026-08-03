const nextConfig = {
  reactStrictMode: true,
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
    ],
  },
};

export default nextConfig;
