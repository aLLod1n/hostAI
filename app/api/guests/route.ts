import { requireUser } from '@/lib/supabase/server'
import { ApiResponse, Guest } from '@/types'

export async function GET() {
  const { user, supabase } = await requireUser()
  if (!user) return Response.json({ data: null, error: 'Unauthorized' } satisfies ApiResponse<null>, { status: 401 })

  const { data, error } = await supabase
    .from('guests')
    .select('*')
    .eq('host_id', user.id)
    .order('last_seen', { ascending: false })

  if (error) return Response.json({ data: null, error: error.message } satisfies ApiResponse<null>, { status: 500 })
  return Response.json({ data, error: null } satisfies ApiResponse<Guest[]>)
}
