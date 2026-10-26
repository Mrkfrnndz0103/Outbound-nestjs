import path from 'node:path'
import type { NextConfig } from 'next'

const projectRoot = path.resolve(__dirname, '..')

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
    resolveAlias: {
      '@': path.join(projectRoot, 'src'),
      '@/components/ui': path.join(projectRoot, '@/components/ui'),
      '@/hooks': path.join(projectRoot, '@/hooks'),
      '@/lib/utils': path.join(projectRoot, '@/lib/utils'),
    },
  },
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.join(projectRoot, 'src'),
      '@/components/ui': path.join(projectRoot, '@/components/ui'),
      '@/hooks': path.join(projectRoot, '@/hooks'),
      '@/lib/utils': path.join(projectRoot, '@/lib/utils'),
    }
    return config
  },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${process.env.NEST_API_URL ?? 'http://127.0.0.1:3001'}/api/:path*` }]
  },
}

export default nextConfig
