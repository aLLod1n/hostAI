import { requireUser } from '@/lib/supabase/server'
import { ApiResponse, BookingWithRelations } from '@/types'
import { normalizePhone } from '@/lib/utils'

export async function GET() {
  const { user, supabase } = await requireUser()
  if (!user) return Response.json({ data: null, error: 'Unauthorized' } satisfies ApiResponse<null>, { status: 401 })

  const { data: aptIds } = await supabase
    .from('apartments')
    .select('id')
    .eq('host_id', user.id)

  const ids = (aptIds ?? []).map(a => a.id)

  const { data, error } = await supabase
    .from('bookings')
    .select('*, guest:guests(*), apartment:apartments(*)')
    .in('apartment_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
    .order('created_at', { ascending: false })

  if (error) return Response.json({ data: null, error: error.message } satisfies ApiResponse<null>, { status: 500 })
  return Response.json({ data, error: null } satisfies ApiResponse<BookingWithRelations[]>)
}

export async function POST(req: Request) {
  const { user, supabase } = await requireUser()
  if (!user) return Response.json({ data: null, error: 'Unauthorized' } satisfies ApiResponse<null>, { status: 401 })

  const { apartment_id, phone, guest_name, check_in, check_out, source } = await req.json()
  const normalizedPhone = normalizePhone(phone)

  const { data: guest, error: guestError } = await supabase
    .from('guests')
    .upsert({ host_id: user.id, phone: normalizedPhone, name: guest_name ?? null }, { onConflict: 'host_id,phone' })
    .select()
    .single()

  if (guestError) return Response.json({ data: null, error: guestError.message } satisfies ApiResponse<null>, { status: 500 })

  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .insert({ apartment_id, guest_id: guest.id, check_in, check_out, source: source ?? null })
    .select('*, guest:guests(*), apartment:apartments(*)')
    .single()

  if (bookingError) return Response.json({ data: null, error: bookingError.message } satisfies ApiResponse<null>, { status: 500 })
  return Response.json({ data: booking, error: null } satisfies ApiResponse<BookingWithRelations>, { status: 201 })
}
