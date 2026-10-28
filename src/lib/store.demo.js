// Demo data layer: everything lives in this browser's localStorage.
// Used when no Supabase keys are set. store.supabase.js has the same functions for the real database.
import { CONFIG } from '../config.js'
import { makeSeed } from './seed.js'
import { addDays, cleanPhone, dateStr, matches, rupee, slotDate } from './format.js'
import { deliveryQuote, expressStatus, packagingFee, validPoint } from './delivery.js'
import { parseCSV } from './csv.js'
import { walletRules } from './wallet.js'

const KEY = 'dergaonhub-demo-v9' // bump to load fresh demo data
const CUSTOMER_KEY = 'dergaonhub-customer'
const listeners = new Set()

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // storage blocked or broken: start from demo data
  }
  return makeSeed()
}

let db = load()

const notify = () => listeners.forEach((fn) => fn())

// Returns false when the browser could not save (blocked, or full because of photos).
function commit() {
  let saved = true
  try {
    localStorage.setItem(KEY, JSON.stringify(db))
  } catch {
    saved = false // changes live until the page reloads
  }
  notify()
  return saved
}

// Saves a photo; if the browser storage is full the change is undone.
function commitPhoto(undo) {
  if (commit()) return
  undo()
  commit()
  fail('Photo not saved: the browser storage is full in demo mode. This limit goes away once the database is connected.')
}

// Another tab changed the data (for example admin open next to the customer site).
window.addEventListener('storage', (e) => {
  if (e.key === KEY) {
    db = load()
    notify()
  }
  if (e.key === CUSTOMER_KEY) notify()
})

export const subscribe = (fn) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export async function resetDemo() {
  db = makeSeed()
  commit()
}

const newId = () => Math.random().toString(36).slice(2, 10)
const now = () => new Date().toISOString()
const clone = (x) => (x === undefined ? null : structuredClone(x))
const fail = (msg) => {
  throw new Error(msg)
}
const sum = (list, f) => list.reduce((s, x) => s + f(x), 0)
const byName = (a, b) => a.name.localeCompare(b.name)

/* ---------- store settings ---------- */

export async function getStore() {
  return clone(db.store)
}

const STORE_FIELDS = ['name', 'phone', 'whatsapp', 'open_time', 'close_time', 'cutoff_time', 'slot_start', 'slot_end', 'min_order', 'delivery_area', 'paused', 'location', 'per_km_fee', 'min_delivery_fee', 'max_delivery_km', 'pack_fee_low', 'pack_fee_mid', 'pack_fee_high', 'pack_mid_from', 'pack_high_from', 'whatsapp_auto', 'free_delivery', 'small_order_below', 'small_order_fee', 'show_powered_by', 'upi_id', 'upi_name', 'cod_limit', 'otp_required', 'referral_on', 'referrer_reward', 'friend_reward', 'referral_min_order', 'wallet_max_per_order', 'mid_order_fee', 'free_delivery_above', 'express_on', 'express_fee', 'express_minutes']

export async function saveStore(data) {
  if (!data.name?.trim()) fail('Enter the store name.')
  if (cleanPhone(data.phone).length !== 10) fail('Enter a valid 10-digit phone number.')
  if (cleanPhone(data.whatsapp).length !== 10) fail('Enter a valid 10-digit WhatsApp number.')
  if (!data.delivery_area?.length) fail('Choose at least one delivery area.')
  if (!validPoint(data.location)) fail('Set the store location on the map.')
  if (!(Number(data.per_km_fee) >= 0) || !(Number(data.min_delivery_fee) >= 0)) fail('Enter valid delivery charges.')
  if (!(Number(data.max_delivery_km) > 0)) fail('Enter a valid max delivery distance.')
  for (const f of STORE_FIELDS) if (f in data) db.store[f] = data[f]
  db.store.name = db.store.name.trim()
  db.store.phone = cleanPhone(db.store.phone)
  db.store.whatsapp = `91${cleanPhone(db.store.whatsapp)}`
  db.store.min_order = Number(db.store.min_order) || 0
  db.store.per_km_fee = Number(db.store.per_km_fee) || 0
  db.store.min_delivery_fee = Number(db.store.min_delivery_fee) || 0
  db.store.max_delivery_km = Number(db.store.max_delivery_km) || 1
  for (const k of ['mid_order_fee', 'free_delivery_above', 'express_fee', 'express_minutes', 'referrer_reward', 'friend_reward', 'referral_min_order', 'wallet_max_per_order', 'cod_limit', 'small_order_below', 'small_order_fee', 'pack_fee_low', 'pack_fee_mid', 'pack_fee_high', 'pack_mid_from', 'pack_high_from']) {
    if (db.store[k] !== undefined) db.store[k] = Number(db.store[k]) || 0 // fields an older demo store doesn't have stay unset
  }
  commit()
  return clone(db.store)
}

export async function setPaused(paused) {
  db.store.paused = !!paused
  commit()
}

/* ---------- products ---------- */

export async function listCategories() {
  return clone(db.categories)
}

