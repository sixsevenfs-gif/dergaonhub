// The activity log (database update 072): who in the team changed what, and when. The owner reads it through
// admin_activity_list(); in demo mode (no keys) it shows sample lines, so the page can be tried.
import { supabase as sb } from './supabase.js'
import { rupee } from './format.js'

// "function not found": update 072 is not run yet.
const missing = (e) => /does not exist|Could not find|schema cache|PGRST20[0-9]/i.test(String(e?.message ?? e))

export const AREAS = [
  ['', 'Everything'], ['orders', 'Orders'], ['catalog', 'Products & menus'], ['customers', 'Customers & help'],
  ['money', 'Money'], ['settings', 'Settings & app'], ['team', 'Team'],
]
export const ROLE_LABEL = { owner: 'Owner', executive: 'Executive', rider: 'Rider', collector: 'Price collector' }

/** One page of the log, newest first (before: the last id already shown). Null before update 072. */
export async function activityList({ before = null, actor = null, area = '', q = '', limit = 100 } = {}) {
  if (!sb) return demoList({ before, actor, area, q, limit })
  const { data, error } = await sb.rpc('admin_activity_list', {
    p_before: before, p_limit: limit, p_actor: actor || null, p_area: area || null, p_q: q.trim() || null,
  })
  if (error) {
    if (missing(error)) return null
    throw new Error(error.message)
  }
  return data
}

/* ---------- words ---------- */

const when = (iso) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
const day = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

