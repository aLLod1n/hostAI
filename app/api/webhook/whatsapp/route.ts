import { waitUntil } from '@vercel/functions'
import { WATIWebhookPayload } from '@/types'

export async function POST(req: Request) {
  // WATI's webhook UI doesn't expose a custom-headers field, so accept the secret
  // as a query param (?secret=...) on the webhook URL, falling back to a header
  // in case a future WATI plan/UI does support one.
  const url = new URL(req.url)
  const secret = url.searchParams.get('secret') ?? req.headers.get('x-wati-secret')
  if (secret !== process.env.WATI_WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 })
  }

  const payload: WATIWebhookPayload = await req.json()

  // Only process text messages — silently ignore images, audio, documents, etc.
  if (payload.type !== 'text' || !payload.text) {
    return new Response('OK', { status: 200 })
  }

  // Respond to WATI immediately, process asynchronously
  waitUntil(
    fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/agent/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_API_SECRET!,
      },
      body: JSON.stringify(payload),
    })
  )

  return new Response('OK', { status: 200 })
}
