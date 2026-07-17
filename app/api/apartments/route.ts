import { requireUser } from '@/lib/supabase/server'
import { ApiResponse, Apartment } from '@/types'

export async function GET() {
  const { user, supabase } = await requireUser()
  if (!user) return Response.json({ data: null, error: 'Unauthorized' } satisfies ApiResponse<null>, { status: 401 })

  const { data, error } = await supabase
    .from('apartments')
    .select('*')
    .eq('host_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return Response.json({ data: null, error: error.message } satisfies ApiResponse<null>, { status: 500 })
  return Response.json({ data, error: null } satisfies ApiResponse<Apartment[]>)
}

export async function POST(req: Request) {
  const { user, supabase } = await requireUser()
  if (!user) return Response.json({ data: null, error: 'Unauthorized' } satisfies ApiResponse<null>, { status: 401 })

  const body = await req.json()
  console.log('[apartments POST] user.id:', user.id)
  console.log('[apartments POST] svc key prefix:', process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 30))
  console.log('[apartments POST] body:', body)
  const { data, error } = await supabase
    .from('apartments')
    .insert({ ...body, host_id: user.id })
    .select()
    .single()

  if (error) {
    console.error('[apartments POST] error:', error)
    return Response.json({ data: null, error: error.message } satisfies ApiResponse<null>, { status: 500 })
  }
  return Response.json({ data, error: null } satisfies ApiResponse<Apartment>, { status: 201 })
}
