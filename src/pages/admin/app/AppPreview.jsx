import { useEffect, useState } from 'react'
import { BellRing, Download, Heart, Search, ShoppingBasket, Truck, UtensilsCrossed, Wallet, Wrench } from 'lucide-react'
import { DEFAULT_PAUSE, DEFAULT_PAUSE_TITLE, DEFAULT_UPDATE } from '../../../lib/appAdmin.js'

// How the Jholzo app looks, drawn small in a phone, for the App Control Center: the home with its banners, the
// update screen and question, and the maintenance screen. Close to the real Android and iPhone screens.

export function PhoneFrame({ children, label }) {
  return (
    <div className="mx-auto w-full max-w-[280px]">
      {label && <p className="mb-2 text-center text-[11px] font-bold uppercase tracking-[0.18em] text-violet-700">{label}</p>}
      <div className="rounded-[2.6rem] border-[9px] border-neutral-900 bg-neutral-900 shadow-[0_20px_40px_-12px_rgba(30,20,80,0.45)]">
        <div className="relative overflow-hidden rounded-[2rem] bg-white" style={{ aspectRatio: '9 / 19.5' }}>
          <div className="absolute left-1/2 top-2 z-30 h-[22px] w-[86px] -translate-x-1/2 rounded-full bg-neutral-900" />
          <div className="absolute inset-x-0 top-0 z-20 flex h-9 items-end justify-between px-6 pb-0.5 text-[10px] font-bold text-neutral-900">
            <span>9:41</span>
            <span className="flex items-center gap-1"><span className="flex items-end gap-px">{[3, 5, 7, 9].map((h) => <i key={h} className="w-[3px] rounded-sm bg-neutral-900" style={{ height: h }} />)}</span><span className="h-2.5 w-5 rounded-[3px] border border-neutral-900 p-px"><span className="block h-full w-3/4 rounded-[1px] bg-neutral-900" /></span></span>
          </div>
          <div className="absolute inset-0 overflow-hidden pt-9">{children}</div>
        </div>
      </div>
    </div>
  )
}

/** The app's home: logo, place, Grocery | Food, search, the banners sliding, then the start of the page below.
 *  banners: the ones to slide; [] shows the empty space; null (other pages) a plain picture block. */
