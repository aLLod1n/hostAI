import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase/server'
import { sendWhatsAppMessage } from '@/lib/agent/whatsapp'
import { ApiResponse } from '@/types'

async function getUser() {
  const authClient = await createServerSupabaseClient()
  const { data: { user } } = await authClient.auth.getUser()
  return user
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getUser()
  if (!user) return Response.json({ data: null, error: 'Unauthorized' } satisfies ApiResponse<null>, { status: 401 })

  const supabase = createServiceClient()
  const { replyText, saveToKb } = await req.json()

  const { data: escalation } = await supabase
    .from('escalations')
    .select('*, guest:guests(phone), apartment:apartments(*)')
    .eq('id', id)
    .single()

  if (!escalation) return Response.json({ data: null, error: 'Not found' } satisfies ApiResponse<null>, { status: 404 })

  try {
    await sendWhatsAppMessage(escalation.guest.phone, replyText)
  } catch (err) {
    console.error('[Inbox] Failed to send reply via WhatsApp:', err)
    return Response.json({ data: null, error: 'Failed to send WhatsApp message' } satisfies ApiResponse<null>, { status: 502 })
  }

  await supabase.from('messages').insert({
    apartment_id: escalation.apartment_id,
    guest_id: escalation.guest_id,
    booking_id: escalation.booking_id,
    direction: 'outbound',
    content: replyText,
    was_ai_reply: false,
    was_escalated: false,
  })

  await supabase
    .from('escalations')
    .update({
      status: 'resolved',
      host_reply: replyText,
      resolved_at: new Date().toISOString(),
      save_to_kb: saveToKb ?? false,
    })
    .eq('id', id)

  if (saveToKb) {
    await supabase.from('knowledge_base').insert({
      apartment_id: escalation.apartment_id,
      question: escalation.guest_question,
      answer: replyText,
    })
  }

  return Response.json({ data: { success: true }, error: null })
}
