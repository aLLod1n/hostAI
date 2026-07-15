# Project Status

> **Keep this file current.** Any time a change is made to this project (code, schema, env config, deployment), update the relevant section below in the same piece of work. See the rule in `AGENTS.md`.

Last updated: 2026-07-15

---

## 0. How this all works (plain English)

**What WATI is:** WATI is a middleman between our app and WhatsApp's official business messaging system (owned by Meta, normally hard to access directly). You connect a WhatsApp number to WATI, and WATI gives you a simple API to send/receive messages on it — similar to how Stripe sits between an app and the actual card networks.

**What a webhook is:** a URL that WATI calls automatically the moment something happens (a guest sends a message), instead of our app having to repeatedly ask WATI "any new messages?" (polling). WATI pushes data to us.

**The flow, step by step:**

1. A guest texts the connected WhatsApp number ("What's the wifi password?").
2. WATI receives it and immediately calls our webhook, `POST /api/webhook/whatsapp`, with the message details.
3. That route checks a secret (so nobody can fake messages to us), replies "OK" to WATI right away (must happen in a few seconds or WATI gives up), and hands the real work off to a second route in the background.
4. `POST /api/agent/process` does the actual work:
   - Looks up the database: which apartment/host owns this WhatsApp number? Which guest is this phone number? Do they have an active booking today?
   - Sends the guest's question, plus that apartment's WiFi/check-in/FAQ info, to **OpenAI**, asking it to answer only from that data.
   - If OpenAI can answer → sends the reply back via WATI's send-message API and logs it.
   - If OpenAI can't answer → sends a "the host will get back to you" holding message and creates an **escalation** (a task in the dashboard inbox for the host to answer personally).
5. Everything is logged in **Supabase** (the database) — every message, every escalation — building a full history per guest.

**Verified for real on 2026-07-15**: sent an actual WhatsApp message from the user's phone to the connected test number; it correctly triggered a webhook call, an OpenAI-generated answer pulled from the seeded knowledge base, a real reply sent back over WhatsApp via WATI, and correct logging in the database. See §5.2/§5.3 for the setup details and §5.1 for the earlier local-only (no real WATI) verification.

**Current caveat:** this is all running through `ngrok`, a tool that gives a local laptop a temporary public internet address, since WATI needs to reach `localhost:3000` from the outside world. That's a stand-in for a real deployment — production will run on Vercel with a stable URL instead (see remaining steps in §6).

---

## 1. Where we are (one-liner)

