'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { EscalationWithRelations } from '@/types'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { timeAgo } from '@/lib/utils'

export default function InboxPage() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'open' | 'resolved' | 'all'>('open')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [replies, setReplies] = useState<Record<string, string>>({})
  const [saveToKb, setSaveToKb] = useState<Record<string, boolean>>({})

  const statusParam = tab === 'all' ? '' : `?status=${tab}`
  const { data, isLoading } = useQuery<{ data: EscalationWithRelations[] }>({
    queryKey: ['escalations', tab],
    queryFn: () => fetch(`/api/escalations${statusParam}`).then(r => r.json()),
  })

  const replyMutation = useMutation({
    mutationFn: ({ id, replyText, save }: { id: string; replyText: string; save: boolean }) =>
      fetch(`/api/escalations/${id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ replyText, saveToKb: save }),
      }).then(r => r.json()),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['escalations'] })
      setExpandedId(null)
      setReplies(prev => { const next = { ...prev }; delete next[variables.id]; return next })
    },
  })

  const escalations = data?.data ?? []

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Inbox</h1>

      <Tabs value={tab} onValueChange={v => setTab(v as typeof tab)} className="mb-4">
        <TabsList>
          <TabsTrigger value="open">Open</TabsTrigger>
          <TabsTrigger value="resolved">Resolved</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && escalations.length === 0 && (
        <div className="rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          {tab === 'open' ? 'No open escalations.' : 'Nothing here.'}
        </div>
      )}

      <div className="space-y-3">
        {escalations.map(esc => (
          <Card key={esc.id} className={esc.status === 'resolved' ? 'opacity-60' : ''}>
            <CardContent className="pt-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <p className="font-medium text-sm">{esc.guest.name ?? esc.guest.phone}</p>
                  <p className="text-xs text-muted-foreground">{esc.apartment.name} · {timeAgo(esc.created_at)}</p>
                </div>
                <Badge variant={esc.status === 'open' ? 'default' : 'secondary'}>{esc.status}</Badge>
              </div>

              <p className="mb-3 text-sm text-foreground/80 italic">&ldquo;{esc.guest_question}&rdquo;</p>

              {esc.status === 'resolved' && esc.host_reply && (
                <p className="border-l-2 border-border pl-3 text-sm text-muted-foreground">{esc.host_reply}</p>
              )}

              {esc.status === 'open' && (
                expandedId === esc.id ? (
                  <div className="space-y-2 mt-2">
                    <Textarea
                      placeholder="Type your reply…"
                      value={replies[esc.id] ?? ''}
                      onChange={e => setReplies(prev => ({ ...prev, [esc.id]: e.target.value }))}
                      rows={3}
                    />
                    <div className="flex items-center gap-3">
                      <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={saveToKb[esc.id] ?? false}
                          onChange={e => setSaveToKb(prev => ({ ...prev, [esc.id]: e.target.checked }))}
                        />
                        Save to knowledge base
                      </label>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => replyMutation.mutate({
                          id: esc.id,
                          replyText: replies[esc.id] ?? '',
                          save: saveToKb[esc.id] ?? false,
                        })}
                        disabled={!replies[esc.id] || replyMutation.isPending}
                      >
                        {replyMutation.isPending ? 'Sending…' : 'Send reply'}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setExpandedId(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setExpandedId(esc.id)}>
                    Reply
                  </Button>
                )
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
