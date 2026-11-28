import { useEffect, useRef, useState } from 'react'
import { Crop as CropIcon, Loader2, Minus, Plus } from 'lucide-react'
import { Sheet } from './ui.jsx'

// Before a dish or cover photo is saved: drag the photo and zoom so the food fills the box. The box has the shape
// the apps show (dish 1 : 1, cover 16 : 9), so what is inside it is what customers see. "Use as it is" keeps the
// whole photo (the apps then cut it to the box themselves).
export default function CropSheet({ file, aspect = 1, title = 'Crop the photo', onDone, onCancel }) {
  const box = useRef(null)
  const drag = useRef(null)
  const [img, setImg] = useState(null)
  const [url, setUrl] = useState('')
  const [w, setW] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const h = w / aspect

  // The photo
  useEffect(() => {
    if (!file) return
    const u = URL.createObjectURL(file)
    setUrl(u)
    setImg(null)
    setError('')
    setZoom(1)
    const el = new Image()
    el.onload = () => setImg(el)
    el.onerror = () => setError('This photo could not be opened. Please try another one.')
    el.src = u
    return () => URL.revokeObjectURL(u)
  }, [file])

  // The box width (the sheet's width)
  useEffect(() => {
    if (!file || !box.current) return
    const el = box.current
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    setW(el.clientWidth)
    return () => ro.disconnect()
  }, [file, img])

  const base = img && w ? Math.max(w / img.width, h / img.height) : 1
  const scale = base * zoom
  const clamp = (p, s = scale) => img ? ({
    x: Math.min(0, Math.max(w - img.width * s, p.x)),
    y: Math.min(0, Math.max(h - img.height * s, p.y)),
  }) : p

  // Start in the middle
  useEffect(() => {
    if (img && w) setPos({ x: (w - img.width * base) / 2, y: (h - img.height * base) / 2 })
  }, [img, w, base, h])

  // Zoom around the middle of the box
  function zoomTo(z) {
    const next = Math.min(4, Math.max(1, z))
    const cx = (w / 2 - pos.x) / scale
    const cy = (h / 2 - pos.y) / scale
    const s = base * next
    setZoom(next)
    setPos(clamp({ x: w / 2 - cx * s, y: h / 2 - cy * s }, s))
  }

  async function save() {
    if (!img) return
    setBusy(true)
    try {
      const sx = -pos.x / scale
      const sy = -pos.y / scale
      const sw = w / scale
      const sh = h / scale
      const outW = Math.round(Math.min(1600, sw))
      const outH = Math.round(outW / aspect)
      const canvas = document.createElement('canvas')
      canvas.width = outW
      canvas.height = outH
      const ctx = canvas.getContext('2d')
      ctx.imageSmoothingQuality = 'high'
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, outW, outH)
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH)
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
      if (!blob) throw new Error('This photo could not be cropped. Use it as it is.')
      onDone(new File([blob], 'photo.jpg', { type: 'image/jpeg' }))
    } catch (e) {
      setError(e.message)
    }
    setBusy(false)
  }

  return (
    <Sheet
      open={!!file}
      onClose={onCancel}
      title={title}
      footer={
        <div className="flex gap-2">
          <button type="button" onClick={() => onDone(file)} disabled={busy}
            className="press flex-1 rounded-2xl border border-line bg-white py-3 text-[14px] font-semibold">Use as it is</button>
          <button type="button" onClick={save} disabled={!img || busy}
            className="press flex flex-[1.4] items-center justify-center gap-2 rounded-2xl bg-neutral-900 py-3 text-[14px] font-semibold text-white disabled:opacity-50">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <CropIcon size={16} />} Crop & use
          </button>
        </div>
      }
    >
      <p className="mb-3 text-[13px] leading-snug text-muted">Drag the photo and zoom so the food fills the box. What is inside the box is what customers see in the app.</p>
      <div
        ref={box}
        className="relative mx-auto w-full touch-none select-none overflow-hidden rounded-2xl bg-neutral-900"
        style={{ height: h || 240, maxWidth: aspect > 1.2 ? 560 : 340, cursor: 'grab' }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          drag.current = { x: e.clientX, y: e.clientY, start: pos }
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (!d) return
          setPos(clamp({ x: d.start.x + e.clientX - d.x, y: d.start.y + e.clientY - d.y }))
        }}
        onPointerUp={() => { drag.current = null }}
        onPointerCancel={() => { drag.current = null }}
        onWheel={(e) => zoomTo(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08))}
      >
        {img && url ? (
          <img src={url} alt="" draggable={false} className="pointer-events-none absolute left-0 top-0 max-w-none"
            style={{ width: img.width * scale, height: img.height * scale, transform: `translate(${pos.x}px, ${pos.y}px)` }} />
        ) : (
          !error && <span className="absolute inset-0 grid place-items-center text-white/70"><Loader2 className="animate-spin" /></span>
        )}
        {/* thirds, to place the food in the middle */}
        <span className="pointer-events-none absolute inset-0">
          <span className="absolute inset-y-0 left-1/3 w-px bg-white/40" />
          <span className="absolute inset-y-0 left-2/3 w-px bg-white/40" />
          <span className="absolute inset-x-0 top-1/3 h-px bg-white/40" />
          <span className="absolute inset-x-0 top-2/3 h-px bg-white/40" />
          <span className="absolute inset-0 rounded-2xl ring-2 ring-inset ring-white/80" />
        </span>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button type="button" onClick={() => zoomTo(zoom / 1.2)} className="grid h-9 w-9 place-items-center rounded-full border border-line bg-white" aria-label="Zoom out"><Minus size={16} /></button>
        <input type="range" min="1" max="4" step="0.01" value={zoom} onChange={(e) => zoomTo(Number(e.target.value))} className="flex-1 accent-neutral-900" aria-label="Zoom" />
        <button type="button" onClick={() => zoomTo(zoom * 1.2)} className="grid h-9 w-9 place-items-center rounded-full border border-line bg-white" aria-label="Zoom in"><Plus size={16} /></button>
      </div>
      {error && <p className="mt-2 text-[13px] text-rose-700">{error}</p>}
    </Sheet>
  )
}