const SETTING = {
  name: 'Store name', phone: 'Store phone', whatsapp: 'WhatsApp number', open_time: 'Opens at', close_time: 'Closes at',
  cutoff_time: 'Same-day cut-off', slot_start: 'Delivery from', slot_end: 'Delivery until', min_order: 'Minimum order',
  delivery_area: 'Delivery areas', paused: 'Store paused', lat: 'Store location', lng: 'Store location', per_km_fee: 'Delivery fee per km',
  min_delivery_fee: 'Lowest delivery fee', max_delivery_km: 'Farthest delivery (km)', free_delivery: 'Free delivery',
  pack_fee_low: 'Packing fee (small)', pack_fee_mid: 'Packing fee (medium)', pack_fee_high: 'Packing fee (big)',
  pack_mid_from: 'Medium packing from', pack_high_from: 'Big packing from', whatsapp_auto: 'Automatic WhatsApp',
  small_order_below: 'Small order below', small_order_fee: 'Small order fee', mid_order_fee: 'Mid order fee',
  show_powered_by: 'Show "Powered by"', upi_id: 'UPI ID', upi_name: 'UPI name', cod_limit: 'Cash on delivery up to',
  otp_required: 'OTP at checkout', referral_on: 'Refer & Earn', referrer_reward: 'Reward for the inviter', friend_reward: 'Reward for the friend',
  referral_min_order: 'Refer & Earn minimum order', wallet_max_per_order: 'Jholzo Money per order (most)', free_delivery_above: 'Free delivery above',
  express_on: 'Express delivery', express_fee: 'Express charge', express_minutes: 'Express minutes', express_from: 'Express from', express_until: 'Express until',
  upi_pay_minutes: 'Minutes to pay by UPI', otp_credits_left: 'OTPs left', otp_alert_at: 'OTP alert at', otp_auto_off: 'OTP off by itself',
  riders_confirm: 'Riders confirm orders', upi_on: 'UPI payments', riders_buy: 'Riders buy at the shop', app_orders_live: 'App orders are real (not test)',
  gift_wrap_fee: 'Gift packing charge', food_on: 'Food', food_delivery_fee: 'Food delivery fee', food_free_delivery_above: 'Food free delivery above',
  food_platform_fee: 'Food platform fee', food_gst_percent: 'Food GST %', update_mode: 'App update', update_version: 'App update version',
  update_platforms: 'App update for', update_title: 'App update title', update_message: 'App update message', ios_store_url: 'App Store link',
  android_store_url: 'Play Store link', app_status: 'App status', app_status_title: 'App status title', app_status_message: 'App status message',
  app_count_from: 'App users counted from', tg_app_users: 'Telegram: new app users', rain_on: 'Rain notice', rain_message: 'Rain message',
  rain_place: 'Rain notice on',
  // owner settings (private_settings)
  daily_order_cap: 'Orders per evening (most)', rider_pay_near: 'Rider pay (near)', rider_pay_far: 'Rider pay (far)', rider_far_km: 'Near means up to (km)',
  packing_cost: 'Bag cost', auto_rider: 'Rider for new orders', rider_money_from: 'Rider money counted from',
}
const FIELD = {
  products: { name: 'Name', size: 'Size', price: 'Price', compare_price: 'MRP', available: 'In stock', status: 'Shown', category_id: 'Category',
    featured: 'Popular', featured_rank: 'Popular order', photo_url: 'Photo', photos: 'Photos', description: 'Description', food_addon: 'In restaurant menus', keywords: 'Search words' },
  food_menu_items: { section: 'Section', name: 'Name', description: 'Description', diet: 'Veg / non-veg', price: 'Price', variants: 'Sizes', photo: 'Photo', available: 'Available', bestseller: 'Bestseller' },
  food_restaurants: { status: 'Status', name: 'Name', deal_type: 'Deal', deal_value: 'Deal value', packing_fee: 'Packing charge', min_order: 'Minimum order',
    fssai_number: 'FSSAI number', fssai_expiry: 'FSSAI expiry', opens_at: 'Opens', closes_at: 'Closes', closed_on: 'Weekly off', offer: 'Offer',
    upi_id: 'UPI ID', phone: 'Phone', whatsapp: 'WhatsApp', cover_photo: 'Cover photo', prep_minutes: 'Cooking minutes', pay_when: 'Paid', notes: 'Notes' },
  food_coupons: { code: 'Code', title: 'Title', kind: 'Type', value: 'Value', max_off: 'Most off', min_order: 'Minimum order', active: 'On',
    starts_at: 'Starts', ends_at: 'Ends', total_uses: 'Uses in all', uses_per_customer: 'Uses per customer', first_order_only: 'First order only',
    show_in_app: 'Shown in the app', restaurant_id: 'Restaurant' },
  app_banners: { place: 'Home', image: 'Picture', title: 'Title', link: 'Opens', active: 'On', sort: 'Order', starts_at: 'Starts', ends_at: 'Ends' },
  orders: { status: 'Status', payment_status: 'Payment', payment_method: 'Payment way', rider_id: 'Rider', dispatch: 'On the way', delivery_date: 'Delivery day',
    cash_collected: 'Cash collected', express_waived: 'Express charge dropped', customer_name: 'Customer', customer_phone: 'Phone', address: 'Address', note: 'Note' },
  food_orders: { status: 'Status', rider_id: 'Rider', payment_method: 'Payment way' },
  support_tickets: { status: 'Status', priority: 'Priority', resolution: 'What was done', refund_amount: 'Refund', refund_how: 'Refund by' },
  complaints: { status: 'Status', admin_note: 'Note' },
  riders: { name: 'Name', phone: 'Phone', active: 'Login on', role: 'Role' },
  customers: { blocked: 'Blocked', no_show_count: 'No-shows', name: 'Name', phone: 'Phone' },
  wallet_gifts: { amount: 'Amount', min_order: 'Minimum order', expires_at: 'Expires', note: 'Note', cancelled_at: 'Taken back' },
  rider_returns: { amount: 'Amount', method: 'Way', day: 'Day', confirmed_at: 'Confirmed' },
}
const MONEY = /(^|_)(fee|fees|price|amount|total|reward|min_order|cod_limit|collected|waived|below|above|cost|max_off|pay_near|pay_far|max_per_order|refund_amount)$|^compare_price$|^min_order$/
const STATUS_WORD = { placed: 'New', confirmed: 'Confirmed', completed: 'Delivered', delivered: 'Delivered', cancelled: 'Cancelled', picked: 'Picked up',
  open: 'Needs reply', pending: 'Waiting for customer', resolved: 'Resolved', live: 'Live', ready: 'Ready', paused: 'Paused', dropped: 'Dropped',
  draft: 'Draft', active: 'Shown', hidden: 'Hidden', maintenance: 'Under maintenance', ok: 'Working' }
