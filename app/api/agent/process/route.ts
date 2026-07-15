import { createServiceClient } from '@/lib/supabase/server'
import { findActiveBooking, logMessage } from '@/lib/agent/router'
import { generateAIReply } from '@/lib/agent/ai'
import { sendWhatsAppMessage, sendWhatsAppTemplateMessage } from '@/lib/agent/whatsapp'
import { WATIWebhookPayload } from '@/types'

export const maxDuration = 60 // requires Vercel Pro

export async function POST(req: Request) {
  const secret = req.headers.get('x-internal-secret')
  if (secret !== process.env.INTERNAL_API_SECRET) {
    return new Response('Unauthorized', { status: 401 })
  }

  const payload: WATIWebhookPayload = await req.json()
  const senderPhone = '+' + payload.waId
  const receivingPhone = '+' + payload.channelPhoneNumber
  const messageText = payload.text!

  const supabase = createServiceClient()

  // 1. Resolve host from receiving WhatsApp number
  const { data: hostApartment } = await supabase
    .from('apartments')
    .select('host_id')
    .eq('whatsapp_number', receivingPhone)
    .limit(1)
    .single()

  if (!hostApartment) {
    return new Response('OK', { status: 200 })
  }

  // 2. Find active booking for the sender
  const booking = await findActiveBooking(supabase, senderPhone, hostApartment.host_id)

  // 3. Log inbound message (capture id for escalation link)
  const inboundMessage = await logMessage({
    supabase,
    apartmentId: booking?.apartment.id ?? null,
    guestId: booking?.guest.id ?? null,
    bookingId: booking?.booking.id ?? null,
    direction: 'inbound',
    content: messageText,
    wasAiReply: false,
    wasEscalated: false,
  })

  // 4. No active booking — send fallback template (safe for first-contact outside 24h window)
  if (!booking) {
    try {
      await sendWhatsAppTemplateMessage(senderPhone, 'no_booking_fallback', receivingPhone)
    } catch (err) {
      console.error('[Agent] Fallback template send failed:', err)
    }
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
    console.error('[Agent] Claude API error:', err)
    aiResult = { canAnswer: false, reply: null }
  }

  // 7a. AI answered
  if (aiResult.canAnswer) {
    try {
      await sendWhatsAppMessage(senderPhone, aiResult.reply!)
    } catch (err) {
      console.error('[Agent] Failed to send AI reply:', err)
    }
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
    // Increment KB usage counter for this apartment
    await supabase.rpc('increment_kb_times_used', { p_apartment_id: booking.apartment.id })
  }

  // 7b. AI couldn't answer — escalate to host
  if (!aiResult.canAnswer) {
    const holdingMessage = "Thanks for your message! The host will get back to you shortly."
    try {
      await sendWhatsAppMessage(senderPhone, holdingMessage)
    } catch (err) {
      console.error('[Agent] Failed to send holding message:', err)
    }

    await supabase.from('escalations').insert({
      message_id: inboundMessage.id,
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
