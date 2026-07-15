# Project: GuestBot — WhatsApp AI Assistant for Short-Term Rental Hosts

## Overview

Build a SaaS platform that automates guest communication for short-term rental hosts. Guests text the host's WhatsApp number — an AI bot intercepts messages, identifies which apartment the guest is staying in by looking up their phone number in active bookings, and answers common questions automatically (keys, WiFi, TV, parking, house rules, etc.) using a per-apartment knowledge base. Questions the bot cannot answer are escalated to the host via a dashboard inbox. Every conversation is logged, building a guest CRM over time.

---

## Tech Stack

- **Frontend + API routes**: Next.js 14 (App Router, TypeScript)
- **Styling**: Tailwind CSS + shadcn/ui components
- **Database + Auth**: Supabase (PostgreSQL + Supabase Auth)
- **AI**: Anthropic Claude API (`claude-sonnet-4-6`)
- **WhatsApp**: WATI webhook integration
- **Deployment**: Vercel
- **Payments**: Stripe — scaffold the columns in the DB but do not implement billing logic yet

---

## Critical Architecture Note — Webhook + Vercel Timeout

The WhatsApp webhook must return a 200 response to WATI within a few seconds or WATI will retry. However, our bot logic (DB lookup + Claude API call + WATI send) can take 3–8 seconds total. This creates a timeout risk on Vercel's default 10s function limit.

**Solution: respond to WATI immediately, process asynchronously.**

The webhook route does two things:
1. Immediately returns `200 OK` to WATI
2. Kicks off bot processing using `waitUntil` (Vercel Edge runtime) or by calling a separate internal API route in a fire-and-forget fetch

Use Vercel's `waitUntil` from `@vercel/functions`:

```typescript
import { waitUntil } from '@vercel/functions'

export async function POST(req: Request) {
  const payload = await req.json()
  
  // Respond immediately
  waitUntil(processBotMessage(payload))
  
  return new Response('OK', { status: 200 })
}
```

This keeps the webhook fast and reliable. Add `@vercel/functions` to dependencies.

---

## Database Schema

Create all tables via a single SQL migration file at `supabase/migrations/001_initial_schema.sql`. Use UUIDs for all primary keys. Enable Row Level Security (RLS) on all tables. Add indexes on all foreign keys and on columns used in frequent lookups.

### `hosts`
```sql
CREATE TABLE hosts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  full_name text,
  created_at timestamptz DEFAULT now(),
  stripe_customer_id text,
  subscription_status text DEFAULT 'trial' -- trial | active | cancelled
);
ALTER TABLE hosts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hosts can read own data" ON hosts
  FOR ALL USING (auth.uid() = id);
```

Note: `hosts.id` must equal `auth.users.id` from Supabase Auth. When a host registers, insert a row into `hosts` with the same UUID returned by Supabase Auth. Use a Supabase Auth trigger or handle it in the register API route.

### `apartments`
```sql
CREATE TABLE apartments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid REFERENCES hosts(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  address text,
  city text,
  check_in_instructions text,
  wifi_name text,
  wifi_password text,
  whatsapp_number text,   -- the WA number guests text for this host e.g. "+995599000000"
  created_at timestamptz DEFAULT now(),
  is_active boolean DEFAULT true
);
ALTER TABLE apartments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hosts manage own apartments" ON apartments
  FOR ALL USING (host_id = auth.uid());
CREATE INDEX idx_apartments_host_id ON apartments(host_id);
```

Note: `whatsapp_number` is stored at the host level but placed here for flexibility if a host later wants different numbers per apartment. For MVP, all apartments under one host share one number.

### `knowledge_base`
```sql
CREATE TABLE knowledge_base (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  apartment_id uuid REFERENCES apartments(id) ON DELETE CASCADE NOT NULL,
  question text NOT NULL,
  answer text NOT NULL,
  created_at timestamptz DEFAULT now(),
  times_used integer DEFAULT 0
);
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hosts manage own kb" ON knowledge_base
  FOR ALL USING (
    apartment_id IN (SELECT id FROM apartments WHERE host_id = auth.uid())
  );
CREATE INDEX idx_kb_apartment_id ON knowledge_base(apartment_id);
```

