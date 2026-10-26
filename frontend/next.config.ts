import path from 'node:path'
import type { NextConfig } from 'next'

const projectRoot = __dirname
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_ANON_KEY

const nextConfig: NextConfig = {
  output: 'standalone',
  env: {
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: supabasePublishableKey,
  },
  pageExtensions: ['tsx', 'ts'],
  turbopack: {
    root: projectRoot,
    resolveAlias: { '@': path.join(projectRoot, 'src') },
  },
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.join(projectRoot, 'src'),
    }
    return config
  },
  async rewrites() {
    const api = process.env.NEST_API_URL ?? 'http://api-nest:3001'
    return [
      { source: '/api/:path*', destination: `${api}/api/:path*` },
      { source: '/auth/seatalk/callback', destination: `${api}/auth/seatalk/callback` },
      { source: '/up', destination: `${api}/up` },
    ]
  },
}

export default nextConfig
