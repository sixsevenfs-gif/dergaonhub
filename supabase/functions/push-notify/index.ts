// App notifications for Jholzo (database update 065): Android through Firebase Cloud Messaging, iPhone through
// Apple Push Notifications (APNs, no Firebase in the iPhone app).
//
// Two kinds of calls:
//  1. Order updates, from the database triggers: { table: 'orders' | 'food_orders', id, kind }.
//     It reads the order itself and sends each update once (push_sent), so calling it again does nothing.
//  2. Offers and news, from Admin → App → Notifications: { campaign: <id> } with the owner's login.
//
// Deploy:  npx supabase functions deploy push-notify --no-verify-jwt --project-ref <ref> --use-api
// Secrets: FCM_SERVICE_ACCOUNT = the whole JSON key of a Firebase service account (Android)
//          APNS_KEY = the text of the .p8 key, APNS_KEY_ID = its Key ID, APNS_TEAM_ID (iPhone)
//          APNS_BUNDLE_ID (optional, default com.jholzo.app)

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })

import { appleJwt, googleAssertion } from './sign.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SITE = 'https://jholzo.com'

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
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })

type Note = { title: string; body: string; link: string; kind: string; channel: 'orders' | 'offers'; image?: string; tag?: string }

// Grocery: the same words as the website's WhatsApp messages (src/lib/whatsapp.js).
function groceryNote(kind: string, o: Record<string, any>): Note | null {
  const n = `#${o.order_number}`
  const paid = o.payment_method === 'upi_now' && o.payment_status === 'paid'
  const keepReady = paid ? 'Already paid online ✓' : `Please keep ${rupee(o.total)} ready (cash or UPI).`
  const when = o.delivery_type === 'express' && o.express_by ? `by ${clock(o.express_by)}` : 'this evening'
  const base = { link: `${SITE}/track/${o.order_number}`, kind, channel: 'orders' as const, tag: String(o.order_number) }
  switch (kind) {
    case 'confirmed': return { ...base, title: 'Order confirmed ✅', body: `Your Jholzo order ${n} is confirmed. We will deliver it ${when}.` }
    case 'on_the_way': return { ...base, title: 'On the way 🛵', body: `Our rider has left with your order ${n}. You will get it in 10–15 minutes. ${keepReady}` }
    case 'arriving': return { ...base, title: 'Arriving soon 📍', body: `Our rider is almost at your door with order ${n}. ${keepReady}` }
    case 'delivered': return { ...base, title: 'Delivered 🎉', body: `Order ${n} is delivered. Thank you for shopping with Jholzo!` }
    case 'cancelled': return { ...base, title: 'Order cancelled', body: `Order ${n} was cancelled${o.cancel_reason ? `: ${o.cancel_reason}` : '.'}` }
  }
  return null
}

function foodNote(kind: string, o: Record<string, any>): Note | null {
  const n = `#${o.order_number}`
  const place = String(o.restaurant_name || 'The restaurant').trim()
  const base = { link: `${SITE}/food-order/${o.order_number}`, kind: `food_${kind}`, channel: 'orders' as const, tag: String(o.order_number) }
  switch (kind) {
    case 'confirmed': return { ...base, title: 'Restaurant accepted ✅', body: `${place} is preparing your order ${n}.` }
    case 'picked': return { ...base, title: 'On the way 🛵', body: `Your food from ${place} is on the way. Please keep ${rupee(o.total)} ready (cash or UPI).` }
    case 'delivered': return { ...base, title: 'Enjoy your meal 😋', body: `Order ${n} is delivered. Thanks for ordering from Jholzo Food!` }
    case 'cancelled': return { ...base, title: 'Food order cancelled', body: `Order ${n} was cancelled${o.cancel_reason ? `: ${o.cancel_reason}` : '.'}` }
  }
  return null
}

/* ---------- Android: Firebase (service account → OAuth token, kept while warm) ---------- */

let google = ''
let googleUntil = 0

async function googleToken(sa: { client_email: string; private_key: string }) {
  if (google && Date.now() < googleUntil - 60_000) return google
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: await googleAssertion(sa) }),
  })
  const body = await res.json()
  if (!body.access_token) throw new Error(`Google sign-in failed: ${JSON.stringify(body).slice(0, 200)}`)
  google = body.access_token
  googleUntil = Date.now() + (Number(body.expires_in) || 3600) * 1000
  return google
}

async function sendAndroid(token: string, n: Note): Promise<'ok' | 'gone' | 'fail'> {
  const raw = Deno.env.get('FCM_SERVICE_ACCOUNT')
  if (!raw) return 'fail'
  const sa = JSON.parse(raw)
  const data: Record<string, string> = { title: n.title, body: n.body, kind: n.kind, link: n.link }
  if (n.image) data.image = n.image
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await googleToken(sa)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: n.title, body: n.body, ...(n.image ? { image: n.image } : {}) },
        data,
        android: {
          priority: 'HIGH',
          notification: { channel_id: n.channel, color: '#1F6B3A', ...(n.tag ? { tag: n.tag } : {}), ...(n.image ? { image: n.image } : {}) },
        },
      },
    }),
  })
  if (res.ok) return 'ok'
  // Uninstalled app or old token: forget it.
  return res.status === 404 || (res.status === 400 && /registration|UNREGISTERED|INVALID_ARGUMENT/i.test(await res.text())) ? 'gone' : 'fail'
}

/* ---------- iPhone: APNs with a .p8 key (ES256 token, renewed every 40 minutes) ---------- */

let apple = ''
let appleAt = 0

