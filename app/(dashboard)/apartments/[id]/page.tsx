'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Apartment } from '@/types'
import { Button, LinkButton } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function ApartmentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [apt, setApt] = useState<Apartment | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    fetch(`/api/apartments/${id}`)
      .then(r => r.json())
      .then(j => setApt(j.data))
  }, [id])

  function set(key: keyof Apartment, value: string | boolean) {
    setApt(prev => prev ? { ...prev, [key]: value } : prev)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!apt) return
    setSaving(true)
    setError(null)
    setSuccess(false)
    const res = await fetch(`/api/apartments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(apt),
    })
    const json = await res.json()
    if (json.error) { setError(json.error) } else { setSuccess(true) }
    setSaving(false)
  }

  async function handleDelete() {
    if (!confirm('Delete this apartment? This cannot be undone.')) return
    setDeleting(true)
    await fetch(`/api/apartments/${id}`, { method: 'DELETE' })
    router.push('/apartments')
  }

  if (!apt) return <p className="text-sm text-muted-foreground">Loading…</p>

  return (
    <div className="max-w-xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{apt.name}</h1>
        <LinkButton href={`/apartments/${id}/knowledge-base`} variant="outline" size="sm">Knowledge base →</LinkButton>
      </div>
      <form onSubmit={handleSave}>
        <Card>
          <CardHeader><CardTitle>Edit details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            {success && <p className="text-sm text-emerald-600 dark:text-emerald-400">Saved.</p>}
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={apt.name} onChange={e => set('name', e.target.value)} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>City</Label>
                <Input value={apt.city ?? ''} onChange={e => set('city', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>WhatsApp number</Label>
                <Input value={apt.whatsapp_number ?? ''} onChange={e => set('whatsapp_number', e.target.value)} placeholder="+995599000000" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Input value={apt.address ?? ''} onChange={e => set('address', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>WiFi name</Label>
                <Input value={apt.wifi_name ?? ''} onChange={e => set('wifi_name', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>WiFi password</Label>
                <Input value={apt.wifi_password ?? ''} onChange={e => set('wifi_password', e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Check-in instructions</Label>
              <Textarea value={apt.check_in_instructions ?? ''} onChange={e => set('check_in_instructions', e.target.value)} rows={4} />
            </div>
            <div className="flex items-center justify-between pt-2">
              <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
              <Button type="button" variant="destructive" size="sm" disabled={deleting} onClick={handleDelete}>
                {deleting ? 'Deleting…' : 'Delete apartment'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  )
}
