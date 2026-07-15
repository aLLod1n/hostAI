import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase/server'
import { ApiResponse, KnowledgeBaseEntry } from '@/types'

async function getUser() {
  const authClient = await createServerSupabaseClient()
  const { data: { user } } = await authClient.auth.getUser()
  return user
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getUser()
  if (!user) return Response.json({ data: null, error: 'Unauthorized' } satisfies ApiResponse<null>, { status: 401 })

  const supabase = createServiceClient()
  const body = await req.json()
  const { data, error } = await supabase
    .from('knowledge_base')
    .update(body)
    .eq('id', id)
    .select()
    .single()

  if (error) return Response.json({ data: null, error: error.message } satisfies ApiResponse<null>, { status: 500 })
  return Response.json({ data, error: null } satisfies ApiResponse<KnowledgeBaseEntry>)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getUser()
  if (!user) return Response.json({ data: null, error: 'Unauthorized' } satisfies ApiResponse<null>, { status: 401 })

  const supabase = createServiceClient()
  const { error } = await supabase.from('knowledge_base').delete().eq('id', id)
  if (error) return Response.json({ data: null, error: error.message } satisfies ApiResponse<null>, { status: 500 })
  return Response.json({ data: { success: true }, error: null })
}