// Customers see only active products; admin passes includeHidden.
export async function listProducts({ q = '', categoryId = '', includeHidden = false } = {}) {
  return clone(
    db.products
      .filter((p) => includeHidden || p.status === 'active')
      .filter((p) => !categoryId || p.category_id === categoryId)
      .filter((p) => !q.trim() || matches(`${p.name} ${p.size} ${p.keywords}`, q))
      .sort(byName),
  )
}

const productOrFail = (id) => db.products.find((p) => p.id === id) ?? fail('Product not found.')

export async function addProduct({ name, size, category_id, keywords, price }) {
  if (!name?.trim()) fail('Enter the product name.')
  if (!db.categories.some((c) => c.id === category_id)) fail('Choose a category.')
  if (!(Number(price) > 0)) fail('Enter a valid price.')
  const p = {
    id: newId(), name: name.trim(), size: size?.trim() ?? '', category_id, keywords: keywords?.trim() ?? '',
    price: Number(price), photo_url: '', featured: false, available: true, status: 'active', updated_at: now(),
  }
  db.products.push(p)
  commit()
  return clone(p)
}

export async function updateProduct(id, patch) {
  const p = productOrFail(id)
  if ('price' in patch) {
    if (!(Number(patch.price) > 0)) fail('Enter a valid price.')
    p.price = Number(patch.price)
  }
  if ('compare_price' in patch) {
    const before = patch.compare_price == null ? null : Number(patch.compare_price)
    if (before != null && !(before > p.price)) fail('The discount price must be lower than the original price.')
    p.compare_price = before
  }
  if ('available' in patch) p.available = !!patch.available
  if ('featured' in patch) p.featured = !!patch.featured
  if ('status' in patch) p.status = patch.status
  p.updated_at = now()
  commit()
}

export async function setProductPhoto(id, photoUrl) {
  const p = productOrFail(id)
  const before = p.photo_url
  p.photo_url = photoUrl
  commitPhoto(() => {
    p.photo_url = before
  })
}

// CSV columns: name,size,category,keywords,price (category can be its id or its name).
export async function importProductsCSV(text) {
  const rows = parseCSV(text)
  if (rows.length && rows[0][0].trim().toLowerCase() === 'name') rows.shift()
  let added = 0
  const skipped = []
  for (const [name = '', size = '', category = '', keywords = '', price = ''] of rows) {
    const cat = db.categories.find((c) => c.id === category.trim() || c.name.toLowerCase() === category.trim().toLowerCase())
    if (!name.trim() || !cat || !(Number(price) > 0)) {
      skipped.push(name || '(empty row)')
      continue
    }
    if (db.products.some((p) => p.name.toLowerCase() === name.trim().toLowerCase() && p.size === size.trim())) {
      skipped.push(`${name} (already added)`)
      continue
    }
    db.products.push({
      id: newId(), name: name.trim(), size: size.trim(), category_id: cat.id, keywords: keywords.trim(),
      price: Number(price), photo_url: '', featured: false, available: true, status: 'active', updated_at: now(),
    })
    added++
  }
  commit()
  return { added, skipped }
}

/* ---------- customer login (demo: phone only, OTP comes with the database) ---------- */

export function currentCustomer() {
  try {
    return JSON.parse(localStorage.getItem(CUSTOMER_KEY))
  } catch {
    return null
  }
}

export async function customerSignIn(phone, name = '', verified = false) {
  const ph = cleanPhone(phone)
  if (ph.length !== 10) fail('Enter a valid 10-digit phone number.')
  const known = db.customers.find((c) => c.phone === ph)
  const me = currentCustomer()
  const session = { phone: ph, name: name.trim() || known?.name || '', verified: verified || (me?.phone === ph && !!me?.verified) }
  try {
    localStorage.setItem(CUSTOMER_KEY, JSON.stringify(session))
  } catch {
    fail('Could not save your login in this browser.')
  }
  notify()
  return session
}

// Customer changes their name on My account; past orders keep the name they were placed with.
export async function updateMyName(name) {
  const me = currentCustomer() ?? fail('Please log in first.')
  if (!name.trim()) fail('Enter your name.')
  const session = { ...me, name: name.trim() }
  try {
    localStorage.setItem(CUSTOMER_KEY, JSON.stringify(session))
  } catch {
    fail('Could not save your name in this browser.')
  }
  const c = db.customers.find((x) => x.phone === me.phone)
  if (c) c.name = session.name
  commit()
  return session
}

export async function customerSignOut() {
  try {
    localStorage.removeItem(CUSTOMER_KEY)
  } catch {
    // nothing to clear
  }
  notify()
}

/* ---------- Jholzo Money and Refer & Earn (same rules as supabase/migrations/017_wallet_referral.sql) ---------- */

const entries = () => (db.wallet ??= [])
const balanceOf = (customerId) => Math.round(sum(entries().filter((e) => e.customer_id === customerId), (e) => e.amount) * 100) / 100
const ordererId = (o) => o.orderer_id ?? o.customer_id
function addEntry(customerId, amount, kind, orderId = null, note = '') {
  entries().push({ id: newId(), customer_id: customerId, amount, kind, order_id: orderId, note, created_at: now() })
}