MVP is **code-complete, builds/lints/type-checks clean, and the core bot pipeline has been verified working end-to-end with a real WhatsApp message** through real WATI credentials, a Meta free test number (`+15553798073`), and an ngrok tunnel exposing `/api/webhook/whatsapp`. AI provider is **OpenAI**, not Anthropic Claude as `hostAI plan.md` specifies (deviation done at user's request). Remaining work is deployment (Vercel Pro) and template approval for the no-booking fallback path — see §6.

---

## 2. Build health

| Check | Status |
|---|---|
| `npx tsc --noEmit` | ✅ clean |
| `npm run build` | ✅ succeeds (19 routes, proxy/middleware compiled) |
| `npx eslint .` | ✅ clean (fixed: unescaped `"` in `inbox/page.tsx` and `(dashboard)/page.tsx`; removed dead `KnowledgeBaseEntry`/`aiHandled` in `analytics/page.tsx`, dead `formatDate` import in `guests/[id]/page.tsx`, dead `Badge` import in `(dashboard)/page.tsx`) |
| `lib/agent/ai.ts` provider | ✅ swapped `@anthropic-ai/sdk` → `openai` package. Client is lazily instantiated (`getClient()`) rather than at module scope — the OpenAI SDK throws immediately if `OPENAI_API_KEY` is unset, which broke `npm run build`'s page-data collection when instantiated eagerly (Anthropic's SDK didn't have this issue) |
| Supabase schema applied to live project | ✅ confirmed via REST API — `hosts`, `apartments`, `knowledge_base`, `guests`, `bookings`, `messages`, `escalations` all return 200 |
| End-to-end bot pipeline (local) | ✅ verified 2026-07-15 — see §5.1 below |
| WATI webhook payload shape | ✅ fixed 2026-07-15 — `hostAI plan.md` and the original code assumed `text: { body: string }` and an `accountPhone` field. WATI's real "Message Received" webhook (confirmed against `docs.wati.io/reference/message-received`) sends `text` as a **plain string** and the receiving-number field is **`channelPhoneNumber`**. Old code would have silently dropped every real inbound message (webhook still returns 200, so failure would've been invisible) and failed the host lookup. Fixed in `types/index.ts` (`WATIWebhookPayload`), `app/api/webhook/whatsapp/route.ts`, `app/api/agent/process/route.ts`; re-verified against the seeded test data with the corrected payload shape |
| WATI outbound send request format | ✅ fixed 2026-07-15 — `hostAI plan.md`/original code sent `messageText` as a JSON body field on `sendSessionMessage`, and `whatsappNumber` as a JSON body field on `sendTemplateMessage` (missing the required `channel_number`/`parameters` fields entirely). WATI's real API (confirmed against `docs.wati.io/reference/post_api-v1-sendsessionmessage-whatsappnumber` and `.../post_api-v1-sendtemplatemessage`) expects `messageText` as a **query param** on session sends, and on template sends expects `whatsappNumber` as a **query param** plus a JSON body with `template_name`, `broadcast_name`, `channel_number` (required), and `parameters` (required array). Fixed in `lib/agent/whatsapp.ts`; `sendWhatsAppTemplateMessage` now takes a `channelPhoneNumber` param, threaded through from `app/api/agent/process/route.ts`'s existing `receivingPhone`. Not yet tested against a real WATI account (no credentials) — only verified it type-checks/builds; **re-test this once WATI creds exist** |
| Test data in DB | ⚠️ one seeded test host/apartment/guest/booking from the §5.1 verification run still present in the live Supabase project (harmless, not linked to a real Supabase Auth user so it's not reachable via dashboard login). Apartment `whatsapp_number` updated to the real Meta test number `+15553798073`; guest `phone` updated to the user's real WhatsApp number `+995598600242` so a real inbound message will match — safe to leave or delete manually via SQL once real testing is done |
| WATI webhook secret delivery | ✅ fixed 2026-07-15 — WATI's "Add Webhook" UI (Connectors → Webhooks) has no custom-headers field (unlike what WATI's Zapier-integration docs describe for a different webhook type), so the `x-wati-secret` header approach from `hostAI plan.md` doesn't work here. Changed `app/api/webhook/whatsapp/route.ts` to accept the secret as a `?secret=` query param on the webhook URL (falling back to the header check in case a future WATI plan/UI adds header support). Verified locally: request with no secret → 401, request with `?secret=<value>` → 200 |

---

## 3. Environment variables (`.env.local`)

| Var | Status |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ set |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ set |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ set |
| `NEXT_PUBLIC_APP_URL` | ✅ set (`http://localhost:3000`) |
| `INTERNAL_API_SECRET` | ✅ set (generated via `openssl rand -hex 32`) |
| `OPENAI_MODEL` | ✅ set (`gpt-4o-mini`, overridable) |
| `OPENAI_API_KEY` | ✅ set |
| `WATI_API_URL` | ✅ set — live-tested with a real `GET /api/v1/getContacts` call, returned 200 |
| `WATI_API_TOKEN` | ✅ set. **Correction to earlier guidance**: this is the `wati_...` personal access token from the "Create API Token" tab (scope `publicapi`), used with `Authorization: Bearer <token>` — not the JWT shown on the "API Docs" page as originally assumed. Confirmed working live |
| `WATI_WEBHOOK_SECRET` | ✅ set (generated via `openssl rand -hex 32` for local testing — **replace with the real value from your WATI dashboard once you connect a WATI account**, they must match) |

---

## 4. MVP build order (per `hostAI plan.md`) — implementation status

