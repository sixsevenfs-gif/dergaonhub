import { useEffect, useRef, useState } from 'react'
import { ArrowRight } from 'lucide-react'

const AUTO_MS = 5000

function StoreBanner({ onShop }) {
  return (
    <div className="relative h-full bg-gradient-to-br from-[#1E2B0F] via-[#131A0B] to-ink">
      <img
        src="/photos/hero-groceries.jpg"
        alt="Atta, rice, oil, daal and fresh vegetables"
        className="absolute inset-y-0 right-0 h-full w-[60%] object-cover [mask-image:linear-gradient(to_right,transparent,black_22%)]"
      />
      <div className="relative flex h-full w-[50%] flex-col justify-center pl-4">
        <p className="whitespace-nowrap text-[16px] font-black leading-tight">Fresh essentials.</p>
        <p className="text-[16px] font-black leading-tight text-accent">Delivered to<br />your door.</p>
        <button type="button" onClick={onShop} className="mt-2.5 inline-flex h-8 w-fit items-center gap-1 whitespace-nowrap rounded-full bg-accent px-3 text-[13px] font-bold text-ink">
          Shop groceries <ArrowRight size={15} />
        </button>
      </div>
    </div>
  )
}

function PosterBanner({ onShop }) {
  return (
    <button type="button" onClick={onShop} className="block h-full w-full bg-[#0A100A]" aria-label="Groceries at cheapest prices. Same day delivery. Shop now">
      <img src="/photos/poster-same-day.jpg" alt="" className="h-full w-full object-contain" />
    </button>
  )
}

// Home banner: slides change by themselves every few seconds, and can be swiped.
export default function HeroSlider({ onShop }) {
  const slides = [StoreBanner, PosterBanner]
  const [index, setIndex] = useState(0)
  const touchX = useRef(null)

  useEffect(() => {
    const t = setTimeout(() => setIndex((i) => (i + 1) % slides.length), AUTO_MS)
    return () => clearTimeout(t)
  }, [index, slides.length])

  const go = (i) => setIndex((i + slides.length) % slides.length)

  return (
    <section className="mt-5">
      <div
        className="relative overflow-hidden rounded-2xl border border-accent/50"
        onTouchStart={(e) => {
          touchX.current = e.touches[0].clientX
        }}
        onTouchEnd={(e) => {
          if (touchX.current === null) return
          const dx = e.changedTouches[0].clientX - touchX.current
          if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1))
          touchX.current = null
        }}
      >
        <div className="flex transition-transform duration-500 ease-out" style={{ transform: `translateX(-${index * 100}%)` }}>
          {slides.map((Slide, i) => (
            <div key={i} className="aspect-[2.6] w-full shrink-0" aria-hidden={i !== index}>
              <Slide onShop={onShop} />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex justify-center gap-1.5">
        {slides.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Banner ${i + 1}`}
            onClick={() => go(i)}
            className={`h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-accent' : 'w-1.5 bg-white/30'}`}
          />
        ))}
      </div>
    </section>
  )
}
