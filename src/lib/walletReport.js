// Admin → Jholzo Money: each customer's balance, where every rupee came from or went, their gifts and their orders.
// Built from the same rows in the database and in demo mode (customers, wallet entries, orders, gifts, gift moves).
import { ENTRY_LABEL } from './wallet.js'

const nameOf = (c) => c?.name?.trim() || c?.phone || 'Customer'
const round = (n) => Math.round(n * 100) / 100
const ordererOf = (o) => o.orderer_id ?? o.customer_id

// What a gift is now: active (can still be used), used up, expired or taken back.
export function giftStatus(g, left, at = new Date()) {
  if (g.cancelled_at) return 'cancelled'
  if (left <= 0) return 'used'
  if (new Date(g.expires_at) <= at) return 'expired'
  return 'active'
}

export function walletReport(customers, entries, orders, gifts = [], moves = []) {
  const byId = new Map(customers.map((c) => [c.id, c]))
  const orderById = new Map(orders.map((o) => [o.id, o]))
  const invited = new Map()
  for (const c of customers) if (c.referred_by) invited.set(c.referred_by, (invited.get(c.referred_by) ?? 0) + 1)

  const people = new Map()
  const person = (id) => {
    if (!people.has(id)) people.set(id, { entries: [], balance: 0, earned: 0, used: 0, gifts: [], orders: [] })
    return people.get(id)
  }

  for (const e of entries) {
    const amount = Number(e.amount) || 0
    const o = e.order_id ? orderById.get(e.order_id) : null
    const n = o ? `#${o.order_number}` : ''
    const me = byId.get(e.customer_id)
    let from
    if (e.kind === 'referral_bonus') {
      // Who earned it for them: the friend who ordered with their invite code.
      const friend = o ? byId.get(ordererOf(o)) : null
      from = friend ? `${nameOf(friend)} (${friend.phone}) ordered ${n}` : e.note
    } else if (e.kind === 'welcome_bonus') {
      const by = me?.referred_by ? byId.get(me.referred_by) : null
      from = `First order ${n}${by ? ` · invited by ${nameOf(by)} (${by.phone})` : ''}`
    } else if (e.kind === 'order_payment') {
      from = `Used on order ${n}`
    } else if (e.kind === 'refund') {
      from = n ? `Order ${n} cancelled, money back` : e.note
    } else {
      from = e.note || 'Added by Jholzo'
    }
    const row = person(e.customer_id)
    row.entries.push({
      id: e.id, amount, kind: e.kind, label: ENTRY_LABEL[e.kind] ?? e.kind, from: from || '', note: e.note ?? '',
      created_at: e.created_at, order_number: o?.order_number ?? '',
    })
    row.balance += amount
    if (amount > 0) row.earned += amount
    else row.used -= amount
  }

  // Gifts (update 051): money left = amount + its moves (used is minus, given back is plus).
  const movesOf = new Map()
  for (const m of moves) {
    if (!movesOf.has(m.gift_id)) movesOf.set(m.gift_id, [])
    movesOf.get(m.gift_id).push(m)
  }
  let giftsActive = 0
  for (const g of gifts) {
    const list = movesOf.get(g.id) ?? []
    const amount = Number(g.amount) || 0
    const left = round(amount + list.reduce((s, m) => s + (Number(m.amount) || 0), 0))
    const status = giftStatus(g, left)
    // Net gift money per order (used minus what came back), only orders that still have some.
    const perOrder = new Map()
    for (const m of list) if (m.order_id) perOrder.set(m.order_id, (perOrder.get(m.order_id) ?? 0) - (Number(m.amount) || 0))
    const uses = [...perOrder].filter(([, v]) => v > 0.004).map(([orderId, v]) => ({ order_number: orderById.get(orderId)?.order_number ?? '', amount: round(v) }))
    const row = person(g.customer_id)
    row.gifts.push({
      id: g.id, amount, left: Math.max(0, left), min_order: Number(g.min_order) || 0, expires_at: g.expires_at, note: g.note ?? '',
      created_at: g.created_at, cancelled_at: g.cancelled_at ?? null, status, uses,
    })
    if (status === 'active') {
      row.balance += left
      giftsActive += left
    }
    row.earned += amount
    row.used += uses.reduce((s, u) => s + u.amount, 0)
  }

  // Orders each customer placed themselves (their wallet is on those), newest first.
  for (const o of orders) {
    const id = ordererOf(o)
    if (!id) continue
    person(id).orders.push({
      id: o.id, order_number: o.order_number, created_at: o.created_at, completed_at: o.completed_at, status: o.status,
      cancel_reason: o.cancel_reason ?? '', subtotal: Number(o.subtotal) || 0, total: Number(o.total) || 0,
      wallet_used: Number(o.wallet_used) || 0, payment_method: o.payment_method,
      for_name: o.customer_id !== id ? o.customer_name : '',
      items: (o.order_items ?? o.items ?? []).map((i) => ({ name: i.name_snapshot, qty: i.quantity, total: Number(i.line_total) || 0 })),
    })
  }

  const list = [...people.entries()].filter(([id]) => byId.has(id)).map(([id, row]) => {
    const c = byId.get(id)
    const by = c?.referred_by ? byId.get(c.referred_by) : null
    const delivered = row.orders.filter((o) => o.status === 'completed')
    row.orders.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    row.gifts.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    return {
      id,
      name: nameOf(c),
      phone: c?.phone ?? '',
      code: c?.referral_code ?? '',
      invited_by: by ? `${nameOf(by)} (${by.phone})` : '',
      friends: invited.get(id) ?? 0,
      balance: round(row.balance),
      earned: round(row.earned),
      used: round(row.used),
      entries: row.entries.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))),
      gifts: row.gifts,
      gift_left: round(row.gifts.filter((g) => g.status === 'active').reduce((s, g) => s + g.left, 0)),
      orders: row.orders,
      delivered: delivered.length,
      spent: round(delivered.reduce((s, o) => s + o.total + o.wallet_used, 0)),
      last_order_at: row.orders[0]?.created_at ?? null,
    }
  })
  list.sort((a, b) => String(b.last_order_at ?? '').localeCompare(String(a.last_order_at ?? '')) || b.balance - a.balance || a.name.localeCompare(b.name))
  return {
    customers: list,
    total: {
      balance: round(list.reduce((s, c) => s + c.balance, 0)),
      earned: round(list.reduce((s, c) => s + c.earned, 0)),
      used: round(list.reduce((s, c) => s + c.used, 0)),
      gifts: round(giftsActive),
    },
  }
}