1. ✅ Supabase schema (`supabase/migrations/001_initial_schema.sql`) — deployed
2. ✅ Auth — register/login pages + `proxy.ts` route guard (this Next.js version renamed `middleware.ts` → `proxy.ts` / `export function proxy`, confirmed against vendored docs — not a gap)
3. ✅ Apartment CRUD — list/new/detail pages + `app/api/apartments/*`
4. ✅ Knowledge base editor — `app/(dashboard)/apartments/[id]/knowledge-base/page.tsx` + `app/api/apartments/[id]/knowledge-base`, `app/api/knowledge-base/[id]`
5. ✅ Booking form — `app/(dashboard)/bookings/new/page.tsx` + `app/api/bookings/*`
6. ✅ Webhook + bot engine — `app/api/webhook/whatsapp/route.ts` → `app/api/agent/process/route.ts` → `lib/agent/{router,ai,whatsapp}.ts` (plan called this dir `lib/bot/`, actual code uses `lib/agent/` — naming deviation only, logic matches). AI provider is **OpenAI** (`gpt-4o-mini` via `OPENAI_MODEL`), not Anthropic Claude as the plan specifies — the `CANNOT_ANSWER` sentinel / escalation logic is unchanged, only the SDK/model call changed
7. ✅ Inbox — `app/(dashboard)/inbox/page.tsx` + `app/api/escalations/*`
8. ✅ Guest list/CRM — `app/(dashboard)/guests/page.tsx`, `[id]/page.tsx` + `app/api/guests/*`
9. ✅ Overview page — `app/(dashboard)/page.tsx`
10. ✅ Analytics — `app/(dashboard)/analytics/page.tsx`

**Architectural note:** the plan specified pulling UI into dedicated components (`apartment-form.tsx`, `kb-editor.tsx`, `booking-form.tsx`, `escalation-card.tsx`, `guest-message-history.tsx`, `header.tsx`). These were not split out — logic currently lives inline in the page files instead (only `components/layout/sidebar.tsx` and `components/ui/*` exist). Not a functional gap, just a deviation worth knowing about if the pages start feeling bloated.

---

## 5. What's blocking a real end-to-end run

### 5.1 Local pipeline verification (done 2026-07-15)

Seeded a test host/apartment (2 KB entries: WiFi password, check-out time)/guest/active booking directly via the Supabase service-role client, started `next dev`, and POSTed two WATI-shaped payloads to `/api/webhook/whatsapp`:

- **KB-covered question** ("What is the wifi password?") → AI answered correctly from the KB (`"Network: TestWifi, Password: testpass123"`), `messages` got both inbound + outbound rows (`was_ai_reply: true`), no escalation created, both KB entries' `times_used` incremented 0→1 (matches the plan's "increment all KB entries for the apartment" MVP rule).
- **Non-KB question** ("Is there a swimming pool at the property?") → AI correctly returned `CANNOT_ANSWER`, an `escalations` row was created (`status: open`, linked to the inbound `message_id`), and the holding message was logged as outbound (`was_escalated: true`).
- Both `/api/agent/process` calls returned 200; the only error was the expected, caught `sendWhatsAppMessage` failure (no `WATI_API_URL` yet) — logged but non-fatal, matching the try/catch design in `app/api/agent/process/route.ts`.

This confirms the full pipeline — webhook auth → async handoff → booking lookup → OpenAI call → KB matching → DB writes → escalation creation — all work correctly.

**Follow-up (same day):** while researching WATI's actual webhook setup steps, discovered the payload shape mismatch described above. Fixed the code, restarted the dev server, and re-sent a test payload using WATI's real schema (`channelPhoneNumber` + string `text`) — confirmed host lookup, booking match, and AI answer all still work correctly with the corrected shape.

### 5.2 Local WATI wiring (done 2026-07-15)