// RAHUL482: up to 5 letters of the name + 3 digits, or JHOL + digits.
function newReferralCode(name) {
  let base = (name ?? '').replace(/[^A-Za-z]/g, '').slice(0, 5).toUpperCase()
  if (base.length < 3) base = 'JHOL'
  let code
  do code = `${base}${100 + Math.floor(Math.random() * 900)}`
  while (db.customers.some((c) => c.referral_code === code))
  return code
}

// Money follows the order status: cancelled → used money back; delivered → invite rewards on a
// friend's first delivered order; delivered undone → those rewards taken back.
function walletOnStatus(o, from) {
  if (o.status === from) return
  const rules = walletRules(db.store)
  const meId = ordererId(o)
  if (o.status === 'cancelled' && o.wallet_used > 0 && !entries().some((e) => e.order_id === o.id && e.kind === 'refund')) {
    addEntry(meId, o.wallet_used, 'refund', o.id, `Order ${o.order_number} cancelled`)
  }
  if (o.status === 'completed' && rules.on) {
    const me = db.customers.find((c) => c.id === meId)
    const firstDelivered = !db.orders.some((x) => x.id !== o.id && x.status === 'completed' && ordererId(x) === meId)
    const alreadyWelcomed = entries().some((e) => e.customer_id === meId && e.kind === 'welcome_bonus')
    if (me?.referred_by && o.subtotal >= rules.minOrder && firstDelivered && !alreadyWelcomed) {
      const first = me.name.split(' ')[0] || 'Your friend'
      if (rules.referrerReward > 0) addEntry(me.referred_by, rules.referrerReward, 'referral_bonus', o.id, `${first}'s first order was delivered`)
      if (rules.friendReward > 0) addEntry(meId, rules.friendReward, 'welcome_bonus', o.id, 'Welcome reward for joining with an invite')
    }
  }
  if (from === 'completed') {
    db.wallet = entries().filter((e) => !(e.order_id === o.id && (e.kind === 'referral_bonus' || e.kind === 'welcome_bonus')))
  }
}

export async function myWallet(phone) {
  const ph = cleanPhone(phone)
  if (ph.length !== 10) return null
  let c = customerByPhone(ph)
  // Demo: this browser owns a number once it has ordered for it (or verified it).
  const owns = (db.verified ?? []).includes(ph) || db.orders.some((o) => o.ordered_by_phone === ph || (o.customer_phone === ph && !o.ordered_by_phone))
  if (!owns) return { locked: true }
  // Verified but never ordered: the invite code comes with the first order (with their name).
  if (!c) return { locked: false, code: null, balance: 0, referred: false, has_orders: false, entries: [], friends: [] }
  if (!c.referral_code) {
    c.referral_code = newReferralCode(c.name)
    commit()
  }
  const orderNo = (id) => db.orders.find((o) => o.id === id)?.order_number ?? null
  return clone({
    locked: false,
    code: c.referral_code,
    balance: balanceOf(c.id),
    referred: !!c.referred_by,
    has_orders: db.orders.some((o) => ordererId(o) === c.id || o.customer_id === c.id),
    entries: entries().filter((e) => e.customer_id === c.id).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 50)
      .map((e) => ({ ...e, order_number: orderNo(e.order_id) })),
    friends: db.customers.filter((f) => f.referred_by === c.id).map((f) => ({
      name: f.name.split(' ')[0] || 'Friend',
      joined_at: f.created_at,
      earned: entries().some((e) => e.customer_id === c.id && e.kind === 'referral_bonus' && ordererId(db.orders.find((o) => o.id === e.order_id) ?? {}) === f.id),
    })),
  })
}

export async function adminWalletAdjust(customerId, amount, note) {
  const value = Math.round(Number(amount) * 100) / 100
  if (!value) fail('Enter an amount.')
  if (!note?.trim()) fail('Write a short reason.')
  db.customers.find((c) => c.id === customerId) ?? fail('Customer not found.')
  addEntry(customerId, value, 'admin', null, note.trim())
  commit()
}

/* ---------- orders (customer) ---------- */

const customerByPhone = (phone) => db.customers.find((c) => c.phone === cleanPhone(phone))
const completedCount = (customerId) =>
  db.orders.filter((o) => o.customer_id === customerId && o.status === 'completed').length

// After the cut-off the order goes to tomorrow, and a full evening moves to the next one.
function pickDate() {
  let date = slotDate(db.store)
  const booked = (d) => db.orders.filter((o) => o.delivery_date === d && o.status !== 'cancelled').length
  while (booked(date) >= dailyCap()) date = addDays(date, 1)
  return date
}

const dailyCap = () => Math.max(1, Number(db.private?.daily_order_cap) || CONFIG.DELIVERY_CAP)

// The day the next order would be delivered (today, tomorrow, or later if those evenings are full).
export async function nextDeliveryDate() {
  return pickDate()
}

