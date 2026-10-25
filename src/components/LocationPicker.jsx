import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const pinIcon = L.divIcon({ className: '', html: '<div class="dh-pin"></div>', iconSize: [32, 42], iconAnchor: [16, 40] })

// Free OpenStreetMap map with a pin. Drag the pin or tap the map to move it.
// value: { lat, lng } or null; start: where the pin sits before a value is chosen;
// home: optional point drawn as a small dot (the store).
export default function LocationPicker({ value, onChange, start, home, className = 'h-56' }) {
  const box = useRef(null)
  const map = useRef(null)
  const pin = useRef(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    const first = value ?? start
    const m = L.map(box.current, { attributionControl: true }).setView([first.lat, first.lng], value ? 16 : 14)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(m)
    if (home) {
      L.circleMarker([home.lat, home.lng], { radius: 7, color: '#0B0B0B', weight: 2, fillColor: '#E8FF3A', fillOpacity: 1 })
        .addTo(m)
        .bindTooltip('Dergaon Hub')
    }
    const p = L.marker([first.lat, first.lng], { draggable: true, icon: pinIcon }).addTo(m)
    const report = (ll) => onChangeRef.current({ lat: ll.lat, lng: ll.lng })
    p.on('dragend', () => report(p.getLatLng()))
    m.on('click', (e) => {
      p.setLatLng(e.latlng)
      report(e.latlng)
    })
    map.current = m
    pin.current = p
    return () => m.remove()
    // The map is created once; later value changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A new value from outside (for example "use my location") moves the pin and the map.
  useEffect(() => {
    if (!value || !pin.current) return
    const cur = pin.current.getLatLng()
    if (Math.abs(cur.lat - value.lat) > 1e-7 || Math.abs(cur.lng - value.lng) > 1e-7) {
      pin.current.setLatLng([value.lat, value.lng])
      map.current.setView([value.lat, value.lng], Math.max(map.current.getZoom(), 16))
    }
  }, [value])

  return <div ref={box} className={`isolate z-0 w-full overflow-hidden rounded-xl ${className}`} />
}
