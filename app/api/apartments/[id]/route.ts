import { requireUser } from '@/lib/supabase/server'
import { ApiResponse, Apartment } from '@/types'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { user, supabase } = await requireUser()
  if (!user) return Response.json({ data: null, error: 'Unauthorized' } satisfies ApiResponse<null>, { status: 401 })

  const { data, error } = await supabase
    .from('apartments')
    .select('*')
    .eq('id', id)
    .eq('host_id', user.id)
    .single()

  if (error) return Response.json({ data: null, error: 'Not found' } satisfies ApiResponse<null>, { status: 404 })
  return Response.json({ data, error: null } satisfies ApiResponse<Apartment>)
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { user, supabase } = await requireUser()
  if (!user) return Response.json({ data: null, error: 'Unauthorized' } satisfies ApiResponse<null>, { status: 401 })

  const body = await req.json()
  const { data, error } = await supabase
    .from('apartments')
    .update(body)
    .eq('id', id)
    .eq('host_id', user.id)
    .select()
    .single()

  if (error) return Response.json({ data: null, error: error.message } satisfies ApiResponse<null>, { status: 500 })
  return Response.json({ data, error: null } satisfies ApiResponse<Apartment>)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { user, supabase } = await requireUser()
  if (!user) return Response.json({ data: null, error: 'Unauthorized' } satisfies ApiResponse<null>, { status: 401 })

  const { error } = await supabase
    .from('apartments')
    .delete()
    .eq('id', id)
    .eq('host_id', user.id)

  if (error) return Response.json({ data: null, error: error.message } satisfies ApiResponse<null>, { status: 500 })
  return Response.json({ data: { success: true }, error: null })
}
