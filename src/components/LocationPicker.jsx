import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { CONFIG } from '../config.js'

const pinIcon = L.divIcon({ className: '', html: '<div class="dh-pin"></div>', iconSize: [32, 42], iconAnchor: [16, 40] })

// Points closer than this (about 1 m) count as the same place.
const same = (a, b) => Math.abs(a.lat - b.lat) < 1e-5 && Math.abs(a.lng - b.lng) < 1e-5

// Free OpenStreetMap map with a pin. Drag the pin or tap the map to move it.
// value: { lat, lng } or null; start: where the pin sits before a value is chosen;
// home: optional point drawn as a small dot (the store).
// fixedPin: the pin stays in the middle and the customer moves the map under it (like Swiggy).
// here: the phone's own position { lat, lng, accuracy }, drawn as a blue dot.
// focus: changes when the map must fly to value again, even if value did not change.
// radiusKm: draws the delivery area around the pin as a radar circle (road km, so the circle is radiusKm / ROAD_FACTOR).
export default function LocationPicker({ value, onChange, start, home, here, focus, radiusKm, fixedPin = false, className = 'h-56' }) {
  const box = useRef(null)
  const map = useRef(null)
  const pin = useRef(null)
  const hereLayer = useRef(null)
  const radiusLayer = useRef(null)
  const radiusEdge = useRef(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const valueRef = useRef(value)
  valueRef.current = value
  const [moving, setMoving] = useState(false)

  useEffect(() => {
    const first = value ?? start
    const m = L.map(box.current, { attributionControl: true, zoomControl: !fixedPin }).setView([first.lat, first.lng], value ? 17 : 15)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(m)
    if (home) {
      L.circleMarker([home.lat, home.lng], { radius: 7, color: '#FFFFFF', weight: 2, fillColor: '#1F6B3A', fillOpacity: 1 })
        .addTo(m)
        .bindTooltip('Jholzo')
    }
    const report = (ll) => onChangeRef.current({ lat: ll.lat, lng: ll.lng })
    if (fixedPin) {
      // Only a move by the customer (or after a place is chosen) picks a new place:
      // resizing the map also "moves" it, and must not choose the store's spot by itself.
      let touched = false
      m.on('dragstart', () => (touched = true))
      m.on('movestart', () => setMoving(true))
      m.on('moveend', () => {
        setMoving(false)
        const c = m.getCenter()
        const cur = valueRef.current
        if ((touched || cur) && !(cur && same(cur, c))) report(c)
      })
      m.on('click', (e) => {
        touched = true
        m.panTo(e.latlng)
      })
    } else {
      const p = L.marker([first.lat, first.lng], { draggable: true, icon: pinIcon }).addTo(m)
      p.on('dragend', () => report(p.getLatLng()))
      m.on('click', (e) => {
        p.setLatLng(e.latlng)
        report(e.latlng)
      })
      pin.current = p
    }
    // The sheet can change size after the map is drawn (phone keyboard, rotation).
    const resize = new ResizeObserver(() => m.invalidateSize())
    resize.observe(box.current)
    map.current = m
    return () => {
      resize.disconnect()
      m.remove()
    }
    // The map is created once; later value changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A new value from outside (for example "use my location") moves the pin and the map.
  // With a new focus the map always flies there and zooms in, even if the pin is already close.
  const lastFocus = useRef(focus)
  useEffect(() => {
    if (!value || !map.current) return
    if (focus !== lastFocus.current) {
      lastFocus.current = focus
      pin.current?.setLatLng([value.lat, value.lng])
      map.current.flyTo([value.lat, value.lng], 17, { duration: 0.8 })
      return
    }
    const at = fixedPin ? map.current.getCenter() : pin.current.getLatLng()
    if (!same(at, value)) {
      pin.current?.setLatLng([value.lat, value.lng])
      map.current.setView([value.lat, value.lng], Math.max(map.current.getZoom(), 16))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, focus])

  // Blue dot (and a faint accuracy circle) where the phone is.
  useEffect(() => {
    hereLayer.current?.remove()
    hereLayer.current = null
    if (!here || !map.current) return
    hereLayer.current = L.layerGroup([
      L.circle([here.lat, here.lng], { radius: Math.min(here.accuracy || 0, 300), stroke: false, fillColor: '#2F80ED', fillOpacity: 0.12, interactive: false }),
      L.circleMarker([here.lat, here.lng], { radius: 7, color: '#fff', weight: 3, fillColor: '#2F80ED', fillOpacity: 1, interactive: false }),
    ]).addTo(map.current)
  }, [here])

  // Delivery area: a filled circle with rings, like a radar, centred on the pin.
  const centre = value ?? start
  useEffect(() => {
    radiusLayer.current?.remove()
    radiusLayer.current = null
    radiusEdge.current = null
    if (!(Number(radiusKm) > 0) || !map.current || !centre) return
    const r = (Number(radiusKm) / CONFIG.ROAD_FACTOR) * 1000
    const at = [centre.lat, centre.lng]
    const edge = L.circle(at, { radius: r, color: '#1F6B3A', weight: 2, dashArray: '8 6', fillColor: '#5FA63F', fillOpacity: 0.14, interactive: false })
    const rings = [1 / 3, 2 / 3].map((f) => L.circle(at, { radius: r * f, color: '#1F6B3A', weight: 1, opacity: 0.35, fill: false, interactive: false }))
    radiusLayer.current = L.layerGroup([edge, ...rings]).addTo(map.current)
    radiusEdge.current = edge
    // Redrawn only when the distance or the centre point really moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radiusKm, centre?.lat, centre?.lng])

  // Show the whole circle when the distance changes (and when the map opens).
  useEffect(() => {
    if (radiusEdge.current && map.current) map.current.fitBounds(radiusEdge.current.getBounds(), { padding: [12, 12] })
  }, [radiusKm])

  if (!fixedPin) return <div ref={box} className={`isolate z-0 w-full overflow-hidden rounded-xl ${className}`} />

  return (
    <div className={`relative w-full overflow-hidden ${className}`}>
      <div ref={box} className="isolate z-0 h-full w-full" />
      {/* The pin is drawn over the map, so its tip always marks the middle of the map. */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 z-10">
        <span className={`absolute -left-[7px] -top-[3px] h-1.5 w-3.5 rounded-full bg-black/35 transition-transform duration-150 ${moving ? 'scale-50' : ''}`} />
        <svg width="38" height="50" viewBox="0 0 38 50" className={`absolute -left-[19px] -top-[50px] drop-shadow-md transition-transform duration-150 ${moving ? '-translate-y-2.5' : ''}`}>
          <path d="M19 49C19 49 2 30 2 18.5 2 8.8 9.6 1.5 19 1.5S36 8.8 36 18.5C36 30 19 49 19 49Z" fill="#1F6B3A" />
          <circle cx="19" cy="18.5" r="11" fill="#FFFFFF" />
          <circle cx="19" cy="18.5" r="4.5" fill="#1F6B3A" />
        </svg>
      </div>
    </div>
  )
}
