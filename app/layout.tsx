import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'

const geist = Geist({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'GuestBot — WhatsApp AI for Short-Term Rental Hosts',
  description: 'Automate your guest communication with AI',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={geist.className}>
      <body className="min-h-screen bg-background antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
