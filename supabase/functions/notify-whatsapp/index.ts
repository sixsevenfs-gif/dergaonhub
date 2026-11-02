// Sends a WhatsApp message to the customer automatically (WhatsApp Cloud API by Meta).
// "Order confirmed" / "Delivered": the database calls it the moment an order is saved / marked delivered
// (update 036), with no login. "On the way": the rider page calls it when the rider taps, with their login.
// It does nothing until the admin turns on "Automatic WhatsApp" in Admin → Settings.
//
// Deploy:  npx supabase functions deploy notify-whatsapp --no-verify-jwt --use-api --project-ref <your project ref>
// Secrets: npx supabase secrets set WA_TOKEN=... WA_PHONE_ID=...
// Templates (approved in Meta → WhatsApp Manager): see supabase/README.md.
import { createClient } from 'npm:@supabase/supabase-js@2.75.0'

const TEMPLATES: Record<string, string> = {
  placed: 'order_confirmed',
  on_the_way: 'rider_on_the_way',
  arriving: 'rider_arriving',
  delivered: 'order_delivered',
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const rupee = (n: number) => {
  const v = Math.round((Number(n) || 0) * 100) / 100
  return '₹' + v.toLocaleString('en-IN', Number.isInteger(v) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtTime(t: string) {
  const [h, m] = String(t).slice(0, 5).split(':').map(Number)
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`
}

// The bill in one line (WhatsApp doesn't allow line breaks inside a template value), same items and
// charges as the "Send bill on WhatsApp" message (src/lib/whatsapp.js billMessage).
type Item = { name_snapshot: string; quantity: number; line_total: number; note: string }
function billLine(o: Record<string, any>, items: Item[]) {
  const clean = (t: string) => String(t).replace(/\s+/g, ' ').trim()
  const parts = items.map((i) => `${clean(i.name_snapshot)} x${i.quantity} = ${rupee(i.line_total)}${i.note ? ` (${clean(i.note)})` : ''}`)
  // Long carts: as many items as fit, then "+N more" (the bill page has all of them).
  let shown = parts
  while (shown.join(' · ').length > 600 && shown.length > 1) shown = shown.slice(0, -1)
  if (shown.length < parts.length) shown = [...shown, `+${parts.length - shown.length} more`]
  return [
    ...shown,
    `Delivery ${Number(o.delivery_fee) ? rupee(o.delivery_fee) : 'FREE'}`,
    ...(Number(o.express_fee) > 0 ? [`Express ${rupee(o.express_fee)}`] : []),
    ...(Number(o.packaging_fee) ? [`Packaging ${rupee(o.packaging_fee)}`] : []),
    ...(Number(o.wallet_used) > 0 ? [`Jholzo Money −${rupee(o.wallet_used)}`] : []),
  ].join(' · ')
}

// "today between 5 PM and 8 PM" (India time)
function slotWords(date: string, store: { slot_start: string; slot_end: string }) {
  const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)
  const tomorrow = new Date(Date.now() + 29.5 * 3600_000).toISOString().slice(0, 10)
  const day = date === today ? 'today' : date === tomorrow ? 'tomorrow' : `on ${date.split('-').reverse().join('-')}`
  return `${day} between ${fmtTime(store.slot_start)} and ${fmtTime(store.slot_end)}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { order_id, order_number, kind } = await req.json()
    if (!TEMPLATES[kind]) return json({ error: 'Unknown message.' }, 400)

    const url = Deno.env.get('SUPABASE_URL')!
    // The caller's own login decides what they may do; the service key only reads and logs.
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: auth } = await caller.auth.getUser()
    const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    let query = db.from('orders').select('*')
    query = order_id ? query.eq('id', order_id) : query.eq('order_number', String(order_number ?? ''))
    const { data: o } = await query.maybeSingle()
    if (!o) return json({ error: 'Order not found.' }, 404)

    // "Order confirmed" may come from the database (no login) or the order's own customer; "Delivered" from the
    // database once the order is delivered. Each goes out once per order, so calling again does nothing.
    // The rider messages need a rider or the admin.
    const staff = auth.user ? (await caller.rpc('is_staff')).data : false
    const allowed = kind === 'placed' ? !auth.user || o.placed_by === auth.user.id || staff
      : kind === 'delivered' ? o.status === 'completed' && (!auth.user || staff)
      : staff
    if (!allowed) return json({ error: auth.user ? 'Not allowed.' : 'Please log in again.' }, auth.user ? 403 : 401)

    const { data: store } = await db.from('store_settings').select('*').eq('id', 1).single()
    if (!store?.whatsapp_auto) return json({ sent: false, reason: 'off' })

    if (kind === 'placed') {
      // Claim the order's one "confirmed" message (update 036) before sending.
      const { data: claimed, error: claimError } = await db.from('orders').update({ wa_placed_sent: true })
        .eq('id', o.id).eq('wa_placed_sent', false).select('id')
      if (!claimError && !claimed?.length) return json({ sent: true, already: true })
    }
    // One automatic message of each kind per order, so a double tap never sends twice.
    const { count } = await db.from('order_messages').select('id', { count: 'exact', head: true })
      .eq('order_id', o.id).eq('kind', kind).eq('channel', 'auto').eq('ok', true)
    if (count) return json({ sent: true, already: true })

    // "Order placed" goes to whoever ordered (for someone else: the orderer); rider messages to the receiver.
    const toOrderer = kind === 'placed' && o.ordered_by_phone
    const name = String(toOrderer ? o.ordered_by_name : o.customer_name).split(' ')[0] || 'there'
    let params = [name, o.order_number, rupee(o.total)]
    const components: Record<string, unknown>[] = []
    if (kind === 'placed') params = [name, o.order_number, slotWords(o.delivery_date, store), rupee(o.total)]
    if (kind === 'delivered') {
      // The bill: items and charges, total, how it was paid, the order number for the report link in the text;
      // the button opens the bill (PDF).
      const { data: items } = await db.from('order_items').select('name_snapshot, quantity, line_total, note')
        .eq('order_id', o.id).order('name_snapshot')
      const paid = o.payment_method === 'cash' ? `Cash ${rupee(o.cash_collected || o.total)}` : `UPI ${rupee(o.total)}`
      params = [name, o.order_number, billLine(o, items ?? []), rupee(o.total), paid, o.order_number]
      components.push({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: o.order_number }] })
    }

    const res = await fetch(`https://graph.facebook.com/v21.0/${Deno.env.get('WA_PHONE_ID')}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${Deno.env.get('WA_TOKEN')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: `91${toOrderer ? o.ordered_by_phone : o.customer_phone}`,
        type: 'template',
        template: {
          name: TEMPLATES[kind],
          language: { code: 'en' },
          components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text: String(text) })) }, ...components],
        },
      }),
    })
    const body = await res.json().catch(() => ({}))
    const error = res.ok ? '' : body?.error?.message ?? `WhatsApp error ${res.status}`
    // Not sent (template not approved yet, wrong number...): free the claim so it can be tried again.
    if (!res.ok && kind === 'placed') await db.from('orders').update({ wa_placed_sent: false }).eq('id', o.id)
    await db.from('order_messages').insert({ order_id: o.id, kind, channel: 'auto', ok: res.ok, error, sent_by: auth.user?.id ?? null })
    return json(res.ok ? { sent: true } : { sent: false, error }, res.ok ? 200 : 502)
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
