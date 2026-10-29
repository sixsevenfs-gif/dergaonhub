import { Link } from 'react-router-dom'
import { Instagram } from 'lucide-react'
import { waLink } from '../lib/whatsapp.js'
import { LEGAL } from '../config.js'
import { JholzoText } from './Wordmark.jsx'

const POLICY_LINKS = [
  ['about', 'About us'],
  ['contact', 'Contact us'],
  ['privacy', 'Privacy policy'],
  ['terms', 'Terms & conditions'],
  ['refund', 'Refund & cancellation'],
  ['delivery', 'Delivery policy'],
]

export default function Footer({ store }) {
  if (!store) return null
  return (
    <footer className="mt-10 space-y-3 border-t border-line pt-7 text-sm text-muted">
      <div className="mb-5">
        <p>
          <JholzoText className="text-[40px]" />
        </p>
        <p className="mt-2 text-[13px] text-ink">Fresh Groceries. Right at Your Door.</p>
        <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand">{LEGAL.GROUP_LINE}</p>
        <a href={LEGAL.INSTAGRAM} target="_blank" rel="noreferrer" className="mt-4 inline-flex h-10 items-center gap-2 rounded-full border border-line px-4 text-[13px] font-semibold text-ink">
          <Instagram size={18} className="text-[#E1306C]" /> Follow us on Instagram · @jholzo
        </a>
      </div>
      <p>
        <Link to="/track" className="underline underline-offset-4">My orders</Link>
        {' · '}
        <Link to="/account" className="underline underline-offset-4">My account</Link>
      </p>
      <nav className="grid grid-cols-2 gap-x-4 gap-y-2 py-2">
        {POLICY_LINKS.map(([slug, label]) => (
          <Link key={slug} to={`/policy/${slug}`} className="text-ink/80 underline-offset-4 hover:underline">{label}</Link>
        ))}
      </nav>
      <p>
        Want a website for your shop?{' '}
        <a href={waLink(store.whatsapp, 'Hello, I would like a website for my shop.')} target="_blank" rel="noreferrer" className="font-semibold text-brand underline underline-offset-4">
          WhatsApp us
        </a>
      </p>
      <p className="pt-2 text-xs">© {new Date().getFullYear()} {LEGAL.COMPANY} · FSSAI: {LEGAL.FSSAI}</p>
    </footer>
  )
}
