// Jholzo Money (wallet) and Refer & Earn: the rules from Admin → Settings, and the invite code
// that came with a shared link. The database (supabase/migrations/017_wallet_referral.sql) checks
// every rule again; these are for showing the right amounts.

const REF_KEY = 'jholzo-ref'

// Settings with defaults, so an older store (before update 017) still shows sensible numbers.
export function walletRules(store) {
  const n = (v, d) => (v === undefined || v === null || v === '' ? d : Number(v) || 0)
  return {
    on: store?.referral_on !== false,
    referrerReward: n(store?.referrer_reward, 30),
    friendReward: n(store?.friend_reward, 20),
    minOrder: n(store?.referral_min_order, 149),
    maxPerOrder: n(store?.wallet_max_per_order, 50),
  }
}

// How much of the balance this order can use.
export const walletToUse = (balance, store, total) =>
  Math.max(0, Math.min(Number(balance) || 0, walletRules(store).maxPerOrder, total))

// Gift money from the owner (update 051) that has not expired, been taken back or used up, soonest to expire first.
export const activeGifts = (wallet) =>
  (wallet && !wallet.locked ? wallet.gifts ?? [] : [])
    .filter((g) => g.status === 'active' && g.left > 0 && new Date(g.expires_at) > new Date())
    .sort((a, b) => String(a.expires_at).localeCompare(String(b.expires_at)))

// Jholzo Money on an order, same rules as place_order (update 051): gifts whose minimum the items total reaches pay
// for items only (never the charges) with no per-order limit; the other money (rewards, refunds) pays up to the
// per-order limit of what is left. nudge: the next gift the customer can unlock by adding items.
// itemsCap: what gifts may pay at most (the items total, less an invite code's discount, update 058).
export function walletPlan(wallet, store, subtotal, fullTotal, itemsCap = subtotal) {
  const gifts = activeGifts(wallet)
  const usable = gifts.filter((g) => g.min_order <= subtotal)
  const gift = Math.min(usable.reduce((s, g) => s + g.left, 0), Math.max(0, itemsCap))
  const generalBalance = wallet && !wallet.locked ? Number(wallet.general_balance ?? wallet.balance) || 0 : 0
  const general = walletToUse(generalBalance, store, Math.max(0, fullTotal - gift))
  const locked = gifts.filter((g) => g.min_order > subtotal).sort((a, b) => a.min_order - b.min_order)[0]
  return {
    gift: round2(gift),
    general: round2(general),
    use: round2(gift + general),
    nudge: locked ? { need: round2(locked.min_order - subtotal), amount: locked.left, minOrder: locked.min_order, expires_at: locked.expires_at } : null,
  }
}
const round2 = (n) => Math.round(n * 100) / 100

// "Valid till 15 Nov, 9:00 PM" (India time).
// "23 Nov, 11:59 pm"; with the year when it is not this year ("23 Nov 2027, 11:59 pm"), so a gift valid into next
// year does not look as if it has already ended.
export const validTill = (iso) => {
  const d = new Date(iso)
  const year = (x) => x.toLocaleString('en-IN', { year: 'numeric', timeZone: 'Asia/Kolkata' })
  const other = year(d) !== year(new Date())
  return d.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', ...(other ? { year: 'numeric' } : {}), hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata',
  })
}

// WhatsApp text for a gift. It never says from which order amount it works: the cart tells them that.
// Only emoji from the basic set (⭐ ⏰ ✅ ➜): newer ones like 🎁 break in WhatsApp links on a Mac. No *bold* marks.
export function giftMessage(name, amount, expiresAt) {
  const first = String(name ?? '').trim().split(' ')[0]
  const till = validTill(expiresAt).replace(/\b(am|pm)\b/, (m) => m.toUpperCase())
  return [
    `Hi${first ? ` ${first}` : ''} ⭐`,
    `₹${Number(amount).toLocaleString('en-IN')} Jholzo Money is waiting in your Jholzo account!`,
    `⏰ Only till ${till}. After that it expires.`,
    'It comes off your bill by itself at checkout ✅',
    'Order now ➜ https://jholzo.com',
  ].join('\n')
}

// A link like jholzo.com/?ref=RAHUL482 saves the code until the first order is placed.
export function captureRefFromUrl() {
  try {
    const code = new URLSearchParams(window.location.search).get('ref')
    if (code && /^[A-Za-z0-9]{4,12}$/.test(code)) localStorage.setItem(REF_KEY, code.toUpperCase())
  } catch {
    // storage blocked: the friend can still type the code at checkout
  }
}

export function savedRefCode() {
  try {
    return localStorage.getItem(REF_KEY) ?? ''
  } catch {
    return ''
  }
}

export function clearRefCode() {
  try {
    localStorage.removeItem(REF_KEY)
  } catch {
    // nothing to clear
  }
}

export const inviteLink = (code) => `${window.location.origin}/?ref=${code}`

export function inviteMessage(code, store) {
  const r = walletRules(store)
  return `Order groceries from Jholzo, delivered to your door in Dergaon 🛒\nUse my invite code *${code}* on your first order (₹${r.minOrder} or more) and get ₹${r.friendReward} off right away.\n${inviteLink(code)}`
}

// Words for each row of the money history.
export const ENTRY_LABEL = {
  referral_bonus: 'Invite reward',
  welcome_bonus: 'Welcome reward',
  order_payment: 'Used on order',
  refund: 'Refund',
  admin: 'From Jholzo',
  gift: 'Gift from Jholzo',
}

/**
 * The app notification for Jholzo Money the owner added (update 077): the same words for one customer or for
 * everyone. Gifts have an end date and maybe an order amount; money added by hand has a reason instead.
 */
export function moneyPush(amount, { expiresAt = null, minOrder = 0, reason = '' } = {}) {
  const value = `₹${Number(amount).toLocaleString('en-IN')}`
  const till = expiresAt ? validTill(expiresAt).replace(/\b(am|pm)\b/, (m) => m.toUpperCase()) : ''
  const use = minOrder > 0 ? `Use it on an order of ₹${minOrder} or more` : 'Use it on your next order'
  const body = expiresAt
    ? `${use} before ${till}. It comes off your bill by itself. Happy shopping!`
    : `${reason ? `${reason.trim().replace(/[.!]$/, '')}. ` : ''}${use}. It comes off your bill by itself.`
  return { title: `${value} added to your Jholzo Money 🎁`, body: body.slice(0, 300) }
}
