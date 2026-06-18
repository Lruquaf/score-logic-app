import type { ReactNode } from 'react'

import { Footer } from '@/components/layout/Footer'
import { Header } from '@/components/layout/Header'

export default function GameLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen">
      <Header />
      <div className="page-container-wide flex flex-1 flex-col pb-10 pt-5">
        {children}
      </div>
      <Footer />
    </div>
  )
}
