import { useEffect, useRef, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { CategoryIcon } from './icons.jsx'
import { categoryTint } from '../lib/categoryLook.js'
import { percentOff, rupee } from '../lib/format.js'

// The placeholder pack drawings (public/demo/) are not real photos.
const realPhoto = (url) => !!url && !url.includes('/demo/')

// Per-kg price only where people compare by weight (staples, loose produce, dry fruits),
// not on chocolates, snacks, drinks or soaps where it reads oddly.
const UNIT_PRICE_CATEGORIES = new Set(['atta', 'rice', 'daal', 'oil', 'masala', 'vegetables', 'dryfruits'])

// "5 kg" at ₹285 → "₹57/kg"; grams per kg, ml per litre. Nothing for pieces or packs.
function unitPrice(price, size = '', categoryId = '') {
  if (!UNIT_PRICE_CATEGORIES.has(categoryId)) return ''
  const m = size.trim().toLowerCase().match(/^([\d.]+)\s*(kg|g|l|ltr|litre|ml)$/)
  if (!m) return ''
  const n = Number(m[1])
  if (!(n > 0)) return ''
  const [qty, unit] = { kg: [n, 'kg'], g: [n / 1000, 'kg'], l: [n, 'L'], ltr: [n, 'L'], litre: [n, 'L'], ml: [n / 1000, 'L'] }[m[2]]
  if (qty === 1) return ''
  return `${rupee(price / qty)}/${unit}`
}

// Product photo, or the category icon on a soft tint when there is no photo.
export function ProductTile({ p, className = 'h-[84px] w-[92px]' }) {
  const photo = [p.photo_url, ...(p.photos ?? [])].find(realPhoto)
  const tint = categoryTint(p.category_id)
  return (
    <div className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-mint-soft ${p.available ? '' : 'grayscale'} ${className}`}>
      {photo ? (
        <img src={photo} alt={p.name} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center" style={{ background: `${tint}14`, color: tint }}>
          <CategoryIcon id={p.category_id} size={34} strokeWidth={1.5} />
        </span>
      )}
    </div>
  )
}

// Several photos: swipe with a finger, or they slide by themselves while the mouse is over the
// product or after a tap (like Myntra). Dots show which photo is on screen.
function PhotoSlider({ photos, alt }) {
  const track = useRef(null)
  const timer = useRef(null)
  const [index, setIndex] = useState(0)

  const show = (i) => track.current?.scrollTo({ left: i * track.current.clientWidth, behavior: 'smooth' })
  const stop = () => {
    clearInterval(timer.current)
    timer.current = null
  }
  // One round through all photos, then back to the first.
  const play = () => {
    if (timer.current) return
    let i = 0
    timer.current = setInterval(() => {
      i += 1
      if (i >= photos.length) {
        stop()
        show(0)
        return
      }
      show(i)
    }, 1100)
  }
  useEffect(() => stop, [])

  return (
    <>
      <div
        ref={track}
        onMouseEnter={play}
        onMouseLeave={() => {
          stop()
          show(0)
        }}
        onTouchStart={stop}
        onClick={play}
        onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {photos.map((url, i) => (
          <img key={url} src={url} alt={i ? '' : alt} loading="lazy" className="h-full w-full shrink-0 snap-center object-cover" />
        ))}
      </div>
      <span className="pointer-events-none absolute bottom-2 left-1/2 z-[1] flex -translate-x-1/2 gap-1">
        {photos.map((url, i) => (
          <span key={url} className={`h-1.5 rounded-full bg-white transition-all ${i === index ? 'w-4 opacity-100' : 'w-1.5 opacity-60'}`} />
        ))}
      </span>
    </>
  )
}

// One product card in the 2-column grid: photo, name, size, price, and "+ Add" (or − 1 +).
export default function ProductCard({ p, qty, onQty, disabled }) {
  const perUnit = unitPrice(p.price, p.size, p.category_id)
  const off = p.compare_price ? percentOff(p.compare_price, p.price) : 0
  const photos = [p.photo_url, ...(p.photos ?? [])].filter(realPhoto)
  const tint = categoryTint(p.category_id)
  return (
    <article className="flex flex-col rounded-2xl border border-line bg-white p-2 shadow-[0_2px_10px_rgb(26_31_27/0.04)]">
      <div className={`relative aspect-square overflow-hidden rounded-xl bg-mint-soft ${p.available ? '' : 'grayscale'}`}>
        {photos.length > 1 ? (
          <PhotoSlider photos={photos} alt={p.name} />
        ) : photos.length ? (
          <img src={photos[0]} alt={p.name} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center" style={{ background: `${tint}14`, color: tint }}>
            <CategoryIcon id={p.category_id} size={48} strokeWidth={1.4} />
          </span>
        )}
        {off > 0 && p.available && (
          <span className="absolute left-1.5 top-1.5 rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold text-white">{off}% OFF</span>
        )}
        {!p.available && (
          <span className="absolute inset-x-0 bottom-2 mx-auto w-fit rounded-full bg-black/65 px-2.5 py-1 text-[11px] font-medium text-white">Out of stock</span>
        )}
      </div>

      <div className="flex flex-1 flex-col px-1 pt-2">
        <h3 className="line-clamp-2 min-h-[2.5em] text-[13.5px] font-medium leading-[1.25] text-ink">{p.name}</h3>
        <p className="mt-0.5 text-[12px] text-muted">{p.size}</p>
        <div className="mt-auto flex items-end justify-between gap-1 pt-2">
          <span className="min-w-0 leading-tight">
            <span className="block text-[15px] font-semibold text-ink">{rupee(p.price)}</span>
            {off > 0 ? (
              <span className="block text-[11px] text-muted line-through">{rupee(p.compare_price)}</span>
            ) : (
              perUnit && <span className="block text-[10.5px] text-muted">{perUnit}</span>
            )}
          </span>
          {!p.available ? null : qty > 0 ? (
            <span className="flex h-8 shrink-0 items-center rounded-full bg-brand text-white">
              <button type="button" aria-label="Remove one" onClick={() => onQty(qty - 1)} className="flex h-8 w-7 items-center justify-center"><Minus size={14} strokeWidth={2.6} /></button>
              <span className="min-w-3 text-center text-[13px] font-semibold">{qty}</span>
              <button type="button" aria-label="Add one" onClick={() => onQty(qty + 1)} className="flex h-8 w-7 items-center justify-center"><Plus size={14} strokeWidth={2.6} /></button>
            </span>
          ) : (
            <button
              type="button"
              aria-label={`Add ${p.name}`}
              disabled={disabled}
              onClick={() => onQty(1)}
              className="flex h-8 shrink-0 items-center gap-0.5 rounded-full bg-brand px-3 text-[12.5px] font-semibold text-white active:scale-95 disabled:opacity-40"
            >
              <Plus size={14} strokeWidth={2.6} /> Add
            </button>
          )}
        </div>
      </div>
    </article>
  )
}
