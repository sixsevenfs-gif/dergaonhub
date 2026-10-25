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
export function deliveryQuote(store, point) {
  if (!point) return null
  const km = roadKm(store.location, point)
  if (km > store.max_delivery_km) return { km, fee: null, tooFar: true }
  return { km, fee: Math.max(store.min_delivery_fee, Math.ceil(km) * store.per_km_fee), tooFar: false }
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
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) =>
        reject(
          new Error(
            err.code === 1
              ? 'Location permission was not given. Drag the pin to your home on the map.'
              : 'Could not get your location. Drag the pin to your home on the map.',
          ),
        ),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  })
}
