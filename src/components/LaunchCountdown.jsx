import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Instagram } from 'lucide-react'
import { JholzoText } from './Wordmark.jsx'
import { WhatsAppIcon } from './icons.jsx'
import { LAUNCH_AT, LEGAL } from '../config.js'

// On this computer only (npm run dev): ?launchtest=10 makes the launch 10 seconds away, to try the opening moment.
const testSeconds = import.meta.env.DEV && Number(new URLSearchParams(window.location.search).get('launchtest'))
const LAUNCH = testSeconds ? Date.now() + testSeconds * 1000 : new Date(LAUNCH_AT).getTime()
const PREVIEW_KEY = 'jholzo-preview'
const pad = (n) => String(n).padStart(2, '0')
const SERIF = "font-['Cormorant_Garamond',Georgia,serif]"

// ?preview=store lets the founder look inside before the launch (remembered in this tab).
function previewing() {
  try {
    if (new URLSearchParams(window.location.search).get('preview') === 'store') sessionStorage.setItem(PREVIEW_KEY, '1')
    return sessionStorage.getItem(PREVIEW_KEY) === '1'
  } catch {
    return false
  }
}

const GOLD_DUST = Array.from({ length: 36 }, (_, i) => ({
  left: (i * 53) % 100, delay: (i % 12) * 0.12, duration: 2.8 + ((i * 7) % 10) / 5, size: 3 + (i % 4), color: i % 3 ? '#E3C27A' : '#FFFFFF',
}))

// One number with its label; the digits fade up each time they change.
function Unit({ value, label }) {
  return (
    <div className="flex w-16 flex-col items-center sm:w-24">
      <span key={value} className={`lc-rise ${SERIF} text-[56px] font-light leading-none [font-variant-numeric:lining-nums_tabular-nums] text-white sm:text-[84px]`}>{value}</span>
      <span className="mt-3 text-[9px] font-medium uppercase tracking-[0.35em] text-[#E3C27A]/80 sm:text-[10px]">{label}</span>
    </div>
  )
}

// Full-screen countdown until LAUNCH_AT; the store stays shut behind it. At zero the store opens.
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
  const when = new Date(LAUNCH)
  const day = when.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' })
  const time = when.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).toUpperCase()
  const remind = `https://wa.me/919181061864?text=${encodeURIComponent('Hi Jholzo! Please remind me when you open.')}`

  return (
    <div className="fixed inset-0 z-[60] overflow-hidden bg-[radial-gradient(1100px_700px_at_50%_35%,#1C4A2C_0%,#0F2A19_55%,#08170E_100%)] text-white">
      <div className="lc-breathe pointer-events-none absolute left-1/2 top-[38%] h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgb(227_194_122/0.16),transparent_62%)]" />
      <div className="lc-grain pointer-events-none absolute inset-0 opacity-[0.05]" />
      <div className="pointer-events-none absolute inset-3 rounded-[28px] border border-[#E3C27A]/20 sm:inset-6" />

      <div className="relative mx-auto flex h-full max-w-2xl flex-col items-center justify-center px-6 text-center">
        <JholzoText onBrand className="lc-fade text-[30px] sm:text-[36px]" />
        <span className="lc-fade mt-3 text-[9px] font-medium uppercase tracking-[0.5em] text-white/45 [animation-delay:.15s]">Dergaon · Assam</span>

        {celebrate ? (
          <div className="lc-fade mt-14 flex flex-col items-center">
            <span className="text-[10px] font-medium uppercase tracking-[0.5em] text-[#E3C27A]">Now open</span>
            <h1 className={`${SERIF} mt-4 text-[52px] font-normal italic leading-[1.05] sm:text-[76px]`}>
              Welcome to <span className="text-[#E3C27A]">Jholzo.</span>
            </h1>
            <p className="mt-4 max-w-sm text-sm font-light leading-relaxed text-white/70">Thank you for waiting, Dergaon. Your store is open.</p>
            <button
              type="button"
              onClick={() => setClosed(true)}
              className="mt-10 h-12 rounded-full bg-[#E3C27A] px-10 text-[13px] font-semibold uppercase tracking-[0.2em] text-[#0F2A19] transition hover:bg-[#EDD08F] active:scale-[.98]"
            >
              Start shopping
            </button>
          </div>
        ) : (
          <>
            <h1 className={`lc-fade ${SERIF} mt-14 text-[44px] font-normal italic leading-[1.05] [animation-delay:.3s] sm:text-[68px]`}>
              Something <span className="text-[#E3C27A]">fresh</span>
              <br />
              is arriving.
            </h1>
            <p className="lc-fade mt-5 text-[11px] font-medium uppercase tracking-[0.3em] text-white/60 [animation-delay:.45s]">
              {day} · {time}
            </p>

            <div className="lc-fade mt-12 flex items-start [animation-delay:.6s]">
              {units.map(([v, l], i) => (
                <div key={l} className="flex items-start">
                  {i > 0 && <span className="mx-2 mt-2 h-12 w-px bg-gradient-to-b from-transparent via-[#E3C27A]/40 to-transparent sm:mx-5 sm:h-16" />}
                  <Unit value={v} label={l} />
                </div>
              ))}
            </div>

            <div className="lc-fade mt-14 flex flex-col items-center gap-4 [animation-delay:.75s] sm:flex-row sm:gap-6">
              <a
                href={LEGAL.INSTAGRAM}
                target="_blank"
                rel="noreferrer"
                className="flex h-11 items-center gap-2 rounded-full border border-[#E3C27A]/60 px-6 text-[12px] font-medium uppercase tracking-[0.2em] text-[#E3C27A] transition hover:bg-[#E3C27A]/10"
              >
                <Instagram size={15} /> Follow @jholzo
              </a>
              <a href={remind} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.2em] text-white/60 transition hover:text-white">
                <WhatsAppIcon size={15} /> Remind me
              </a>
            </div>
          </>
        )}

        <span className="absolute bottom-8 text-[9px] uppercase tracking-[0.4em] text-white/30 sm:bottom-12">Powered by {LEGAL.COMPANY}</span>
      </div>

      {celebrate && GOLD_DUST.map((c, i) => (
        <span
          key={i}
          className="lc-confetti pointer-events-none absolute -top-4 block rounded-full"
          style={{ left: `${c.left}%`, width: c.size, height: c.size, background: c.color, animationDelay: `${c.delay}s`, animationDuration: `${c.duration}s` }}
        />
      ))}
    </div>
  )
}
