// Two or three equal options in a light green track; the chosen one sits in a green pill
// that slides between them.
export default function GlassTabs({ options, value, onChange, className = '' }) {
  const index = Math.max(0, options.findIndex((o) => o.value === value))
  return (
    <div className={`relative flex rounded-full bg-mint p-1 ${className}`}>
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-1 left-1 top-1 rounded-full bg-brand shadow-[0_4px_12px_rgb(31_107_58/0.3)] transition-transform duration-300 ease-[cubic-bezier(.3,1.3,.5,1)]"
        style={{ width: `calc((100% - 0.5rem) / ${options.length})`, transform: `translateX(${index * 100}%)` }}
      />
      {options.map(({ value: v, label, icon: Icon }) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={v === value}
          onClick={() => onChange(v)}
          className={`relative z-10 flex h-11 flex-1 items-center justify-center gap-2 rounded-full text-sm transition-colors ${v === value ? 'font-semibold text-white' : 'font-medium text-ink/70'}`}
        >
          {Icon && <Icon size={17} />} {label}
        </button>
      ))}
    </div>
  )
}
