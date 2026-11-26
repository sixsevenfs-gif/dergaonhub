// Sends the admin a Telegram message when an order comes in, when a customer submits a UPI UTR, and when an
// order is cancelled (update 042), for food orders (064), help requests and new app customers (069). Called by database triggers (migrations/019_telegram_notify.sql), not by the site, so no order is missed
// even if the customer closes the page. Express orders are marked URGENT and pinned in the chat.
//
// Deploy:  npx supabase functions deploy telegram-notify --no-verify-jwt --project-ref <your project ref>
// Secrets: npx supabase secrets set TELEGRAM_BOT_TOKEN=... TELEGRAM_CHAT_ID=... --project-ref <your project ref>
//          (TELEGRAM_CHAT_ID can be several ids separated by commas, e.g. you and a rider.)
import { appUserMessage, cancelMessage, foodCancelMessage, foodOrderMessage, orderMessage, supportNewMessage, supportReplyMessage, utrMessage } from './message.ts'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

// Plain REST reads with the service key (no supabase-js, so the function bundles fast).
async function rows(path: string) {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  if (!res.ok) throw new Error(`Database read failed (${res.status})`)
  return res.json()
}

// Claims "this event is being sent" in one atomic update; returns false if another call already claimed it.
// Before update 020 the flag columns do not exist: then it sends without the once-only guard.
async function claim(filter: string, patch: Record<string, unknown>, table = 'orders') {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) return true
  return (await res.json()).length > 0
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function telegram(method: string, body: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${Deno.env.get('TELEGRAM_BOT_TOKEN')}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json().catch(() => ({ ok: false }))
}

