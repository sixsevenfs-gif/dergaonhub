import { CONFIG } from '../config.js'

// Buildings mapped on OpenStreetMap inside the delivery circle (Overpass API, free).
// Many village houses are not mapped yet, so the real number of homes is higher.
// Results are remembered on this phone for each centre and distance.
const KEY = 'jholzo-house-count'

const cacheKey = (lat, lng, km) => `${lat.toFixed(4)},${lng.toFixed(4)},${km}`

export function savedHouseCount(lat, lng, km) {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}')[cacheKey(lat, lng, km)] ?? null
  } catch {
    return null
  }
}

export async function countHouses(lat, lng, km) {
  const radius = Math.round((km / CONFIG.ROAD_FACTOR) * 1000) // road km → straight-line metres, like the map circle
  const query = `[out:json][timeout:50];(way["building"](around:${radius},${lat},${lng});relation["building"](around:${radius},${lat},${lng}););out count;`
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: `data=${encodeURIComponent(query)}`,
  })
  if (!res.ok) throw new Error('The map service is busy. Try again in a minute.')
  const json = await res.json()
  const total = Number(json.elements?.[0]?.tags?.total ?? 0)
  const result = { total, at: new Date().toISOString() }
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    all[cacheKey(lat, lng, km)] = result
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    // storage blocked: the number is still shown
  }
  return result
}
