import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Banknote, Instagram, PartyPopper, Tag, Truck } from 'lucide-react'
import { JholzoText } from './Wordmark.jsx'
import { WhatsAppIcon } from './icons.jsx'
import LaunchBackground from './LaunchBackground.jsx'
import { LAUNCH_AT, LEGAL } from '../config.js'

// On this computer only (npm run dev): ?launchtest=10 makes the launch 10 seconds away, to try the celebration.
const testSeconds = import.meta.env.DEV && Number(new URLSearchParams(window.location.search).get('launchtest'))
const LAUNCH = testSeconds ? Date.now() + testSeconds * 1000 : new Date(LAUNCH_AT).getTime()
const PREVIEW_KEY = 'jholzo-preview'
const pad = (n) => String(n).padStart(2, '0')

// ?preview=store lets the founder look inside before the launch (remembered in this tab).
function previewing() {
  try {
    if (new URLSearchParams(window.location.search).get('preview') === 'store') sessionStorage.setItem(PREVIEW_KEY, '1')
    return sessionStorage.getItem(PREVIEW_KEY) === '1'
  } catch {
    return false
  }
}

const CONFETTI = Array.from({ length: 70 }, (_, i) => ({
  left: (i * 53) % 100, delay: (i % 14) * 0.08, duration: 2.4 + ((i * 7) % 10) / 6,
  color: ['#F6C343', '#7CC24F', '#FFFFFF', '#EAF4E4', '#FF8A5B'][i % 5], wide: i % 3 === 0,
}))

// One number box; the digits slide in each time they change.
function Unit({ value, label }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative flex h-[84px] w-[74px] items-center justify-center overflow-hidden rounded-2xl [perspective:400px] border border-white/20 bg-white/10 shadow-[0_12px_30px_rgb(0_0_0/0.25),inset_0_1px_0_rgb(255_255_255/0.25)] sm:h-[112px] sm:w-[100px]">
        <span className="absolute inset-x-0 top-1/2 h-px bg-black/15" />
        <span key={value} className="lc-flip text-[40px] font-extrabold tabular-nums tracking-tight text-white sm:text-[54px]">{value}</span>
      </div>
      <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/70">{label}</span>
    </div>
  )
}

