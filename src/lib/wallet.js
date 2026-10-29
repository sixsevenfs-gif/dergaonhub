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
  return `Order groceries from Jholzo, delivered to your door in Dergaon 🛒\nUse my invite code *${code}* on your first order (₹${r.minOrder} or more) and get ₹${r.friendReward} Jholzo Money after it is delivered.\n${inviteLink(code)}`
}

// Words for each row of the money history.
export const ENTRY_LABEL = {
  referral_bonus: 'Invite reward',
  welcome_bonus: 'Welcome reward',
  order_payment: 'Used on order',
  refund: 'Refund',
  admin: 'From Jholzo',
}
