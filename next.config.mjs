const nextConfig = {
  reactStrictMode: true,
  images: {
    // Limit responsive variants to the widths used by the application’s cards,
    // boards, and icons. This bounds the number of Vercel image cache keys.
    deviceSizes: [360, 640, 960, 1280],
    imageSizes: [32, 48, 64, 96, 160, 240, 320],
    formats: ['image/webp'],
    // Riot/CDN assets are versioned or generated catalog assets. A week avoids
    // repeat transformations while keeping catalogue refreshes reasonably fresh.
    minimumCacheTTL: 60 * 60 * 24 * 7,
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
    ],
  },
};

export default nextConfig;
