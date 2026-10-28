import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Navigation } from 'lucide-react'
import { mapsLink } from '../lib/delivery.js'

const pinIcon = L.divIcon({ className: '', html: '<div class="dh-pin"></div>', iconSize: [32, 42], iconAnchor: [16, 40] })

// Small still map of the customer's pin (and the store). Tapping it opens Google Maps directions.
export default function MapPreview({ point, home, className = 'h-36' }) {
  const box = useRef(null)

  useEffect(() => {
    const m = L.map(box.current, {
      zoomControl: false, attributionControl: true, dragging: false, scrollWheelZoom: false,
      doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false, tap: false,
    }).setView([point.lat, point.lng], 16)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m)
    if (home) L.circleMarker([home.lat, home.lng], { radius: 6, color: '#FFFFFF', weight: 2, fillColor: '#1F6B3A', fillOpacity: 1 }).addTo(m)
    L.marker([point.lat, point.lng], { icon: pinIcon, interactive: false }).addTo(m)
    return () => m.remove()
    // Only the coordinates matter; a new object with the same place must not redraw the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [point.lat, point.lng, home?.lat, home?.lng])

  return (
    <a href={mapsLink(point)} target="_blank" rel="noreferrer" className={`relative block overflow-hidden rounded-xl border border-line ${className}`}>
      <div ref={box} className="pointer-events-none isolate z-0 h-full w-full" />
      <span className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-brand shadow">
        <Navigation size={13} /> Directions
      </span>
    </a>
  )
}
