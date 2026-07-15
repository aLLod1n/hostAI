import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase/server'
import { ApiResponse, EscalationWithRelations } from '@/types'

async function getUser() {
  const authClient = await createServerSupabaseClient()
  const { data: { user } } = await authClient.auth.getUser()
  return user
}

export async function GET(req: Request) {
  const user = await getUser()
  if (!user) return Response.json({ data: null, error: 'Unauthorized' } satisfies ApiResponse<null>, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')

  const supabase = createServiceClient()
  const { data: aptIds } = await supabase
    .from('apartments')
    .select('id')
    .eq('host_id', user.id)

  const ids = (aptIds ?? []).map(a => a.id)

  let query = supabase
    .from('escalations')
    .select('*, guest:guests(*), apartment:apartments(*)')
    .in('apartment_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return Response.json({ data: null, error: error.message } satisfies ApiResponse<null>, { status: 500 })
  return Response.json({ data, error: null } satisfies ApiResponse<EscalationWithRelations[]>)
}
