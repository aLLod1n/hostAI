import { createServerSupabaseClient, createServiceClient } from '@/lib/supabase/server'
import { ApiResponse, KnowledgeBaseEntry } from '@/types'

async function getUser() {
  const authClient = await createServerSupabaseClient()
  const { data: { user } } = await authClient.auth.getUser()
  return user
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getUser()
  if (!user) return Response.json({ data: null, error: 'Unauthorized' } satisfies ApiResponse<null>, { status: 401 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('knowledge_base')
    .select('*')
    .eq('apartment_id', id)
    .order('times_used', { ascending: false })

  if (error) return Response.json({ data: null, error: error.message } satisfies ApiResponse<null>, { status: 500 })
  return Response.json({ data, error: null } satisfies ApiResponse<KnowledgeBaseEntry[]>)
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getUser()
  if (!user) return Response.json({ data: null, error: 'Unauthorized' } satisfies ApiResponse<null>, { status: 401 })

  const supabase = createServiceClient()
  const { question, answer } = await req.json()
  const { data, error } = await supabase
    .from('knowledge_base')
    .insert({ apartment_id: id, question, answer })
    .select()
    .single()

  if (error) return Response.json({ data: null, error: error.message } satisfies ApiResponse<null>, { status: 500 })
  return Response.json({ data, error: null } satisfies ApiResponse<KnowledgeBaseEntry>, { status: 201 })
}
