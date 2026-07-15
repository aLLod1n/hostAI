'use client'

import { useQuery } from '@tanstack/react-query'
import { BookingWithRelations, EscalationWithRelations, Apartment } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export default function AnalyticsPage() {
  const { data: bookingsData } = useQuery<{ data: BookingWithRelations[] }>({
    queryKey: ['bookings'],
    queryFn: () => fetch('/api/bookings').then(r => r.json()),
  })
  const { data: escalationsData } = useQuery<{ data: EscalationWithRelations[] }>({
    queryKey: ['escalations', 'all'],
    queryFn: () => fetch('/api/escalations').then(r => r.json()),
  })
  const { data: aptData } = useQuery<{ data: Apartment[] }>({
    queryKey: ['apartments'],
    queryFn: () => fetch('/api/apartments').then(r => r.json()),
  })

  const bookings = bookingsData?.data ?? []
  const escalations = escalationsData?.data ?? []
  const apartments = aptData?.data ?? []

  const totalEscalations = escalations.length
  const resolvedEscalations = escalations.filter(e => e.status === 'resolved').length

  // Per-apartment stats
  const aptStats = apartments.map(apt => {
    const aptEscalations = escalations.filter(e => e.apartment_id === apt.id)
    const aptBookings = bookings.filter(b => b.apartment_id === apt.id)
    const resolved = aptEscalations.filter(e => e.status === 'resolved').length
    const total = aptEscalations.length
    return { apt, total, resolved, aptBookings: aptBookings.length }
  })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <Card><CardContent className="pt-5">
          <p className="text-3xl font-semibold tracking-tight">{bookings.length}</p>
          <p className="mt-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Total bookings</p>
        </CardContent></Card>
        <Card><CardContent className="pt-5">
          <p className="text-3xl font-semibold tracking-tight">{totalEscalations}</p>
          <p className="mt-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Total escalations</p>
        </CardContent></Card>
        <Card><CardContent className="pt-5">
          <p className="text-3xl font-semibold tracking-tight">
            {totalEscalations === 0 ? '—' : `${Math.round((resolvedEscalations / totalEscalations) * 100)}%`}
          </p>
          <p className="mt-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Escalation resolve rate</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Per-apartment breakdown</CardTitle></CardHeader>
        <CardContent>
          {apartments.length === 0
            ? <p className="text-sm text-muted-foreground">No apartments yet.</p>
            : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Apartment</TableHead>
                    <TableHead>Bookings</TableHead>
                    <TableHead>Escalations</TableHead>
                    <TableHead>Resolved</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aptStats.map(({ apt, total, resolved, aptBookings }) => (
                    <TableRow key={apt.id}>
                      <TableCell className="font-medium">{apt.name}</TableCell>
                      <TableCell>{aptBookings}</TableCell>
                      <TableCell>{total}</TableCell>
                      <TableCell>{resolved}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )
          }
        </CardContent>
      </Card>
    </div>
  )
}