export function AppHomePreview({ place = 'grocery', banners = null, highlightId = null }) {
  const food = place === 'food'
  const [page, setPage] = useState(0)
  const list = banners ?? []
  const count = list.length
  const start = Math.max(0, list.findIndex((b) => b.id === highlightId))
  useEffect(() => setPage(start), [start, count])
  useEffect(() => {
    if (count < 2) return undefined
    const t = setInterval(() => setPage((p) => (p + 1) % count), 3000)
    return () => clearInterval(t)
  }, [count])
  const tint = food ? 'text-red-600' : 'text-[#1F6B3A]'
  const soft = food ? 'bg-red-50' : 'bg-[#EAF4E4]'
  const dot = food ? 'bg-red-600' : 'bg-[#22A04B]'
  return (
    <div className={`h-full ${food ? 'bg-[#FFFBFA]' : 'bg-[#F7F8F6]'} px-3 pt-2`}>
      <div className="flex items-center justify-between">
        {food ? (
          <p className="text-[15px] font-black leading-[0.95] text-red-600">JHOLZO<br /><span className="text-amber-400">FOOD</span></p>
        ) : (
          <p className="text-[17px] font-black tracking-tight text-[#1F6B3A]">JHOLZO</p>
        )}
        <div className="flex gap-1.5">
          <span className={`flex h-6 items-center gap-1 rounded-full px-2 text-[9px] font-bold ${soft} ${tint}`}><Wallet size={10} /> ₹0</span>
          <span className={`flex h-6 w-6 items-center justify-center rounded-full ${soft} ${tint}`}><Heart size={10} /></span>
        </div>
      </div>
      <p className="mt-1.5 text-[8px] text-neutral-500">Delivering to <b className="text-[9px] text-neutral-800">Dergaon</b></p>
      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        <span className={`flex h-8 items-center gap-1 rounded-lg px-2 text-[9px] font-bold ${food ? 'bg-[#EAF4E4] text-[#1F6B3A]' : 'bg-[#1F6B3A] text-white ring-2 ring-[#1F6B3A]/30'}`}><ShoppingBasket size={11} /> Grocery</span>
        <span className={`flex h-8 items-center gap-1 rounded-lg px-2 text-[9px] font-bold ${food ? 'bg-red-600 text-white ring-2 ring-red-600/30' : 'bg-red-50 text-red-700'}`}><UtensilsCrossed size={11} /> Food</span>
      </div>
      <div className="mt-1.5 flex h-7 items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2 text-[8px] text-neutral-400"><Search size={10} className={tint} /> {food ? 'Search for dishes or restaurants' : 'Search atta, daal, chips…'}</div>

      <div className="mt-2">
        {banners === null ? (
          <div className={`rounded-xl ${food ? 'bg-gradient-to-r from-red-200 to-orange-100' : 'bg-gradient-to-r from-emerald-200 to-lime-100'}`} style={{ aspectRatio: '2.2 / 1' }} />
        ) : count > 0 ? (
          <>
            <div className="relative overflow-hidden rounded-xl shadow-sm" style={{ aspectRatio: '2.2 / 1' }}>
              <div className="flex h-full transition-transform duration-500" style={{ transform: `translateX(-${page * 100}%)` }}>
                {list.map((b) => (
                  <div key={b.id} className="relative h-full w-full shrink-0">
                    <img src={b.image} alt={b.title || ''} className="h-full w-full object-cover" />
                    {b.id === highlightId && <span className="absolute left-1.5 top-1.5 rounded-full bg-violet-600 px-1.5 py-0.5 text-[7px] font-bold text-white">This banner</span>}
                  </div>
                ))}
              </div>
            </div>
            {count > 1 && (
              <div className="mt-1 flex justify-center gap-1">
                {list.map((b, i) => <span key={b.id} className={`h-1 rounded-full transition-all ${i === page ? `w-3 ${dot}` : 'w-1 bg-neutral-300'}`} />)}
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center justify-center rounded-xl border border-dashed border-neutral-300 text-[8px] text-neutral-400" style={{ aspectRatio: '2.2 / 1' }}>No banner here: this space is hidden</div>
        )}
      </div>

      {food ? (
        <div className="mt-2 space-y-1.5">
          {[0, 1].map((k) => (
            <div key={k} className="overflow-hidden rounded-lg bg-white shadow-sm">
              <div className={`h-12 ${k ? 'bg-gradient-to-br from-amber-700 to-orange-400' : 'bg-gradient-to-br from-red-800 to-red-500'}`} />
              <div className="space-y-1 p-1.5"><div className="h-1.5 w-20 rounded bg-neutral-300" /><div className="h-1 w-28 rounded bg-neutral-200" /></div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-[#EEF7EB] p-1.5 text-[8px]"><Truck size={11} className="text-[#2E8B2E]" /><b className="text-[#10401F]">FREE delivery</b> on ₹299+</div>
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {Array.from({ length: 8 }).map((_, k) => <div key={k} className="aspect-square rounded-lg bg-white shadow-sm" />)}
          </div>
        </>
      )}
    </div>
  )
}

/** What a phone below the new version sees: the full screen (mandatory) or the question (normal). */
export function UpdatePreview({ mode, title, message }) {
  if (mode === 'force') {
    return (
      <div className="flex h-full flex-col items-center bg-white px-5 pb-6 pt-3 text-center">
        <p className="text-[15px] font-black text-[#1F6B3A]">JHOLZO</p>
        <div className="flex flex-1 flex-col items-center justify-center">
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-[#EAF4E4]"><Download size={34} className="text-[#1F6B3A]" /></span>
          <p className="mt-4 text-[17px] font-black text-neutral-900">{title || 'Update Jholzo'}</p>
          <p className="mt-1.5 text-[10px] leading-snug text-neutral-500">{message || DEFAULT_UPDATE}</p>
        </div>
        <span className="flex h-9 w-full items-center justify-center gap-1 rounded-xl bg-[#1F6B3A] text-[11px] font-bold text-white"><Download size={12} /> Update now</span>
        <p className="mt-1.5 text-[8px] text-neutral-400">You have version 1.1</p>
      </div>
    )
  }
  return (
    <div className="relative h-full">
      <div className={mode === 'soft' ? 'h-full opacity-60 blur-[1px]' : 'h-full'}><AppHomePreview /></div>
      {mode === 'soft' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/25 px-5">
          <div className="w-full rounded-2xl bg-white/95 p-3 text-center shadow-xl">
            <p className="text-[12px] font-bold">{title || 'Update available'}</p>
            <p className="mt-1 text-[9px] leading-snug text-neutral-600">{message || 'A new version of Jholzo is out with new features and fixes.'}</p>
            <div className="mt-2.5 grid grid-cols-2 gap-1.5 text-[10px] font-semibold">
              <span className="rounded-lg bg-neutral-100 py-1.5">Later</span>
              <span className="rounded-lg bg-[#1F6B3A] py-1.5 text-white">Update</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** The full screen every phone sees while the app is in maintenance. */
export function MaintenancePreview({ title, message }) {
  return (
    <div className="flex h-full flex-col items-center bg-gradient-to-b from-white to-amber-50 px-5 pb-6 pt-3 text-center">
      <p className="text-[15px] font-black text-[#1F6B3A]">JHOLZO</p>
      <div className="flex flex-1 flex-col items-center justify-center">
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-amber-100"><Wrench size={32} className="text-amber-700" /></span>
        <p className="mt-4 text-[17px] font-black text-neutral-900">{title || DEFAULT_PAUSE_TITLE}</p>
        <p className="mt-1.5 text-[10px] leading-snug text-neutral-500">{message || DEFAULT_PAUSE}</p>
      </div>
      <span className="mb-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-amber-600 text-[11px] font-bold text-white"><BellRing size={12} /> Notify me when it&apos;s back</span>
      <span className="flex h-9 w-full items-center justify-center rounded-xl border border-neutral-300 text-[11px] font-bold text-neutral-700">Try again</span>
    </div>
  )
}

/** A phone's lock screen with the notification on it (Android shows the picture big; iPhones show the text). */
export function LockScreenPreview({ title, body, image }) {
  const day = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })
  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-indigo-950 via-violet-800 to-fuchsia-600 px-3 pt-5 text-white">
      <p className="text-center text-[10px] font-semibold text-white/80">{day}</p>
      <p className="text-center text-[44px] font-extralight leading-tight">9:41</p>
      <div className="mt-5 rounded-2xl bg-white/90 p-2.5 text-neutral-900 shadow-xl">
        <div className="flex items-center gap-1.5 text-[8px] font-semibold uppercase tracking-wide text-neutral-500">
          <img src="/icons/icon-192.png" alt="" className="h-4 w-4 rounded" /> Jholzo <span className="ml-auto normal-case">now</span>
        </div>
        <p className="mt-1 text-[11px] font-bold leading-snug">{title || 'Title'}</p>
        <p className="line-clamp-4 text-[10px] leading-snug text-neutral-700">{body || 'Your message shows here.'}</p>
        {image && <img src={image} alt="" className="mt-1.5 max-h-28 w-full rounded-lg object-cover" />}
      </div>
      <p className="mt-auto pb-3 text-center text-[8px] text-white/60">Tap opens the page you chose</p>
    </div>
  )
}