### `guests`
```sql
CREATE TABLE guests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid REFERENCES hosts(id) ON DELETE CASCADE NOT NULL,
  phone text NOT NULL,          -- E.164 format e.g. "+995599123456"
  name text,
  language text,                -- detected language code e.g. "en", "ru", "de"
  first_seen timestamptz DEFAULT now(),
  last_seen timestamptz DEFAULT now(),
  total_stays integer DEFAULT 0,
  notes text,
  UNIQUE(host_id, phone)
);
ALTER TABLE guests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hosts manage own guests" ON guests
  FOR ALL USING (host_id = auth.uid());
CREATE INDEX idx_guests_host_phone ON guests(host_id, phone);
```

Note: `language` gets populated after the first message and reused — avoids re-detecting on every message.

### `bookings`
```sql
CREATE TABLE bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  apartment_id uuid REFERENCES apartments(id) ON DELETE CASCADE NOT NULL,
  guest_id uuid REFERENCES guests(id) ON DELETE CASCADE NOT NULL,
  check_in date NOT NULL,
  check_out date NOT NULL,
  status text DEFAULT 'active',   -- active | completed | cancelled
  source text,                    -- airbnb | booking | direct | other
  created_at timestamptz DEFAULT now()
);
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hosts manage own bookings" ON bookings
  FOR ALL USING (
    apartment_id IN (SELECT id FROM apartments WHERE host_id = auth.uid())
  );
CREATE INDEX idx_bookings_apartment_id ON bookings(apartment_id);
CREATE INDEX idx_bookings_guest_id ON bookings(guest_id);
CREATE INDEX idx_bookings_status_dates ON bookings(status, check_in, check_out);
```

### `messages`
```sql
CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL,
  apartment_id uuid REFERENCES apartments(id) ON DELETE SET NULL NOT NULL,
  guest_id uuid REFERENCES guests(id) ON DELETE SET NULL NOT NULL,
  direction text NOT NULL,           -- inbound | outbound
  content text NOT NULL,
  was_ai_reply boolean DEFAULT false,
  was_escalated boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hosts read own messages" ON messages
  FOR ALL USING (
    apartment_id IN (SELECT id FROM apartments WHERE host_id = auth.uid())
  );
CREATE INDEX idx_messages_booking_id ON messages(booking_id);
CREATE INDEX idx_messages_guest_id ON messages(guest_id);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);
```

### `escalations`
```sql
CREATE TABLE escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  apartment_id uuid REFERENCES apartments(id) ON DELETE SET NULL NOT NULL,
  guest_id uuid REFERENCES guests(id) ON DELETE SET NULL NOT NULL,
  booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL,
  guest_question text NOT NULL,
  status text DEFAULT 'open',        -- open | resolved
  host_reply text,
  resolved_at timestamptz,
  save_to_kb boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE escalations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hosts manage own escalations" ON escalations
  FOR ALL USING (
    apartment_id IN (SELECT id FROM apartments WHERE host_id = auth.uid())
  );
CREATE INDEX idx_escalations_status ON escalations(status);
CREATE INDEX idx_escalations_apartment_id ON escalations(apartment_id);
```

---

## Project Structure

