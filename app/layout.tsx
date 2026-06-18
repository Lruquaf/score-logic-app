import type { Metadata, Viewport } from 'next'

import { Analytics } from '@/components/Analytics'
import { QueryProvider } from '@/components/providers/QueryProvider'

import '@/app/globals.css'

export const metadata: Metadata = {
  title: {
    default: 'ScoreLogic',
    template: '%s | ScoreLogic'
  },
  description: 'Football deduction puzzles built from final standings and hidden scorelines.',
  applicationName: 'ScoreLogic',
  openGraph: {
    title: 'ScoreLogic',
    description: 'Football deduction puzzles built from final standings and hidden scorelines.',
    type: 'website',
    siteName: 'ScoreLogic'
  }
}

export const viewport: Viewport = {
  themeColor: '#2F6F45'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="scorelogic-shell min-h-screen text-[var(--ink)] antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-[var(--radius-md)] focus:bg-[var(--field)] focus:px-4 focus:py-3 focus:text-sm focus:font-bold focus:text-white"
        >
          Skip to content
        </a>
        <QueryProvider>
          <div id="main-content">{children}</div>
        </QueryProvider>
        <Analytics />
      </body>
    </html>
  )
}
