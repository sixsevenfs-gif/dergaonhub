import { useLayoutEffect, useRef } from 'react'

// Category filter pills while browsing: the chosen one is solid green, the rest are outlined.
export default function CategoryBar({ categories, value, onChange }) {
  const track = useRef(null)
  const items = [{ id: '', short: 'All' }, ...categories]

  // Keep the chosen pill in view.
  useLayoutEffect(() => {
    const el = track.current?.querySelector(`[data-cat="${value || 'all'}"]`)
    if (!el) return
    const box = track.current
    box.scrollTo({ left: Math.max(0, el.offsetLeft - (box.clientWidth - el.offsetWidth) / 2), behavior: 'smooth' })
  }, [value, categories.length])

  return (
    <div ref={track} className="-mx-4 mt-4 flex gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map((c) => {
        const active = value === c.id
        return (
          <button
            key={c.id || 'all'}
            type="button"
            data-cat={c.id || 'all'}
            onClick={() => onChange(c.id)}
            className={`h-10 shrink-0 whitespace-nowrap rounded-full px-5 text-[13px] font-medium transition-colors ${
              active ? 'bg-brand text-white shadow-[0_4px_12px_rgb(31_107_58/0.25)]' : 'border border-line bg-white text-ink'
            }`}
          >
            {c.short}
          </button>
        )
      })}
    </div>
  )
}
