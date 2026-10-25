// The customer's delivery details, remembered on this phone: map pin + place name,
// and the name/address/area typed at checkout. Header, My account and checkout share them.
import { useEffect, useState } from 'react'
import { validPoint } from './delivery.js'

const LOCATION_KEY = 'dergaonhub-location'
const DETAILS_KEY = 'dergaonhub-checkout'
const RECEIVER_KEY = 'dergaonhub-receiver'
const EVENT = 'dergaonhub-location-change'

function read(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback
  } catch {
    return fallback
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage blocked: details are asked again next time
  }
  window.dispatchEvent(new Event(EVENT))
}

// { lat, lng, label } or null
export function getSavedLocation() {
  const loc = read(LOCATION_KEY, null)
  return validPoint(loc) ? loc : null
}

export const saveLocation = (point, label = '') => write(LOCATION_KEY, { lat: point.lat, lng: point.lng, label })

// { name, phone, address, area }
export const getSavedDetails = () => read(DETAILS_KEY, {})
export const saveDetails = (details) => write(DETAILS_KEY, { ...getSavedDetails(), ...details })

// "Order for someone else": the last receiver { name, phone, address, area, location }, so ordering
// for the same family member again is quick. Kept apart from the customer's own address.
export const getSavedReceiver = () => read(RECEIVER_KEY, {})
export const saveReceiver = (receiver) => write(RECEIVER_KEY, receiver)

// Re-renders when the saved location or details change (also from other tabs).
export function useSavedDelivery() {
  const [state, setState] = useState(() => ({ location: getSavedLocation(), details: getSavedDetails() }))
  useEffect(() => {
    const update = () => setState({ location: getSavedLocation(), details: getSavedDetails() })
    window.addEventListener(EVENT, update)
    window.addEventListener('storage', update)
    return () => {
      window.removeEventListener(EVENT, update)
      window.removeEventListener('storage', update)
    }
  }, [])
  return state
}

// Place name for a pin, from OpenStreetMap's free service (Nominatim). Empty string if it fails.
const cache = new Map()
export async function placeName(p) {
  const key = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`
  if (cache.has(key)) return cache.get(key)
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&accept-language=en&lat=${p.lat}&lon=${p.lng}`)
    const a = (await res.json()).address ?? {}
    const local = a.neighbourhood || a.suburb || a.quarter || a.hamlet || a.village || a.road || ''
    const town = a.town || a.city || a.village || a.county || ''
    const label = [local, town].filter((x, i, all) => x && all.indexOf(x) === i).join(', ')
    cache.set(key, label)
    return label
  } catch {
    return ''
  }
}
