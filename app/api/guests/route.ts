import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase/server'
import { ApiResponse, Guest } from '@/types'

async function getUser() {
  const authClient = await createServerSupabaseClient()
  const { data: { user } } = await authClient.auth.getUser()
  return user
}

export async function GET() {
  const user = await getUser()
  if (!user) return Response.json({ data: null, error: 'Unauthorized' } satisfies ApiResponse<null>, { status: 401 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('guests')
    .select('*')
    .eq('host_id', user.id)
    .order('last_seen', { ascending: false })

  if (error) return Response.json({ data: null, error: error.message } satisfies ApiResponse<null>, { status: 500 })
  return Response.json({ data, error: null } satisfies ApiResponse<Guest[]>)
}
