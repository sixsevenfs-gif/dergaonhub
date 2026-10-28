// Sends the admin a Telegram message when an order comes in, and again when a customer submits a UPI UTR.
// Called by database triggers (migrations/019_telegram_notify.sql), not by the site, so no order is missed
// even if the customer closes the page. Express orders are marked URGENT and pinned in the chat.
//
// Deploy:  npx supabase functions deploy telegram-notify --no-verify-jwt --project-ref <your project ref>
// Secrets: npx supabase secrets set TELEGRAM_BOT_TOKEN=... TELEGRAM_CHAT_ID=... --project-ref <your project ref>
//          (TELEGRAM_CHAT_ID can be several ids separated by commas, e.g. you and a rider.)
import { orderMessage, utrMessage } from './message.ts'

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
async function claim(filter: string, patch: Record<string, unknown>) {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/orders?${filter}`, {
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

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)
  try {
    const { order_id, kind } = await req.json()
    if (!['placed', 'utr'].includes(kind)) return json({ error: 'Unknown message.' }, 400)

    if (!UUID.test(String(order_id ?? ''))) return json({ error: 'Order not found.' }, 404)
    const [o] = await rows(`orders?id=eq.${order_id}&select=*`)
    if (!o) return json({ error: 'Order not found.' }, 404)

    // This endpoint is public (the trigger calls it without a login), so it only ever talks about
    // fresh events: a new order from the last 15 minutes, or an order that has a UTR on it.
    if (kind === 'placed' && Date.now() - new Date(o.created_at).getTime() > 15 * 60_000) return json({ sent: false, reason: 'old' })
    if (kind === 'utr' && !o.upi_ref) return json({ sent: false, reason: 'no utr' })

    // Once per event: a repeat call (or someone replaying it) sends nothing.
    const claimed = kind === 'placed'
      ? await claim(`id=eq.${o.id}&tg_placed_sent=eq.false`, { tg_placed_sent: true })
      : await claim(`id=eq.${o.id}&tg_utr_sent=neq.${encodeURIComponent(o.upi_ref)}`, { tg_utr_sent: o.upi_ref })
    if (!claimed) return json({ sent: false, reason: 'already sent' })

    let text: string
    if (kind === 'placed') {
      const items = await rows(`order_items?order_id=eq.${o.id}&select=name_snapshot,quantity,line_total,note`)
      const [store] = await rows('store_settings?id=eq.1&select=slot_start,slot_end')
      text = orderMessage(o, items, store ?? { slot_start: '17:00', slot_end: '20:00' })
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
    if (!sent) await claim(`id=eq.${o.id}`, kind === 'placed' ? { tg_placed_sent: false } : { tg_utr_sent: '' })
    return json({ sent, results })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
