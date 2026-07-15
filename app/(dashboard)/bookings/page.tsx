'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { BookingWithRelations } from '@/types'
import { Button, LinkButton } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate } from '@/lib/utils'

const STATUS_COLORS: Record<string, 'default' | 'secondary' | 'destructive'> = {
  active: 'default',
  completed: 'secondary',
  cancelled: 'destructive',
}

export default function BookingsPage() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery<{ data: BookingWithRelations[] }>({
    queryKey: ['bookings'],
    queryFn: () => fetch('/api/bookings').then(r => r.json()),
  })

  const cancelMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/bookings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bookings'] }),
  })

  const bookings = data?.data ?? []

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Bookings</h1>
        <LinkButton href="/bookings/new">+ New booking</LinkButton>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!isLoading && bookings.length === 0 && (
        <div className="rounded-lg border border-dashed py-16 text-center text-muted-foreground">No bookings yet.</div>
      )}

      {bookings.length > 0 && (
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Guest</TableHead>
                <TableHead>Apartment</TableHead>
                <TableHead>Check-in</TableHead>
                <TableHead>Check-out</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bookings.map(b => (
                <TableRow key={b.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{b.guest.name ?? '—'}</p>
                      <p className="text-xs text-muted-foreground">{b.guest.phone}</p>
                    </div>
                  </TableCell>
                  <TableCell>{b.apartment.name}</TableCell>
                  <TableCell>{formatDate(b.check_in)}</TableCell>
                  <TableCell>{formatDate(b.check_out)}</TableCell>
                  <TableCell className="capitalize">{b.source ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_COLORS[b.status] ?? 'secondary'}>{b.status}</Badge>
                  </TableCell>
                  <TableCell>
                    {b.status === 'active' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => cancelMutation.mutate(b.id)}
                        disabled={cancelMutation.isPending}
                      >
                        Cancel
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
