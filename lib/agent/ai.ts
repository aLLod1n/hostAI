import OpenAI from 'openai'
import { Apartment, Booking, Guest, KnowledgeBaseEntry } from '@/types'

// Instantiated lazily (not at module scope) so importing this file doesn't throw
// during Next.js build-time page-data collection when OPENAI_API_KEY isn't set yet.
let client: OpenAI | null = null
function getClient(): OpenAI {
  if (!client) client = new OpenAI()
  return client
}

interface AIReplyInput {
  apartment: Apartment
  guest: Guest
  booking: Booking
  knowledgeBase: KnowledgeBaseEntry[]
  guestMessage: string
}

interface AIReplyResult {
  canAnswer: boolean
  reply: string | null
}

export async function generateAIReply({
  apartment, guest, booking, knowledgeBase, guestMessage,
}: AIReplyInput): Promise<AIReplyResult> {
  const kbText = knowledgeBase.length > 0
    ? knowledgeBase.map(kb => `Q: ${kb.question}\nA: ${kb.answer}`).join('\n\n')
    : 'No FAQ entries added yet.'

  const systemPrompt = `You are a helpful assistant for guests staying at "${apartment.name}"${apartment.address ? ` located at ${apartment.address}` : ''}.

Guest name: ${guest.name ?? 'Guest'}
Check-in: ${booking.check_in}
Check-out: ${booking.check_out}

WIFI:
Network: ${apartment.wifi_name ?? 'not provided'}
Password: ${apartment.wifi_password ?? 'not provided'}

CHECK-IN INSTRUCTIONS:
${apartment.check_in_instructions ?? 'Not provided.'}

KNOWLEDGE BASE:
${kbText}

RULES:
- Reply in the same language the guest is writing in
- Be warm, friendly, and concise — this is a WhatsApp conversation
- Only answer from the information above — never invent details
- If the answer is not in the knowledge base, respond ONLY with the exact text: CANNOT_ANSWER
- Do not apologize or explain when returning CANNOT_ANSWER — just return that exact string`

  const response = await getClient().chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    max_tokens: 500,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: guestMessage },
    ],
  })

  const replyText = response.choices[0]?.message?.content?.trim() || 'CANNOT_ANSWER'

  if (replyText === 'CANNOT_ANSWER') {
    return { canAnswer: false, reply: null }
  }

  // TODO: if guest.language is null, detect language from replyText and update the guests row
  // Use the `franc` package: import { franc } from 'franc'; const lang = franc(replyText)
  // Then: supabase.from('guests').update({ language: lang }).eq('id', guest.id)

  return { canAnswer: true, reply: replyText }
}