- WATI trial account created; attempting to connect the user's personal number (`+995598600242`) as the business channel failed — Meta rejects a number already active on regular WhatsApp. Used **Meta's free test number** feature instead (`+15553798073`, fake `+1 555` area code) to avoid touching the personal WhatsApp account.
- `ngrok` installed via `winget` (had to `ngrok update` from the winget-shipped 3.3.1 to 3.39.9 — WATI's/ngrok's account required ≥3.20.0), authtoken configured, tunnel running: `https://b6ff-81-16-247-59.ngrok-free.app` → `localhost:3000`. **Note: this URL changes every time the ngrok tunnel restarts** (free plan, no reserved domain) — `NEXT_PUBLIC_APP_URL` and the WATI webhook URL both need updating whenever that happens.
- `NEXT_PUBLIC_APP_URL` updated to the ngrok URL, dev server restarted to pick it up.
- Seeded apartment/guest from §5.1 repointed at the real numbers (see §2 test-data row).
- Webhook registered in WATI: `https://b6ff-81-16-247-59.ngrok-free.app/api/webhook/whatsapp?secret=<WATI_WEBHOOK_SECRET>`, "Message Received" event. WATI's "Add Webhook" form has no custom-headers field, so the secret is passed as a URL query param instead — see the "WATI webhook secret delivery" row in §2.
- **Confirmed working 2026-07-15**: sent real WhatsApp messages from `+995598600242` to `+15553798073`. "Hey" → AI replied "Hello! How can I assist you today? 😊" (general greeting, answered without needing the KB). "What is WiFi password ?" → AI correctly answered "Network: TestWifi, Password: testpass123" from the KB. Both round-tripped through real WATI send calls with no errors (unlike the earlier §5.1 local-only test, where the send call correctly failed since there was no real WATI account yet). `messages` table has the correct rows for both.

### 5.4 Real apartment testing + Meta test-number delivery limitation (2026-07-15)

- Relinked the WATI test number (`+15553798073`) from the seeded fake "Test Apartment" to the user's **real** apartment ("bezhan kalichava", real WiFi `bejo`/`12345678`), and extended its booking's `check_out` date so it's actually active today. Confirmed the bot now answers with real apartment-specific data (`messages.content` showing the real `12345678` WiFi password, matched to the right apartment) — the AI-answer/escalation logic is correctly apartment-scoped, not hardcoded/shared.
- Hit a **Meta free-test-number limitation**: outbound WATI send calls return success (200, no errors in our logs) but Meta silently drops delivery to any recipient not on that test number's pre-verified allowlist. WATI's own "Add Webhook" UI doesn't expose Meta's recipient-allowlist controls, and since WATI manages the underlying Meta app on the user's behalf, the user has no `developers.facebook.com` access to add one either. A second test number ("hostAI") has the same restriction (it's per-Meta-app, not something a new number bypasses), and its display name is separately rejected by Meta (requires an operational business website, out of scope here) — unrelated to the delivery issue, a dead end for now.
- **Decision**: not worth pursuing further right now — the pipeline's correctness is already proven (real webhook receipt, correct DB lookups, correct OpenAI answers, correct escalation creation, WATI API accepting sends). Actual phone delivery will naturally work once a real (non-test) number is connected for production, which needs to happen at deployment time anyway. Verify DB rows directly (Supabase Table Editor / SQL Editor on `messages`/`escalations`, or this app's own Inbox page) instead of expecting replies to arrive on WhatsApp locally.
- ngrok's free-tier URL changes every restart — when it changes, WATI emails "Action Required! Your webhooks are failing" until the URL is updated in both `.env.local` (`NEXT_PUBLIC_APP_URL`) and the WATI webhook config. Happened once already; resolved.

### 5.5 Remaining gaps

1. Not deployed → production needs **Vercel Pro** (plan requires `maxDuration = 60` on `/api/agent/process`; Hobby caps at 10s) and a stable webhook URL (ngrok's free-tier URL changes on every restart and isn't suitable beyond local testing).
2. `no_booking_fallback` WhatsApp template not yet created/approved in WATI — only matters for guests who message with no active booking; the happy-path (active booking, KB-covered and non-KB-covered questions) is fully verified via DB inspection.
3. Actual delivery to a real phone is blocked locally by Meta's test-number recipient-allowlist restriction (see §5.4) — will resolve naturally with a real production number, not worth fixing for local dev.
4. Project is **not yet a git repository** — needed before a normal Vercel deployment flow (git init + GitHub + Vercel connection).