```
/
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql     -- all CREATE TABLE statements above
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx                 -- sidebar nav, auth guard
│   │   ├── page.tsx                   -- overview / home
│   │   ├── apartments/
│   │   │   ├── page.tsx               -- list all apartments
│   │   │   ├── new/page.tsx           -- create apartment form
│   │   │   └── [id]/
│   │   │       ├── page.tsx           -- apartment detail + edit
│   │   │       └── knowledge-base/
│   │   │           └── page.tsx       -- KB editor for this apartment
│   │   ├── bookings/
│   │   │   ├── page.tsx               -- all bookings list
│   │   │   └── new/page.tsx           -- new booking form
│   │   ├── guests/
│   │   │   ├── page.tsx               -- guest CRM list
│   │   │   └── [id]/page.tsx          -- guest detail + message history
│   │   ├── inbox/
│   │   │   └── page.tsx               -- escalations inbox
│   │   └── analytics/
│   │       └── page.tsx               -- stats + charts
│   └── api/
│       ├── webhook/
│       │   └── whatsapp/
│       │       └── route.ts           -- WATI webhook receiver
│       ├── bot/
│       │   └── process/route.ts       -- internal: async bot processing
│       ├── apartments/
│       │   ├── route.ts               -- GET list, POST create
│       │   └── [id]/
│       │       ├── route.ts           -- GET, PATCH, DELETE
│       │       └── knowledge-base/
│       │           └── route.ts       -- GET list, POST create
│       ├── knowledge-base/
│       │   └── [id]/route.ts          -- PATCH, DELETE single entry
│       ├── bookings/
│       │   ├── route.ts               -- GET list, POST create
│       │   └── [id]/route.ts          -- PATCH, DELETE
│       ├── guests/
│       │   ├── route.ts               -- GET list
│       │   └── [id]/route.ts          -- GET detail, PATCH notes
│       └── escalations/
│           ├── route.ts               -- GET list
│           └── [id]/
│               └── reply/route.ts     -- POST host reply → sends WA + resolves
├── lib/
│   ├── supabase/
│   │   ├── client.ts                  -- browser Supabase client
│   │   └── server.ts                  -- server Supabase client (cookies)
│   ├── bot/
│   │   ├── router.ts                  -- phone → active booking lookup
│   │   ├── ai.ts                      -- Claude API, prompt builder, response parser
│   │   └── whatsapp.ts                -- WATI send message wrapper
│   └── utils.ts                       -- phone normalization, date helpers
├── components/
│   ├── ui/                            -- shadcn/ui auto-generated components
│   ├── layout/
│   │   ├── sidebar.tsx
│   │   └── header.tsx
│   ├── apartments/
│   │   ├── apartment-card.tsx
│   │   └── apartment-form.tsx
│   ├── bookings/
│   │   └── booking-form.tsx           -- select/create guest + apartment + dates
│   ├── knowledge-base/
│   │   └── kb-editor.tsx              -- inline add/edit/delete Q&A pairs
│   ├── inbox/
│   │   └── escalation-card.tsx        -- expand + reply + save-to-KB checkbox
│   └── guests/
│       └── guest-message-history.tsx
├── types/
│   └── index.ts                       -- all shared TypeScript interfaces
└── middleware.ts                      -- Supabase Auth session refresh + route protection
```

---

## Middleware (Route Protection)

Create `middleware.ts` at the project root. It must:
1. Refresh the Supabase Auth session on every request
2. Redirect unauthenticated users away from `/` and all dashboard routes to `/login`
3. Redirect authenticated users away from `/login` and `/register` to `/`

Use `@supabase/ssr` for this — it handles cookie-based sessions correctly in Next.js App Router.

---

## TypeScript Types (`types/index.ts`)

Define interfaces matching every database table exactly:

```typescript
export interface Host {
  id: string
  email: string
  full_name: string | null
  created_at: string
  stripe_customer_id: string | null
  subscription_status: 'trial' | 'active' | 'cancelled'
}

export interface Apartment {
  id: string
  host_id: string
  name: string
  address: string | null
  city: string | null
  check_in_instructions: string | null
  wifi_name: string | null
  wifi_password: string | null
  whatsapp_number: string | null
  created_at: string
  is_active: boolean
}

export interface KnowledgeBaseEntry {
  id: string
  apartment_id: string
  question: string
  answer: string
  created_at: string
  times_used: number
}

export interface Guest {
  id: string
  host_id: string
  phone: string
  name: string | null
  language: string | null
  first_seen: string
  last_seen: string
  total_stays: number
  notes: string | null
}

export interface Booking {
  id: string
  apartment_id: string
  guest_id: string
  check_in: string
  check_out: string
  status: 'active' | 'completed' | 'cancelled'
  source: string | null
  created_at: string
}

export interface Message {
  id: string
  booking_id: string | null
  apartment_id: string
  guest_id: string
  direction: 'inbound' | 'outbound'
  content: string
  was_ai_reply: boolean
  was_escalated: boolean
  created_at: string
}

export interface Escalation {
  id: string
  message_id: string | null
  apartment_id: string
  guest_id: string
  booking_id: string | null
  guest_question: string
  status: 'open' | 'resolved'
  host_reply: string | null
  resolved_at: string | null
  save_to_kb: boolean
  created_at: string
}

// Joined types used in UI
export interface EscalationWithRelations extends Escalation {
  guest: Guest
  apartment: Apartment
}

export interface BookingWithRelations extends Booking {
  guest: Guest
  apartment: Apartment
}

// WATI webhook payload
export interface WATIWebhookPayload {
  id: string
  created: string
  waId: string              // sender phone without "+" e.g. "995599123456"
  accountPhone: string      // receiving WATI number without "+" e.g. "995599000000"
  text?: { body: string }
  type: string              // "text" | "image" | "audio" | etc.
}
```