export async function placeOrder({ lines, name, phone, address, area, location, note, payment_method, allow_substitute, orderer, use_wallet, ref_code, express }) {
  const store = db.store
  if (store.paused) fail('The store is not taking orders right now. Please try again later.')
  const ph = cleanPhone(phone)
  if (!name.trim()) fail('Enter your name.')
  if (ph.length !== 10) fail('Enter a valid 10-digit phone number.')
  if (!address.trim()) fail('Enter your address or a landmark.')
  if (!store.delivery_area.includes(area)) fail('Choose your area.')
  if (!validPoint(location)) fail('Set your home location on the map.')
  const ob = orderer && cleanPhone(orderer.phone) !== ph ? { name: orderer.name.trim(), phone: cleanPhone(orderer.phone) } : null
  if (ob && ob.phone.length !== 10) fail('Enter a valid 10-digit phone number for yourself.')
  if (ob && !ob.name) fail('Enter your name.')
  const quote = deliveryQuote(store, location)
  if (quote.tooFar) fail(`We are currently not available at your location (${quote.km} km away). We will be available soon!`)

  // OTP (when switched on): the ordering number must be verified on this phone.
  if (store.otp_required && !(db.verified ?? []).includes(ob?.phone ?? ph)) fail('Please verify your phone number with the OTP first.')
  // Blocked by the admin: no online orders. Repeated no-shows: no cash on delivery.
  let customer = customerByPhone(ph)
  const obc = ob && customerByPhone(ob.phone)
  if (customer?.blocked || obc?.blocked) fail('Online ordering is blocked for this number. Please call us to order.')
  const noShows = Math.max(customer?.no_show_count ?? 0, obc?.no_show_count ?? 0)
  if (payment_method === 'cash' && noShows >= CONFIG.NO_SHOW_LIMIT) {
    fail('Due to misuse of cash on delivery, we have temporarily restricted it for this number. Please choose UPI.')
  }

  const items = []
  for (const line of lines) {
    const p = db.products.find((x) => x.id === line.productId)
    if (!p || !p.available || p.status !== 'active') fail('Some items are no longer available. Please check your cart.')
    items.push({
      id: newId(), product_id: p.id, name_snapshot: `${p.name} ${p.size}`.trim(), price_snapshot: p.price,
      quantity: line.qty, note: line.note || '', line_total: p.price * line.qty,
    })
  }
  if (!items.length) fail('Your cart is empty.')

  const subtotal = sum(items, (i) => i.line_total)
  if (subtotal < store.min_order) fail(`Minimum order is ${rupee(store.min_order)}.`)
  // Evening charge by items total; Express (within an hour) adds its charge (see deliveryQuote).
  if (express) {
    const ex = expressStatus(store)
    if (ex.off) fail('Express delivery is not available right now. Please choose evening delivery.')
    if (!ex.ok) fail('Express delivery is not available at this time. Please choose evening delivery.')
  }
  const dq = deliveryQuote(store, location, subtotal, !!express)
  const fee = dq.eveningFee
  const packaging = packagingFee(store, subtotal)
  let total = Math.round((subtotal + fee + dq.expressFee + packaging) * 100) / 100

  // The person ordering (their wallet, their invite code): the orderer when ordering for someone else.
  const mePhone = ob?.phone ?? ph
  let me = customerByPhone(mePhone)
  const rules = walletRules(store)
  const ref = (ref_code ?? '').replace(/\s/g, '').toUpperCase()
  let referrer = null
  if (ref && rules.on) {
    referrer = db.customers.find((c) => c.referral_code === ref) ?? fail('This invite code is not valid. Check it or remove it.')
    if (referrer.phone === mePhone) fail('You cannot use your own invite code.')
    if (me && (me.referred_by || db.orders.some((o) => ordererId(o) === me.id || o.customer_id === me.id))) {
      fail('Invite codes work only on your first order. Please remove the code.')
    }
  }
  // Jholzo Money: up to the per-order limit (the demo has one phone, so it always owns the number).
  const walletUsed = use_wallet && me ? Math.max(0, Math.min(balanceOf(me.id), rules.maxPerOrder, total)) : 0
  total = Math.round((total - walletUsed) * 100) / 100

  if (payment_method !== 'upi_now' && total > (store.cod_limit ?? 350)) {
    fail(`Orders above ${rupee(store.cod_limit ?? 350)} are paid by UPI before delivery. Please choose "Pay now by UPI".`)
  }
  if (payment_method === 'upi_now' && !store.upi_id) fail('Online payment is not available right now. Please choose another payment method.')

  if (!customer) {
    customer = { id: newId(), phone: ph, name: name.trim(), no_show_count: 0, blocked: false, created_at: now() }
    db.customers.push(customer)
  } else {
    customer.name = name.trim()
  }
  if (!ob) me = customer
  if (!me) {
    me = { id: newId(), phone: ob.phone, name: ob.name, no_show_count: 0, blocked: false, created_at: now() }
    db.customers.push(me)
  }
  if (referrer) me.referred_by = referrer.id
  me.referral_code ??= newReferralCode(me.name)

  const order = {
    id: newId(), order_number: `DG-${db.next_order_number++}`, type: 'delivery',
    customer_id: customer.id, customer_name: customer.name, customer_phone: ph,
    address: address.trim(), area, location: { lat: location.lat, lng: location.lng }, distance_km: quote.km,
    note: note?.trim() ?? '', allow_substitute: !!allow_substitute,
    orderer_id: me.id, subtotal, delivery_fee: fee, packaging_fee: packaging, wallet_used: walletUsed, total, payment_method, cash_collected: 0,
    payment_status: payment_method === 'upi_now' ? 'awaiting' : 'none', upi_ref: '',
    delivery_date: express ? dateStr() : pickDate(), status: 'placed', cancel_reason: '',
    delivery_type: express ? 'express' : 'evening', express_fee: dq.expressFee,
    express_by: express ? new Date(Date.now() + expressStatus(store).minutes * 60000).toISOString() : null,
    created_at: now(), confirmed_at: null, completed_at: null,
    ordered_by_name: ob?.name ?? '', ordered_by_phone: ob?.phone ?? '',
  }
  db.orders.push(order)
  db.order_items.push(...items.map((i) => ({ ...i, order_id: order.id })))
  if (walletUsed > 0) addEntry(me.id, -walletUsed, 'order_payment', order.id, `Used on order ${order.order_number}`)
  commit()
  return clone(order)
}

