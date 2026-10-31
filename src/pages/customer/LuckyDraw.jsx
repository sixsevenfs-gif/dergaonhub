import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, BadgeCheck, ChevronDown, Gift, Instagram, ShoppingBag, Sparkles, Ticket, Trophy, Users, Video } from 'lucide-react'
import BottomNav from '../../components/BottomNav.jsx'
import { btnAccent, card } from '../../components/ui.js'
import { LEGAL, LUCKY_DRAW } from '../../config.js'
import { rupee } from '../../lib/format.js'

const IG_HANDLE = '@' + LEGAL.INSTAGRAM.replace(/\/+$/, '').split('/').pop()
const IG_GRADIENT = 'bg-[linear-gradient(135deg,#F58529_0%,#DD2A7B_45%,#8134AF_75%,#515BD4_100%)]'

const STEPS = [
  [ShoppingBag, 'Place your order', `Order anything on Jholzo and be one of our first ${LUCKY_DRAW.FIRST} customers.`],
  [Ticket, "You're in the draw", 'Your first delivered order enters you automatically. Nothing else to fill.'],
  [Gift, `${LUCKY_DRAW.WINNERS} winners picked`, `Once we reach ${LUCKY_DRAW.FIRST} customers, ${LUCKY_DRAW.WINNERS} lucky winners are picked at random.`],
  [Instagram, 'Result on Instagram', `Winners are announced on our official Instagram ${IG_HANDLE}, with a video of them getting their cash.`],
]

const RULES = [
  'One entry per phone number, however many orders you place.',
  'Only delivered orders count. Cancelled or returned orders are not counted.',
  'Open to customers in our Dergaon delivery area.',
  'Winners are picked at random and called on the phone number used for the order.',
  'Prize money is sent by UPI or bank transfer.',
  "Jholzo's decision on the winners is final.",
]

function Header() {
  const navigate = useNavigate()
  return (
    <header className="flex h-14 items-center gap-3">
      <button type="button" aria-label="Back" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))} className="-ml-2 flex h-11 w-11 items-center justify-center text-ink">
        <ArrowLeft size={24} />
      </button>
      <h1 className="flex-1 text-xl font-semibold text-ink">Lucky Draw</h1>
    </header>
  )
}

// Big green prize card with gold coins.
function PrizeCard() {
  return (
    <section className="relative mt-4 overflow-hidden rounded-[22px] bg-gradient-to-br from-[#2E7D46] via-brand to-[#0F3B1D] p-5 text-white">
      <span className="absolute -right-10 -top-10 h-40 w-40 animate-pulse rounded-full bg-[#F6C343]/25 blur-2xl" />
      {[['right-5 top-6 h-12 w-12 text-lg', '-rotate-12'], ['right-16 top-20 h-9 w-9 text-sm', 'rotate-12'], ['right-4 top-[104px] h-7 w-7 text-xs', 'rotate-6']].map(([pos, rot]) => (
        <span key={pos} className={`absolute ${pos} ${rot} flex items-center justify-center rounded-full border-2 border-[#FFE08A] bg-gradient-to-br from-[#FFD45C] to-[#E9A916] font-bold text-[#8A5A00] shadow-lg`}>₹</span>
      ))}
      <span className="relative inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ring-1 ring-white/25">
        <Sparkles size={14} className="text-[#F6C343]" /> Launch offer
      </span>
      <p className="relative mt-4 text-[15px] text-white/85">Win</p>
      <p className="relative text-[52px] font-extrabold leading-none tracking-tight text-[#F6C343]">{rupee(LUCKY_DRAW.PRIZE)}</p>
      <p className="relative mt-1 text-lg font-semibold">Cash prize</p>
      <p className="relative mt-3 max-w-[16rem] text-[13px] text-white/85">
        {LUCKY_DRAW.WINNERS} lucky customers from our first {LUCKY_DRAW.FIRST} customers win {rupee(LUCKY_DRAW.PRIZE)} each.
      </p>
    </section>
  )
}

