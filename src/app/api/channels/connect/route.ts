import { NextResponse } from 'next/server'
import { createInstance, getQRCode, getConnectionState } from '@/lib/channels/evolution-api'
import { withAuthAndRateLimit } from '@/lib/api-wrapper'

export const POST = withAuthAndRateLimit(
  async (req, { user, supabase }) => {
    // 1. See if user already has a channel
    let { data: channel } = await supabase
      .from('channels')
      .select('id, name, active')
      .eq('seller_id', user.id)
      .eq('type', 'whatsapp')
      .limit(1)
      .maybeSingle()

    const instanceName = channel?.name || `sf_${user.id.replace(/-/g, '')}`

    if (!channel) {
      // Create channel in DB
      const { data: newChannel, error } = await supabase
        .from('channels')
        .insert({
          seller_id: user.id,
          type: 'whatsapp',
          name: instanceName,
          active: false,
        })
        .select()
        .single()
      
      if (error) throw error
      channel = newChannel
    }

    const host = (process.env.NEXT_PUBLIC_APP_URL || 'https://sahelflow.vercel.app').trim()
    const webhookUrl = `${host}/api/webhooks/evolution`

    // 2. Try to fetch connection state to see if it exists in Evolution API
    try {
      const state = await getConnectionState(instanceName)
      if (state?.instance?.state === 'open') {
        return NextResponse.json({ status: 'connected', instanceName })
      }
    } catch {
      // Instance probably doesn't exist, we will create it
      console.log(`[WhatsApp Connect] Creating new instance: ${instanceName}`)
      await createInstance(instanceName, webhookUrl)
    }

    // 3. Get QR Code
    const qrData = await getQRCode(instanceName)
    
    return NextResponse.json({ 
      status: 'qr', 
      qrCode: qrData.base64,
      pairingCode: qrData.pairingCode,
      instanceName 
    })
  },
  { rateLimitConfig: { maxRequests: 5, windowMs: 60000 } } // Strict rate limit to prevent abuse of external WhatsApp api
)
