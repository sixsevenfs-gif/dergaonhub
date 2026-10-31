import { CONFIG } from '../config.js'
import { rupee, toMinutes } from './format.js'

// Straight-line distance between two { lat, lng } points, in km.
export function straightKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

// Roads are not straight, so the road distance is guessed as straight line × ROAD_FACTOR.
export const roadKm = (a, b) => Math.round(straightKm(a, b) * CONFIG.ROAD_FACTOR * 10) / 10

// Delivery rules from Admin → Settings, with defaults for a store from before update 018.
export function deliveryRules(store) {
  const n = (v, d) => (v === undefined || v === null || v === '' ? d : Number(v) || 0)
  return {
    smallBelow: n(store?.small_order_below, 99), smallFee: n(store?.small_order_fee, 40),
    midFee: n(store?.mid_order_fee, 11), freeAbove: n(store?.free_delivery_above, 299),
    expressOn: !!store?.express_on, expressFee: n(store?.express_fee, 40), expressMinutes: n(store?.express_minutes, 60),
  }
}

// Evening (5–8 PM) delivery charge by items total: ₹40 below ₹99, ₹11 up to ₹298, FREE from ₹299.
// "Free delivery (launch offer)" makes the ₹11 slab free too; small orders always pay.
// Same rule as evening_delivery_fee() in the database.
export function eveningFee(store, subtotal) {
  const r = deliveryRules(store)
  if (subtotal < r.smallBelow) return r.smallFee
  if (store.free_delivery || subtotal >= r.freeAbove) return 0
  return r.midFee
}

// Delivery to the customer's pin. Distance only decides whether we deliver (max_delivery_km);
// the charge comes from the items total (subtotal), plus the Express charge when chosen.
// next: { addMore, save } tells the customer how much more to add to pay less for delivery.
// manual: the address was typed by hand (map not working), so there is no distance (km is null).
export function deliveryQuote(store, point, subtotal = null, express = false, { manual = false } = {}) {
  if (!point && !manual) return null
  const km = point ? roadKm(store.location, point) : null
  if (km != null && km > store.max_delivery_km) return { km, fee: null, tooFar: true }
  if (subtotal == null) return { km, fee: null, tooFar: false }
  const r = deliveryRules(store)
  const evening = eveningFee(store, subtotal)
  const fullFee = subtotal < r.smallBelow ? r.smallFee : subtotal < r.freeAbove ? r.midFee : 0
  const expressFee = express ? r.expressFee : 0
  const next = subtotal < r.smallBelow
    ? { addMore: r.smallBelow - subtotal, save: evening - eveningFee(store, r.smallBelow) }
    : evening > 0 ? { addMore: r.freeAbove - subtotal, save: evening } : null
  return { km, fee: evening + expressFee, eveningFee: evening, expressFee, fullFee, free: evening === 0, tooFar: false, next }
}

// "1 hour", "2 hours" or "45 min" for the Express promise.
export const expressTimeText = (minutes) =>
  minutes % 60 === 0 ? `${minutes / 60} hour${minutes === 60 ? '' : 's'}` : `${minutes} min`

// Express can be chosen while it is switched on, from opening time until express_minutes before closing.
export function expressStatus(store, now = new Date()) {
  const r = deliveryRules(store)
  if (!r.expressOn || store.paused) return { ok: false, off: true }
  const mins = now.getHours() * 60 + now.getMinutes()
  const last = toMinutes(store.close_time) - r.expressMinutes
  const lastTime = `${String(Math.floor(last / 60)).padStart(2, '0')}:${String(last % 60).padStart(2, '0')}`
  if (mins < toMinutes(store.open_time) || mins > last) return { ok: false, off: false, from: store.open_time, until: lastTime }
  return { ok: true, minutes: r.expressMinutes }
}

// Packaging charge by order value (items only): below pack_mid_from, up to pack_high_from, and above.
export function packagingFee(store, subtotal) {
  if (subtotal >= store.pack_high_from) return store.pack_fee_high
  if (subtotal >= store.pack_mid_from) return store.pack_fee_mid
  return store.pack_fee_low
}

export const feeRuleText = (store) => {
  const r = deliveryRules(store)
  return `Evening: ${rupee(r.smallFee)} below ${rupee(r.smallBelow)}, ${rupee(r.midFee)} up to ${rupee(r.freeAbove - 1)}, FREE from ${rupee(r.freeAbove)} · up to ${store.max_delivery_km} km`
}

export const mapsLink = (p) => `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`

export const validPoint = (p) =>
  !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180

// Browser location. Resolves to { lat, lng } or rejects with a message for the customer.
export function currentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Location is not available on this phone/browser. Please place the pin on the map.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) =>
        reject(
          Object.assign(
            new Error(
              err.code === 1
                ? 'Location permission was not given. Drag the pin to your home on the map.'
                : 'Could not get your location. Drag the pin to your home on the map.',
            ),
            { denied: err.code === 1 },
          ),
        ),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  })
}
