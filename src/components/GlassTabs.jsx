// Two or three equal options in a frosted glass track; the chosen one sits in a raised glass pill
// that slides between them (same look as the category bar on the home page).
export default function GlassTabs({ options, value, onChange, className = '' }) {
  const index = Math.max(0, options.findIndex((o) => o.value === value))
  return (
    <div className={`relative flex rounded-full border border-white/10 bg-white/[0.05] p-1 shadow-[inset_0_2px_6px_rgb(0_0_0/0.45),0_1px_0_rgb(255_255_255/0.06)] ${className}`}>
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-1 left-1 top-1 rounded-full border border-white/25 bg-gradient-to-b from-white/[0.22] to-white/[0.06] shadow-[inset_0_1px_0_rgb(255_255_255/0.45),inset_0_-2px_4px_rgb(0_0_0/0.25),0_6px_16px_rgb(0_0_0/0.45)] transition-transform duration-300 ease-[cubic-bezier(.3,1.3,.5,1)]"
        style={{ width: `calc((100% - 0.5rem) / ${options.length})`, transform: `translateX(${index * 100}%)` }}
      >
        <span className="absolute inset-x-5 -top-px h-px bg-gradient-to-r from-transparent via-accent/80 to-transparent" />
      </span>
      {options.map(({ value: v, label, icon: Icon }) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={v === value}
          onClick={() => onChange(v)}
          className={`relative z-10 flex h-11 flex-1 items-center justify-center gap-2 rounded-full text-sm transition-colors ${v === value ? 'font-bold text-accent' : 'font-medium text-white/75'}`}
        >
          {Icon && <Icon size={17} />} {label}
        </button>
      ))}
    </div>
  )
}
