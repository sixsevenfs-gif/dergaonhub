// Help & support for the admin (database update 069): the inbox of requests from the apps, one request with
// its conversation, replies and team notes, resolve with a refund, quick replies and the report. With the
// database it uses the owner's or executive's login (the database checks every step again); in demo mode (no
// keys) it shows sample requests kept in this tab, so the pages can be tried.
import { supabase as sb } from './supabase.js'

const check = ({ data, error }) => {
  if (error) throw new Error(error.message || 'Something went wrong. Please try again.')
  return data
}
// "relation does not exist" / "function not found": update 069 is not run yet.
const missing = (e) => /does not exist|Could not find|schema cache|PGRST20[0-9]/i.test(String(e?.message ?? e))

export const TOPICS = {
  missing_item: 'Item missing', wrong_item: 'Wrong item', quality: 'Taste or quality', spilled: 'Spilled or damaged',
  damaged: 'Damaged or expired', late: 'Late delivery', rider: 'Rider', payment: 'Payment or bill', cancel: 'Cancel order',
  login: 'Login or OTP', app: 'App problem', wallet: 'Jholzo Money', account: 'My account', suggestion: 'Idea or feedback',
  partner: 'Partnership', other: 'Something else',
}
export const KINDS = [['food', 'Food'], ['grocery', 'Grocery'], ['other', 'App & other']]
export const KIND_LABEL = Object.fromEntries(KINDS)
export const STATUS = {
  open: ['Needs reply', 'bg-red-100 text-red-700'],
  pending: ['Waiting for customer', 'bg-amber-100 text-amber-800'],
  resolved: ['Resolved', 'bg-green-100 text-green-800'],
}
export const REFUND_HOW = [['wallet', 'Jholzo Money'], ['upi', 'UPI'], ['cash', 'Cash']]
export const APP_NAME = { android: 'Android', ios: 'iPhone', web: 'Website' }

/** A quick reply with the customer's first name and the order put in. */
export function fillReply(text, t) {
  const first = String(t?.customer_name ?? '').trim().split(/\s+/)[0] || 'there'
  return String(text).replaceAll('{name}', first).replaceAll('{order}', t?.order_number || 'your order')
}

// "4 min", "2 h", "3 d": how long ago, short.
export function since(iso) {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
  if (min < 1) return 'now'
  if (min < 60) return `${min} min`
  const h = Math.round(min / 60)
  return h < 24 ? `${h} h` : `${Math.round(h / 24)} d`
}

/* ---------- demo data (this tab only) ---------- */

