// Admin → Jholzo Money: each customer's balance and where every rupee came from or went.
// Built from the same rows in the database and in demo mode (customers, wallet entries, orders).
import { ENTRY_LABEL } from './wallet.js'

const nameOf = (c) => c?.name?.trim() || c?.phone || 'Customer'
const round = (n) => Math.round(n * 100) / 100

export function walletReport(customers, entries, orders) {
  const byId = new Map(customers.map((c) => [c.id, c]))
  const orderById = new Map(orders.map((o) => [o.id, o]))
  const invited = new Map()
  for (const c of customers) if (c.referred_by) invited.set(c.referred_by, (invited.get(c.referred_by) ?? 0) + 1)

  const people = new Map()
  for (const e of entries) {
    const amount = Number(e.amount) || 0
    const o = e.order_id ? orderById.get(e.order_id) : null
    const n = o ? `#${o.order_number}` : ''
    const me = byId.get(e.customer_id)
    let from
    if (e.kind === 'referral_bonus') {
      // Who earned it for them: the friend who ordered with their invite code.
      const friend = o ? byId.get(o.orderer_id ?? o.customer_id) : null
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
    const row = people.get(e.customer_id) ?? { entries: [], balance: 0, earned: 0, used: 0 }
    row.entries.push({
      id: e.id, amount, kind: e.kind, label: ENTRY_LABEL[e.kind] ?? e.kind, from: from || '', note: e.note ?? '',
      created_at: e.created_at, order_number: o?.order_number ?? '',
    })
    row.balance += amount
    if (amount > 0) row.earned += amount
    else row.used -= amount
    people.set(e.customer_id, row)
  }

  const list = [...people.entries()].map(([id, row]) => {
    const c = byId.get(id)
    const by = c?.referred_by ? byId.get(c.referred_by) : null
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
    }
  })
  list.sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name))
  return {
    customers: list,
    total: {
      balance: round(list.reduce((s, c) => s + c.balance, 0)),
      earned: round(list.reduce((s, c) => s + c.earned, 0)),
      used: round(list.reduce((s, c) => s + c.used, 0)),
    },
  }
}
