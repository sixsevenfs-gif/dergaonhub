// All data reads and writes go through this file.
// Right now (demo mode) data lives in this browser's localStorage.
// When the database (Supabase or Firebase) is connected, only this file changes:
// pages keep calling the same functions.
import { CONFIG } from '../config.js'
import { makeSeed } from './seed.js'
import { addDays, cleanPhone, dateStr, matches, rupee, slotDate } from './format.js'
import { deliveryQuote, validPoint } from './delivery.js'

const KEY = 'dergaonhub-demo-v6' // bump to load fresh demo data
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
  fail('Photo save nahi hui: demo mode mein browser ki jagah bhar gayi. Database connect hone ke baad ye limit nahi rahegi.')
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

const STORE_FIELDS = ['name', 'phone', 'whatsapp', 'open_time', 'close_time', 'cutoff_time', 'slot_start', 'slot_end', 'min_order', 'delivery_area', 'paused', 'location', 'per_km_fee', 'min_delivery_fee', 'max_delivery_km']

export async function saveStore(data) {
  if (!data.name?.trim()) fail('Store ka naam daalo.')
  if (cleanPhone(data.phone).length !== 10) fail('Sahi 10 digit phone number daalo.')
  if (cleanPhone(data.whatsapp).length !== 10) fail('Sahi 10 digit WhatsApp number daalo.')
  if (!data.delivery_area?.length) fail('Kam se kam ek delivery area chuno.')
  if (!validPoint(data.location)) fail('Map pe apne ghar (store) ki location lagao.')
  if (!(Number(data.per_km_fee) >= 0) || !(Number(data.min_delivery_fee) >= 0)) fail('Delivery charge sahi daalo.')
  if (!(Number(data.max_delivery_km) > 0)) fail('Max delivery km sahi daalo.')
  for (const f of STORE_FIELDS) if (f in data) db.store[f] = data[f]
  db.store.name = db.store.name.trim()
  db.store.phone = cleanPhone(db.store.phone)
  db.store.whatsapp = `91${cleanPhone(db.store.whatsapp)}`
  db.store.min_order = Number(db.store.min_order) || 0
  db.store.per_km_fee = Number(db.store.per_km_fee) || 0
  db.store.min_delivery_fee = Number(db.store.min_delivery_fee) || 0
  db.store.max_delivery_km = Number(db.store.max_delivery_km) || 1
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

const productOrFail = (id) => db.products.find((p) => p.id === id) ?? fail('Product nahi mila.')

export async function addProduct({ name, size, category_id, keywords, price }) {
  if (!name?.trim()) fail('Product ka naam daalo.')
  if (!db.categories.some((c) => c.id === category_id)) fail('Category chuno.')
  if (!(Number(price) > 0)) fail('Sahi price daalo.')
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
    if (!(Number(patch.price) > 0)) fail('Sahi price daalo.')
    p.price = Number(patch.price)
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

function parseCSV(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim()))
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
      skipped.push(`${name} (pehle se hai)`)
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

export async function customerSignIn(phone, name = '') {
  const ph = cleanPhone(phone)
  if (ph.length !== 10) fail('Sahi 10 digit phone number daalo.')
  const known = db.customers.find((c) => c.phone === ph)
  const session = { phone: ph, name: name.trim() || known?.name || '' }
  try {
    localStorage.setItem(CUSTOMER_KEY, JSON.stringify(session))
  } catch {
    fail('Is browser mein login save nahi ho pa raha.')
  }
  notify()
  return session
}

// Customer changes their name on My account; past orders keep the name they were placed with.
export async function updateMyName(name) {
  const me = currentCustomer() ?? fail('Pehle login karo.')
  if (!name.trim()) fail('Naam daalo.')
  const session = { ...me, name: name.trim() }
  try {
    localStorage.setItem(CUSTOMER_KEY, JSON.stringify(session))
  } catch {
    fail('Is browser mein naam save nahi ho pa raha.')
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

/* ---------- orders (customer) ---------- */

const customerByPhone = (phone) => db.customers.find((c) => c.phone === cleanPhone(phone))
const completedCount = (customerId) =>
  db.orders.filter((o) => o.customer_id === customerId && o.status === 'completed').length

// After the cut-off the order goes to tomorrow, and a full evening moves to the next one.
function pickDate() {
  let date = slotDate(db.store)
  const booked = (d) => db.orders.filter((o) => o.delivery_date === d && o.status !== 'cancelled').length
  while (booked(date) >= CONFIG.DELIVERY_CAP) date = addDays(date, 1)
  return date
}

export async function placeOrder({ lines, name, phone, address, area, location, note, payment_method, allow_substitute }) {
  const store = db.store
  if (store.paused) fail('Store abhi orders nahi le raha. Thodi der baad try karo.')
  const ph = cleanPhone(phone)
  if (!name.trim()) fail('Apna naam daalo.')
  if (ph.length !== 10) fail('Sahi 10 digit phone number daalo.')
  if (!address.trim()) fail('Address ya landmark daalo.')
  if (!store.delivery_area.includes(area)) fail('Apna area chuno.')
  if (!validPoint(location)) fail('Map pe apne ghar ki location lagao.')
  const quote = deliveryQuote(store, location)
  if (quote.tooFar) fail(`Ye jagah ${quote.km} km door hai. Abhi hum ${store.max_delivery_km} km tak deliver karte hain.`)

  let customer = customerByPhone(ph)
  if (customer?.blocked || (customer?.no_show_count ?? 0) >= CONFIG.NO_SHOW_LIMIT) {
    fail('Is number se online order abhi band hai. Hume call karke order karo.')
  }

  const items = []
  for (const line of lines) {
    const p = db.products.find((x) => x.id === line.productId)
    if (!p || !p.available || p.status !== 'active') fail('Kuch items ab available nahi hain. Cart check karo.')
    items.push({
      id: newId(), product_id: p.id, name_snapshot: `${p.name} ${p.size}`.trim(), price_snapshot: p.price,
      quantity: line.qty, note: line.note || '', line_total: p.price * line.qty,
    })
  }
  if (!items.length) fail('Cart khaali hai.')

  const subtotal = sum(items, (i) => i.line_total)
  if (subtotal < store.min_order) fail(`Minimum order ${rupee(store.min_order)} hai.`)
  const total = subtotal + quote.fee
  if ((!customer || completedCount(customer.id) === 0) && total > CONFIG.FIRST_ORDER_LIMIT) {
    fail(`Pehle order ki limit ${rupee(CONFIG.FIRST_ORDER_LIMIT)} hai. Thode items kam karo, ya hume call karo.`)
  }

  if (!customer) {
    customer = { id: newId(), phone: ph, name: name.trim(), no_show_count: 0, blocked: false, created_at: now() }
    db.customers.push(customer)
  } else {
    customer.name = name.trim()
  }

  const order = {
    id: newId(), order_number: `DG-${db.next_order_number++}`, type: 'delivery',
    customer_id: customer.id, customer_name: customer.name, customer_phone: ph,
    address: address.trim(), area, location: { lat: location.lat, lng: location.lng }, distance_km: quote.km,
    note: note?.trim() ?? '', allow_substitute: !!allow_substitute,
    subtotal, delivery_fee: quote.fee, total, payment_method, cash_collected: 0,
    delivery_date: pickDate(), status: 'placed', cancel_reason: '',
    created_at: now(), confirmed_at: null, completed_at: null,
  }
  db.orders.push(order)
  db.order_items.push(...items.map((i) => ({ ...i, order_id: order.id })))
  commit()
  return clone(order)
}

// Placed or confirmed orders whose day has passed are cancelled automatically.
function expireOld() {
  const today = dateStr()
  let changed = false
  for (const o of db.orders) {
    if ((o.status === 'placed' || o.status === 'confirmed') && o.delivery_date < today) {
      o.status = 'cancelled'
      o.cancel_reason = 'Expired'
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
      .filter((o) => o.customer_phone === ph)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((o) => ({ ...o, items: itemsOf(o.id), item_count: sum(itemsOf(o.id), (i) => i.quantity) })),
  )
}

/* ---------- complaints ---------- */

// Customer reports a problem with one of their own orders.
export async function submitComplaint({ orderNumber, type, message }) {
  const me = currentCustomer() ?? fail('Pehle apne phone number se login karo.')
  const o = db.orders.find((x) => x.order_number === orderNumber) ?? fail('Order nahi mila.')
  if (o.customer_phone !== me.phone) fail('Ye order is phone number ka nahi hai.')
  if (!type) fail('Problem ka type chuno.')
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
  const k = db.complaints.find((x) => x.id === id) ?? fail('Complaint nahi mili.')
  k.status = 'resolved'
  k.admin_note = note?.trim() ?? ''
  k.resolved_at = now()
  commit()
}

export async function reopenComplaint(id) {
  const k = db.complaints.find((x) => x.id === id) ?? fail('Complaint nahi mili.')
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

const orderOrFail = (id) => db.orders.find((o) => o.id === id) ?? fail('Order nahi mila.')

export async function confirmOrder(id) {
  const o = orderOrFail(id)
  if (o.status !== 'placed') fail('Sirf naye order confirm ho sakte hain.')
  o.status = 'confirmed'
  o.confirmed_at = now()
  commit()
}

// Delivered and paid.
export async function completeOrder(id, cashCollected) {
  const o = orderOrFail(id)
  if (o.status === 'cancelled') fail('Cancelled order deliver nahi ho sakta.')
  o.status = 'completed'
  o.completed_at = now()
  o.cash_collected = o.payment_method === 'cash' ? Number(cashCollected ?? o.total) || 0 : 0
  commit()
}

export async function reopenOrder(id) {
  const o = orderOrFail(id)
  if (o.status !== 'completed') return
  o.status = 'confirmed'
  o.completed_at = null
  o.cash_collected = 0
  commit()
}

export async function cancelOrder(id, reason) {
  const o = orderOrFail(id)
  if (o.status === 'completed') fail('Delivered order cancel nahi ho sakta.')
  if (!reason) fail('Cancel ka reason chuno.')
  o.status = 'cancelled'
  o.cancel_reason = reason
  if (reason === 'No-show') {
    const c = db.customers.find((x) => x.id === o.customer_id)
    if (c) c.no_show_count += 1
  }
  commit()
}

// An item was not found at the shop: remove it and recalculate the total.
export async function removeOrderItem(orderId, itemId) {
  const o = orderOrFail(orderId)
  if (o.status !== 'placed' && o.status !== 'confirmed') fail('Ab ye order badla nahi ja sakta.')
  const remaining = itemsOf(orderId).filter((i) => i.id !== itemId)
  if (!remaining.length) fail('Aakhri item nahi hata sakte. Order cancel karo.')
  db.order_items = db.order_items.filter((i) => i.id !== itemId)
  o.subtotal = sum(remaining, (i) => i.line_total)
  o.total = o.subtotal + o.delivery_fee
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
    cap: CONFIG.DELIVERY_CAP,
    groups: areas.map((area) => ({ area, orders: orders.filter((o) => o.area === area) })),
    shopping: Object.values(shopping).sort((a, b) => a.name.localeCompare(b.name)),
  })
}

// Money for one day: what customers paid, what was spent at the shops, what is left.
export async function dailySummary(date) {
  const day = db.orders.filter((o) => o.delivery_date === date)
  const done = day.filter((o) => o.status === 'completed')
  const cash = sum(done.filter((o) => o.payment_method === 'cash'), (o) => o.cash_collected)
  const upi = sum(done.filter((o) => o.payment_method === 'upi'), (o) => o.total)
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
    spent, spentNote: expense?.note ?? '',
    profit: cash + upi - spent,
  }
}

export async function setDailyExpense(date, amount, note = '') {
  const value = Number(amount)
  if (!(value >= 0)) fail('Sahi amount daalo.')
  db.daily_expenses = db.daily_expenses.filter((e) => e.date !== date)
  db.daily_expenses.push({ date, amount: value, note: note.trim() })
  commit()
}

/* ---------- admin: customers ---------- */

export async function adminListCustomers() {
  return clone(
    db.customers
      .map((c) => ({ ...c, orders: db.orders.filter((o) => o.customer_id === c.id).length, completed: completedCount(c.id) }))
      .sort((a, b) => b.no_show_count - a.no_show_count || a.name.localeCompare(b.name)),
  )
}

export async function setCustomerBlocked(id, blocked) {
  const c = db.customers.find((x) => x.id === id) ?? fail('Customer nahi mila.')
  c.blocked = blocked
  commit()
}

export async function resetNoShows(id) {
  const c = db.customers.find((x) => x.id === id) ?? fail('Customer nahi mila.')
  c.no_show_count = 0
  commit()
}
