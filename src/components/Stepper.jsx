import { Minus, Plus } from 'lucide-react'

// − 1 + with round outlined buttons (cart).
export default function Stepper({ value, onChange, className = '' }) {
  const btn = 'flex h-8 w-8 items-center justify-center rounded-full border border-line bg-white text-ink active:bg-mint'
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <button type="button" aria-label="Decrease" onClick={() => onChange(value - 1)} className={btn}>
        <Minus size={15} strokeWidth={2.4} />
      </button>
      <span className="min-w-4 text-center text-sm font-semibold">{value}</span>
      <button type="button" aria-label="Increase" onClick={() => onChange(value + 1)} className={btn}>
        <Plus size={15} strokeWidth={2.4} />
      </button>
    </div>
  )
}
