'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

export default function RegisterPage() {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleRegister(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName || null } },
    })

    if (signUpError) {
      setError(signUpError.message)
      setLoading(false)
      return
    }

    // Host row is created automatically by the on_auth_user_created trigger
    router.push('/')
    router.refresh()
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted/40 px-4">
      <div className="flex items-center gap-2.5">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
          G
        </div>
        <span className="font-heading text-lg font-semibold">GuestBot</span>
      </div>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">Create your account</CardTitle>
          <CardDescription>Start automating your guest communication</CardDescription>
        </CardHeader>
        <form onSubmit={handleRegister}>
          <CardContent className="space-y-4">
            {error && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="fullName">Full name</Label>
              <Input
                id="fullName"
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="Jane Smith"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                minLength={6}
                required
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Creating account…' : 'Create account'}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link href="/login" className="font-medium text-primary hover:underline">
                Sign in
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