// Placed or confirmed orders whose day has passed are cancelled automatically.
function expireOld() {
  const today = dateStr()
  let changed = false
  for (const o of db.orders) {
    if ((o.status === 'placed' || o.status === 'confirmed') && o.delivery_date < today) {
      const from = o.status
      o.status = 'cancelled'
      o.cancel_reason = 'Expired'
      walletOnStatus(o, from)
      changed = true
    }
  }
  if (changed) commit()
}

const itemsOf = (orderId) => db.order_items.filter((i) => i.order_id === orderId)

export async function getOrder(orderNumber) {
  expireOld()
  const o = db.orders.find((x) => x.order_number.toLowerCase() === String(orderNumber).toLowerCase())
  if (!o) return null
  return clone({
    order: o,
    items: itemsOf(o.id),
    store: db.store,
    complaints: db.complaints.filter((k) => k.order_id === o.id),
  })
}

export async function ordersByPhone(phone) {
  expireOld()
  const ph = cleanPhone(phone)
  return clone(
    db.orders
      .filter((o) => o.customer_phone === ph || o.ordered_by_phone === ph)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((o) => ({ ...o, items: itemsOf(o.id), item_count: sum(itemsOf(o.id), (i) => i.quantity) })),
  )
}

/* ---------- waitlist: people outside the delivery radius ---------- */

// "Notify me": someone outside the delivery area leaves their number to hear when we start there.
export async function joinWaitlist({ phone, name, location, label, km }) {
  const ph = cleanPhone(phone)
  if (ph.length !== 10) fail('Enter a valid 10-digit phone number.')
  db.waitlist ??= []
  const existing = db.waitlist.find((w) => w.phone === ph && !w.notified)
  const entry = {
    id: existing?.id ?? newId(), phone: ph, name: name?.trim() ?? '', location, label: label ?? '', km,
    notified: false, created_at: existing?.created_at ?? now(),
  }
  db.waitlist = [...db.waitlist.filter((w) => w.id !== entry.id), entry]
  commit()
}

export async function adminListWaitlist() {
  return clone([...(db.waitlist ?? [])].sort((a, b) => a.notified - b.notified || a.km - b.km))
}

export async function setWaitlistNotified(id, notified) {
  const w = (db.waitlist ?? []).find((x) => x.id === id) ?? fail('Entry not found.')
  w.notified = notified
  commit()
}

/* ---------- complaints ---------- */

// Customer reports a problem with one of their own orders.
export async function submitComplaint({ orderNumber, type, message }) {
  const me = currentCustomer() ?? fail('Please log in with your phone number first.')
  const o = db.orders.find((x) => x.order_number === orderNumber) ?? fail('Order not found.')
  if (o.customer_phone !== me.phone) fail('This order does not belong to this phone number.')
  if (!type) fail('Choose the type of problem.')
  db.complaints.push({
    id: newId(), order_id: o.id, order_number: o.order_number, customer_phone: o.customer_phone, customer_name: o.customer_name,
    type, message: message?.trim() ?? '', status: 'open', admin_note: '', created_at: now(), resolved_at: null,
  })
  commit()
}

export async function myComplaints() {
  const me = currentCustomer()
  if (!me) return []
  return clone(db.complaints.filter((k) => k.customer_phone === me.phone).sort((a, b) => b.created_at.localeCompare(a.created_at)))
}

export async function adminListComplaints({ status = '' } = {}) {
  return clone(
    db.complaints
      .filter((k) => !status || k.status === status)
      .sort((a, b) => (a.status === b.status ? b.created_at.localeCompare(a.created_at) : a.status === 'open' ? -1 : 1)),
  )
}

export async function resolveComplaint(id, note) {
  const k = db.complaints.find((x) => x.id === id) ?? fail('Complaint not found.')
  k.status = 'resolved'
  k.admin_note = note?.trim() ?? ''
  k.resolved_at = now()
  commit()
}

