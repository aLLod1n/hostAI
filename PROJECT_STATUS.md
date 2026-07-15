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

**Deployed to production and verified working end-to-end.** MVP is code-complete, builds/lints/type-checks clean, live at `https://host-ai-ebon.vercel.app` on Vercel **Hobby** (not Pro — see §5.5), with WATI's webhook pointed at it and a confirmed real request round-tripping through webhook auth → async hand-off → booking lookup → OpenAI → KB match → DB writes, all within the 10s Hobby timeout. AI provider is **OpenAI**, not Anthropic Claude as `hostAI plan.md` specifies (deviation done at user's request). Project is on GitHub (`github.com/aLLod1n/hostAI`, `main`), connected to Vercel for deploys. Remaining work is the optional `no_booking_fallback` template approval — see §6.

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

### 5.6 Production deployment + verification (done 2026-07-15)

- Deployed to Vercel on the **Hobby** plan (see §5.5 item 1 for the Pro-vs-Hobby decision) at `https://host-ai-ebon.vercel.app`. Repo `github.com/aLLod1n/hostAI` connected for git-push deploys.
- Env vars copied into Vercel from `.env.local`; `NEXT_PUBLIC_APP_URL` set to the production URL (this one has to point at the real deployed domain, not ngrok, since it's what `/api/webhook/whatsapp` calls back into for the async hand-off).
- WATI's webhook URL updated from the ngrok URL to `https://host-ai-ebon.vercel.app/api/webhook/whatsapp?secret=<WATI_WEBHOOK_SECRET>`.
- **Verified live**: root URL correctly redirects unauthenticated requests to `/login` (route guard working). Webhook auth confirmed (401 without `?secret=`, 200 with it). Sent a real webhook payload end-to-end: inbound message logged, OpenAI answered correctly from the KB (`"The wifi password is 12345678."`), outbound message logged, full round-trip in ~4s — comfortably inside the Hobby 10s cap. The safety-net escalation (§5.5 item 1) was correctly deleted since the AI answered successfully, confirming that logic works in production too.
- User separately sent a real WhatsApp message ("როგორ ხარ ?") that correctly escalated (not KB-covered) — sitting as an open escalation in the Inbox now, along with two earlier ones (`"hey yoyu"`, `"hello"`) awaiting a host reply.

### 5.5 Remaining gaps

1. ~~Not deployed~~ — done 2026-07-15, see §5.6. **Decision: deployed on Vercel Hobby (free), not Pro** — `hostAI plan.md` assumed Pro was required for `maxDuration = 60` (Hobby caps at 10s), but real production timings show the full pipeline (DB lookup + OpenAI + WATI send) completing in ~4s, comfortably under 10s. `app/api/agent/process/route.ts` sets `maxDuration = 10` and opens a safety-net `escalations` row (status `open`) *before* calling OpenAI/WATI, deleting it if the AI answers successfully — so a hard Hobby-timeout kill mid-request leaves the question visible in the host's inbox instead of silently vanishing. Revisit Pro only if Hobby's 10s cap proves too tight under real load.
2. `no_booking_fallback` WhatsApp template not yet created/approved in WATI — only matters for guests who message with no active booking; the happy-path (active booking, KB-covered and non-KB-covered questions) is fully verified in production, see §5.6.
3. Actual delivery to arbitrary phones is still blocked by Meta's test-number recipient-allowlist restriction (see §5.4) — unrelated to deployment, will resolve once a real (non-test) WhatsApp Business number replaces the Meta free test number.
4. ~~Project is not yet a git repository~~ — done 2026-07-15: initialized locally and pushed to `github.com/aLLod1n/hostAI` (`main` branch). `.env*`, `node_modules`, local dev logs (`dev-server.log`, `ngrok.log`), and `.claude/settings.local.json` are all gitignored — no secrets committed.

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
9. ~~Push project to GitHub~~ — done, see §5.5 item 4 (`github.com/aLLod1n/hostAI`, `main`).
10. ~~Connect the GitHub repo to Vercel, deploy, copy env vars in, point WATI's webhook URL at the production domain~~ — done 2026-07-15, see §5.6. **Live at `https://host-ai-ebon.vercel.app` on Vercel Hobby, verified working end-to-end in production.**
11. (Optional) Create and get Meta approval for a `no_booking_fallback` WhatsApp template, for guests without an active booking.
12. (Optional/deferred per plan) Stripe billing logic — DB columns exist (`hosts.stripe_customer_id`, `subscription_status`) but no billing logic is implemented, matching the plan's explicit "scaffold only" instruction.
13. Host has 3 open escalations waiting in the Inbox (`"როგორ ხარ ?"`, `"hey yoyu"`, `"hello"`) from testing — reply to or clear these via the Inbox page when convenient (test data, not urgent).

---

## 7. WATI signup + local wiring walkthrough

**Steps 1–6 and 8 are done** (see §3, §5.2, §5.4) — kept here as a reference for redoing the local wiring (e.g. after an ngrok restart changes the tunnel URL) rather than as an open TODO list.

1. ~~**Create a WATI account** at wati.io (trial or paid).~~ Done — trial account created, using Meta's free test number `+15553798073`.
2. ~~**Get API credentials**~~ Done — `WATI_API_URL`/`WATI_API_TOKEN` set in `.env.local`, live-verified (see §3).
3. **Install and start ngrok**: `ngrok http 3000`, copy the `https://...ngrok-free.app` forwarding URL it prints. **Needed again any time the tunnel restarts** — the free-tier URL isn't stable.
4. **Point the app at the tunnel**: set `NEXT_PUBLIC_APP_URL` in `.env.local` to that ngrok URL, then restart `npm run dev`.
5. **Register the webhook in WATI**: dashboard → **Connectors** → **Webhooks** → **Add Webhook**.
   - URL: `<ngrok-url>/api/webhook/whatsapp?secret=<WATI_WEBHOOK_SECRET>` — the secret goes in as a **query param**, not a header. WATI's "Add Webhook" form has no custom-headers field, so the `x-wati-secret` header approach doesn't work (see §2, "WATI webhook secret delivery").
   - Status: Enabled
   - Events: select "Message Received"
   - Use WATI's "Trigger sample callback" button first to confirm connectivity before testing with a real message.
   - **Needed again any time the ngrok URL changes.**
6. ~~**Point an apartment at the real number**~~ Done — the real apartment ("bezhan kalichava") is linked to `+15553798073` (see §5.4).
7. **(Optional, still pending)** create and get Meta-approved a WhatsApp template named `no_booking_fallback` in WATI's Templates section — only needed for the no-active-booking fallback path; approval can take hours. Requires your WATI account, I can't do this step.
8. ~~**Send a real WhatsApp message**~~ Done — confirmed working end-to-end 2026-07-15 (see §5.2, §5.4). Note: delivery to arbitrary phones is currently blocked by Meta's test-number allowlist restriction — verify via the Supabase `messages`/`escalations` tables or the app's own Inbox page instead of expecting a reply on WhatsApp.