---

## Core Bot Logic

### 1. Webhook entry point (`app/api/webhook/whatsapp/route.ts`)

```typescript
import { waitUntil } from '@vercel/functions'

export async function POST(req: Request) {
  // 1. Verify WATI webhook secret
  const secret = req.headers.get('x-wati-secret')
  if (secret !== process.env.WATI_WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 })
  }

  // 2. Parse payload
  const payload: WATIWebhookPayload = await req.json()

  // 3. Only process text messages, silently ignore others
  if (payload.type !== 'text' || !payload.text?.body) {
    return new Response('OK', { status: 200 })
  }

  // 4. Fire-and-forget processing — respond to WATI immediately
  waitUntil(
    fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/bot/process`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_API_SECRET!
      },
      body: JSON.stringify(payload)
    })
  )

  return new Response('OK', { status: 200 })
}
```

### 2. Bot processor (`app/api/bot/process/route.ts`)

This is the internal route that does the actual work. Protected by `INTERNAL_API_SECRET`.

Set `maxDuration` so the route is not killed by Vercel's default 10s limit (requires Vercel Pro):

```typescript
export const maxDuration = 60  // seconds — requires Vercel Pro

export async function POST(req: Request) {
  // Verify internal secret
  const secret = req.headers.get('x-internal-secret')
  if (secret !== process.env.INTERNAL_API_SECRET) {
    return new Response('Unauthorized', { status: 401 })
  }

  const payload: WATIWebhookPayload = await req.json()
  const senderPhone = '+' + payload.waId          // normalize to E.164
  const receivingPhone = '+' + payload.accountPhone // the WATI number that received the message
  const messageText = payload.text!.body

  // Use Supabase service role client here (not anon)
  const supabase = createServiceClient()

  // 1. Find which host owns the receiving WhatsApp number
  // accountPhone from the WATI payload tells us exactly which host's number was messaged
  const { data: hostApartment } = await supabase
    .from('apartments')
    .select('host_id')
    .eq('whatsapp_number', receivingPhone)
    .limit(1)
    .single()

  if (!hostApartment) {
    // No host configured for this number — silently drop
    return new Response('OK', { status: 200 })
  }

  // 2. Find active booking by sender phone + host
  const booking = await findActiveBooking(senderPhone, hostApartment.host_id)

  // 3. Log inbound message and capture its ID (needed for escalation link)
  const inboundMessage = await logMessage({
    supabase,
    apartmentId: booking?.apartment.id ?? null,
    guestId: booking?.guest.id ?? null,
    bookingId: booking?.booking.id ?? null,
    direction: 'inbound',
    content: messageText,
    wasEscalated: false,
    wasAiReply: false,
  })

  // 4. No active booking — send fallback message (use WATI template to avoid 24h window issue)
  if (!booking) {
    await sendWhatsAppTemplateMessage(senderPhone, 'no_booking_fallback')
    return new Response('OK', { status: 200 })
  }

  // 5. Update guest last_seen
  await supabase
    .from('guests')
    .update({ last_seen: new Date().toISOString() })
    .eq('id', booking.guest.id)

  // 6. Generate AI reply
  let aiResult: { canAnswer: boolean; reply: string | null }
  try {
    aiResult = await generateAIReply({
      apartment: booking.apartment,
      guest: booking.guest,
      booking: booking.booking,
      knowledgeBase: booking.knowledgeBase,
      guestMessage: messageText,
    })
  } catch (err) {
    console.error('[Bot] Claude API error:', err)
    // Treat Claude failure as cannot-answer so the host is notified
    aiResult = { canAnswer: false, reply: null }
  }

  // 7a. AI answered — send reply + log outbound + increment KB usage
  if (aiResult.canAnswer) {
    await sendWhatsAppMessage(senderPhone, aiResult.reply!)
    await logMessage({
      supabase,
      apartmentId: booking.apartment.id,
      guestId: booking.guest.id,
      bookingId: booking.booking.id,
      direction: 'outbound',
      content: aiResult.reply!,
      wasAiReply: true,
      wasEscalated: false,
    })
    // Increment times_used for all KB entries of this apartment
    // (simple approach for MVP — replace with matched-entry increment if semantic search is added)
    await supabase.rpc('increment_kb_times_used', { p_apartment_id: booking.apartment.id })
  }

  // 7b. AI couldn't answer — create escalation linked to inbound message, send holding message
  if (!aiResult.canAnswer) {
    const holdingMessage = "Thanks for your message! The host will get back to you shortly."
    await sendWhatsAppMessage(senderPhone, holdingMessage)

    await supabase.from('escalations').insert({
      message_id: inboundMessage.id,   // link to the inbound message row
      apartment_id: booking.apartment.id,
      guest_id: booking.guest.id,
      booking_id: booking.booking.id,
      guest_question: messageText,
      status: 'open',
    })

    await logMessage({
      supabase,
      apartmentId: booking.apartment.id,
      guestId: booking.guest.id,
      bookingId: booking.booking.id,
      direction: 'outbound',
      content: holdingMessage,
      wasAiReply: false,
      wasEscalated: true,
    })
  }

  return new Response('OK', { status: 200 })
}
```

### 3. Router (`lib/bot/router.ts`)

PostgREST does not support filtering on joined foreign tables with `.eq('guest.phone', ...)` unless you use `!inner` joins. The correct pattern is to query from `guests` first, then join bookings.

```typescript
export async function findActiveBooking(phone: string, hostId: string) {
  const today = new Date().toISOString().split('T')[0]   // "YYYY-MM-DD"

  // Step 1: resolve guest by phone + host
  const { data: guest } = await supabase
    .from('guests')
    .select('id')
    .eq('host_id', hostId)
    .eq('phone', phone)
    .single()

  if (!guest) return null

  // Step 2: find their active booking with full relations
  const { data } = await supabase
    .from('bookings')
    .select(`
      *,
      guest:guests(*),
      apartment:apartments(*, knowledge_base(*))
    `)
    .eq('guest_id', guest.id)
    .eq('status', 'active')
    .lte('check_in', today)
    .gte('check_out', today)
    .limit(1)
    .single()

  if (!data) return null

  return {
    booking: data,
    guest: data.guest,
    apartment: data.apartment,
    knowledgeBase: data.apartment.knowledge_base,
  }
}