async function appleToken() {
  if (apple && Date.now() - appleAt < 40 * 60_000) return apple
  apple = await appleJwt(Deno.env.get('APNS_KEY')!, Deno.env.get('APNS_KEY_ID')!, Deno.env.get('APNS_TEAM_ID') ?? 'J56X4MYK58')
  appleAt = Date.now()
  return apple
}

async function sendIos(token: string, env: string, n: Note): Promise<'ok' | 'gone' | 'fail'> {
  if (!Deno.env.get('APNS_KEY') || !Deno.env.get('APNS_KEY_ID')) return 'fail'
  const host = env === 'dev' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com'
  const res = await fetch(`${host}/3/device/${token}`, {
    method: 'POST',
    headers: {
      authorization: `bearer ${await appleToken()}`,
      'apns-topic': Deno.env.get('APNS_BUNDLE_ID') ?? 'com.jholzo.app',
      'apns-push-type': 'alert',
      'apns-priority': '10',
      ...(n.tag ? { 'apns-collapse-id': n.tag.slice(0, 64) } : {}),
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      aps: { alert: { title: n.title, body: n.body }, sound: 'default', 'thread-id': n.channel, ...(n.image ? { 'mutable-content': 1 } : {}) },
      link: n.link,
      kind: n.kind,
      ...(n.image ? { image: n.image } : {}),
    }),
  })
  if (res.ok) return 'ok'
  const reason = await res.text()
  return res.status === 410 || /BadDeviceToken|Unregistered|DeviceTokenNotForTopic/.test(reason) ? 'gone' : 'fail'
}

type Target = { token: string; platform: string; env: string }

async function sendAll(targets: Target[], n: Note) {
  let sent = 0
  let failed = 0
  const gone: string[] = []
  // A few at a time, so a big list finishes quickly without flooding.
  for (let i = 0; i < targets.length; i += 20) {
    const results = await Promise.all(targets.slice(i, i + 20).map(async (t) => {
      try {
        return [t.token, t.platform === 'ios' ? await sendIos(t.token, t.env, n) : await sendAndroid(t.token, n)] as const
      } catch {
        return [t.token, 'fail'] as const
      }
    }))
    for (const [token, r] of results) {
      if (r === 'ok') sent++
      else failed++
      if (r === 'gone') gone.push(token)
    }
  }
  for (const token of gone) await db(`device_tokens?token=eq.${encodeURIComponent(token)}`, { method: 'DELETE' })
  return { sent, failed, removed: gone.length }
}

/* ---------- 1. order updates ---------- */

async function orderUpdate(table: string, id: string, kind: string) {
  if (!['orders', 'food_orders'].includes(table) || !UUID.test(id)) return json({ error: 'bad request' }, 400)
  // Once per order and update.
  const claim = await db('push_sent', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify({ key: `${table}:${id}:${kind}` }),
  })
  if (!claim.ok || (await claim.json()).length === 0) return json({ skipped: 'already sent' })
  const [o] = await (await db(`${table}?id=eq.${id}&select=*`)).json()
  if (!o) return json({ error: 'order not found' }, 404)
  // Old events (a replayed call) are not sent.
  if (Date.now() - new Date(o.created_at).getTime() > 3 * 86_400_000) return json({ skipped: 'old order' })
  const note = table === 'orders' ? groceryNote(kind, o) : foodNote(kind, o)
  if (!note) return json({ error: 'unknown update' }, 400)
  const phones = [o.customer_phone, o.ordered_by_phone].filter((p: string) => /^[0-9]{10}$/.test(p ?? ''))
  if (!phones.length) return json({ sent: 0 })
  const targets: Target[] = await (await db(`device_tokens?phone=in.(${phones.join(',')})&select=token,platform,env`)).json()
  return json(await sendAll(targets, note))
}

/* ---------- 2. offers and news from the admin ---------- */

async function campaign(req: Request, id: string) {
  if (!UUID.test(id)) return json({ error: 'bad request' }, 400)
  // Only the owner may send: check the login that called with the database's own is_admin().
  const auth = req.headers.get('Authorization') ?? ''
  const check = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/rpc/is_admin`, {
    method: 'POST',
    headers: { apikey: Deno.env.get('SUPABASE_ANON_KEY')!, Authorization: auth, 'Content-Type': 'application/json' },
    body: '{}',
  })
  if (!check.ok || (await check.json()) !== true) return json({ error: 'Only the owner can send notifications.' }, 403)
  const [c] = await (await db(`push_campaigns?id=eq.${id}&select=*`)).json()
  if (!c) return json({ error: 'Not found.' }, 404)
  if (c.status !== 'queued') return json({ error: 'This one was already sent.' }, 409)
  await db(`push_campaigns?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'sending' }) })
  try {
    const targets: Target[] = await (await db('rpc/push_campaign_targets', {
      method: 'POST', body: JSON.stringify({ p_audience: c.audience, p_phones: c.phones ?? [] }),
    })).json()
    const result = await sendAll(Array.isArray(targets) ? targets : [], {
      title: c.title, body: c.body, link: c.link || SITE, kind: 'offer', channel: 'offers', image: c.image || undefined,
    })
    await db(`push_campaigns?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'sent', targeted: targets.length ?? 0, sent: result.sent, failed: result.failed, finished_at: new Date().toISOString() }),
    })
    return json({ targeted: targets.length ?? 0, ...result })
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    await db(`push_campaigns?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'failed', error, finished_at: new Date().toISOString() }) })
    return json({ error }, 500)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({})
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)
  try {
    const body = await req.json()
    if (body.campaign) return await campaign(req, String(body.campaign))
    return await orderUpdate(String(body.table ?? ''), String(body.id ?? ''), String(body.kind ?? ''))
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