async function sendAll(text: string) {
  const chats = (Deno.env.get('TELEGRAM_CHAT_ID') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const results = []
  for (const chat_id of chats) {
    const r = await telegram('sendMessage', { chat_id, text, parse_mode: 'HTML', disable_web_page_preview: true })
    results.push({ chat_id, ok: !!r.ok, error: r.ok ? undefined : r.description, message_id: r.result?.message_id })
  }
  return results
}

// Jholzo Food orders (update 064): new and cancelled, once each.
async function food(foodOrderId: string, kind: string) {
  if (!UUID.test(foodOrderId)) return json({ error: 'Order not found.' }, 404)
  const [o] = await rows(`food_orders?id=eq.${foodOrderId}&select=*`)
  if (!o) return json({ error: 'Order not found.' }, 404)
  if (kind === 'food_placed' && Date.now() - new Date(o.created_at).getTime() > 15 * 60_000) return json({ sent: false, reason: 'old' })
  if (kind === 'food_cancelled' && o.status !== 'cancelled') return json({ sent: false, reason: 'not cancelled' })
  const flag = kind === 'food_placed' ? 'tg_placed_sent' : 'tg_cancel_sent'
  if (!(await claim(`id=eq.${o.id}&${flag}=eq.false`, { [flag]: true }, 'food_orders'))) return json({ sent: false, reason: 'already sent' })
  const items = await rows(`food_order_items?order_id=eq.${o.id}&select=*`)
  let text: string
  if (kind === 'food_placed') {
    const [r] = o.restaurant_id ? await rows(`food_restaurants?id=eq.${o.restaurant_id}&select=phone,whatsapp,address`) : []
    text = foodOrderMessage(o, items, { phone: r?.phone || r?.whatsapp, address: r?.address })
  } else {
    text = foodCancelMessage(o, items)
  }
  const results = await sendAll(text)
  const sent = results.some((r) => r.ok)
  if (!sent) await claim(`id=eq.${o.id}`, { [flag]: false }, 'food_orders')
  return json({ sent, results })
}

// Help & support (update 069): a new request, or the customer writing again. Once each, only fresh ones.
async function support(kind: string, id: string) {
  if (!UUID.test(id)) return json({ error: 'Not found.' }, 404)
  const fresh = (iso: string) => Date.now() - new Date(iso).getTime() < 15 * 60_000
  if (kind === 'support_new') {
    const [t] = await rows(`support_tickets?id=eq.${id}&select=*`)
    if (!t) return json({ error: 'Not found.' }, 404)
    if (!fresh(t.created_at)) return json({ sent: false, reason: 'old' })
    if (!(await claim(`id=eq.${t.id}&tg_sent=eq.false`, { tg_sent: true }, 'support_tickets'))) return json({ sent: false, reason: 'already sent' })
    const [first] = await rows(`support_messages?ticket_id=eq.${t.id}&sender=eq.customer&select=body,photos&order=created_at.asc&limit=1`)
    const results = await sendAll(supportNewMessage(t, first))
    const sent = results.some((r) => r.ok)
    if (!sent) await claim(`id=eq.${t.id}`, { tg_sent: false }, 'support_tickets')
    return json({ sent, results })
  }
  const [m] = await rows(`support_messages?id=eq.${id}&select=*`)
  if (!m || m.sender !== 'customer') return json({ error: 'Not found.' }, 404)
  if (!fresh(m.created_at)) return json({ sent: false, reason: 'old' })
  if (!(await claim(`id=eq.${m.id}&tg_sent=eq.false`, { tg_sent: true }, 'support_messages'))) return json({ sent: false, reason: 'already sent' })
  const [t] = await rows(`support_tickets?id=eq.${m.ticket_id}&select=*`)
  const results = await sendAll(supportReplyMessage(t ?? {}, m))
  const sent = results.some((r) => r.ok)
  if (!sent) await claim(`id=eq.${m.id}`, { tg_sent: false }, 'support_messages')
  return json({ sent, results })
}

// A number's first login in the app (update 069), when Admin → App users has the Telegram switch on.
async function appUser(loginId: string) {
  if (!/^[0-9]{1,18}$/.test(loginId)) return json({ error: 'Not found.' }, 404)
  const [l] = await rows(`app_logins?id=eq.${loginId}&select=*`)
  if (!l) return json({ error: 'Not found.' }, 404)
  if (Date.now() - new Date(l.at).getTime() > 15 * 60_000) return json({ sent: false, reason: 'old' })
  const [s] = await rows('store_settings?id=eq.1&select=tg_app_users')
  if (!s?.tg_app_users) return json({ sent: false, reason: 'switched off' })
  if (!(await claim(`id=eq.${l.id}&tg_sent=eq.false`, { tg_sent: true }, 'app_logins'))) return json({ sent: false, reason: 'already sent' })
  const [i] = await rows(`app_installs?id=eq.${l.install_id}&select=platform,name,device_model,app_version`)
  const results = await sendAll(appUserMessage(i ?? {}, l))
  const sent = results.some((r) => r.ok)
  if (!sent) await claim(`id=eq.${l.id}`, { tg_sent: false }, 'app_logins')
  return json({ sent, results })
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)
  try {
    const { order_id, food_order_id, kind, ticket_id, message_id, login_id } = await req.json()
    if (kind === 'support_new') return await support(kind, String(ticket_id ?? ''))
    if (kind === 'support_reply') return await support(kind, String(message_id ?? ''))
    if (kind === 'app_user') return await appUser(String(login_id ?? ''))
    if (kind === 'food_placed' || kind === 'food_cancelled') return await food(String(food_order_id ?? ''), kind)
    if (!['placed', 'utr', 'cancelled'].includes(kind)) return json({ error: 'Unknown message.' }, 400)

    if (!UUID.test(String(order_id ?? ''))) return json({ error: 'Order not found.' }, 404)
    const [o] = await rows(`orders?id=eq.${order_id}&select=*`)
    if (!o) return json({ error: 'Order not found.' }, 404)

    // This endpoint is public (the trigger calls it without a login), so it only ever talks about
    // fresh events: a new order from the last 15 minutes, or an order that has a UTR on it.
    if (kind === 'placed' && Date.now() - new Date(o.created_at).getTime() > 15 * 60_000) return json({ sent: false, reason: 'old' })
    if (kind === 'utr' && !o.upi_ref) return json({ sent: false, reason: 'no utr' })
    if (kind === 'cancelled' && o.status !== 'cancelled') return json({ sent: false, reason: 'not cancelled' })

    // Once per event: a repeat call (or someone replaying it) sends nothing.
    const flag = { placed: 'tg_placed_sent', cancelled: 'tg_cancel_sent' }[kind as string]
    const claimed = flag
      ? await claim(`id=eq.${o.id}&${flag}=eq.false`, { [flag]: true })
      : await claim(`id=eq.${o.id}&tg_utr_sent=neq.${encodeURIComponent(o.upi_ref)}`, { tg_utr_sent: o.upi_ref })
    if (!claimed) return json({ sent: false, reason: 'already sent' })

    let text: string
    if (kind === 'placed') {
      const items = await rows(`order_items?order_id=eq.${o.id}&select=name_snapshot,quantity,line_total,note`)
      const [store] = await rows('store_settings?id=eq.1&select=slot_start,slot_end')
      text = orderMessage(o, items, store ?? { slot_start: '17:00', slot_end: '20:00' })
    } else if (kind === 'cancelled') {
      const items = await rows(`order_items?order_id=eq.${o.id}&select=name_snapshot,quantity,line_total`)
      text = cancelMessage(o, items)
    } else {
      text = utrMessage(o)
    }

    const chats = (Deno.env.get('TELEGRAM_CHAT_ID') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    if (!chats.length) return json({ error: 'TELEGRAM_CHAT_ID is not set.' }, 500)
    const results = []
    for (const chat_id of chats) {
      const r = await telegram('sendMessage', { chat_id, text, parse_mode: 'HTML', disable_web_page_preview: true })
      // Express stays on top of the chat until it is delivered and unpinned.
      if (r.ok && kind === 'placed' && o.delivery_type === 'express') {
        await telegram('pinChatMessage', { chat_id, message_id: r.result.message_id })
      }
      results.push({ chat_id, ok: !!r.ok, error: r.ok ? undefined : r.description })
    }
    const sent = results.some((r) => r.ok)
    // Nothing reached Telegram: release the claim so a retry can send it.
    if (!sent) await claim(`id=eq.${o.id}`, flag ? { [flag]: false } : { tg_utr_sent: '' })
    return json({ sent, results })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