const PAY_WORD = { cash: 'Cash', upi: 'UPI on delivery', upi_now: 'UPI (paid first)', qr: 'UPI QR' }
const ROLE_WORD = { rider: 'Rider', executive: 'Executive', collector: 'Price collector' }
const AUDIENCE_WORD = { all: 'everyone with the app', android: 'Android phones', ios: 'iPhones', food: 'food customers', grocery: 'grocery customers',
  phones: 'chosen numbers', maintenance: 'people who opened the app during maintenance' }

const fieldName = (entity, k) => FIELD[entity]?.[k] ?? SETTING[k] ?? k.replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase())

function fmt(k, v, names) {
  if (v === null || v === undefined || v === '') return '—'
  if (['rider_id', 'auto_rider', 'refunded_by', 'confirmed_by', 'cancelled_by', 'delivered_by'].includes(k)) return names.people?.[v] ?? 'someone'
  if (k === 'category_id') return names.categories?.[v] ?? v
  if (k === 'restaurant_id') return names.restaurants?.[v] ?? 'a restaurant'
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (k === 'status') return STATUS_WORD[v] ?? v
  if (k === 'payment_method') return PAY_WORD[v] ?? v
  if (k === 'role') return ROLE_WORD[v] ?? v
  if (k === 'photo_url' || k === 'photo' || k === 'image' || k === 'cover_photo') return v ? 'a photo' : '—'
  if (typeof v === 'number' || (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v))) return MONEY.test(k) ? rupee(Number(v)) : String(v)
  if (Array.isArray(v)) {
    if (!v.length) return '—'
    return v.map((x) => (x && typeof x === 'object' ? (x.label ? `${x.label} ${rupee(Number(x.price) || 0)}` : JSON.stringify(x)) : String(x))).join(', ')
  }
  if (typeof v === 'object') return JSON.stringify(v)
  if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return when(v)
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return day(v)
  return v.length > 80 ? `${v.slice(0, 77)}…` : v
}

/**
 * A log line in words: the main sentence, more lines when one change touched several things, and where to open it.
 * names: { people, restaurants, categories } from activityList().
 */
