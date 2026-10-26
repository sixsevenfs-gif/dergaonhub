import { CONFIG } from '../config.js'
import { rupee } from './format.js'

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

// Delivery fee from the store (founder's home) to the customer's pin:
// every started km costs per_km_fee, never less than min_delivery_fee.
// With free delivery on (launch offer) the fee is 0; fullFee is what it would have been.
// With the items total (subtotal): below small_order_below (₹149) delivery is a flat small_order_fee (₹40),
// or the distance fee if that is higher, and free delivery does not apply. small: { addMore, save } tells
// the customer how much more to add and what they would save. Same rule as place_order() in the database.
export function deliveryQuote(store, point, subtotal = null) {
  if (!point) return null
  const km = roadKm(store.location, point)
  if (km > store.max_delivery_km) return { km, fee: null, tooFar: true }
  const fullFee = Math.max(store.min_delivery_fee, Math.ceil(km) * store.per_km_fee)
  const normalFee = store.free_delivery ? 0 : fullFee
  const below = Number(store.small_order_below) || 0
  if (subtotal != null && subtotal < below) {
    const fee = Math.max(Number(store.small_order_fee) || 0, fullFee)
    return { km, fee, fullFee, free: false, tooFar: false, small: { addMore: below - subtotal, save: fee - normalFee } }
  }
  return { km, fee: normalFee, fullFee, free: !!store.free_delivery, tooFar: false, small: null }
}

// Packaging charge by order value (items only): below pack_mid_from, up to pack_high_from, and above.
export function packagingFee(store, subtotal) {
  if (subtotal >= store.pack_high_from) return store.pack_fee_high
  if (subtotal >= store.pack_mid_from) return store.pack_fee_mid
  return store.pack_fee_low
}

export const feeRuleText = (store) =>
  `${rupee(store.per_km_fee)} per km (minimum ${rupee(store.min_delivery_fee)}), up to ${store.max_delivery_km} km`

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
