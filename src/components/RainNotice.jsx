import { CloudRain } from 'lucide-react'

// Admin → App → App status → Heavy rain notice (update 071), for Grocery: the website is the grocery shop.
// The words match the apps' card; nothing shows until the owner switches it on (or before 071).
const DEFAULT_RAIN = "It's raining heavily in Dergaon, so orders may take a little longer today. Thank you for your patience."

const rainForGrocery = (store) => !!store?.rain_on && ['both', 'grocery'].includes(store?.rain_place ?? 'both')

export default function RainNotice({ store, className = '' }) {
  if (!rainForGrocery(store)) return null
  return (
    <div role="status" className={`flex items-start gap-3 rounded-2xl bg-gradient-to-r from-sky-100 to-indigo-50 p-3 ${className}`}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/80 text-sky-700"><CloudRain size={19} /></span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">Heavy rain in Dergaon</p>
        <p className="text-[13px] leading-5 text-muted">{String(store.rain_message ?? '').trim() || DEFAULT_RAIN}</p>
      </div>
    </div>
  )
}
