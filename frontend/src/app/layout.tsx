import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'SOC 5 Outbound · Operations Login',
  description: 'SOC 5 Outbound — Operations Management System secure login.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f4f5f4',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>
}
