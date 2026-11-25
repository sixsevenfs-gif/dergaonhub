import { Smartphone, TabletSmartphone } from 'lucide-react'

// The top of every App Control Center page: what it is, and that a change reaches both apps at once.
export default function AppHeader({ title, text, children }) {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-700 via-indigo-700 to-sky-600 p-5 text-white shadow-lg">
      <div className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full bg-white/10" />
      <div className="pointer-events-none absolute -bottom-16 right-16 h-36 w-36 rounded-full bg-white/5" />
      <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/70">App Control Center</p>
      <h1 className="mt-1 text-2xl font-black sm:text-3xl">{title}</h1>
      <p className="mt-1 max-w-xl text-sm text-white/85">{text ?? 'One change reaches both apps, Android and iPhone, within a minute. No app update or store review needed.'}</p>
      <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
        <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1"><Smartphone size={13} /> Android app</span>
        <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1"><TabletSmartphone size={13} /> iPhone app</span>
      </div>
      {children}
    </div>
  )
}