const demo = (() => {
  const now = Date.now()
  const ago = (min) => new Date(now - min * 60_000).toISOString()
  const msg = (min, sender, body, extra = {}) => ({ id: `m${Math.random().toString(36).slice(2, 9)}`, created_at: ago(min), sender, body, photos: [], internal: false, staff_name: sender === 'support' ? 'Owner' : '', ...extra })
  const ticket = (n, extra, messages) => {
    const last = messages.filter((m) => !m.internal).at(-1)
    return {
      id: `t${n}`, ticket_number: `JH-${1000 + n}`, created_at: messages[0].created_at, updated_at: last.created_at, customer_phone: `98765${String(43210 + n).padStart(5, '0')}`,
      kind: 'other', topic: 'other', food_order_id: null, order_id: null, order_number: '', restaurant_name: '', status: 'open', priority: 'normal',
      source: n % 2 ? 'android' : 'ios', app_version: n % 2 ? '1.1.0' : '1.1', last_message_at: last.created_at, last_from: last.sender === 'customer' ? 'customer' : 'support',
      last_preview: last.body.slice(0, 140) || 'Photo', customer_unread: 0, support_unread: last.sender === 'customer', first_response_at: null, resolved_at: null,
      resolution: '', refund_amount: 0, refund_how: '', rating: null, rating_comment: '', messages, ...extra,
    }
  }
  const tickets = [
    ticket(4, { customer_name: 'Asha Devi', kind: 'food', topic: 'missing_item', priority: 'high', food_order_id: 'fo4', order_number: 'JF-1004', restaurant_name: 'Food delight' }, [
      msg(14, 'customer', 'The raita is missing from my order. I paid for it.', { photos: ['demo/raita.jpg'] }),
      msg(9, 'customer', 'Also the roti was cold.'),
    ]),
    ticket(3, { customer_name: 'Rahul Das', kind: 'grocery', topic: 'damaged', priority: 'high', status: 'pending', order_id: 'o1002', order_number: 'DG-1002', first_response_at: ago(150) }, [
      msg(170, 'customer', 'Two eggs were broken in the tray.'),
      msg(165, 'support', 'Checked with the rider: the tray was dropped at the gate.', { internal: true }),
      msg(150, 'support', 'Sorry Rahul! We will send 2 eggs with your next order, free.'),
    ]),
    ticket(2, { customer_name: 'Priya Gogoi', topic: 'login' }, [
      msg(55, 'customer', 'The OTP comes very late, sometimes after 2 minutes.'),
    ]),
    ticket(1, { customer_name: 'Bikash Saikia', kind: 'food', topic: 'late', status: 'resolved', food_order_id: 'fo5', order_number: 'JF-1005', restaurant_name: 'Food delight',
      first_response_at: ago(60 * 26 - 5), resolved_at: ago(60 * 25), resolution: 'Rain delay; gave ₹30 Jholzo Money', refund_amount: 30, refund_how: 'wallet', rating: 5, rating_comment: 'Very quick help' }, [
      msg(60 * 26, 'customer', 'My food came 50 minutes late and it was cold.'),
      msg(60 * 26 - 5, 'support', 'Sorry Bikash, it was raining hard. We added ₹30 to your Jholzo Money.'),
      msg(60 * 25, 'system', 'Marked as resolved. Refund: ₹30 added to your Jholzo Money.'),
    ]),
  ]
  const replies = [
    { id: 'q1', title: 'Checking now', body: 'Sorry about this, {name}. We are checking it right now and will reply here in a few minutes.', sort: 1 },
    { id: 'q2', title: 'Missing item on its way', body: 'Sorry, {name}! The missing item from {order} is on its way to you now.', sort: 2 },
    { id: 'q3', title: 'Need a photo', body: 'Could you please send a photo? It helps us fix this quickly.', sort: 3 },
    { id: 'q4', title: 'Refund as Jholzo Money', body: 'We have added your refund to Jholzo Money. You will find it in the app under Account → Jholzo Money, for your next grocery order.', sort: 4 },
    { id: 'q5', title: 'All done', body: 'Glad we could help, {name}! If anything else comes up, just reply here.', sort: 5 },
  ]
  return { tickets, replies, ago }
})()

const strip = ({ messages, ...t }) => t // eslint-disable-line no-unused-vars
const touch = (t, patch) => Object.assign(t, patch, { updated_at: new Date().toISOString() })

/* ---------- reads ---------- */

/** The inbox: needs reply (urgent, then the longest waiting first), waiting for the customer, resolved or all.
 *  Null before update 069. */
export async function listTickets({ status = 'open', kind = '', search = '' } = {}) {
  const s = search.trim().toLowerCase()
  if (!sb) {
    return demo.tickets.filter((t) => (status === 'all' || t.status === status) && (!kind || t.kind === kind)
      && (!s || [t.ticket_number, t.customer_name, t.customer_phone, t.order_number].some((v) => v.toLowerCase().includes(s))))
      .sort((a, b) => (status === 'open' ? (a.priority === 'high' ? 0 : 1) - (b.priority === 'high' ? 0 : 1) || a.last_message_at.localeCompare(b.last_message_at) : b.last_message_at.localeCompare(a.last_message_at)))
      .map(strip).map((t) => structuredClone(t))
  }
  let q = sb.from('support_tickets').select('id, ticket_number, created_at, customer_name, customer_phone, kind, topic, order_number, restaurant_name, status, priority, source, last_message_at, last_from, last_preview, support_unread, rating, refund_amount')
  if (status !== 'all') q = q.eq('status', status)
  if (kind) q = q.eq('kind', kind)
  // Letters, digits and dashes only, so the search cannot break the filter.
  const safe = s.replace(/[^a-z0-9\- ]/g, '').trim()
  if (safe) q = q.or(['ticket_number', 'customer_phone', 'customer_name', 'order_number'].map((c) => `${c}.ilike.*${safe}*`).join(','))
  q = status === 'open'
    ? q.order('priority', { ascending: true }).order('last_message_at', { ascending: true })
    : q.order('last_message_at', { ascending: false })
  const { data, error } = await q.limit(200)
  if (error) {
    if (missing(error)) return null
    throw new Error(error.message)
  }
  return data
}

