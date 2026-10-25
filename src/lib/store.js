// All data reads and writes go through this file.
// Right now (demo mode) data lives in this browser's localStorage.
// When Supabase is connected, only this file changes: pages keep calling the same functions.
import { CONFIG } from '../config.js'
import { makeSeed } from './seed.js'
import { addDays, cleanPhone, dateStr, matches, rupee, slotDate } from './format.js'

const KEY = 'dergaon-demo-v2' // bump to load fresh demo data
const SESSION_KEY = 'dergaon-demo-session'
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

// Another tab changed the data (for example the shop dashboard open next to the customer site).
window.addEventListener('storage', (e) => {
  if (e.key === KEY) {
    db = load()
    notify()
  }
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

/* ---------- products ---------- */

function joinProduct(sp) {
  const lp = sp.library_product_id ? db.library.find((l) => l.id === sp.library_product_id) : null
  return {
    ...sp,
    name: lp?.name ?? sp.custom_name,
    size: lp?.size ?? sp.custom_size,
    category_id: lp?.category_id ?? sp.category_id,
    keywords: lp?.keywords ?? '',
    photo_url: sp.photo_url || lp?.photo_url || '',
    own_photo_url: sp.photo_url,
  }
}

const byName = (a, b) => a.name.localeCompare(b.name)

export async function listCategories() {
  return clone(db.categories)
}

export async function listShopProducts(shopId, { publicOnly = false } = {}) {
  return clone(
    db.shop_products
      .filter((sp) => sp.shop_id === shopId && (!publicOnly || sp.review_status === 'approved'))
      .map(joinProduct)
      .sort(byName),
  )
}

export async function listLibrary({ q = '', categoryId = '' } = {}) {
  return clone(
    db.library
      .filter((l) => l.status === 'active')
      .filter((l) => !categoryId || l.category_id === categoryId)
      .filter((l) => !q.trim() || matches(`${l.name} ${l.size} ${l.keywords}`, q))
      .sort(byName),
  )
}

/* ---------- customer site ---------- */

export async function listLiveShops() {
  return clone(db.shops.filter((s) => s.status === 'live'))
}

export async function getShop(id) {
  return clone(db.shops.find((s) => s.id === id))
}

export async function searchAll(q) {
  const live = db.shops.filter((s) => s.status === 'live')
  const shops = live.filter((s) => matches(`${s.name} ${s.area} ${s.category}`, q))
  const products = db.shop_products
    .filter((sp) => sp.review_status === 'approved' && live.some((s) => s.id === sp.shop_id))
    .map(joinProduct)
    .filter((p) => matches(`${p.name} ${p.size} ${p.keywords}`, q))
    .slice(0, 12)
    .map((p) => ({ ...p, shop_name: live.find((s) => s.id === p.shop_id).name }))
  const directory = db.directory.filter((d) => d.status === 'live' && matches(`${d.name} ${d.category} ${d.area}`, q))
  return clone({ shops, products, directory })
}

const customerByPhone = (phone) => db.customers.find((c) => c.phone === cleanPhone(phone))
const completedCount = (customerId) =>
  db.orders.filter((o) => o.customer_id === customerId && o.status === 'completed').length

// Picks the delivery day: after the cut-off it is tomorrow, and a full evening moves to the next one.
function pickDate(shop, type) {
  let date = slotDate(shop)
  if (type === 'delivery') {
    const booked = (d) => db.orders.filter((o) => o.type === 'delivery' && o.delivery_date === d && o.status !== 'cancelled').length
    while (booked(date) >= CONFIG.DELIVERY_CAP) date = addDays(date, 1)
  }
  return date
}

export async function placeOrder({ shopId, lines, name, phone, type, address, area, note, payment_method }) {
  const shop = db.shops.find((s) => s.id === shopId)
  if (!shop || shop.status !== 'live' || shop.paused) fail('Ye shop abhi orders nahi le rahi.')
  const ph = cleanPhone(phone)
  if (!name.trim()) fail('Apna naam daalo.')
  if (ph.length !== 10) fail('Sahi 10 digit phone number daalo.')
  if (type === 'delivery') {
    if (!shop.delivery_available) fail('Ye shop delivery nahi karti. Pickup chuno.')
    if (!address.trim()) fail('Address ya landmark daalo.')
    if (!area) fail('Apna area chuno.')
  } else if (!shop.pickup_available) {
    fail('Ye shop pickup nahi deti.')
  }

  let customer = customerByPhone(ph)
  if (customer?.blocked || (customer?.no_show_count ?? 0) >= CONFIG.NO_SHOW_LIMIT) {
    fail('Is number se online order abhi band hai. Shop ko call karke order karo.')
  }

  const items = []
  for (const line of lines) {
    const sp = db.shop_products.find((p) => p.id === line.shopProductId && p.shop_id === shopId)
    if (!sp || !sp.available || sp.review_status !== 'approved') fail('Kuch items ab available nahi hain. Cart check karo.')
    const p = joinProduct(sp)
    items.push({
      id: newId(), shop_product_id: sp.id, name_snapshot: `${p.name} ${p.size}`.trim(), price_snapshot: sp.price,
      quantity: line.qty, note: line.note || '', line_total: sp.price * line.qty,
    })
  }
  if (!items.length) fail('Cart khaali hai.')

  const subtotal = sum(items, (i) => i.line_total)
  if (type === 'delivery' && subtotal < shop.min_order) fail(`Delivery ke liye minimum order ${rupee(shop.min_order)} hai.`)
  const delivery_fee = type === 'delivery' ? shop.delivery_fee : 0
  const total = subtotal + delivery_fee
  if ((!customer || completedCount(customer.id) === 0) && total > CONFIG.FIRST_ORDER_LIMIT) {
    fail(`Pehle order ki limit ${rupee(CONFIG.FIRST_ORDER_LIMIT)} hai. Thode items kam karo, ya shop ko call karo.`)
  }

  if (!customer) {
    customer = { id: newId(), phone: ph, name: name.trim(), no_show_count: 0, blocked: false, created_at: now() }
    db.customers.push(customer)
  } else {
    customer.name = name.trim()
  }

  const order = {
    id: newId(), order_number: `DG-${db.next_order_number++}`, shop_id: shopId,
    customer_id: customer.id, customer_name: customer.name, customer_phone: ph,
    type, address: type === 'delivery' ? address.trim() : '', area: type === 'delivery' ? area : '', note: note?.trim() ?? '',
    subtotal, delivery_fee, total, payment_method, cash_collected: 0,
    delivery_date: pickDate(shop, type), status: 'placed', cancel_reason: '',
    created_at: now(), confirmed_at: null, completed_at: null,
  }
  db.orders.push(order)
  db.order_items.push(...items.map((i) => ({ ...i, order_id: order.id })))
  commit()
  return clone(order)
}

// Confirmed or placed orders whose day has passed are cancelled automatically.
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

function fullOrder(o) {
  return {
    order: o,
    items: db.order_items.filter((i) => i.order_id === o.id),
    shop: db.shops.find((s) => s.id === o.shop_id),
  }
}

export async function getOrder(orderNumber) {
  expireOld()
  const o = db.orders.find((x) => x.order_number.toLowerCase() === String(orderNumber).toLowerCase())
  return o ? clone(fullOrder(o)) : null
}

export async function ordersByPhone(phone) {
  expireOld()
  const ph = cleanPhone(phone)
  return clone(
    db.orders
      .filter((o) => o.customer_phone === ph)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((o) => ({ ...o, shop_name: db.shops.find((s) => s.id === o.shop_id)?.name })),
  )
}

export async function listDirectory() {
  return clone(db.directory.filter((d) => d.status === 'live').sort(byName))
}

export async function submitDirectory(data, { asAdmin = false } = {}) {
  if (!data.name?.trim()) fail('Business ka naam daalo.')
  if (cleanPhone(data.phone).length !== 10) fail('Sahi 10 digit phone number daalo.')
  const wa = cleanPhone(data.whatsapp)
  db.directory.push({
    id: newId(), name: data.name.trim(), category: data.category, area: data.area,
    phone: cleanPhone(data.phone), whatsapp: wa.length === 10 ? `91${wa}` : '', hours: data.hours?.trim() ?? '',
    photo_url: '', status: asAdmin ? 'live' : 'pending',
  })
  commit()
}

/* ---------- shop owner ---------- */

export function currentUserEmail() {
  try {
    return localStorage.getItem(SESSION_KEY)
  } catch {
    return null
  }
}

// Demo login: email only. Real Google/email login comes with Supabase Auth.
export async function signIn(email) {
  const e = email.trim().toLowerCase()
  if (!/^\S+@\S+\.\S+$/.test(e)) fail('Sahi email daalo.')
  if (!db.users.find((u) => u.email === e)) db.users.push({ id: newId(), email: e, role: 'shop_owner', created_at: now() })
  try {
    localStorage.setItem(SESSION_KEY, e)
  } catch {
    fail('Is browser mein login save nahi ho pa raha.')
  }
  commit()
}

export async function signOut() {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    // nothing to clear
  }
  notify()
}

const me = () => db.users.find((u) => u.email === currentUserEmail())
const myShopRow = () => {
  const u = me()
  return u ? db.shops.find((s) => s.owner_user_id === u.id) : undefined
}
const myShopOrFail = () => myShopRow() ?? fail('Pehle login karke shop banao.')

export async function getMyShop() {
  return clone(myShopRow())
}

const SHOP_FIELDS = ['name', 'category', 'area', 'address', 'phone', 'whatsapp', 'open_time', 'close_time', 'delivery_available', 'pickup_available', 'min_order', 'delivery_fee', 'cutoff_time', 'slot_start', 'slot_end', 'delivery_area', 'paused']

export async function saveMyShop(data) {
  const u = me() ?? fail('Pehle login karo.')
  if (!data.name?.trim()) fail('Shop ka naam daalo.')
  if (cleanPhone(data.phone).length !== 10) fail('Sahi 10 digit phone number daalo.')
  if (cleanPhone(data.whatsapp).length !== 10) fail('Sahi 10 digit WhatsApp number daalo.')
  let shop = myShopRow()
  if (!shop) {
    shop = { id: newId(), owner_user_id: u.id, status: 'draft', reject_reason: '', paused: false, logo_url: '', created_at: now() }
    db.shops.push(shop)
  }
  for (const f of SHOP_FIELDS) if (f in data) shop[f] = data[f]
  shop.name = shop.name.trim()
  shop.phone = cleanPhone(shop.phone)
  shop.whatsapp = `91${cleanPhone(shop.whatsapp)}`
  shop.min_order = Number(shop.min_order) || 0
  shop.delivery_fee = Number(shop.delivery_fee) || 0
  commit()
  return clone(shop)
}

export async function goLive() {
  const shop = myShopOrFail()
  if (!db.shop_products.some((p) => p.shop_id === shop.id)) fail('Pehle kam se kam ek product add karo.')
  shop.status = 'pending'
  shop.reject_reason = ''
  commit()
}

export async function addFromLibrary(libraryProductId, price) {
  const shop = myShopOrFail()
  const p = Number(price)
  if (!(p > 0)) fail('Sahi price daalo.')
  if (db.shop_products.some((sp) => sp.shop_id === shop.id && sp.library_product_id === libraryProductId)) fail('Ye product pehle se added hai.')
  const lp = db.library.find((l) => l.id === libraryProductId)
  db.shop_products.push({
    id: newId(), shop_id: shop.id, library_product_id: libraryProductId, custom_name: '', custom_size: '',
    category_id: lp.category_id, price: p, available: true, review_status: 'approved', photo_url: '', updated_at: now(),
  })
  commit()
}

export async function addCustomProduct({ name, size, category_id, price }) {
  const shop = myShopOrFail()
  if (!name?.trim()) fail('Product ka naam daalo.')
  if (!(Number(price) > 0)) fail('Sahi price daalo.')
  db.shop_products.push({
    id: newId(), shop_id: shop.id, library_product_id: null, custom_name: name.trim(), custom_size: size?.trim() ?? '',
    category_id, price: Number(price), available: true, review_status: 'pending', photo_url: '', updated_at: now(),
  })
  commit()
}

export async function updateShopProduct(id, patch) {
  const shop = myShopOrFail()
  const sp = db.shop_products.find((p) => p.id === id && p.shop_id === shop.id) ?? fail('Product nahi mila.')
  if ('price' in patch && !(Number(patch.price) > 0)) fail('Sahi price daalo.')
  if ('price' in patch) sp.price = Number(patch.price)
  if ('available' in patch) sp.available = !!patch.available
  sp.updated_at = now()
  commit()
}

// Shop's own photo for a product (overrides the library photo). Empty string removes it.
export async function setShopProductPhoto(id, photoUrl) {
  const shop = myShopOrFail()
  const sp = db.shop_products.find((p) => p.id === id && p.shop_id === shop.id) ?? fail('Product nahi mila.')
  const before = sp.photo_url
  sp.photo_url = photoUrl
  sp.updated_at = now()
  commitPhoto(() => {
    sp.photo_url = before
  })
}

export async function setShopLogo(logoUrl) {
  const shop = myShopOrFail()
  const before = shop.logo_url
  shop.logo_url = logoUrl
  commitPhoto(() => {
    shop.logo_url = before
  })
}

export async function removeShopProduct(id) {
  const shop = myShopOrFail()
  db.shop_products = db.shop_products.filter((p) => !(p.id === id && p.shop_id === shop.id))
  commit()
}

export async function listMyOrders() {
  expireOld()
  const shop = myShopOrFail()
  return clone(
    db.orders
      .filter((o) => o.shop_id === shop.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((o) => ({
        ...o,
        item_count: sum(db.order_items.filter((i) => i.order_id === o.id), (i) => i.quantity),
        hint: hintFor(o.customer_phone),
      })),
  )
}

// "This number has 1 earlier no-show" style hint shown to the shop on each order.
function hintFor(phone) {
  const c = customerByPhone(phone)
  if (!c) return { completed: 0, no_show_count: 0, blocked: false }
  return { completed: completedCount(c.id), no_show_count: c.no_show_count, blocked: c.blocked }
}

export async function getOrderById(orderId) {
  expireOld()
  const o = db.orders.find((x) => x.id === orderId)
  if (!o) return null
  return clone({ ...fullOrder(o), hint: hintFor(o.customer_phone) })
}

/* ---------- order actions (shop owner and admin) ----------
   In demo mode anyone can call these; Supabase row-level security will limit
   shop owners to their own orders. */

const orderOrFail = (id) => db.orders.find((o) => o.id === id) ?? fail('Order nahi mila.')

export async function confirmOrder(id) {
  const o = orderOrFail(id)
  if (o.status !== 'placed') fail('Sirf naye order confirm ho sakte hain.')
  o.status = 'confirmed'
  o.confirmed_at = now()
  commit()
}

export async function completeOrder(id, cashCollected) {
  const o = orderOrFail(id)
  if (o.status === 'cancelled') fail('Cancelled order complete nahi ho sakta.')
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
  if (o.status === 'completed') fail('Completed order cancel nahi ho sakta.')
  if (!reason) fail('Cancel ka reason chuno.')
  o.status = 'cancelled'
  o.cancel_reason = reason
  if (reason === 'No-show') {
    const c = db.customers.find((x) => x.id === o.customer_id)
    if (c) c.no_show_count += 1
  }
  commit()
}

// Shop removes an out-of-stock item while confirming; totals are recalculated.
export async function removeOrderItem(orderId, itemId) {
  const o = orderOrFail(orderId)
  if (o.status !== 'placed' && o.status !== 'confirmed') fail('Ab ye order badla nahi ja sakta.')
  const remaining = db.order_items.filter((i) => i.order_id === orderId && i.id !== itemId)
  if (!remaining.length) fail('Aakhri item nahi hata sakte. Order cancel karo.')
  db.order_items = db.order_items.filter((i) => i.id !== itemId)
  o.subtotal = sum(remaining, (i) => i.line_total)
  o.total = o.subtotal + o.delivery_fee
  commit()
}

/* ---------- admin ---------- */

export async function adminStats() {
  expireOld()
  const today = dateStr()
  const todays = db.orders.filter((o) => o.delivery_date === today && o.status !== 'cancelled')
  return {
    todayOrders: todays.length,
    todayValue: sum(todays, (o) => o.total),
    pendingShops: db.shops.filter((s) => s.status === 'pending').length,
    pendingProducts: db.shop_products.filter((p) => p.review_status === 'pending').length,
    pendingDirectory: db.directory.filter((d) => d.status === 'pending').length,
  }
}

export async function adminListShops() {
  return clone(
    db.shops.map((s) => ({
      ...s,
      owner_email: db.users.find((u) => u.id === s.owner_user_id)?.email ?? '',
      product_count: db.shop_products.filter((p) => p.shop_id === s.id).length,
    })),
  )
}

export async function adminGetShop(id) {
  const shop = db.shops.find((s) => s.id === id)
  if (!shop) return null
  return clone({
    shop,
    owner_email: db.users.find((u) => u.id === shop.owner_user_id)?.email ?? '',
    products: db.shop_products.filter((p) => p.shop_id === id).map(joinProduct).sort(byName),
  })
}

export async function setShopStatus(id, status, reason = '') {
  const shop = db.shops.find((s) => s.id === id) ?? fail('Shop nahi mili.')
  if (status === 'rejected' && !reason.trim()) fail('Reject ka reason likho.')
  shop.status = status
  shop.reject_reason = status === 'rejected' ? reason.trim() : ''
  commit()
}

export async function adminRemoveProduct(shopProductId) {
  db.shop_products = db.shop_products.filter((p) => p.id !== shopProductId)
  commit()
}

export async function adminListOrders({ shopId = '', status = '', date = '' } = {}) {
  expireOld()
  return clone(
    db.orders
      .filter((o) => (!shopId || o.shop_id === shopId) && (!status || o.status === status) && (!date || o.delivery_date === date))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((o) => ({ ...o, shop_name: db.shops.find((s) => s.id === o.shop_id)?.name })),
  )
}

export async function deliverySheet(date) {
  expireOld()
  const orders = db.orders
    .filter((o) => o.type === 'delivery' && o.delivery_date === date && o.status !== 'cancelled')
    .map((o) => ({
      ...o,
      shop_name: db.shops.find((s) => s.id === o.shop_id)?.name,
      items: db.order_items.filter((i) => i.order_id === o.id),
    }))
  const areas = [...new Set(orders.map((o) => o.area))].sort()
  return clone({ count: orders.length, cap: CONFIG.DELIVERY_CAP, groups: areas.map((area) => ({ area, orders: orders.filter((o) => o.area === area) })) })
}

// Founder collects cash on delivery, keeps the delivery fee and hands the rest to the shop.
export async function settlementSummary(date) {
  const rows = db.shops
    .map((shop) => {
      const day = db.orders.filter((o) => o.shop_id === shop.id && o.delivery_date === date && o.status !== 'cancelled')
      const done = day.filter((o) => o.status === 'completed')
      const cashDelivery = done.filter((o) => o.type === 'delivery' && o.payment_method === 'cash')
      const cash = sum(cashDelivery, (o) => o.cash_collected)
      const fees = sum(done.filter((o) => o.type === 'delivery'), (o) => o.delivery_fee)
      const feesInCash = sum(cashDelivery, (o) => o.delivery_fee)
      return {
        shop_id: shop.id, shop_name: shop.name, orders: day.length, completed: done.length,
        value: sum(done, (o) => o.total), cash, upi: sum(done.filter((o) => o.payment_method === 'upi'), (o) => o.total),
        fees, hand_to_shop: cash - feesInCash,
        settled: db.settlements.some((s) => s.date === date && s.shop_id === shop.id),
      }
    })
    .filter((r) => r.orders > 0)
  return clone(rows)
}

export async function setSettled(date, shopId, settled) {
  db.settlements = db.settlements.filter((s) => !(s.date === date && s.shop_id === shopId))
  if (settled) db.settlements.push({ date, shop_id: shopId, settled_at: now() })
  commit()
}

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

export async function adminListLibrary() {
  return clone(
    db.library.map((l) => ({ ...l, shop_count: db.shop_products.filter((p) => p.library_product_id === l.id).length })).sort(byName),
  )
}

export async function addLibraryProduct({ name, size, category_id, keywords }) {
  if (!name?.trim()) fail('Product ka naam daalo.')
  if (!db.categories.some((c) => c.id === category_id)) fail('Category chuno.')
  const item = { id: newId(), name: name.trim(), size: size?.trim() ?? '', category_id, keywords: keywords?.trim() ?? '', photo_url: '', status: 'active' }
  db.library.push(item)
  commit()
  return clone(item)
}

// Library photo: every shop selling this product shows it (unless the shop has its own).
export async function setLibraryPhoto(id, photoUrl) {
  const l = db.library.find((x) => x.id === id) ?? fail('Product nahi mila.')
  const before = l.photo_url
  l.photo_url = photoUrl
  commitPhoto(() => {
    l.photo_url = before
  })
}

export async function setLibraryStatus(id, status) {
  const l = db.library.find((x) => x.id === id) ?? fail('Product nahi mila.')
  l.status = status
  commit()
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

// CSV columns: name,size,category,keywords (category can be its id or its name).
export async function importLibraryCSV(text) {
  const rows = parseCSV(text)
  if (rows.length && rows[0][0].trim().toLowerCase() === 'name') rows.shift()
  let added = 0
  const skipped = []
  for (const [name = '', size = '', category = '', keywords = ''] of rows) {
    const cat = db.categories.find((c) => c.id === category.trim() || c.name.toLowerCase() === category.trim().toLowerCase())
    if (!name.trim() || !cat) {
      skipped.push(name || '(empty row)')
      continue
    }
    if (db.library.some((l) => l.name.toLowerCase() === name.trim().toLowerCase() && l.size === size.trim())) {
      skipped.push(`${name} (already in library)`)
      continue
    }
    db.library.push({ id: newId(), name: name.trim(), size: size.trim(), category_id: cat.id, keywords: keywords.trim(), photo_url: '', status: 'active' })
    added++
  }
  commit()
  return { added, skipped }
}

export async function listReviewQueue() {
  return clone(
    db.shop_products
      .filter((p) => p.review_status === 'pending')
      .map((p) => ({ ...joinProduct(p), shop_name: db.shops.find((s) => s.id === p.shop_id)?.name })),
  )
}

export async function reviewCustomProduct(id, action) {
  const sp = db.shop_products.find((p) => p.id === id) ?? fail('Product nahi mila.')
  if (action === 'reject') {
    sp.review_status = 'rejected'
  } else {
    sp.review_status = 'approved'
    if (action === 'promote') {
      const item = { id: newId(), name: sp.custom_name, size: sp.custom_size, category_id: sp.category_id, keywords: sp.custom_name.toLowerCase(), photo_url: '', status: 'active' }
      db.library.push(item)
      sp.library_product_id = item.id
    }
  }
  commit()
}

export async function adminListDirectory() {
  return clone([...db.directory].sort((a, b) => (a.status === 'pending' ? -1 : 0) - (b.status === 'pending' ? -1 : 0) || byName(a, b)))
}

export async function setDirectoryStatus(id, status) {
  const d = db.directory.find((x) => x.id === id) ?? fail('Listing nahi mili.')
  d.status = status
  commit()
}
