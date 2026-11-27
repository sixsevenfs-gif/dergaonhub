// App notifications for Jholzo (database update 065): Android through Firebase Cloud Messaging, iPhone through
// Apple Push Notifications (APNs, no Firebase in the iPhone app).
//
// Two kinds of calls:
//  1. Order updates, from the database triggers: { table: 'orders' | 'food_orders', id, kind }.
//     It reads the order itself and sends each update once (push_sent), so calling it again does nothing.
//  2. Offers and news, from Admin → App → Notifications: { campaign: <id> } with the owner's login; scheduled
//     ones (update 078) from the database's timer: { scheduled: <id> }.
//  3. Answers in Help & support (update 069), from a database trigger: { support_message: <id> }.
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

// Grocery: every step of the order. Since update 077 a new order gets "received" (30–45 minutes) and there is no
// separate "confirmed" (the case stays for calls already queued). The list of all messages is in
// docs/app-notifications.md.
function groceryNote(kind: string, o: Record<string, any>): Note | null {
  const n = `#${o.order_number}`
  const paid = o.payment_status === 'paid'
  const keepReady = paid ? 'Already paid ✓' : `Please keep ${rupee(o.total)} ready (cash or UPI).`
  const when = o.delivery_type === 'express' && o.express_by ? `by ${clock(o.express_by)}` : 'this evening'
  const base = { link: `${SITE}/track/${o.order_number}`, kind, channel: 'orders' as const, tag: String(o.order_number) }
  switch (kind) {
    case 'placed': return {
      ...base, title: 'Order received 🧾',
      body: o.payment_method === 'upi_now' && !paid
        ? `We got your order ${n}. Finish the UPI payment and we will deliver it within 30–45 minutes.`
        : `We got your order ${n}. We will deliver it within 30–45 minutes.`,
    }
    case 'confirmed': return { ...base, title: 'Order confirmed ✅', body: `Your order ${n} is confirmed. We will deliver it ${when}.` }
    case 'on_the_way': return { ...base, title: 'Your order is on the way 🛵', body: `Our rider has left with your order ${n}. It will reach you in 10–15 minutes. ${keepReady}` }
    case 'arriving': return { ...base, title: 'Rider at your door 📍', body: `Our rider has reached your location with order ${n}. ${keepReady}` }
    case 'delivered': return { ...base, title: 'Your order has been delivered 🎉', body: `Order ${n} is delivered. Thank you for shopping with Jholzo. Keep shopping!` }
    case 'cancelled': return { ...base, title: 'Order cancelled', body: `Your order ${n} was cancelled${o.cancel_reason ? `: ${o.cancel_reason}` : '.'} Need help? Open Jholzo → Help.` }
  }
  return null
}