function Stats() {
  const items = [
    [Users, String(LUCKY_DRAW.FIRST), 'First customers'],
    [Trophy, String(LUCKY_DRAW.WINNERS), 'Lucky winners'],
    [Gift, rupee(LUCKY_DRAW.PRIZE), 'Cash each'],
  ]
  return (
    <section className="mt-3 grid grid-cols-3 gap-2">
      {items.map(([Icon, value, label]) => (
        <div key={label} className={`${card} flex flex-col items-center px-2 py-3 text-center`}>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-mint text-brand"><Icon size={18} /></span>
          <span className="mt-1.5 text-xl font-bold leading-none text-brand-dark">{value}</span>
          <span className="mt-1 text-[11px] text-muted">{label}</span>
        </div>
      ))}
    </section>
  )
}

// Steps joined by a dotted line, like a timeline.
function HowItWorks() {
  return (
    <section className="mt-7">
      <h2 className="text-[17px] font-semibold">How it works</h2>
      <ol className="mt-3">
        {STEPS.map(([Icon, title, note], i) => (
          <li key={title} className="relative flex gap-3 pb-5 last:pb-0">
            {i < STEPS.length - 1 && <span className="absolute left-[21px] top-12 h-[calc(100%-44px)] border-l-2 border-dashed border-brand/25" />}
            <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-mint text-brand">
              <Icon size={20} />
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">{i + 1}</span>
            </span>
            <span className="pt-0.5">
              <span className="block text-sm font-semibold">{title}</span>
              <span className="text-[13px] text-muted">{note}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}

// Instagram card: the result and the winners' video are posted only there.
function InstagramCard() {
  return (
    <section className={`relative mt-7 overflow-hidden rounded-[22px] ${IG_GRADIENT} p-5 text-white`}>
      <Instagram size={150} strokeWidth={1} className="absolute -bottom-8 -right-8 text-white/15" />
      <span className="relative inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold">
        <BadgeCheck size={14} /> Official account
      </span>
      <h2 className="relative mt-3 text-[22px] font-bold leading-tight">Result coming soon on Instagram</h2>
      <p className="relative mt-2 text-[13px] text-white/90">
        We will post the {LUCKY_DRAW.WINNERS} winners and a video of them getting their cash only on {IG_HANDLE}. Follow us so you don&apos;t miss it.
      </p>
      <div className="relative mt-3 flex gap-4 text-[12px] font-medium text-white/90">
        <span className="inline-flex items-center gap-1.5"><Trophy size={15} /> Winners list</span>
        <span className="inline-flex items-center gap-1.5"><Video size={15} /> Winner video</span>
      </div>
      <a
        href={LEGAL.INSTAGRAM}
        target="_blank"
        rel="noreferrer"
        className="relative mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 text-base font-semibold text-[#C13584] shadow-[0_8px_20px_rgb(0_0_0/0.18)] active:scale-[.99]"
      >
        <Instagram size={20} /> Follow {IG_HANDLE}
      </a>
    </section>
  )
}

function Rules() {
  return (
    <details className={`${card} group mt-7 p-4`}>
      <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold">
        Rules of the lucky draw
        <ChevronDown size={18} className="text-muted transition-transform group-open:rotate-180" />
      </summary>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[13px] text-muted">
        {RULES.map((r) => <li key={r}>{r}</li>)}
      </ul>
    </details>
  )
}

// /lucky-draw: opened from the home banner. Open to everyone so the link can be shared.
export default function LuckyDraw() {
  if (!LUCKY_DRAW.ON) return <Navigate to="/" replace />
  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-28 pt-2">
      <Header />
      <img
        src="/photos/lucky-draw-banner.webp"
        alt={`First ${LUCKY_DRAW.FIRST} customers: ${LUCKY_DRAW.WINNERS} lucky winners get ${rupee(LUCKY_DRAW.PRIZE)} cash`}
        className="aspect-[2.2] w-full rounded-[22px] object-cover shadow-[0_6px_20px_rgb(26_31_27/0.10)]"
      />
      <PrizeCard />
      <Stats />
      <Link to="/" className={`${btnAccent} mt-4`}>Order now and enter <ArrowRight size={18} /></Link>
      <HowItWorks />
      <InstagramCard />
      <Rules />
      <BottomNav />
    </main>
  )
}