// Full-screen countdown until LAUNCH_AT; the store stays shut behind it. At zero: confetti, then the store opens.
export default function LaunchCountdown() {
  const { pathname } = useLocation()
  const [now, setNow] = useState(() => Date.now())
  const [preview] = useState(previewing)
  const [celebrate, setCelebrate] = useState(false)
  const [closed, setClosed] = useState(false)
  const staffPage = /^\/(admin|partner)/.test(pathname)
  const waiting = now < LAUNCH
  const show = !staffPage && !preview && !closed && (waiting || celebrate)

  useEffect(() => {
    if (!waiting) return
    const t = setInterval(() => {
      const n = Date.now()
      setNow(n)
      if (n >= LAUNCH) setCelebrate(true)
    }, 1000)
    return () => clearInterval(t)
  }, [waiting])

  useEffect(() => {
    if (!show) return
    const before = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = before
    }
  }, [show])

  if (!show) return null

  const left = Math.max(0, Math.floor((LAUNCH - now) / 1000))
  const days = Math.floor(left / 86400)
  const units = [
    ...(days > 0 ? [[pad(days), 'Days']] : []),
    [pad(Math.floor(left / 3600) % 24), 'Hours'],
    [pad(Math.floor(left / 60) % 60), 'Minutes'],
    [pad(left % 60), 'Seconds'],
  ]
  const launchText = new Date(LAUNCH).toLocaleString('en-IN', { day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })
  const remind = `https://wa.me/919181061864?text=${encodeURIComponent('Hi Jholzo! Please remind me when you launch.')}`

  return (
    <div className="fixed inset-0 z-[60] overflow-hidden bg-[radial-gradient(900px_600px_at_50%_30%,#2B7E48_0%,#17532D_55%,#0B2E16_100%)] text-white">
      {/* motion graphics: light rays, glow, canvas (leaves, bokeh, groceries), vignette and film grain */}
      <div className="lc-rays pointer-events-none absolute left-1/2 top-[-20%] h-[120vmax] w-[120vmax] -translate-x-1/2 opacity-60 will-change-transform [background:repeating-conic-gradient(from_0deg,rgb(255_255_255/0.07)_0deg_6deg,transparent_6deg_18deg)] [mask-image:radial-gradient(circle,black_0%,transparent_60%)]" />
      <div className="lc-glow pointer-events-none absolute left-1/2 top-[30%] h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgb(246_195_67/0.22),transparent_65%)]" />
      <LaunchBackground />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgb(0_0_0/0.55)_100%)]" />
      <div className="lc-grain pointer-events-none absolute inset-0 opacity-[0.05]" />

      <div className="relative mx-auto flex h-full max-w-xl flex-col items-center justify-center px-6 text-center">
        <span className="text-[11px] font-semibold uppercase tracking-[0.45em] text-white/55">Dergaon · Assam</span>
        <JholzoText onBrand className="mt-6 text-[60px] sm:text-[76px]" />
        <span className="mt-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-white/55">Powered by {LEGAL.COMPANY}</span>

        {celebrate ? (
          <div className="lc-pop mt-10 flex flex-col items-center">
            <PartyPopper size={56} className="text-[#F6C343]" />
            <h1 className="mt-4 text-4xl font-extrabold sm:text-5xl">We are live! 🎉</h1>
            <p className="mt-2 text-white/80">Thank you for waiting, Dergaon. Your store is open.</p>
            <button type="button" onClick={() => setClosed(true)} className="mt-7 h-14 rounded-full bg-[#F6C343] px-9 text-lg font-bold text-[#17532D] shadow-[0_12px_30px_rgb(246_195_67/0.35)] active:scale-[.98]">
              Start shopping →
            </button>
          </div>
        ) : (
          <>
            <h1 className="mt-9 text-[28px] font-extrabold leading-tight sm:text-4xl">
              Dergaon&apos;s own grocery store is <span className="text-[#F6C343]">almost here</span>
            </h1>
            <p className="mt-2 text-sm text-white/75">Opening on {launchText}</p>

            <div className="mt-8 flex items-start gap-2.5 sm:gap-4">
              {units.map(([v, l], i) => (
                <div key={l} className="flex items-start gap-2.5 sm:gap-4">
                  {i > 0 && <span className="lc-blink pt-6 text-3xl font-bold text-white/50 sm:pt-8 sm:text-4xl">:</span>}
                  <Unit value={v} label={l} />
                </div>
              ))}
            </div>

            <div className="mt-9 flex flex-wrap justify-center gap-2 text-[12px] font-medium">
              {[[Tag, 'Better prices'], [Truck, 'Low delivery charge'], [Banknote, 'Cash or UPI']].map(([Icon, t]) => (
                <span key={t} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 ring-1 ring-white/15"><Icon size={14} className="text-[#F6C343]" /> {t}</span>
              ))}
            </div>

            <div className="mt-8 flex w-full max-w-sm flex-col gap-2.5 sm:flex-row">
              <a href={LEGAL.INSTAGRAM} target="_blank" rel="noreferrer" className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-white font-semibold text-[#17532D] active:scale-[.98]">
                <Instagram size={19} /> Follow @jholzo
              </a>
              <a href={remind} target="_blank" rel="noreferrer" className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl border border-white/30 bg-white/10 font-semibold active:scale-[.98]">
                <WhatsAppIcon size={19} /> Remind me
              </a>
            </div>
            <p className="mt-4 text-[11px] text-white/50">Launch offers are announced on Instagram first.</p>
          </>
        )}
      </div>

      {celebrate && CONFETTI.map((c, i) => (
        <span
          key={i}
          className="lc-confetti pointer-events-none absolute -top-4 block rounded-sm"
          style={{ left: `${c.left}%`, width: c.wide ? 12 : 7, height: c.wide ? 6 : 12, background: c.color, animationDelay: `${c.delay}s`, animationDuration: `${c.duration}s` }}
        />
      ))}
    </div>
  )
}