export function describeActivity(a, names = {}) {
  const ch = a.changes ?? {}
  const keys = Object.keys(ch)
  const was = (k) => ch[k]?.[0]
  const now = (k) => ch[k]?.[1]
  const has = (k) => keys.includes(k)
  const line = (k) => `${fieldName(a.entity, k)}: ${fmt(k, was(k), names)} → ${fmt(k, now(k), names)}`
  const others = (...skip) => keys.filter((k) => !skip.includes(k)).map(line)
  const L = a.label || ''
  const [orderNo, itemName] = L.split(' · ')
  let text = ''
  let details = []
  let link = null

  switch (a.entity) {
    case 'orders': {
      link = a.entity_id ? `/admin/orders/${a.entity_id}` : null
      if (a.action === 'bulk_delete') {
        text = `Deleted ${ch.count} ${ch.count === 1 ? 'order' : 'orders'}${ch.first ? ` (${ch.first}${ch.last && ch.last !== ch.first ? ` to ${ch.last}` : ''})` : ''}, worth ${rupee(Number(ch.total) || 0)}`
        link = null
        break
      }
      if (a.action === 'insert') {
        text = `Placed order ${L} for ${ch.customer_name || 'a customer'} · ${rupee(Number(ch.total) || 0)}${ch.payment_method ? ` (${PAY_WORD[ch.payment_method] ?? ch.payment_method})` : ''}`
        break
      }
      const s = has('status') ? [was('status'), now('status')] : null
      let used = []
      if (s && s[1] === 'confirmed' && s[0] === 'placed') { text = `Confirmed order ${L}`; used = ['status'] }
      else if (s && s[1] === 'cancelled') { text = `Cancelled order ${L}${now('cancel_reason') ? `: ${now('cancel_reason')}` : ''}`; used = ['status', 'cancel_reason'] }
      else if (s && s[1] === 'completed') {
        const cash = has('cash_collected') && Number(now('cash_collected')) > 0
        text = `Delivered order ${L}${cash ? ` · took ${rupee(Number(now('cash_collected')))} cash` : ''}`
        used = ['status', 'cash_collected']
      }
      else if (s && s[0] === 'completed') { text = `Undid the delivery of ${L}`; used = ['status', 'cash_collected'] }
      else if (s && s[0] === 'cancelled') { text = `Brought back cancelled order ${L}`; used = ['status', 'cancel_reason'] }
      else if (has('refunded_amount')) {
        const how = ({ upi: 'UPI', cash: 'cash', wallet: 'Jholzo Money' })[now('refund_how') ?? ''] ?? 'UPI'
        text = `Gave back ${rupee(Number(now('refunded_amount')) - Number(was('refunded_amount') || 0))} for ${L} by ${how}${now('refund_note') ? ` · ${now('refund_note')}` : ''}`
        used = ['refunded_amount', 'refund_how', 'refund_note']
      }
      else if (has('payment_status') && now('payment_status') === 'paid') { text = `Marked ${L} paid`; used = ['payment_status'] }
      else if (has('payment_status') && now('payment_status') === 'failed') { text = `Marked the payment of ${L} as not received`; used = ['payment_status'] }
      else if (has('rider_id') && now('rider_id') && !was('rider_id')) { text = `Gave ${L} to ${fmt('rider_id', now('rider_id'), names)}`; used = ['rider_id'] }
      else if (has('rider_id') && !now('rider_id')) { text = `Took ${L} back from ${fmt('rider_id', was('rider_id'), names)}`; used = ['rider_id'] }
      else if (has('rider_id')) { text = `Moved ${L} from ${fmt('rider_id', was('rider_id'), names)} to ${fmt('rider_id', now('rider_id'), names)}`; used = ['rider_id'] }
      else if (has('dispatch')) { text = now('dispatch') === 'arriving' ? `${L} is arriving` : now('dispatch') ? `${L} is on the way` : `${L} is back at the store`; used = ['dispatch'] }
      else if (has('delivery_date')) { text = `Moved ${L} to ${fmt('delivery_date', now('delivery_date'), names)}`; used = ['delivery_date'] }
      else if (has('express_waived')) { text = `${L} left late: express charge of ${rupee(Number(now('express_waived')) || 0)} not taken`; used = ['express_waived'] }
      else text = `Changed order ${L}`
      details = others(...used)
      break
    }
    case 'order_removed_items':
      text = `Took ${itemName || 'an item'}${ch.quantity > 1 ? ` ×${ch.quantity}` : ''} off ${orderNo}${ch.line_total ? ` (${rupee(Number(ch.line_total))})` : ''}`
      if (ch.reason) details = [`Why: ${ch.reason}`]
      break
    case 'food_orders': {
      link = a.entity_id ? `/admin/food/orders/${a.entity_id}` : null
      if (a.action === 'bulk_delete') {
        text = `Deleted ${ch.count} food ${ch.count === 1 ? 'order' : 'orders'}${ch.first ? ` (${ch.first}${ch.last && ch.last !== ch.first ? ` to ${ch.last}` : ''})` : ''}, worth ${rupee(Number(ch.total) || 0)}`
        link = null
        break
      }
      if (a.action === 'insert') { text = `Placed food order ${L} at ${ch.restaurant_name || 'a restaurant'} · ${rupee(Number(ch.total) || 0)}`; break }
      const s = has('status') ? now('status') : ''
      let used = ['status']
      if (s === 'confirmed') text = `Restaurant has food order ${L} (confirmed)`
      else if (s === 'picked') text = `Picked up food order ${L}`
      else if (s === 'delivered') text = `Delivered food order ${L}`
      else if (s === 'cancelled') { text = `Cancelled food order ${L}${now('cancel_reason') ? `: ${now('cancel_reason')}` : ''}`; used = ['status', 'cancel_reason'] }
      // Update 073: riders take new food orders themselves, and can give one back before the restaurant has it.
      else if (has('rider_id') && now('rider_id') && now('rider_id') === a.actor_id) { text = `Took food order ${L}`; used = ['rider_id'] }
      else if (has('rider_id') && !now('rider_id') && was('rider_id') === a.actor_id) { text = `Gave back food order ${L} (it rang the others again)`; used = ['rider_id'] }
      else if (has('rider_id') && now('rider_id')) { text = `Gave food order ${L} to ${fmt('rider_id', now('rider_id'), names)}`; used = ['rider_id'] }
      else if (has('rider_id')) { text = `Took food order ${L} back from ${fmt('rider_id', was('rider_id'), names)}`; used = ['rider_id'] }
      else { text = `Changed food order ${L}`; used = [] }
      details = others(...used)
      break
    }
    case 'products':
      link = '/admin/products'
      if (a.action === 'insert') { text = `Added product ${L} · ${rupee(Number(ch.price) || 0)}`; break }
      if (a.action === 'delete') { text = `Deleted product ${L}`; break }
      if (keys.length === 1 && has('price')) text = `${L}: price ${rupee(Number(was('price')))} → ${rupee(Number(now('price')))}`
      else if (keys.length === 1 && has('available')) text = now('available') ? `${L} is back in stock` : `${L} is out of stock`
      else if (keys.length === 1 && has('food_addon')) text = now('food_addon') ? `${L} added to every restaurant's menu` : `${L} taken off the restaurant menus`
      else { text = `Changed product ${L}`; details = others() }
      break
    case 'categories':
      text = a.action === 'insert' ? `Added category ${L}` : a.action === 'delete' ? `Deleted category ${L}` : `Changed category ${L}`
      if (a.action === 'update') details = others()
      break
    case 'food_restaurants':
      link = '/admin/food/restaurants'
      if (a.action === 'insert') text = `Added restaurant ${L}`
      else if (a.action === 'delete') text = `Removed restaurant ${L}`
      else if (has('status') && keys.length === 1) text = `${L} is now ${fmt('status', now('status'), names)} (was ${fmt('status', was('status'), names)})`
      else { text = `Changed restaurant ${L}`; details = others() }
      break
    case 'food_menu_items': {
      link = '/admin/food/restaurants'
      const [rest, dish] = L.split(' · ')
      if (a.action === 'insert') text = `Added ${dish || 'a dish'} to ${rest || 'a menu'}${ch.price ? ` · ${rupee(Number(ch.price))}` : ''}`
      else if (a.action === 'delete') text = `Removed ${dish || 'a dish'} from ${rest || 'a menu'}`
      else if (keys.length === 1 && has('price')) text = `${dish} (${rest}): price ${rupee(Number(was('price')))} → ${rupee(Number(now('price')))}`
      else if (keys.length === 1 && has('available')) text = now('available') ? `${dish} (${rest}) is available again` : `${dish} (${rest}) is sold out`
      else { text = `Changed ${dish || 'a dish'} (${rest})`; details = others() }
      break
    }
    case 'customers':
      link = a.entity_id ? `/admin/customers/${a.entity_id}` : null
      if (has('blocked')) text = now('blocked') ? `Blocked ${L}` : `Unblocked ${L}`
      else if (has('no_show_count') && Number(now('no_show_count')) === 0) text = `Cleared the no-shows of ${L}`
      else if (has('no_show_count')) text = `No-show marked for ${L} (now ${now('no_show_count')})`
      else text = `Changed customer ${L}`
      details = others('blocked', ...(text.includes('no-show') ? ['no_show_count'] : []))
      break
    case 'complaints':
      link = '/admin/complaints'
      text = has('status') && now('status') === 'resolved' ? `Resolved the website complaint on ${L}` : `Updated the website complaint on ${L}`
      details = others('status')
      break
    case 'support_tickets':
      link = a.entity_id ? `/admin/support/${a.entity_id}` : null
      if (has('status') && now('status') === 'resolved') text = `Resolved help request ${L}${Number(now('refund_amount')) > 0 ? ` with a refund of ${rupee(Number(now('refund_amount')))}` : ''}`
      else if (has('status')) text = `Help request ${L}: ${fmt('status', was('status'), names)} → ${fmt('status', now('status'), names)}`
      else if (has('priority')) text = `Help request ${L}: priority ${was('priority')} → ${now('priority')}`
      else text = `Updated help request ${L}`
      details = others('status', ...(text.includes('priority') ? ['priority'] : []), ...(text.includes('refund') ? ['refund_amount'] : []))
      break
    case 'wallet_entries': {
      const n = Number(ch.amount) || 0
      text = n >= 0 ? `Added ${rupee(n)} Jholzo Money to ${L}` : `Took back ${rupee(-n)} Jholzo Money from ${L}`
      if (ch.note) details = [`Reason: ${ch.note}`]
      link = '/admin/money'
      break
    }
    case 'wallet_gifts':
      link = '/admin/money'
      if (a.action === 'insert') {
        text = `Gave ${rupee(Number(ch.amount) || 0)} gift money to ${L}`
        details = [ch.min_order ? `On orders of ${rupee(Number(ch.min_order))} or more` : '', ch.expires_at ? `Until ${fmt('expires_at', ch.expires_at, names)}` : '', ch.note ? `Note: ${ch.note}` : ''].filter(Boolean)
      } else if (has('cancelled_at') && now('cancelled_at')) text = `Took back the gift money of ${L}`
      else { text = `Changed the gift money of ${L}`; details = others() }
      break
    case 'food_payouts':
      link = '/admin/food/payouts'
      text = a.action === 'delete' ? `Deleted a payout record of ${L}` : `Paid ${rupee(Number(ch.amount) || 0)} to ${L}`
      if (ch.note && a.action !== 'delete') details = [`Note: ${ch.note}`]
      break
    case 'rider_returns': {
      const [rider, d] = L.split(' · ')
      if (a.action === 'insert') text = `${rider} handed over ${rupee(Number(ch.amount) || 0)}${ch.method ? ` (${ch.method})` : ''}${d ? ` for ${fmt('day', d, names)}` : ''}`
      else if (has('confirmed_at') && now('confirmed_at')) text = `Confirmed the money from ${rider}${d ? ` for ${fmt('day', d, names)}` : ''}`
      else { text = `Changed the money handed over by ${rider}`; details = others() }
      break
    }
    case 'food_coupons':
      link = '/admin/food/coupons'
      if (a.action === 'insert') text = `Made coupon ${L}`
      else if (a.action === 'delete') text = `Deleted coupon ${L}`
      else if (keys.length === 1 && has('active')) text = now('active') ? `Switched on coupon ${L}` : `Switched off coupon ${L}`
      else { text = `Changed coupon ${L}`; details = others() }
      if (a.action === 'insert') details = [ch.title ? `“${ch.title}”` : '', ch.kind === 'percent' ? `${ch.value}% off${ch.max_off ? `, up to ${rupee(Number(ch.max_off))}` : ''}` : ch.value ? `${rupee(Number(ch.value))} off` : '', ch.min_order ? `On ${rupee(Number(ch.min_order))} or more` : ''].filter(Boolean)
      break
    case 'store_settings':
    case 'private_settings': {
      link = a.entity === 'private_settings' ? '/admin/settings' : null
      const one = keys.length === 1 ? keys[0] : null
      if (one === 'paused') text = now('paused') ? 'Paused the store (no orders)' : 'Opened the store again'
      else if (one === 'food_on') text = now('food_on') ? 'Switched Food on' : 'Switched Food off'
      else if (one === 'rain_on') text = now('rain_on') ? 'Switched the rain notice on' : 'Switched the rain notice off'
      else if (has('app_status') && now('app_status') === 'maintenance') text = 'Put the app under maintenance'
      else if (has('app_status') && was('app_status') === 'maintenance') text = 'Brought the app back from maintenance'
      else if (one) text = line(one)
      else text = `Changed ${keys.length} settings`
      details = one ? [] : others()
      if (has('app_status') && keys.length > 1) details = others('app_status')
      break
    }
    case 'app_banners':
      link = '/admin/app/banners'
      if (a.action === 'insert') text = `Added a ${ch.place ?? ''} banner${ch.title ? `: ${ch.title}` : ''}`.replace('a  banner', 'a banner')
      else if (a.action === 'delete') text = `Deleted the banner ${L}`
      else if (keys.length === 1 && has('active')) text = now('active') ? `Switched on the banner ${L}` : `Switched off the banner ${L}`
      else { text = `Changed the banner ${L}`; details = others() }
      break
    case 'push_campaigns':
      link = '/admin/app/notifications'
      text = `Sent the notification “${L}” to ${AUDIENCE_WORD[ch.audience] ?? ch.audience ?? 'customers'}`
      if (ch.body) details = [ch.body]
      break
    case 'riders':
      link = '/admin/settings'
      if (a.action === 'insert') text = `Added ${L} to the team as ${ROLE_WORD[ch.role] ?? 'Rider'}`
      else if (a.action === 'delete') text = `Removed ${L} from the team`
      else if (keys.length === 1 && has('active')) text = now('active') ? `Switched on ${L}'s login` : `Switched off ${L}'s login`
      else if (keys.length === 1 && has('role')) text = `${L} is now ${fmt('role', now('role'), names)} (was ${fmt('role', was('role'), names)})`
      else { text = `Changed team member ${L}`; details = others() }
      break
    case 'admins':
      text = a.action === 'insert' ? 'Added an owner login' : 'Removed an owner login'
      break
    default:
      text = `${a.action === 'insert' ? 'Added' : a.action === 'delete' ? 'Deleted' : 'Changed'} ${a.entity.replaceAll('_', ' ')} ${L}`.trim()
      details = a.action === 'update' ? others() : []
  }
  return { text, details: details.filter(Boolean), link }
}

