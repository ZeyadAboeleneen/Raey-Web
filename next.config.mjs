/** @type {import('next').NextConfig} */
const nextConfig = {
  // ==== أهم إضافة ====
  output: 'standalone', // دي اللي تخلي Next.js يحزم المشروع بشكل يشتغل على السيرفر كتطبيق Node.js

  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  pageExtensions: ['tsx', 'ts', 'jsx', 'js', 'mjs'],
  
  experimental: {
    serverActions: {
      bodySizeLimit: '25mb',
    },
  },

  images: {
    // Enabling image optimization for better performance (requires sharp, which is installed)
    unoptimized: false,
    dangerouslyAllowSVG: true,
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "via.placeholder.com" },
      { protocol: "https", hostname: "jwbonsxidrbmuiopjafj.supabase.co" },
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "**" },
    ],
    loader: 'default',
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },

  reactStrictMode: true,
  swcMinify: true,
  
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        dns: false,
        child_process: false,
      }
    }
    return config
  },
}

export default nextConfig