// Helper — inserts a message row and returns it (so callers can capture the id)
export async function logMessage(params: {
  supabase: SupabaseClient
  apartmentId: string | null
  guestId: string | null
  bookingId: string | null
  direction: 'inbound' | 'outbound'
  content: string
  wasAiReply: boolean
  wasEscalated: boolean
}): Promise<Message> {
  const { data, error } = await params.supabase
    .from('messages')
    .insert({
      apartment_id: params.apartmentId,
      guest_id: params.guestId,
      booking_id: params.bookingId,
      direction: params.direction,
      content: params.content,
      was_ai_reply: params.wasAiReply,
      was_escalated: params.wasEscalated,
    })
    .select()
    .single()

  if (error) throw new Error(`logMessage failed: ${error.message}`)
  return data as Message
}
```

Also add this Postgres helper function to the migration (needed for atomic KB counter increment):

```sql
-- Add to supabase/migrations/001_initial_schema.sql
CREATE OR REPLACE FUNCTION increment_kb_times_used(p_apartment_id uuid)
RETURNS void LANGUAGE sql AS $$
  UPDATE knowledge_base
  SET times_used = times_used + 1
  WHERE apartment_id = p_apartment_id;
$$;
```

### 4. AI reply generator (`lib/bot/ai.ts`)

```typescript
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