export async function reopenComplaint(id) {
  const k = db.complaints.find((x) => x.id === id) ?? fail('Complaint not found.')
  k.status = 'open'
  k.resolved_at = null
  commit()
}

/* ---------- admin: orders ---------- */

// "This number has 1 earlier no-show" style hint shown on each order.
function hintFor(phone) {
  const c = customerByPhone(phone)
  if (!c) return { completed: 0, no_show_count: 0, blocked: false }
  return { completed: completedCount(c.id), no_show_count: c.no_show_count, blocked: c.blocked }
}

export async function adminListOrders({ status = '', date = '' } = {}) {
  expireOld()
  return clone(
    db.orders
      .filter((o) => (!status || o.status === status) && (!date || o.delivery_date === date))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((o) => ({ ...o, item_count: sum(itemsOf(o.id), (i) => i.quantity), hint: hintFor(o.customer_phone) })),
  )
}

export async function getOrderById(orderId) {
  expireOld()
  const o = db.orders.find((x) => x.id === orderId)
  if (!o) return null
  return clone({
    order: o, items: itemsOf(o.id), store: db.store, hint: hintFor(o.customer_phone),
    complaints: db.complaints.filter((k) => k.order_id === o.id),
  })
}

const orderOrFail = (id) => db.orders.find((o) => o.id === id) ?? fail('Order not found.')

export async function confirmOrder(id) {
  const o = orderOrFail(id)
  if (o.status !== 'placed') fail('Only new orders can be confirmed.')
  o.status = 'confirmed'
  o.confirmed_at = now()
  commit()
}

// Delivered and paid.
export async function completeOrder(id, cashCollected) {
  const o = orderOrFail(id)
  if (o.status === 'cancelled') fail('A cancelled order cannot be delivered.')
  const from = o.status
  o.status = 'completed'
  o.completed_at = now()
  o.cash_collected = o.payment_method === 'cash' ? Number(cashCollected ?? o.total) || 0 : 0
  walletOnStatus(o, from)
  commit()
}

export async function reopenOrder(id) {
  const o = orderOrFail(id)
  if (o.status !== 'completed') return
  o.status = 'confirmed'
  o.completed_at = null
  o.cash_collected = 0
  walletOnStatus(o, 'completed')
  commit()
}

export async function cancelOrder(id, reason) {
  const o = orderOrFail(id)
  if (o.status === 'completed') fail('A delivered order cannot be cancelled.')
  if (!reason) fail('Choose a reason for cancelling.')
  const from = o.status
  o.status = 'cancelled'
  o.cancel_reason = reason
  walletOnStatus(o, from)
  if (reason === 'No-show') {
    const c = db.customers.find((x) => x.id === o.customer_id)
    if (c) c.no_show_count += 1
  }
  commit()
}

// An item was not found at the shop: remove it and recalculate the total.
export async function removeOrderItem(orderId, itemId) {
  const o = orderOrFail(orderId)
  if (o.status !== 'placed' && o.status !== 'confirmed') fail('This order can no longer be changed.')
  const remaining = itemsOf(orderId).filter((i) => i.id !== itemId)
  if (!remaining.length) fail('You cannot remove the last item. Cancel the order instead.')
  db.order_items = db.order_items.filter((i) => i.id !== itemId)
  o.subtotal = sum(remaining, (i) => i.line_total)
  o.packaging_fee = packagingFee(db.store, o.subtotal)
  o.total = Math.max(0, o.subtotal + o.delivery_fee + (o.express_fee ?? 0) + o.packaging_fee - (o.wallet_used ?? 0))
  commit()
}

/* ---------- admin: day tools ---------- */

export async function adminStats() {
  expireOld()
  const today = dateStr()
  const todays = db.orders.filter((o) => o.delivery_date === today && o.status !== 'cancelled')
  return {
    newOrders: db.orders.filter((o) => o.status === 'placed').length,
    todayOrders: todays.length,
    todayValue: sum(todays, (o) => o.total),
    openComplaints: db.complaints.filter((k) => k.status === 'open').length,
    waitlist: (db.waitlist ?? []).filter((w) => !w.notified).length,
    outOfStock: db.products.filter((p) => p.status === 'active' && !p.available).length,
    paused: db.store.paused,
  }
}

// The evening run: all orders for one day grouped by area, with one shopping list for the trip to the shop.
export async function deliverySheet(date) {
  expireOld()
  const orders = db.orders
    .filter((o) => o.delivery_date === date && o.status !== 'cancelled')
    .map((o) => ({ ...o, items: itemsOf(o.id) }))
  const areas = [...new Set(orders.map((o) => o.area))].sort()

  const shopping = {}
  // Only confirmed orders: unconfirmed ones may still be cancelled, delivered ones are already bought.
  for (const o of orders.filter((x) => x.status === 'confirmed')) {
    for (const i of o.items) {
      shopping[i.name_snapshot] ??= { name: i.name_snapshot, quantity: 0, cost: 0 }
      shopping[i.name_snapshot].quantity += i.quantity
      shopping[i.name_snapshot].cost += i.line_total
    }
  }

  return clone({
    count: orders.length,
    cap: dailyCap(),
    groups: areas.map((area) => ({ area, orders: orders.filter((o) => o.area === area) })),
    shopping: Object.values(shopping).sort((a, b) => a.name.localeCompare(b.name)),
  })
}

