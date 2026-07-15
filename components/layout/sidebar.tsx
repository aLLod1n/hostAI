'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  Building2,
  CalendarDays,
  Inbox,
  Users,
  BarChart3,
  LogOut,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

const navItems = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/apartments', label: 'Apartments', icon: Building2 },
  { href: '/bookings', label: 'Bookings', icon: CalendarDays },
  { href: '/inbox', label: 'Inbox', icon: Inbox },
  { href: '/guests', label: 'Guests', icon: Users },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex size-7 items-center justify-center rounded-lg bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground">
          G
        </div>
        <span className="font-heading text-base font-semibold text-sidebar-foreground">
          GuestBot
        </span>
      </div>

      <nav className="flex-1 space-y-0.5 px-3">
        {navItems.map(item => {
          const active = pathname === item.href
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-sidebar-primary/10 font-medium text-sidebar-primary'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              )}
            >
              <Icon className="size-4" strokeWidth={2} />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 text-sidebar-foreground/70 hover:text-sidebar-foreground"
          onClick={handleSignOut}
        >
          <LogOut className="size-4" strokeWidth={2} />
          Sign out
        </Button>
      </div>
    </aside>
  )
}