---

## 6. Recommended next steps (priority order)

1. ~~Generate `INTERNAL_API_SECRET`~~ — done.
2. ~~Fix the 4 ESLint errors~~ — done.
3. ~~Swap AI provider to OpenAI~~ — done (`lib/agent/ai.ts`, `package.json`, `.env.local`).
4. ~~Supply `OPENAI_API_KEY`~~ — done.
5. ~~Verify the full webhook → booking lookup → AI reply/escalation → DB pipeline locally~~ — done, see §5.1.
6. ~~Fix WATI payload/request-format mismatches found while researching the real API~~ — done, see §2.
7. ~~Sign up for WATI, get a test number, set up ngrok, register the webhook~~ — done, see §5.2.
8. ~~Send a real WhatsApp message and confirm the live loop~~ — done, see §5.2. **The bot is fully working end-to-end with real WhatsApp messages as of 2026-07-15.**
9. Confirm Vercel Pro plan, deploy, point WATI's webhook URL at the production domain (with a stable URL, not ngrok's free-tier one).
10. (Optional) Create and get Meta approval for a `no_booking_fallback` WhatsApp template, for guests without an active booking.
11. (Optional/deferred per plan) Stripe billing logic — DB columns exist (`hosts.stripe_customer_id`, `subscription_status`) but no billing logic is implemented, matching the plan's explicit "scaffold only" instruction.

---

## 7. WATI signup + local wiring walkthrough

1. **Create a WATI account** at wati.io (trial or paid). You'll get access to a WhatsApp Business number — either WATI's shared sandbox number for testing, or you connect your own Meta-approved WhatsApp Business number.
2. **Get API credentials**: in the WATI dashboard, go to the **API Docs** section. Copy the API endpoint (format like `https://live-mt-server.wati.io/<ACCOUNT_ID>`) into `WATI_API_URL`, and the bearer token into `WATI_API_TOKEN` in `.env.local`.
3. **Install and start ngrok**: `ngrok http 3000`, copy the `https://...ngrok.io` forwarding URL it prints.
4. **Point the app at the tunnel**: set `NEXT_PUBLIC_APP_URL` in `.env.local` to that ngrok URL, then restart `npm run dev` (the webhook route calls back into `/api/agent/process` using this value).
5. **Register the webhook in WATI**: dashboard → **Connectors** → **Webhooks** → **Add Webhook**.
   - URL: `<ngrok-url>/api/webhook/whatsapp`
   - Status: Enabled
   - Events: select "Message Received" (or equivalent inbound-message event)
   - Headers: add a custom header `x-wati-secret` = the same value as `WATI_WEBHOOK_SECRET` in `.env.local`. A placeholder value is already generated there for local testing — swap it for a fresh one if you prefer, just make sure both sides match.
   - Use WATI's "Trigger sample callback" button first to confirm connectivity before testing with a real message.
6. **Point an apartment at the real number**: update the test apartment's (or a real one's) `whatsapp_number` column to the WATI number in E.164 format (e.g. `+14155552671`) — the bot looks up which host owns a message by matching `channelPhoneNumber` against this column.
7. **(Optional, for the no-active-booking path)** create and get Meta-approved a WhatsApp template named `no_booking_fallback` in WATI's Templates section — approval can take hours, so start it early if you want that path tested. Not required for testing the main active-booking flow.
8. **Send a real WhatsApp message** from your phone to the connected WATI number, then check `npm run dev`'s terminal output and the `messages`/`escalations` tables in Supabase to confirm it processed correctly.

I can't do steps 1 and 7 (account signup, template approval) — those require your WATI account. Once you've got `WATI_API_URL`/`WATI_API_TOKEN` and the webhook registered, tell me and I'll help verify the response format from a real send call and debug anything that doesn't work.
