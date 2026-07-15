'use client'

import { useQuery } from '@tanstack/react-query'
import { Apartment } from '@/types'
import { LinkButton } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function ApartmentsPage() {
  const { data, isLoading } = useQuery<{ data: Apartment[] }>({
    queryKey: ['apartments'],
    queryFn: () => fetch('/api/apartments').then(r => r.json()),
  })

  const apartments = data?.data ?? []

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Apartments</h1>
        <LinkButton href="/apartments/new">+ Add apartment</LinkButton>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!isLoading && apartments.length === 0 && (
        <div className="rounded-lg border border-dashed py-16 text-center">
          <p className="text-muted-foreground">No apartments yet.</p>
          <LinkButton href="/apartments/new" className="mt-4">Add your first apartment</LinkButton>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {apartments.map(apt => (
          <Card key={apt.id} className="transition-shadow hover:shadow-md">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <CardTitle className="text-base">{apt.name}</CardTitle>
                <Badge variant={apt.is_active ? 'default' : 'secondary'}>
                  {apt.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              {apt.city && <p className="text-sm text-muted-foreground">{apt.city}</p>}
            </CardHeader>
            <CardContent>
              <div className="mb-4 space-y-1 text-sm text-muted-foreground">
                {apt.wifi_name && <p>WiFi: {apt.wifi_name}</p>}
                {apt.whatsapp_number && <p>WA: {apt.whatsapp_number}</p>}
              </div>
              <div className="flex gap-2">
                <LinkButton href={`/apartments/${apt.id}`} size="sm" variant="outline">Edit</LinkButton>
                <LinkButton href={`/apartments/${apt.id}/knowledge-base`} size="sm" variant="outline">Knowledge base</LinkButton>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
