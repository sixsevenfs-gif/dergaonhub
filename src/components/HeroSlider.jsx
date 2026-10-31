import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Banknote, Store, Truck } from 'lucide-react'
import { Leaf } from './BrandMark.jsx'
import { getStore } from '../lib/store.js'
import { useData } from '../lib/useData.js'
import { walletRules } from '../lib/wallet.js'
import { LUCKY_DRAW } from '../config.js'

const AUTO_MS = 4500

// Thin bottom strip of a banner: three small icons with labels, like the Refer & Earn design.
function Strip({ items }) {
  return (
    <span className="absolute inset-x-0 bottom-0 grid h-[28px] grid-cols-3 divide-x divide-white/20 bg-black/20">
      {items.map(([Icon, a, b]) => (
        <span key={a} className="flex items-center justify-center gap-1 px-0.5">
          <Icon size={13} strokeWidth={2} className="shrink-0 text-white" />
          <span className="whitespace-nowrap text-[9px] font-medium text-white/95">{a} {b}</span>
        </span>
      ))}
    </span>
  )
}

const pill = 'inline-flex w-fit items-center gap-1 rounded-full bg-mint px-2.5 py-0.5 text-[10.5px] font-semibold text-brand'
const cta = 'mt-2 inline-flex h-7 w-fit items-center gap-1.5 rounded-full bg-mint px-3 text-[11.5px] font-semibold text-brand-dark shadow-sm'

// Slide 1: the grocery photo on the right (kept small enough to stay sharp), words on deep green.
function PhotoBanner({ onShop }) {
  return (
    <div className="relative h-full overflow-hidden bg-gradient-to-br from-[#1E6B37] to-[#0F3B1D]">
      <img
        src="/photos/hero-groceries.jpg"
        alt="Atta, rice, oil, daal and fresh vegetables"
        className="absolute right-0 top-0 h-[calc(100%-28px)] w-[60%] object-cover [mask-image:linear-gradient(to_right,transparent,black_38%)]"
      />
      <span className="relative flex h-[calc(100%-28px)] w-[58%] flex-col justify-center pl-3.5">
        <span className={pill}><Leaf className="h-3 w-3" /> Fresh & Local</span>
        <span className="mt-1 text-[15px] font-bold leading-[1.15] text-white">Fresh Groceries</span>
        <span className="text-[15px] font-bold leading-[1.15] text-[#F6C343]">Delivered to Your Door</span>
        <button type="button" onClick={onShop} className={cta}>Shop Now <ArrowRight size={14} /></button>
      </span>
      <Strip items={[[Truck, 'Same-day', 'Delivery'], [Store, 'Local', 'Shops'], [Banknote, 'Cash or', 'UPI']]} />
    </div>
  )
}

// Slide 2: Refer & Earn, one finished picture (words included); a tap opens the wallet page.
function ReferBanner() {
  const navigate = useNavigate()
  return (
    <button type="button" onClick={() => navigate('/wallet')} className="block h-full w-full overflow-hidden bg-[#1E6B37]" aria-label="Refer and earn Jholzo Money">
      <img src="/photos/refer-banner.webp" alt="Share JHOLZO, earn rewards. Invite friends, they order, you earn." className="h-full w-full object-cover" />
    </button>
  )
}

// Launch offer slide (first customers can win cash); a tap opens the /lucky-draw page.
function LuckyDrawBanner() {
  const navigate = useNavigate()
  return (
    <button type="button" onClick={() => navigate('/lucky-draw')} className="block h-full w-full overflow-hidden bg-[#EEF4E6]" aria-label={`First ${LUCKY_DRAW.FIRST} customers: ${LUCKY_DRAW.WINNERS} lucky winners get ₹${LUCKY_DRAW.PRIZE} cash`}>
      <img src="/photos/lucky-draw-banner.webp" alt="" className="h-full w-full object-cover" />
    </button>
  )
}

// Home banner: slides change by themselves every few seconds, and can be swiped.
export default function HeroSlider({ onShop }) {
  const { data: store } = useData(getStore)
  const slides = [...(LUCKY_DRAW.ON ? [LuckyDrawBanner] : []), PhotoBanner, ...(walletRules(store).on ? [ReferBanner] : [])]
  const [index, setIndex] = useState(0)
  const touchX = useRef(null)
  const current = index % slides.length

  useEffect(() => {
    if (slides.length < 2) return
    const t = setTimeout(() => setIndex((i) => (i + 1) % slides.length), AUTO_MS)
    return () => clearTimeout(t)
  }, [index, slides.length])

  const go = (i) => setIndex((i + slides.length) % slides.length)

  return (
    <section className="mt-5">
      <div
        className="relative overflow-hidden rounded-[22px] shadow-[0_6px_20px_rgb(26_31_27/0.10)]"
        onTouchStart={(e) => {
          touchX.current = e.touches[0].clientX
        }}
        onTouchEnd={(e) => {
          if (touchX.current === null) return
          const dx = e.changedTouches[0].clientX - touchX.current
          if (Math.abs(dx) > 40) go(current + (dx < 0 ? 1 : -1))
          touchX.current = null
        }}
      >
        <div className="flex transition-transform duration-500 ease-out" style={{ transform: `translateX(-${current * 100}%)` }}>
          {slides.map((Slide, i) => (
            <div key={i} className="aspect-[2.2] w-full shrink-0" aria-hidden={i !== current}>
              <Slide onShop={onShop} />
            </div>
          ))}
        </div>
      </div>
      {slides.length > 1 && (
        <div className="mt-2.5 flex justify-center gap-1.5">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Banner ${i + 1}`}
              onClick={() => go(i)}
              className={`h-1.5 rounded-full transition-all ${i === current ? 'w-5 bg-brand' : 'w-1.5 bg-brand/25'}`}
            />
          ))}
        </div>
      )}
    </section>
  )
}
