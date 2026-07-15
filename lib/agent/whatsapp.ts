// WATI's sendSessionMessage takes messageText as a query param, not a JSON body field
// (docs.wati.io/reference/post_api-v1-sendsessionmessage-whatsappnumber)
export async function sendWhatsAppMessage(phone: string, message: string): Promise<void> {
  const phoneClean = phone.replace('+', '')
  const url = new URL(`${process.env.WATI_API_URL}/api/v1/sendSessionMessage/${phoneClean}`)
  url.searchParams.set('messageText', message)

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WATI_API_TOKEN}`,
    },
  })
  if (!res.ok) {
    const err = await res.text()
    console.error('[WATI] sendSessionMessage failed:', err)
    throw new Error(`WATI send failed: ${err}`)
  }
}

// For first-contact / no-booking fallback — uses a pre-approved template to avoid 24h session window issues.
// WATI's sendTemplateMessage takes whatsappNumber as a query param; channel_number (which host number
// sends it) and parameters are required in the JSON body
// (docs.wati.io/reference/post_api-v1-sendtemplatemessage)
export async function sendWhatsAppTemplateMessage(
  phone: string,
  templateName: string,
  channelPhoneNumber: string
): Promise<void> {
  const phoneClean = phone.replace('+', '')
  const channelClean = channelPhoneNumber.replace('+', '')
  const url = new URL(`${process.env.WATI_API_URL}/api/v1/sendTemplateMessage`)
  url.searchParams.set('whatsappNumber', phoneClean)

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WATI_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      template_name: templateName,
      broadcast_name: templateName,
      channel_number: channelClean,
      parameters: [],
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    console.error('[WATI] sendTemplateMessage failed:', err)
    throw new Error(`WATI template send failed: ${err}`)
  }
}