/** The numbers on the Support switch: open, urgent, unread, waiting. Empty before update 069. */
export async function supportCounts() {
  if (!sb) {
    const t = demo.tickets
    return { open: t.filter((x) => x.status === 'open').length, urgent: t.filter((x) => x.status === 'open' && x.priority === 'high').length,
      unread: t.filter((x) => x.support_unread && x.status !== 'resolved').length, pending: t.filter((x) => x.status === 'pending').length }
  }
  const { data, error } = await sb.rpc('support_counts')
  return error ? {} : data ?? {}
}

/** One request with the whole conversation (team notes too), the customer and their recent orders. Opening it
 *  marks it read for the team. */
export async function getTicket(id) {
  if (!sb) {
    const t = demo.tickets.find((x) => x.id === id)
    if (!t) return undefined
    t.support_unread = false
    return structuredClone({
      ...t, customer: { customer_id: 'c1', blocked: false, grocery_orders: 3, food_orders: 2, requests: 2, refunds: t.refund_amount,
        app: { platform: t.source, app_version: t.app_version, device_model: t.source === 'ios' ? 'iPhone 12' : 'Xiaomi Redmi Note 10', os_version: t.source === 'ios' ? '18.2' : '14', last_seen_at: demo.ago(3) } },
      recent: t.order_number ? [{ kind: t.kind, id: t.food_order_id ?? t.order_id, order_number: t.order_number, status: 'delivered', total: 340, created_at: demo.ago(90) }] : [],
    })
  }
  const { data, error } = await sb.rpc('desk_support_get', { p_id: id })
  if (error) {
    if (missing(error)) return null
    throw new Error(error.message)
  }
  return data
}

/** Links to the customers' photos (private), for an hour. */
export async function photoLinks(paths) {
  if (!paths.length) return {}
  if (!sb) return Object.fromEntries(paths.map((p) => [p, '/app-banners/fresh-groceries.jpg']))
  const { data, error } = await sb.storage.from('support').createSignedUrls(paths, 3600)
  if (error) return {}
  return Object.fromEntries((data ?? []).filter((x) => x.signedUrl).map((x) => [x.path, x.signedUrl]))
}

/* ---------- the team's actions ---------- */

/** A reply to the customer (they get an app notification), or a note only the team sees. */
export async function sendReply(id, text, internal = false) {
  const body = text.trim()
  if (!body) throw new Error('Write a reply first.')
  if (!sb) {
    const t = demo.tickets.find((x) => x.id === id)
    t.messages.push({ id: `m${Date.now()}`, created_at: new Date().toISOString(), sender: 'support', body, photos: [], internal, staff_name: 'Owner' })
    if (!internal) touch(t, { status: t.status === 'resolved' ? 'resolved' : 'pending', first_response_at: t.first_response_at ?? new Date().toISOString(), last_from: 'support', last_preview: body.slice(0, 140), last_message_at: new Date().toISOString() })
    return
  }
  check(await sb.rpc('desk_support_send', { p_id: id, p_message: body, p_internal: internal }))
}

/** Open again / waiting for the customer, or urgent / normal. */
export async function setTicket(id, { status = null, priority = null }) {
  if (!sb) {
    const t = demo.tickets.find((x) => x.id === id)
    touch(t, { ...(status && { status, resolved_at: null }), ...(priority && { priority }) })
    return
  }
  check(await sb.rpc('desk_support_set', { p_id: id, p_status: status, p_priority: priority }))
}