// Food: every step of the order, with the rider's first name once one has it. A rider taking the order sends
// nothing; "confirmed" is the rider's call to the restaurant (update 073).
function foodNote(kind: string, o: Record<string, any>): Note | null {
  const n = `#${o.order_number}`
  const place = String(o.restaurant_name || 'the restaurant').trim()
  const rider = String(o.rider_name || '').trim().split(/\s+/)[0] || 'Our rider'
  const pay = o.payment_method === 'upi' ? `Please keep ${rupee(o.total)} ready to pay by UPI.` : `Please keep ${rupee(o.total)} ready (cash or UPI).`
  const base = { link: `${SITE}/food-order/${o.order_number}`, kind: `food_${kind}`, channel: 'orders' as const, tag: String(o.order_number) }
  switch (kind) {
    case 'placed': return { ...base, title: 'Order received 🧾', body: `We got your order ${n} from ${place}. We are confirming it with the restaurant now.` }
    case 'confirmed': return { ...base, title: 'Your food is being prepared 🍳', body: `${place} has your order ${n} and is cooking it now.` }
    case 'to_restaurant': return { ...base, title: 'Rider on the way to the restaurant 🛵', body: `${rider} is going to ${place} to pick up your order ${n}.` }
    case 'at_restaurant': return { ...base, title: 'Rider at the restaurant 🥡', body: `${rider} has reached ${place}. Your food is being packed.` }
    case 'picked': return { ...base, title: 'Your food is on the way 🛵', body: `${rider} has picked up your food from ${place} and is coming to you. ${pay}` }
    case 'arriving': return { ...base, title: 'Rider at your door 📍', body: `${rider} has reached your location with order ${n}. ${pay}` }
    case 'delivered': return { ...base, title: 'Your order has been delivered 😋', body: `Enjoy your meal! Order ${n} is delivered. Thanks for ordering from Jholzo Food. Order again anytime!` }
    case 'cancelled': return { ...base, title: 'Food order cancelled', body: `Your order ${n} was cancelled${o.cancel_reason ? `: ${o.cancel_reason}` : '.'} Need help? Open Jholzo → Help.` }
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
  return await sendCampaign(id)
}

/* ---------- 2b. scheduled ones (update 078), from the database's timer ---------- */

// No login: the timer calls it. It only sends a notification the owner saved for a time that has now come (the
// database moved it to "queued"), so calling it does nothing else.
async function scheduled(id: string) {
  if (!UUID.test(id)) return json({ error: 'bad request' }, 400)
  const [c] = await (await db(`push_campaigns?id=eq.${id}&select=status,send_at`)).json()
  if (!c || c.status !== 'queued' || !c.send_at || new Date(c.send_at).getTime() > Date.now() + 60_000) return json({ skipped: 'not due' })
  return await sendCampaign(id)
}

// Sends one saved notification. Taking it ("queued" → "sending") happens once, so two calls never send it twice.
async function sendCampaign(id: string) {
  const claim = await db(`push_campaigns?id=eq.${id}&status=eq.queued`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ status: 'sending' }),
  })
  const [c] = claim.ok ? await claim.json() : []
  if (!c) return json({ error: 'This one was already sent.' }, 409)
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

/* ---------- 3. answers in Help & support ---------- */

async function supportAnswer(id: string) {
  if (!UUID.test(id)) return json({ error: 'bad request' }, 400)
  const claim = await db('push_sent', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify({ key: `support_messages:${id}` }),
  })
  if (!claim.ok || (await claim.json()).length === 0) return json({ skipped: 'already sent' })
  const [m] = await (await db(`support_messages?id=eq.${id}&select=*`)).json()
  if (!m || m.internal || m.sender === 'customer') return json({ error: 'not found' }, 404)
  if (Date.now() - new Date(m.created_at).getTime() > 86_400_000) return json({ skipped: 'old' })
  const [t] = await (await db(`support_tickets?id=eq.${m.ticket_id}&select=id,ticket_number,customer_phone`)).json()
  if (!t || !/^[0-9]{10}$/.test(t.customer_phone ?? '')) return json({ sent: 0 })
  const body = String(m.body || 'Open the app to see the answer.')
  const note: Note = {
    title: m.sender === 'system' ? `Request ${t.ticket_number} resolved` : 'Jholzo Support replied',
    body: body.length > 180 ? body.slice(0, 179) + '…' : body,
    link: `${SITE}/help/${t.id}`, kind: 'support', channel: 'orders', tag: `support-${t.ticket_number}`,
  }
  const targets: Target[] = await (await db(`device_tokens?phone=eq.${t.customer_phone}&select=token,platform,env`)).json()
  return json(await sendAll(targets, note))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({})
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)
  try {
    const body = await req.json()
    if (body.campaign) return await campaign(req, String(body.campaign))
    if (body.scheduled) return await scheduled(String(body.scheduled))
    if (body.support_message) return await supportAnswer(String(body.support_message))
    return await orderUpdate(String(body.table ?? ''), String(body.id ?? ''), String(body.kind ?? ''))
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
