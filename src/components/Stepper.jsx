import { Minus, Plus } from 'lucide-react'

export default function Stepper({ value, onChange, className = '' }) {
  return (
    <div className={`flex h-11 items-center justify-between rounded-xl border border-line ${className}`}>
      <button type="button" aria-label="Kam karo" onClick={() => onChange(value - 1)} className="flex h-full w-11 items-center justify-center">
        <Minus size={18} />
      </button>
      <span className="min-w-6 text-center font-semibold">{value}</span>
      <button type="button" aria-label="Aur add karo" onClick={() => onChange(value + 1)} className="flex h-full w-11 items-center justify-center">
        <Plus size={18} />
      </button>
    </div>
  )
}
