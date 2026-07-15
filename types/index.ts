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

export interface GuestWithActiveBooking extends Guest {
  active_booking?: BookingWithRelations
}

// WATI webhook payload — matches WATI's actual "Message Received" event schema
// (docs.wati.io/reference/message-received), not the shape in hostAI plan.md
export interface WATIWebhookPayload {
  id: string
  created: string
  waId: string               // sender phone without "+" e.g. "995599123456"
  channelPhoneNumber: string // receiving WhatsApp Business number without "+" e.g. "995599000000"
  text?: string               // plain string, not { body: string }
  type: string                // "text" | "image" | "audio" | etc.
}

// Standard API response shape
export interface ApiResponse<T> {
  data: T | null
  error: string | null
}
