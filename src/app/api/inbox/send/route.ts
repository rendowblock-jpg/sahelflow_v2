import { NextResponse } from 'next/server'
import { sendText } from '@/lib/channels/evolution-api'
import { sendMessageSchema } from '@/lib/validation'
import { withAuthAndRateLimit } from '@/lib/api-wrapper'

/**
 * POST /api/inbox/send
 * Sends a WhatsApp message via Evolution API and stores it in DB.
 */
export const POST = withAuthAndRateLimit(
  async (req, { user: _user, sellerId, supabase, body }) => {
    const { conversationId, text, replyToId, quotedText } = body!

    // Get conversation with channel info
    const { data: convo } = await supabase
      .from('conversations')
      .select('id, platform_thread_id, seller_id, channel:channels(id, name, active)')
      .eq('id', conversationId)
      .single()

    if (!convo) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    // Verify ownership
    if (convo.seller_id !== sellerId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const channel = convo.channel as unknown as { id: string; name: string; active: boolean } | null
    if (!channel?.name || !channel.active) {
      return NextResponse.json({ error: 'WhatsApp not connected' }, { status: 400 })
    }

    // Extract phone from platform_thread_id (JID format: 213xxx@s.whatsapp.net)
    const phone = convo.platform_thread_id.split('@')[0]

    // Send via Evolution API
    await sendText(channel.name, phone, text)

    // Store in DB
    await supabase.from('messages').insert({
      conversation_id: conversationId,
      direction: 'outbound',
      content: text,
      content_type: 'text',
      is_ai_reply: false,
      reply_to_id: replyToId || null,
      quoted_text: quotedText || null,
    })

    // Update conversation timestamp
    await supabase
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversationId)

    return NextResponse.json({ ok: true })
  },
  {
    schema: sendMessageSchema,
    rateLimitConfig: { maxRequests: 20, windowMs: 60000 },
  }
)