// Money for one day: what customers paid, what was spent at the shops, what is left.
export async function dailySummary(date) {
  const day = db.orders.filter((o) => o.delivery_date === date)
  const done = day.filter((o) => o.status === 'completed')
  const cash = sum(done.filter((o) => o.payment_method === 'cash'), (o) => o.cash_collected)
  const upi = sum(done.filter((o) => o.payment_method !== 'cash'), (o) => o.total)
  const expense = db.daily_expenses.find((e) => e.date === date)
  const spent = expense?.amount ?? 0
  return {
    orders: day.length,
    delivered: done.length,
    cancelled: day.filter((o) => o.status === 'cancelled').length,
    noShows: day.filter((o) => o.cancel_reason === 'No-show').length,
    value: sum(done, (o) => o.total),
    cash, upi, collected: cash + upi,
    fees: sum(done, (o) => o.delivery_fee),
    packaging: sum(done, (o) => o.packaging_fee ?? 0),
    spent, spentNote: expense?.note ?? '',
    profit: cash + upi - spent,
  }
}

export async function setDailyExpense(date, amount, note = '') {
  const value = Number(amount)
  if (!(value >= 0)) fail('Enter a valid amount.')
  db.daily_expenses = db.daily_expenses.filter((e) => e.date !== date)
  db.daily_expenses.push({ date, amount: value, note: note.trim() })
  commit()
}

/* ---------- admin: customers ---------- */

export async function adminListCustomers() {
  return clone(
    db.customers
      .map((c) => ({
        ...c, orders: db.orders.filter((o) => o.customer_id === c.id).length, completed: completedCount(c.id),
        wallet: balanceOf(c.id), referred_by_name: db.customers.find((x) => x.id === c.referred_by)?.name ?? '',
      }))
      .sort((a, b) => b.no_show_count - a.no_show_count || a.name.localeCompare(b.name)),
  )
}

export async function setCustomerBlocked(id, blocked) {
  const c = db.customers.find((x) => x.id === id) ?? fail('Customer not found.')
  c.blocked = blocked
  commit()
}

export async function resetNoShows(id) {
  const c = db.customers.find((x) => x.id === id) ?? fail('Customer not found.')
  c.no_show_count = 0
  commit()
}

/* ---------- admin login (demo: always admin) ---------- */

export async function adminSession() {
  return { email: 'demo', isAdmin: true }
}

export async function adminSignIn() {
  return adminSession()
}

export async function adminSignOut() {}

/* ---------- delivery partner (demo: the admin is the rider) ---------- */

export async function partnerSession() {
  return { email: 'demo', role: 'admin' }
}

export async function partnerSignIn() {
  return partnerSession()
}

const messagesOf = (orderId) => (db.order_messages ?? []).filter((m) => m.order_id === orderId)

export async function partnerOrders(date) {
  expireOld()
  return clone(
    db.orders
      .filter((o) => o.delivery_date === date && o.status !== 'cancelled')
      .sort((a, b) => a.area.localeCompare(b.area) || a.created_at.localeCompare(b.created_at))
      .map((o) => ({ dispatch: '', ...o, items: itemsOf(o.id), messages: messagesOf(o.id) })),
  )
}

export async function setDispatch(id, dispatch) {
  const o = orderOrFail(id)
  if (o.status !== 'confirmed') fail('Only confirmed orders can go out for delivery.')
  o.dispatch = dispatch
  o.dispatched_at = dispatch ? now() : null
  commit()
}

export async function partnerComplete(id, cash, photo) {
  const o = orderOrFail(id)
  if (!photo) fail('Take a photo of the items at the door first.')
  if (o.status !== 'confirmed') fail('Only confirmed orders can be marked delivered.')
  o.delivery_photo = photo
  await completeOrder(id, cash)
}

// Demo: the (small) photo itself is kept with the order.
export const uploadDeliveryPhoto = async (orderId, photoUrl) => photoUrl
export const deliveryPhotoUrl = async (path) => path || ''

export const partnerUndoDelivered = (id) => reopenOrder(id)

export async function logMessage(id, kind) {
  db.order_messages ??= []
  db.order_messages.push({ id: newId(), order_id: id, kind, channel: 'tap', ok: true, at: now() })
  commit()
}

// Demo mode cannot send WhatsApp messages by itself.
export async function sendAutoMessage() {
  return { sent: false, reason: 'off' }
}

/* ---------- admin: riders (demo: names only, no logins) ---------- */

export async function adminListRiders() {
  return clone(db.riders ?? [])
}

