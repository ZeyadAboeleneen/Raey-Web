/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output — bundles the app for Node.js / IIS + iisnode on SmarterASP
  output: 'standalone',

  eslint:     { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors:  true },

  pageExtensions: ['tsx', 'ts', 'jsx', 'js', 'mjs'],

  experimental: {
    serverActions: {
      // Allow large image payloads (base64 data URLs)
      bodySizeLimit: '25mb',
    },
    // These native modules must NOT be bundled by webpack
    serverComponentsExternalPackages: ['mssql', 'sharp'],
  },

  images: {
    unoptimized: true,
    dangerouslyAllowSVG: true,
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      // Keep Cloudinary pattern — existing DB rows still reference Cloudinary URLs
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "via.placeholder.com" },
      { protocol: "https", hostname: "**" },
      { protocol: "http",  hostname: "**" },
    ],
    loader:           'default',
    deviceSizes:      [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes:       [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL:  60,
  },

  reactStrictMode:  true,
  swcMinify:        true,
  compress:         true,
  poweredByHeader:  false,
  generateEtags:    true,

  // NOTE: Cache-Control for /uploads/* is set inside
  //       app/uploads/[...path]/route.ts — no headers() entry needed here.

  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs:            false,
        net:           false,
        tls:           false,
        dns:           false,
        child_process: false,
      }
    }
    return config
  },
}

export default nextConfig
