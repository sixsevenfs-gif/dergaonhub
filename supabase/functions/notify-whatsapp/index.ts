// Sends a WhatsApp message to the customer automatically (WhatsApp Cloud API by Meta).
// The site calls it after an order is placed, and when the rider taps "On the way" / "Arriving".
// It does nothing until the admin turns on "Automatic WhatsApp" in Admin → Settings.
//
// Deploy:  npx supabase functions deploy notify-whatsapp --project-ref <your project ref>
// Secrets: npx supabase secrets set WA_TOKEN=... WA_PHONE_ID=...
// Templates (approved in Meta → WhatsApp Manager): see supabase/README.md.
import { createClient } from 'npm:@supabase/supabase-js@2.75.0'

const TEMPLATES: Record<string, string> = {
  placed: 'order_placed',
  on_the_way: 'rider_on_the_way',
  arriving: 'rider_arriving',
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const rupee = (n: number) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN')

function fmtTime(t: string) {
  const [h, m] = String(t).slice(0, 5).split(':').map(Number)
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`
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
    if (!auth.user) return json({ error: 'Please log in again.' }, 401)
    const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    let query = db.from('orders').select('*')
    query = order_id ? query.eq('id', order_id) : query.eq('order_number', String(order_number ?? ''))
    const { data: o } = await query.maybeSingle()
    if (!o) return json({ error: 'Order not found.' }, 404)

    // A customer may only trigger "placed" for their own order; the rest needs a rider or the admin.
    const { data: staff } = await caller.rpc('is_staff')
    const allowed = kind === 'placed' ? o.placed_by === auth.user.id || staff : staff
    if (!allowed) return json({ error: 'Not allowed.' }, 403)

    const { data: store } = await db.from('store_settings').select('*').eq('id', 1).single()
    if (!store?.whatsapp_auto) return json({ sent: false, reason: 'off' })

    // One automatic message of each kind per order, so a double tap never sends twice.
    const { count } = await db.from('order_messages').select('id', { count: 'exact', head: true })
      .eq('order_id', o.id).eq('kind', kind).eq('channel', 'auto').eq('ok', true)
    if (count) return json({ sent: true, already: true })

    // "Order placed" goes to whoever ordered (for someone else: the orderer); rider messages to the receiver.
    const toOrderer = kind === 'placed' && o.ordered_by_phone
    const name = String(toOrderer ? o.ordered_by_name : o.customer_name).split(' ')[0] || 'there'
    const params =
      kind === 'placed' ? [name, o.order_number, slotWords(o.delivery_date, store), rupee(o.total)]
      : [name, o.order_number, rupee(o.total)]

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
          components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text: String(text) })) }],
        },
      }),
    })
    const body = await res.json().catch(() => ({}))
    const error = res.ok ? '' : body?.error?.message ?? `WhatsApp error ${res.status}`
    await db.from('order_messages').insert({ order_id: o.id, kind, channel: 'auto', ok: res.ok, error, sent_by: auth.user.id })
    return json(res.ok ? { sent: true } : { sent: false, error }, res.ok ? 200 : 502)
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
