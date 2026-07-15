import { SupabaseClient } from '@supabase/supabase-js'
import { Message } from '@/types'

export async function findActiveBooking(supabase: SupabaseClient, phone: string, hostId: string) {
  const today = new Date().toISOString().split('T')[0]

  // Step 1: resolve guest by (host_id, phone)
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
    .select('*, guest:guests(*), apartment:apartments(*, knowledge_base(*))')
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
    knowledgeBase: data.apartment.knowledge_base ?? [],
  }
}

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