/** Resolve: what was done (team only), a refund, and an optional last message to the customer. */
export async function resolveTicket(id, { resolution = '', amount = 0, how = '', message = '' }) {
  const refund = Number(amount) || 0
  if (refund < 0 || refund > 10000) throw new Error('Enter a refund between ₹0 and ₹10,000.')
  if (refund > 0 && !how) throw new Error('Choose how the refund is given.')
  if (!sb) {
    const t = demo.tickets.find((x) => x.id === id)
    const at = new Date().toISOString()
    if (message.trim()) t.messages.push({ id: `m${Date.now()}`, created_at: at, sender: 'support', body: message.trim(), photos: [], internal: false, staff_name: 'Owner' })
    const word = { wallet: 'added to your Jholzo Money', upi: 'by UPI', cash: 'in cash' }[how]
    t.messages.push({ id: `m${Date.now() + 1}`, created_at: at, sender: 'system', body: `Marked as resolved.${refund > 0 ? ` Refund: ₹${refund} ${word}.` : ''}`, photos: [], internal: false })
    touch(t, { status: 'resolved', resolved_at: at, resolution: resolution.trim(), ...(refund > 0 && { refund_amount: refund, refund_how: how }), last_from: 'support', last_preview: 'Marked as resolved', last_message_at: at })
    return
  }
  check(await sb.rpc('desk_support_resolve', { p_id: id, p_resolution: resolution.trim(), p_refund_amount: refund, p_refund_how: refund > 0 ? how : '', p_message: message.trim() }))
}

/* ---------- quick replies ---------- */

export async function quickReplies() {
  if (!sb) return structuredClone(demo.replies).sort((a, b) => a.sort - b.sort)
  const { data, error } = await sb.from('support_quick_replies').select('*').order('sort').order('created_at')
  if (error) {
    if (missing(error)) return null
    throw new Error(error.message)
  }
  return data
}

export async function saveQuickReply({ id, title, body, sort = 0 }) {
  const row = { title: title.trim().slice(0, 60), body: body.trim().slice(0, 1000), sort: Number(sort) || 0 }
  if (!row.title || !row.body) throw new Error('Write a short name and the reply.')
  if (!sb) {
    const old = demo.replies.find((x) => x.id === id)
    if (old) Object.assign(old, row)
    else demo.replies.push({ id: `q${Date.now()}`, ...row })
    return
  }
  check(id ? await sb.from('support_quick_replies').update(row).eq('id', id) : await sb.from('support_quick_replies').insert(row))
}

export async function deleteQuickReply(id) {
  if (!sb) {
    demo.replies = demo.replies.filter((x) => x.id !== id)
    return
  }
  check(await sb.from('support_quick_replies').delete().eq('id', id))
}

/* ---------- report ---------- */

/** Numbers for India dates "YYYY-MM-DD" (owner). Null before update 069. */
export async function supportReport(from, to) {
  if (!sb) {
    const t = demo.tickets
    return {
      new: t.length, resolved: t.filter((x) => x.status === 'resolved').length, open_now: t.filter((x) => x.status === 'open').length,
      pending_now: t.filter((x) => x.status === 'pending').length, first_reply_min: 11, resolve_hours: 3.4, within_24h: 1, rating_avg: 5, ratings: 1, refunds: 30,
      by_kind: { food: 2, grocery: 1, other: 1 },
      by_topic: [{ kind: 'food', topic: 'missing_item', n: 1 }, { kind: 'grocery', topic: 'damaged', n: 1 }, { kind: 'other', topic: 'login', n: 1 }, { kind: 'food', topic: 'late', n: 1 }],
      by_restaurant: [{ name: 'Food delight', n: 2, refunds: 30 }],
      by_day: [{ day: from, n: 1 }, { day: to, n: 3 }],
    }
  }
  const { data, error } = await sb.rpc('admin_support_report', { p_from: from, p_to: to })
  if (error) {
    if (missing(error)) return null
    throw new Error(error.message)
  }
  return data
}
