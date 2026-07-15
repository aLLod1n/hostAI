'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function NewApartmentPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '', address: '', city: '', wifi_name: '', wifi_password: '',
    whatsapp_number: '', check_in_instructions: '',
  })

  function set(key: string, value: string) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const res = await fetch('/api/apartments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const json = await res.json()
    if (json.error) { setError(json.error); setSaving(false); return }
    router.push(`/apartments/${json.data.id}`)
  }

  return (
    <div className="max-w-xl">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">New apartment</h1>
      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Downtown Loft" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>City</Label>
                <Input value={form.city} onChange={e => set('city', e.target.value)} placeholder="Tbilisi" />
              </div>
              <div className="space-y-2">
                <Label>WhatsApp number</Label>
                <Input value={form.whatsapp_number} onChange={e => set('whatsapp_number', e.target.value)} placeholder="+995599000000" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Input value={form.address} onChange={e => set('address', e.target.value)} placeholder="12 Rustaveli Ave" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>WiFi name</Label>
                <Input value={form.wifi_name} onChange={e => set('wifi_name', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>WiFi password</Label>
                <Input value={form.wifi_password} onChange={e => set('wifi_password', e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Check-in instructions</Label>
              <Textarea
                value={form.check_in_instructions}
                onChange={e => set('check_in_instructions', e.target.value)}
                placeholder="Key is in lockbox code 1234, front door is blue..."
                rows={4}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Create apartment'}</Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  )
}
