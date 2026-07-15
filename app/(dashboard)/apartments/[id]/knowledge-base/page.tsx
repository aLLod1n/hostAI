'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { KnowledgeBaseEntry } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

const STARTER_QUESTIONS = [
  'How do I get the keys?',
  "What's the WiFi password?",
  'What time is check-out?',
  'Where can I park?',
  'How do I use the TV?',
]

export default function KnowledgeBasePage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const [newQ, setNewQ] = useState('')
  const [newA, setNewA] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editQ, setEditQ] = useState('')
  const [editA, setEditA] = useState('')

  const { data, isLoading } = useQuery<{ data: KnowledgeBaseEntry[] }>({
    queryKey: ['kb', id],
    queryFn: () => fetch(`/api/apartments/${id}/knowledge-base`).then(r => r.json()),
  })

  const entries = data?.data ?? []

  const addMutation = useMutation({
    mutationFn: (entry: { question: string; answer: string }) =>
      fetch(`/api/apartments/${id}/knowledge-base`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb', id] })
      setNewQ('')
      setNewA('')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ entryId, question, answer }: { entryId: string; question: string; answer: string }) =>
      fetch(`/api/knowledge-base/${entryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, answer }),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb', id] })
      setEditId(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (entryId: string) =>
      fetch(`/api/knowledge-base/${entryId}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kb', id] }),
  })

  function startEdit(entry: KnowledgeBaseEntry) {
    setEditId(entry.id)
    setEditQ(entry.question)
    setEditA(entry.answer)
  }

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Knowledge Base</h1>

      {/* Add new entry */}
      <Card className="mb-6">
        <CardContent className="pt-5 space-y-3">
          <p className="font-medium text-sm">Add Q&A entry</p>
          <Input
            placeholder="Question"
            value={newQ}
            onChange={e => setNewQ(e.target.value)}
          />
          <Textarea
            placeholder="Answer"
            value={newA}
            onChange={e => setNewA(e.target.value)}
            rows={3}
          />
          <Button
            onClick={() => addMutation.mutate({ question: newQ, answer: newA })}
            disabled={!newQ || !newA || addMutation.isPending}
            size="sm"
          >
            {addMutation.isPending ? 'Adding…' : 'Add entry'}
          </Button>
        </CardContent>
      </Card>

      {/* Starter suggestions */}
      {entries.length === 0 && !isLoading && (
        <div className="mb-6">
          <p className="mb-2 text-sm text-muted-foreground">Suggested questions to get started:</p>
          <div className="flex flex-wrap gap-2">
            {STARTER_QUESTIONS.map(q => (
              <button
                key={q}
                onClick={() => setNewQ(q)}
                className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      <div className="space-y-3">
        {entries.map(entry => (
          <Card key={entry.id}>
            <CardContent className="pt-4">
              {editId === entry.id ? (
                <div className="space-y-2">
                  <Input value={editQ} onChange={e => setEditQ(e.target.value)} />
                  <Textarea value={editA} onChange={e => setEditA(e.target.value)} rows={3} />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => updateMutation.mutate({ entryId: entry.id, question: editQ, answer: editA })}
                      disabled={updateMutation.isPending}
                    >
                      Save
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditId(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="font-medium text-sm">{entry.question}</p>
                    <Badge variant="secondary" className="shrink-0">
                      {entry.times_used}×
                    </Badge>
                  </div>
                  <p className="mb-3 text-sm text-muted-foreground">{entry.answer}</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => startEdit(entry)}>Edit</Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => deleteMutation.mutate(entry.id)}
                      disabled={deleteMutation.isPending}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
