'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Guest, Message } from '@/types'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { timeAgo } from '@/lib/utils'

export default function GuestDetailPage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const [notes, setNotes] = useState('')
  const [notesSaved, setNotesSaved] = useState(false)

  const { data, isLoading } = useQuery<{ data: { guest: Guest; messages: Message[] } }>({
    queryKey: ['guest', id],
    queryFn: () => fetch(`/api/guests/${id}`).then(r => r.json()),
    select: d => { if (d.data?.guest?.notes && !notes) setNotes(d.data.guest.notes ?? ''); return d },
  })

  const notesMutation = useMutation({
    mutationFn: () =>
      fetch(`/api/guests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guest', id] })
      setNotesSaved(true)
      setTimeout(() => setNotesSaved(false), 2000)
    },
  })

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>

  const guest = data?.data?.guest
  const messages = data?.data?.messages ?? []

  if (!guest) return <p className="text-sm text-destructive">Guest not found.</p>

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{guest.name ?? guest.phone}</h1>
        <p className="text-muted-foreground">{guest.phone}</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="pt-4 text-center">
          <p className="text-2xl font-semibold tracking-tight">{guest.total_stays}</p>
          <p className="mt-1 text-xs text-muted-foreground">Total stays</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <p className="text-2xl font-semibold tracking-tight">{messages.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">Messages</p>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <p className="text-sm font-semibold uppercase">{guest.language ?? '—'}</p>
          <p className="mt-1 text-xs text-muted-foreground">Language</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Private notes about this guest…"
            rows={3}
          />
          <Button size="sm" onClick={() => notesMutation.mutate()} disabled={notesMutation.isPending}>
            {notesSaved ? 'Saved!' : 'Save notes'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Message history</CardTitle></CardHeader>
        <CardContent>
          {messages.length === 0 && <p className="text-sm text-muted-foreground">No messages yet.</p>}
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {messages.map(msg => (
              <div
                key={msg.id}
                className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-xs rounded-lg px-3 py-2 text-sm ${
                    msg.direction === 'outbound'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground'
                  }`}
                >
                  <p>{msg.content}</p>
                  <div className="mt-1 flex items-center gap-1">
                    <p className={`text-xs ${msg.direction === 'outbound' ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                      {timeAgo(msg.created_at)}
                    </p>
                    {msg.was_ai_reply && (
                      <Badge variant="secondary" className="text-xs h-4">AI</Badge>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
