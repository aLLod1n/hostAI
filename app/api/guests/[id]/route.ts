import { requireUser } from '@/lib/supabase/server'
import { ApiResponse, Guest, Message } from '@/types'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { user, supabase } = await requireUser()
  if (!user) return Response.json({ data: null, error: 'Unauthorized' } satisfies ApiResponse<null>, { status: 401 })

  const [guestRes, messagesRes] = await Promise.all([
    supabase.from('guests').select('*').eq('id', id).eq('host_id', user.id).single(),
    supabase.from('messages').select('*').eq('guest_id', id).order('created_at', { ascending: true }),
  ])

  if (guestRes.error) return Response.json({ data: null, error: 'Not found' } satisfies ApiResponse<null>, { status: 404 })

  return Response.json({
    data: { guest: guestRes.data as Guest, messages: messagesRes.data as Message[] },
    error: null,
  })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { user, supabase } = await requireUser()
  if (!user) return Response.json({ data: null, error: 'Unauthorized' } satisfies ApiResponse<null>, { status: 401 })

  const { notes } = await req.json()
  const { data, error } = await supabase
    .from('guests')
    .update({ notes })
    .eq('id', id)
    .eq('host_id', user.id)
    .select()
    .single()

  if (error) return Response.json({ data: null, error: error.message } satisfies ApiResponse<null>, { status: 500 })
  return Response.json({ data, error: null } satisfies ApiResponse<Guest>)
}