/**
 * Many lines in a row that are one job (a whole menu typed in, a price list uploaded): one group, with the lines
 * inside. Input newest first; output items are { row } or { group: [rows], text }.
 */
export function groupActivity(rows, names = {}) {
  const out = []
  const sameJob = (a, b) => a.actor_id === b.actor_id && a.entity === b.entity && a.action === b.action && a.action !== 'update'
    && ['products', 'food_menu_items'].includes(a.entity)
    && (a.entity !== 'food_menu_items' || a.label.split(' · ')[0] === b.label.split(' · ')[0])
    && Math.abs(new Date(a.at) - new Date(b.at)) < 15 * 60_000
  for (const r of rows) {
    const prev = out.at(-1)
    const head = prev?.group ? prev.group[0] : prev?.row
    if (head && sameJob(head, r)) {
      if (prev.group) prev.group.push(r)
      else out[out.length - 1] = { group: [prev.row, r] }
    } else out.push({ row: r })
  }
  return out.map((item) => {
    if (!item.group || item.group.length < 3) return item.group ? item.group.map((row) => ({ row })) : [item]
    const g = item.group
    const n = g.length
    const verb = g[0].action === 'insert' ? 'Added' : 'Deleted'
    const text = g[0].entity === 'products'
      ? `${verb} ${n} products`
      : `${verb} ${n} dishes ${g[0].action === 'insert' ? 'to' : 'from'} ${g[0].label.split(' · ')[0] || 'a menu'}`
    return [{ group: g, text, link: describeActivity(g[0], names).link }]
  }).flat()
}

