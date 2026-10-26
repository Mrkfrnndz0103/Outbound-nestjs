import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'SOC 5 Outbound · Operations Login',
  description: 'SOC 5 Outbound — Operations Management System secure login.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>
}
