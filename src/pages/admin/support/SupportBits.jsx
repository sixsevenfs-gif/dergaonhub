import { Headset, ShoppingBasket, Smartphone, UtensilsCrossed } from 'lucide-react'
import { STATUS, TOPICS } from '../../../lib/support.js'

// The top of every Support page.
export function SupportHeader({ title, text, children }) {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-teal-700 via-emerald-700 to-cyan-700 p-5 text-white shadow-lg">
      <div className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full bg-white/10" />
      <div className="pointer-events-none absolute -bottom-16 right-16 h-36 w-36 rounded-full bg-white/5" />
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.22em] text-white/75"><Headset size={13} /> Help &amp; support</p>
      <h1 className="mt-1 text-2xl font-black sm:text-3xl">{title}</h1>
      {text && <p className="mt-1 max-w-xl text-sm text-white/85">{text}</p>}
      {children}
    </div>
  )
}

export function StatusChip({ status }) {
  const [label, tone] = STATUS[status] ?? [status, 'bg-neutral-100 text-neutral-600']
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${tone}`}>{label}</span>
}

export function TopicChip({ topic }) {
  return <span className="whitespace-nowrap rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-700">{TOPICS[topic] ?? topic}</span>
}

const KIND_ICON = { food: [UtensilsCrossed, 'bg-red-100 text-red-700'], grocery: [ShoppingBasket, 'bg-green-100 text-green-800'], other: [Smartphone, 'bg-sky-100 text-sky-800'] }
export function KindIcon({ kind, size = 'h-10 w-10' }) {
  const [Icon, tone] = KIND_ICON[kind] ?? KIND_ICON.other
  return <span className={`flex ${size} shrink-0 items-center justify-center rounded-xl ${tone}`}><Icon size={18} /></span>
}