/* ---------- demo ---------- */

const ago = (min) => new Date(Date.now() - min * 60_000).toISOString()
const DEMO_PEOPLE = { o1: 'Owner', e1: 'Mamoni', r1: 'Bikash', r2: 'Dipankar' }
let demoId = 100
const d = (min, actor, role, area, entity, label, action, changes, entityId = '') => ({
  id: demoId--, at: ago(min), actor_id: actor, actor_role: role, actor_name: DEMO_PEOPLE[actor], area, entity, entity_id: entityId, label, action, changes,
})
const DEMO_ROWS = [
  d(4, 'e1', 'executive', 'orders', 'orders', 'DG-1042', 'update', { status: ['placed', 'confirmed'] }),
  d(9, 'r1', 'rider', 'orders', 'orders', 'DG-1039', 'update', { status: ['confirmed', 'completed'], cash_collected: [0, 412] }),
  d(15, 'o1', 'owner', 'catalog', 'products', 'Aashirvaad Atta 5 kg', 'update', { price: [260, 270] }),
  d(22, 'e1', 'executive', 'orders', 'order_removed_items', 'DG-1041 · Amul Butter 100 g', 'insert', { name_snapshot: 'Amul Butter 100 g', quantity: 1, line_total: 58 }),
  d(23, 'e1', 'executive', 'orders', 'orders', 'DG-1041', 'update', { rider_id: [null, 'r2'] }),
  d(40, 'o1', 'owner', 'orders', 'orders', 'DG-1036', 'update', { refunded_amount: [0, 340], refund_how: ['', 'upi'], refund_note: ['', 'PhonePe 5521'] }),
  d(55, 'o1', 'owner', 'money', 'wallet_entries', 'Asha Devi · 9000000111', 'insert', { amount: 50, note: 'Sorry for the late delivery' }),
  d(70, 'o1', 'owner', 'settings', 'store_settings', 'Settings', 'update', { rain_on: [false, true] }),
  d(95, 'o1', 'owner', 'settings', 'push_campaigns', 'Fresh vegetables are in', 'insert', { title: 'Fresh vegetables are in', body: 'Order before 6 pm for delivery today.', audience: 'all' }),
  ...['Veg Chowmein', 'Chicken Chowmein', 'Egg Roll', 'Chicken Roll', 'Veg Momo (8 pcs)'].map((dish, i) =>
    d(130 + i, 'o1', 'owner', 'catalog', 'food_menu_items', `Food delight · ${dish}`, 'insert', { section: 'Chinese', name: dish, price: 60 + i * 20 })),
  d(160, 'e1', 'executive', 'customers', 'customers', 'Ravi Das · 9000000112', 'update', { blocked: [false, true] }),
  d(190, 'r1', 'rider', 'money', 'rider_returns', 'Bikash · 2026-11-26', 'insert', { amount: 1840, method: 'cash', day: '2026-11-26' }),
  d(240, 'o1', 'owner', 'money', 'food_payouts', 'Food delight', 'insert', { amount: 2350, note: 'UPI' }),
  d(300, 'o1', 'owner', 'settings', 'app_banners', 'Diwali offer', 'insert', { place: 'grocery', title: 'Diwali offer', active: true }),
  d(1500, 'o1', 'owner', 'settings', 'store_settings', 'Settings', 'update', { min_order: [99, 149], free_delivery_above: [499, 599] }),
  d(1560, 'o1', 'owner', 'team', 'riders', 'Dipankar', 'insert', { name: 'Dipankar', phone: '9000000077', role: 'rider', active: true }),
  d(1600, 'e1', 'executive', 'orders', 'orders', 'DG-1020', 'update', { status: ['confirmed', 'cancelled'], cancel_reason: ['', 'Customer not reachable'] }),
]

function demoList({ before, actor, area, q, limit }) {
  const rows = DEMO_ROWS
    .filter((r) => (before == null || r.id < before) && (!actor || r.actor_id === actor) && (!area || r.area === area)
      && (!q.trim() || r.label.toLowerCase().includes(q.trim().toLowerCase())))
    .slice(0, limit)
  const team = Object.entries(DEMO_PEOPLE).map(([id, name]) => {
    const mine = DEMO_ROWS.filter((r) => r.actor_id === id)
    return { id, name, role: mine[0]?.actor_role ?? 'rider', n: mine.length }
  }).filter((t) => t.n)
  return structuredClone({ rows, people: DEMO_PEOPLE, restaurants: {}, categories: {}, team })
}
