'use client'

import { useQuery } from '@tanstack/react-query'
import { BookingWithRelations, EscalationWithRelations } from '@/types'
import { Card, CardContent } from '@/components/ui/card'
import { LinkButton } from '@/components/ui/button'
import { timeAgo } from '@/lib/utils'

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-3xl font-semibold tracking-tight">{value}</p>
        <p className="mt-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      </CardContent>
    </Card>
  )
}

export default function OverviewPage() {
  const today = new Date().toISOString().split('T')[0]

  const { data: bookingsData } = useQuery<{ data: BookingWithRelations[] }>({
    queryKey: ['bookings'],
    queryFn: () => fetch('/api/bookings').then(r => r.json()),
  })

  const { data: escalationsData } = useQuery<{ data: EscalationWithRelations[] }>({
    queryKey: ['escalations', 'open'],
    queryFn: () => fetch('/api/escalations?status=open').then(r => r.json()),
  })

  const bookings = bookingsData?.data ?? []
  const escalations = escalationsData?.data ?? []

  const activeToday = bookings.filter(b =>
    b.status === 'active' && b.check_in <= today && b.check_out >= today
  ).length

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Overview</h1>

      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Active bookings today" value={activeToday} />
        <StatCard label="Open escalations" value={escalations.length} />
        <StatCard label="Total bookings" value={bookings.length} />
        <StatCard label="Total guests" value={new Set(bookings.map(b => b.guest_id)).size} />
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Open escalations</h2>
          <LinkButton href="/inbox" variant="ghost" size="sm">View all →</LinkButton>
        </div>

        {escalations.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">No open escalations.</p>
        )}

        <div className="space-y-2">
          {escalations.slice(0, 5).map(esc => (
            <Card key={esc.id}>
              <CardContent className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {esc.guest.name ?? esc.guest.phone}
                    <span className="font-normal text-muted-foreground"> · {esc.apartment.name}</span>
                  </p>
                  <p className="truncate text-sm text-muted-foreground">&ldquo;{esc.guest_question}&rdquo;</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-muted-foreground">{timeAgo(esc.created_at)}</span>
                  <LinkButton href="/inbox" size="sm">Reply</LinkButton>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
