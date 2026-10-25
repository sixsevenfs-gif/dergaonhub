import { Minus, Plus } from 'lucide-react'

// compact: smaller version for the 3-per-row product grid.
export default function Stepper({ value, onChange, className = '', compact = false }) {
  const btn = `flex h-full items-center justify-center ${compact ? 'w-8' : 'w-11'}`
  const icon = compact ? 15 : 18
  return (
    <div className={`flex items-center justify-between rounded-xl border border-line ${compact ? 'h-9 rounded-lg' : 'h-11'} ${className}`}>
      <button type="button" aria-label="Decrease" onClick={() => onChange(value - 1)} className={btn}>
        <Minus size={icon} />
      </button>
      <span className={`text-center font-semibold ${compact ? 'min-w-4 text-sm' : 'min-w-6'}`}>{value}</span>
      <button type="button" aria-label="Increase" onClick={() => onChange(value + 1)} className={btn}>
        <Plus size={icon} />
      </button>
    </div>
  )
}
