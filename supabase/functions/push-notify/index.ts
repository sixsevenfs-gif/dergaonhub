// Sends an Android notification (Firebase Cloud Messaging) to the customer's phones when their order is
// confirmed, on the way, arriving, delivered, cancelled, or the UPI payment is accepted.
// Called by the database trigger in migrations/028_push_notifications.sql, never by the site or the app.
// It only sends what the order row says, once per event (push_log), so calling it again does nothing.
//
// Deploy:  npx supabase functions deploy push-notify --no-verify-jwt --project-ref <your project ref> --use-api
// Secret:  FCM_SERVICE_ACCOUNT = the whole JSON key of a Firebase service account
//          (Firebase console → Project settings → Service accounts → Generate new private key), e.g.
//          npx supabase secrets set FCM_SERVICE_ACCOUNT="$(cat jholzo-firebase-key.json)" --project-ref <ref>

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const KINDS = ['confirmed', 'on_the_way', 'arriving', 'delivered', 'cancelled', 'paid'] as const
type Kind = (typeof KINDS)[number]
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const db = (path: string, init: RequestInit = {}) => {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  return fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
}

const rupee = (n: number) => {
  const v = Math.round(Number(n) * 100) / 100
  return '₹' + v.toLocaleString('en-IN', Number.isInteger(v) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })

// Same words as the website's WhatsApp messages (src/lib/whatsapp.js).
function message(kind: Kind, o: Record<string, any>): { title: string; body: string } {
  const n = `#${o.order_number}`
  const paid = o.payment_method === 'upi_now' && o.payment_status === 'paid'
  const keepReady = paid ? 'Already paid online ✓' : `Please keep ${rupee(o.total)} ready (cash or UPI).`
  const when = o.delivery_type === 'express' && o.express_by ? `by ${clock(o.express_by)}` : 'this evening'
  switch (kind) {
    case 'confirmed':
      return { title: 'Order confirmed ✅', body: `Your Jholzo order ${n} is confirmed. We will deliver it ${when}.` }
    case 'on_the_way':
      return { title: 'On the way 🛵', body: `Our rider has left with your order ${n}. You will get it in 10–15 minutes. ${keepReady}` }
    case 'arriving':
      return { title: 'Arriving soon 📍', body: `Our rider is almost at your door with order ${n}. ${keepReady}` }
    case 'delivered':
      return { title: 'Delivered 🎉', body: `Order ${n} is delivered. Thank you for shopping with Jholzo!` }
    case 'cancelled':
      return { title: 'Order cancelled', body: `Order ${n} was cancelled${o.cancel_reason ? `: ${o.cancel_reason}` : '.'}` }
    case 'paid':
      return { title: 'Payment received ✅', body: `We have received ${rupee(o.total)} for order ${n}. Your order is placed.` }
  }
}

/* ---------- Google sign-in for FCM (service account → OAuth token), cached while warm ---------- */

let access = ''
let accessUntil = 0

const b64url = (data: ArrayBuffer | string) => {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function googleToken(sa: { client_email: string; private_key: string }) {
  if (access && Date.now() < accessUntil - 60_000) return access
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }))
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0))
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claims}`))
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claims}.${b64url(sig)}` }),
  })
  const body = await res.json()
  if (!body.access_token) throw new Error(`Google sign-in failed: ${JSON.stringify(body).slice(0, 200)}`)
  access = body.access_token
  accessUntil = Date.now() + (Number(body.expires_in) || 3600) * 1000
  return access
}

Deno.serve(async (req) => {
  try {
    const { order_id, kind } = await req.json()
    if (!UUID.test(String(order_id ?? '')) || !KINDS.includes(kind)) return json({ error: 'bad request' }, 400)
    const raw = Deno.env.get('FCM_SERVICE_ACCOUNT')
    if (!raw) return json({ skipped: 'FCM_SERVICE_ACCOUNT not set' })
    const sa = JSON.parse(raw)

    // Once per order and event.
    const claim = await db('push_log', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify({ order_id, kind }),
    })
    if (!claim.ok || (await claim.json()).length === 0) return json({ skipped: 'already sent' })

    const [o] = await (await db(`orders?id=eq.${order_id}&select=*`)).json()
    if (!o) return json({ error: 'order not found' }, 404)
    const phones = [o.customer_phone, o.ordered_by_phone].filter((p: string) => /^[0-9]{10}$/.test(p ?? ''))
    if (!phones.length) return json({ sent: 0 })
    const tokens: { token: string }[] = await (await db(`device_tokens?phone=in.(${phones.join(',')})&select=token`)).json()
    if (!tokens.length) return json({ sent: 0 })

    const { title, body } = message(kind, o)
    const bearer = await googleToken(sa)
    let sent = 0
    for (const { token } of tokens) {
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            token,
            notification: { title, body },
            data: { title, body, kind, order_number: String(o.order_number) },
            android: { priority: 'HIGH', notification: { channel_id: 'orders', color: '#1F6B3A', tag: String(o.order_number) } },
          },
        }),
      })
      if (res.ok) {
        sent++
      } else if (res.status === 404 || res.status === 400) {
        // The app was uninstalled or the token expired: forget it.
        await db(`device_tokens?token=eq.${encodeURIComponent(token)}`, { method: 'DELETE' })
      }
    }
    return json({ sent })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