export async function adminAddRider({ email, name, phone }) {
  if (!email?.trim()) fail('Enter the rider login email.')
  if (!name?.trim()) fail('Enter the rider name.')
  const ph = cleanPhone(phone ?? '')
  if (ph && ph.length !== 10) fail('Enter a valid 10-digit phone number.')
  db.riders ??= []
  const found = db.riders.find((r) => r.email.toLowerCase() === email.trim().toLowerCase())
  if (found) Object.assign(found, { name: name.trim(), phone: ph, active: true })
  else db.riders.push({ user_id: newId(), email: email.trim(), name: name.trim(), phone: ph, active: true })
  commit()
}

export async function setRiderActive(userId, active) {
  const r = (db.riders ?? []).find((x) => x.user_id === userId) ?? fail('Rider not found.')
  r.active = !!active
  commit()
}

/* ---------- customer: cancel own order (until the rider is on the way) ---------- */

export async function cancelMyOrder(orderNumber) {
  const o = db.orders.find((x) => x.order_number.toLowerCase() === String(orderNumber).toLowerCase()) ?? fail('Order not found on this phone.')
  if (o.status === 'cancelled') return
  if (o.status === 'completed') fail('This order is already delivered.')
  if (o.dispatch) fail("Our rider is already on the way, so this order can't be cancelled now.")
  const from = o.status
  o.status = 'cancelled'
  o.cancel_reason = 'Cancelled by customer'
  walletOnStatus(o, from)
  commit()
}

/* ---------- no-shows and cash on delivery ---------- */

export async function partnerNoShow(id) {
  const o = orderOrFail(id)
  if (o.status !== 'confirmed') fail('Only confirmed orders can be marked as a no-show.')
  await cancelOrder(id, 'No-show')
}

export async function codAllowed(phone) {
  return (customerByPhone(phone)?.no_show_count ?? 0) < CONFIG.NO_SHOW_LIMIT
}

/* ---------- extra product photos (demo: kept in the browser) ---------- */

export async function addProductPhoto(id, photoUrl) {
  const p = productOrFail(id)
  p.photos = [...(p.photos ?? []), photoUrl]
  commitPhoto(() => {
    p.photos = p.photos.slice(0, -1)
  })
}

export async function removeProductPhoto(id, url) {
  const p = productOrFail(id)
  p.photos = (p.photos ?? []).filter((x) => x !== url)
  commit()
}

/* ---------- admin: contacts for offers ---------- */

export async function adminContacts() {
  const all = new Map()
  const add = (name, phone, at) => {
    if (!phone) return
    const c = all.get(phone) ?? { name, phone, orders: 0, last: at }
    c.orders += 1
    if (at > c.last) c.last = at
    all.set(phone, c)
  }
  for (const o of db.orders) {
    add(o.customer_name, o.customer_phone, o.created_at)
    add(o.ordered_by_name, o.ordered_by_phone, o.created_at)
  }
  return [...all.values()].sort((a, b) => b.last.localeCompare(a.last))
}

/* ---------- admin-only settings ---------- */

export async function getPrivateSettings() {
  return { daily_order_cap: dailyCap(), ready: true }
}

export async function savePrivateSettings({ daily_order_cap }) {
  const cap = Number(daily_order_cap)
  if (!(cap >= 1)) fail('Enter how many orders you can deliver in one evening.')
  db.private = { ...db.private, daily_order_cap: Math.round(cap) }
  commit()
}

/* ---------- Pay now by UPI ---------- */

export async function submitUpiRef(orderNumber, ref) {
  const o = db.orders.find((x) => x.order_number.toLowerCase() === String(orderNumber).toLowerCase()) ?? fail('Order not found on this phone.')
  if (o.payment_method !== 'upi_now') fail('This order is not paid online.')
  const r = String(ref ?? '').replace(/\s/g, '')
  if (!/^[0-9A-Za-z]{6,30}$/.test(r)) fail('Enter the UPI Ref No. / UTR shown in your UPI app (usually 12 digits).')
  if (o.payment_status === 'paid') return
  o.upi_ref = r
  o.payment_status = 'verifying'
  commit()
}

export async function setPaymentStatus(orderId, status) {
  const o = orderOrFail(orderId)
  if (o.payment_method !== 'upi_now') fail('This order is not paid online.')
  if (status === 'paid') {
    Object.assign(o, { payment_status: 'paid', paid_at: now() })
    if (o.status === 'placed') Object.assign(o, { status: 'confirmed', confirmed_at: now() })
  }
  else if (o.total <= (db.store.cod_limit ?? 350)) Object.assign(o, { payment_status: 'none', payment_method: 'cash', upi_ref: '' })
  else o.payment_status = 'failed'
  commit()
}

/* ---------- phone OTP (demo: the code is always 1234) ---------- */

export async function phoneVerified(phone) {
  return (db.verified ?? []).includes(cleanPhone(phone))
}

export async function sendOtp(phone) {
  if (cleanPhone(phone).length !== 10) fail('Enter a valid 10-digit phone number.')
  return { sent: true, timeout: 30, demo: true }
}

export async function verifyOtp(phone, code) {
  if (String(code).trim() !== '1234') fail('Wrong OTP. Please check and try again. (Demo code: 1234)')
  db.verified = [...new Set([...(db.verified ?? []), cleanPhone(phone)])]
  commit()
  return true
}