export async function generateAIReply({ apartment, guest, booking, knowledgeBase, guestMessage }) {
  const kbText = knowledgeBase.length > 0
    ? knowledgeBase.map(kb => `Q: ${kb.question}\nA: ${kb.answer}`).join('\n\n')
    : 'No FAQ entries added yet.'

  const systemPrompt = `You are a helpful assistant for guests staying at "${apartment.name}"${apartment.address ? ` located at ${apartment.address}` : ''}.

Guest name: ${guest.name ?? 'Guest'}
Check-in: ${booking.check_in}
Check-out: ${booking.check_out}

WIFI:
Network: ${apartment.wifi_name ?? 'not provided'}
Password: ${apartment.wifi_password ?? 'not provided'}

CHECK-IN INSTRUCTIONS:
${apartment.check_in_instructions ?? 'Not provided.'}

KNOWLEDGE BASE:
${kbText}

RULES:
- Reply in the same language the guest is writing in
- Be warm, friendly, and concise — this is a WhatsApp conversation
- Only answer from the information above — never invent details
- If the answer is not in the knowledge base, respond ONLY with the exact text: CANNOT_ANSWER
- Do not apologize or explain when returning CANNOT_ANSWER — just return that exact string`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    system: systemPrompt,
    messages: [{ role: 'user', content: guestMessage }],
  })

  const replyText = response.content[0].type === 'text' ? response.content[0].text.trim() : 'CANNOT_ANSWER'

  if (replyText === 'CANNOT_ANSWER') {
    return { canAnswer: false, reply: null }
  }

  // Persist detected language on the guest record (fire-and-forget, non-critical)
  // Language is inferred from Claude's reply rather than running a separate detector.
  // Stored once and reused — avoids re-detection on every message.
  // TODO: pass supabase + guestId here and update guests.language if currently null

  return { canAnswer: true, reply: replyText }
}
```

### 5. WATI sender (`lib/bot/whatsapp.ts`)

**Important — WATI session vs template messages:**
`sendSessionMessage` only works within the 24-hour WhatsApp conversation window (i.e., the guest must have messaged first within the last 24 hours). For the no-booking fallback — which may be a first-ever contact — use a pre-approved WATI template message instead to avoid API errors. All other replies in the bot flow are always responses to an inbound message and therefore within the window.

```typescript
export async function sendWhatsAppMessage(phone: string, message: string): Promise<void> {
  // WATI expects phone without "+" for the endpoint param
  const phoneClean = phone.replace('+', '')

  const res = await fetch(
    `${process.env.WATI_API_URL}/api/v1/sendSessionMessage/${phoneClean}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.WATI_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messageText: message }),
    }
  )

  if (!res.ok) {
    const error = await res.text()
    console.error('[WATI] Failed to send message:', error)
    throw new Error(`WATI send failed: ${error}`)
  }
}

// Used for first-contact / no-booking fallback where the 24h session may not exist.
// The template name must be pre-approved in your WATI account.
export async function sendWhatsAppTemplateMessage(phone: string, templateName: string): Promise<void> {
  const phoneClean = phone.replace('+', '')

  const res = await fetch(
    `${process.env.WATI_API_URL}/api/v1/sendTemplateMessage`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.WATI_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ whatsappNumber: phoneClean, template_name: templateName, broadcast_name: templateName }),
    }
  )

  if (!res.ok) {
    const error = await res.text()
    console.error('[WATI] Failed to send template:', error)
    throw new Error(`WATI template send failed: ${error}`)
  }
}
```

---

## Host Reply to Escalation (`app/api/escalations/[id]/reply/route.ts`)

When the host replies from the inbox, this endpoint:
1. Sends the reply via WhatsApp to the guest
2. Marks escalation as resolved
3. If `save_to_kb: true`, inserts a new knowledge_base row for that apartment

```typescript
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerClient()
  const { replyText, saveToKb } = await req.json()

  // Get escalation with relations
  const { data: escalation } = await supabase
    .from('escalations')
    .select('*, guest:guests(phone), apartment:apartments(*)')
    .eq('id', params.id)
    .single()

  if (!escalation) return Response.json({ error: 'Not found' }, { status: 404 })

  // Send WhatsApp message
  await sendWhatsAppMessage(escalation.guest.phone, replyText)

  // Log outbound message
  await supabase.from('messages').insert({
    apartment_id: escalation.apartment_id,
    guest_id: escalation.guest_id,
    booking_id: escalation.booking_id,
    direction: 'outbound',
    content: replyText,
    was_ai_reply: false,
    was_escalated: false,
  })

  // Resolve escalation
  await supabase
    .from('escalations')
    .update({
      status: 'resolved',
      host_reply: replyText,
      resolved_at: new Date().toISOString(),
      save_to_kb: saveToKb,
    })
    .eq('id', params.id)

  // Optionally save to KB
  if (saveToKb) {
    await supabase.from('knowledge_base').insert({
      apartment_id: escalation.apartment_id,
      question: escalation.guest_question,
      answer: replyText,
    })
  }

  return Response.json({ data: { success: true } })
}
```

---

## Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Anthropic
ANTHROPIC_API_KEY=

# WATI
WATI_API_URL=                    # e.g. https://live-mt-server.wati.io/YOUR_ACCOUNT_ID
WATI_API_TOKEN=
WATI_WEBHOOK_SECRET=

# Internal
INTERNAL_API_SECRET=             # random string, used to secure /api/bot/process
NEXT_PUBLIC_APP_URL=             # e.g. https://yourapp.vercel.app
```

---

## Dashboard Pages

### Overview (`/`)
- Stat cards: apartments count, active bookings today, open escalations, messages handled today
- Table of recent open escalations with guest name, apartment, question, quick-reply button

### Apartments (`/apartments`)
- Card grid of all apartments showing name, city, active booking indicator
- "Add apartment" button

### Apartment detail (`/apartments/[id]`)
- Editable fields: name, address, city, WiFi name, WiFi password, check-in instructions
- Stats: total stays, total messages, AI answer rate %
- Button: "Edit knowledge base"

### Knowledge base editor (`/apartments/[id]/knowledge-base`)
- List of Q&A pairs with `times_used` badge on each
- Inline form to add new entry (question + answer fields + save button)
- Edit and delete buttons on each row
- Empty state with suggested starter questions:
  "How do I get the keys?", "What's the WiFi password?", "What time is check-out?", "Where can I park?", "How do I use the TV?"

### Bookings (`/bookings`)
- Sortable table: guest name, apartment, check-in, check-out, status badge, source
- "New booking" button
- New booking form: search/create guest by phone number, select apartment, pick dates, select source

### Guests (`/guests`)
- Table: name, phone, total stays, last seen, current apartment (if active booking)
- Click → guest detail page with full message history and editable notes

### Inbox (`/inbox`)
- Filter tabs: All | Open | Resolved
- Each escalation card shows: guest name + phone, apartment name, their question, time ago
- Expand to reveal: reply textarea, "Send reply" button, "Save to knowledge base" checkbox
- Resolved escalations show the host's reply greyed out

### Analytics (`/analytics`)
- Total messages this month, AI answer rate, escalation rate
- Bar chart: top 10 most-asked questions across all apartments
- Per-apartment table: messages, AI handled, escalated, answer rate

---

## Key Business Rules

1. Guest is identified by phone number matching an active booking (`status = 'active'`, today between `check_in` and `check_out`)
2. A guest can only have one active booking at a time across all apartments
3. The same guest (phone) can have many bookings over time — they accumulate in the CRM
4. `guests.total_stays` increments when a new booking is created for that guest. In `POST /api/bookings`, after inserting the booking row, run: `supabase.from('guests').update({ total_stays: supabase.rpc('increment', { row_id: guestId }) })` — or use a Postgres trigger on `bookings` INSERT that does `UPDATE guests SET total_stays = total_stays + 1 WHERE id = NEW.guest_id`
5. `guests.language` is set after the first message is received. Infer it from the `Accept-Language` header or a lightweight detector (e.g. `franc` npm package) on the guest's message text. Store it in the guest row after the first inbound message if `language` is currently null. Claude will reply in the guest's language regardless — this field is for display in the CRM
6. `knowledge_base.times_used` increments on every successful AI answer via `increment_kb_times_used(apartment_id)` (the Postgres function defined above). MVP increments all KB entries for the apartment. Replace with per-entry matching when semantic search is added
7. Messages are always logged — inbound and outbound — regardless of whether AI or host replied
8. When the host replies to an escalation and checks "save to KB", a new KB entry is inserted automatically with `question = escalation.guest_question` and `answer = host reply text`
9. Non-text WhatsApp messages (images, voice, documents) are silently ignored by the webhook — no reply sent
10. The no-booking fallback always uses a WATI **template message** (pre-approved in WATI dashboard), never `sendSessionMessage`, because there may be no active 24-hour session window with an unrecognized contact

---

## What to Build First (MVP Order)

Build strictly in this order — each step depends on the previous:

1. Supabase schema — run the migration SQL
2. Auth — register + login pages using Supabase Auth, middleware for route protection, auto-insert host row on register
3. Apartment CRUD — create, list, edit apartments
4. Knowledge base editor — add/edit/delete Q&A entries per apartment
5. Booking form — create a booking linking a guest phone + name to an apartment + dates
6. Webhook + bot engine — the full message flow end to end (this is the core feature)
7. Inbox — view escalations, reply to them, save to KB
8. Guest list — basic CRM view
9. Overview page — stat cards
10. Analytics + guest detail — defer until everything above works

---

## Coding Conventions

- TypeScript strict mode — no `any`
- All DB access uses Supabase client — never raw fetch to PostgREST
- API routes use `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS for bot operations)
- Dashboard pages use `NEXT_PUBLIC_SUPABASE_ANON_KEY` with RLS enforcing ownership
- React Query (TanStack Query) for all client-side data fetching
- shadcn/ui for all UI — no custom component CSS
- Dates stored as UTC; displayed in local timezone on frontend
- Phone numbers always stored and compared in E.164 format (`+` prefix)
- All API routes return consistent shape: `{ data: T | null, error: string | null }`
- Wrap all external API calls (Claude, WATI) in try/catch with proper error logging

---

## Notes for Claude Code

Start with these exact commands:
```bash
npx create-next-app@latest guestbot --typescript --tailwind --app --eslint --src-dir no
cd guestbot
npx shadcn@latest init
npm install @supabase/supabase-js @supabase/ssr @anthropic-ai/sdk @tanstack/react-query @vercel/functions
```

WATI webhook payload structure (exact shape to expect):
```json
{
  "id": "abc123",
  "created": "2024-01-01T10:00:00Z",
  "waId": "995599123456",
  "text": { "body": "Where are the keys?" },
  "type": "text",
  "accountPhone": "995599000000"
}
```
- `waId` = sender phone without `+` → prepend `+` to normalize
- `accountPhone` = the WATI number that received it → use to look up which host
- Only process messages where `type === "text"` — ignore all others silently

Test the webhook locally using ngrok:
```bash
ngrok http 3000
# Set the ngrok URL + /api/webhook/whatsapp as the webhook URL in WATI dashboard
```

**Local `.env.local` requirement:** `NEXT_PUBLIC_APP_URL` must be set to the ngrok URL (e.g. `https://abc123.ngrok.io`) when testing locally. The webhook route uses this to call `/api/bot/process` via `waitUntil(fetch(...))` — without it, the self-call will fail and no messages will be processed.

**Vercel deployment note:** `/api/bot/process` needs `export const maxDuration = 60` and the project must be on Vercel **Pro** plan. On the hobby plan the maximum function duration is 10s, which is not enough for DB lookup + Claude API call + WATI send under load.
