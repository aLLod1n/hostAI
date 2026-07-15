'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { Guest } from '@/types'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate } from '@/lib/utils'

export default function GuestsPage() {
  const { data, isLoading } = useQuery<{ data: Guest[] }>({
    queryKey: ['guests'],
    queryFn: () => fetch('/api/guests').then(r => r.json()),
  })

  const guests = data?.data ?? []

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Guests</h1>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && guests.length === 0 && (
        <div className="rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          No guests yet. They appear here after their first message.
        </div>
      )}

      {guests.length > 0 && (
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Language</TableHead>
                <TableHead>Total stays</TableHead>
                <TableHead>Last seen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {guests.map(g => (
                <TableRow key={g.id} className="cursor-pointer">
                  <TableCell>
                    <Link href={`/guests/${g.id}`} className="font-medium hover:underline">
                      {g.name ?? '—'}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{g.phone}</TableCell>
                  <TableCell className="text-xs text-muted-foreground uppercase">{g.language ?? '—'}</TableCell>
                  <TableCell>{g.total_stays}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(g.last_seen)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
