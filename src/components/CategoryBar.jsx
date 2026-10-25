import { useLayoutEffect, useRef, useState } from 'react'
import { LayoutGrid } from 'lucide-react'
import { CategoryIcon } from './icons.jsx'

// Category switch on the home page: a frosted glass track, and a raised glass pill
// that slides to the chosen category (All, Atta, Rice, ...).
export default function CategoryBar({ categories, value, onChange }) {
  const track = useRef(null)
  const [pill, setPill] = useState(null)
  const items = [{ id: '', short: 'All' }, ...categories]

  // Measure the chosen button so the pill can slide to it, and scroll it into view.
  useLayoutEffect(() => {
    const el = track.current?.querySelector(`[data-cat="${value || 'all'}"]`)
    if (!el) return
    setPill({ left: el.offsetLeft, width: el.offsetWidth })
    const box = track.current
    const target = el.offsetLeft - (box.clientWidth - el.offsetWidth) / 2
    box.scrollTo({ left: Math.max(0, target), behavior: 'smooth' })
  }, [value, categories.length])

  return (
    <div className="-mx-4 mt-4 px-4">
      <div
        ref={track}
        className="relative flex gap-1 overflow-x-auto rounded-full border border-white/10 bg-white/[0.05] p-1.5 shadow-[inset_0_2px_6px_rgb(0_0_0/0.45),0_1px_0_rgb(255_255_255/0.06)] backdrop-blur-xl [scrollbar-width:none]"
      >
        {pill && (
          <span
            aria-hidden
            className="pointer-events-none absolute top-1.5 bottom-1.5 rounded-full border border-white/25 bg-gradient-to-b from-white/[0.22] to-white/[0.06] shadow-[inset_0_1px_0_rgb(255_255_255/0.45),inset_0_-2px_4px_rgb(0_0_0/0.25),0_6px_16px_rgb(0_0_0/0.45)] backdrop-blur-md transition-all duration-300 ease-[cubic-bezier(.3,1.3,.5,1)]"
            style={{ left: pill.left, width: pill.width }}
          >
            {/* soft yellow glow on the top edge, like light caught in glass */}
            <span className="absolute inset-x-5 -top-px h-px bg-gradient-to-r from-transparent via-accent/80 to-transparent" />
            <span className="absolute inset-x-6 top-0 h-3 rounded-full bg-accent/15 blur-md" />
          </span>
        )}
        {items.map((c) => {
          const active = value === c.id
          return (
            <button
              key={c.id || 'all'}
              type="button"
              data-cat={c.id || 'all'}
              onClick={() => onChange(c.id)}
              className={`relative z-10 flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm transition-colors duration-200 ${active ? 'font-bold text-accent' : 'font-medium text-white/80'}`}
            >
              {c.id ? <CategoryIcon id={c.id} size={18} /> : <LayoutGrid size={18} />}
              <span className="whitespace-nowrap">{c.short}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
