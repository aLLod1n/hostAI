'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Apartment } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export default function NewBookingPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    phone: '', guest_name: '', apartment_id: '',
    check_in: '', check_out: '', source: 'direct',
  })

  const { data: aptData } = useQuery<{ data: Apartment[] }>({
    queryKey: ['apartments'],
    queryFn: () => fetch('/api/apartments').then(r => r.json()),
  })
  const apartments = aptData?.data ?? []

  function set(key: string, value: string) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const json = await res.json()
    if (json.error) { setError(json.error); setSaving(false); return }
    router.push('/bookings')
  }

  return (
    <div className="max-w-lg">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">New booking</h1>
      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader><CardTitle>Booking details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Guest phone *</Label>
                <Input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+995599123456" required />
              </div>
              <div className="space-y-2">
                <Label>Guest name</Label>
                <Input value={form.guest_name} onChange={e => set('guest_name', e.target.value)} placeholder="Anna" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Apartment *</Label>
              <Select value={form.apartment_id} onValueChange={v => v && set('apartment_id', v)} required>
                <SelectTrigger><SelectValue placeholder="Select apartment" /></SelectTrigger>
                <SelectContent>
                  {apartments.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Check-in *</Label>
                <Input type="date" value={form.check_in} onChange={e => set('check_in', e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Check-out *</Label>
                <Input type="date" value={form.check_out} onChange={e => set('check_out', e.target.value)} required />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Source</Label>
              <Select value={form.source} onValueChange={v => v && set('source', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="direct">Direct</SelectItem>
                  <SelectItem value="airbnb">Airbnb</SelectItem>
                  <SelectItem value="booking">Booking.com</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create booking'}</Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  )
}
