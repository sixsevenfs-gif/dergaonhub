import { Minus, Plus } from 'lucide-react'
import { CategoryIcon } from './icons.jsx'
import { rupee } from '../lib/format.js'

// Category colour and name for products without a real photo.
const CATEGORY_LOOK = {
  atta: ['#D4A853', 'Atta & Flour'],
  rice: ['#E6DCC3', 'Rice & Poha'],
  daal: ['#E3A23B', 'Dal & Pulses'],
  oil: ['#E8C24A', 'Oil & Ghee'],
  masala: ['#C8582F', 'Masala & Salt'],
  dairy: ['#93BCE3', 'Dairy'],
  snacks: ['#E2803F', 'Snacks'],
  beverages: ['#A87452', 'Tea & Coffee'],
  colddrinks: ['#DB4A43', 'Cold Drinks'],
  personal: ['#BB98DA', 'Personal Care'],
  cleaning: ['#52B6AB', 'Cleaning'],
}

// The placeholder pack drawings (public/demo/) are not real photos.
const realPhoto = (url) => !!url && !url.includes('/demo/')

// "5 kg" at ₹285 → "₹57/kg"; grams per kg, ml per litre. Nothing for pieces or packs.
function unitPrice(price, size = '') {
  const m = size.trim().toLowerCase().match(/^([\d.]+)\s*(kg|g|l|ltr|litre|ml)$/)
  if (!m) return ''
  const n = Number(m[1])
  if (!(n > 0)) return ''
  const [qty, unit] = { kg: [n, 'kg'], g: [n / 1000, 'kg'], l: [n, 'L'], ltr: [n, 'L'], litre: [n, 'L'], ml: [n / 1000, 'L'] }[m[2]]
  if (qty === 1) return ''
  return `${rupee(price / qty)}/${unit}`
}

// A product without a photo gets a calm label-style tile instead of a fake pack drawing.
function ProductArt({ p }) {
  const [tint, label] = CATEGORY_LOOK[p.category_id] ?? ['#E8FF3A', 'Grocery']
  return (
    <div
      className="relative flex h-full w-full flex-col items-center justify-center px-4 pb-8 text-center"
      style={{ background: `radial-gradient(110% 80% at 30% 15%, ${tint}38, transparent 62%), linear-gradient(160deg, #1f1e1b, #121211)` }}
    >
      <CategoryIcon id={p.category_id} size={120} strokeWidth={0.9} className="absolute -bottom-5 -right-5 -rotate-12 opacity-[0.09]" style={{ color: tint }} />
      <span className="font-tagline text-[9px] font-semibold uppercase tracking-[0.24em]" style={{ color: tint }}>{label}</span>
      <span className="mt-2 line-clamp-3 text-[25px] italic leading-[1] text-white/90">{p.name}</span>
      <span className="mt-3 h-px w-8" style={{ background: `${tint}80` }} />
    </div>
  )
}

export default function ProductCard({ p, qty, onQty, disabled }) {
  const perUnit = unitPrice(p.price, p.size)
  return (
    <article className="group flex flex-col">
      <div className={`relative aspect-square overflow-hidden rounded-[22px] bg-[#141413] ring-1 ring-white/[0.07] ${p.available ? '' : 'grayscale'}`}>
        {realPhoto(p.photo_url) ? (
          <img src={p.photo_url} alt={p.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
        ) : (
          <ProductArt p={p} />
        )}
        {/* soft shade so the button and badge always read on top of the photo */}
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/45 to-transparent" />

        {p.featured && p.available && (
          <span className="absolute left-2.5 top-2.5 rounded-full border border-white/20 bg-black/40 px-2 py-0.5 font-tagline text-[9px] font-semibold uppercase tracking-[0.16em] text-white backdrop-blur-md">
            Bestseller
          </span>
        )}

        {!p.available ? (
          <span className="absolute inset-x-0 bottom-3 mx-auto w-fit rounded-full bg-black/70 px-3 py-1 font-ui text-xs font-semibold text-white/85 backdrop-blur">
            Out of stock
          </span>
        ) : qty > 0 ? (
          <div className="absolute bottom-2.5 right-2.5 flex h-10 items-center rounded-full bg-accent font-ui text-ink shadow-[0_8px_20px_rgb(0_0_0/0.45)]">
            <button type="button" aria-label="Remove one" onClick={() => onQty(qty - 1)} className="flex h-10 w-9 items-center justify-center"><Minus size={16} strokeWidth={2.6} /></button>
            <span className="min-w-5 text-center text-[15px] font-bold">{qty}</span>
            <button type="button" aria-label="Add one" onClick={() => onQty(qty + 1)} className="flex h-10 w-9 items-center justify-center"><Plus size={16} strokeWidth={2.6} /></button>
          </div>
        ) : (
          <button
            type="button"
            aria-label={`Add ${p.name}`}
            disabled={disabled}
            onClick={() => onQty(1)}
            className="absolute bottom-2.5 right-2.5 flex h-10 w-10 items-center justify-center rounded-full bg-accent text-ink shadow-[0_8px_20px_rgb(0_0_0/0.45)] transition-transform active:scale-90 disabled:opacity-40"
          >
            <Plus size={20} strokeWidth={2.6} />
          </button>
        )}
      </div>

      <div className="px-1 pt-3">
        <p className="font-tagline text-[10px] font-medium uppercase tracking-[0.18em] text-muted">{p.size}</p>
        <h3 className="mt-1 line-clamp-2 text-[19px] leading-[1.08]">{p.name}</h3>
        <p className="mt-2 flex items-baseline gap-2 font-tagline">
          <span className="text-[18px] font-semibold tracking-tight">{rupee(p.price)}</span>
          {perUnit && <span className="text-[11px] text-muted">{perUnit}</span>}
        </p>
      </div>
    </article>
  )
}
