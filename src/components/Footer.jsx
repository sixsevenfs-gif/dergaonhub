import { Link } from 'react-router-dom'
import { waLink } from '../lib/whatsapp.js'
import { LEGAL } from '../config.js'
import BrandMark from './BrandMark.jsx'

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
    <footer className="mt-10 space-y-3 border-t border-line pt-6 text-sm text-muted">
      {store.show_powered_by !== false ? (
        <img src="/brand/png/dergaon-hub-logo-footer.png" alt={`Dergaon Hub, powered by ${LEGAL.COMPANY}`} className="mb-5 h-auto w-full max-w-[340px]" loading="lazy" />
      ) : (
        <div className="mb-5 flex items-center gap-3">
          <BrandMark className="h-16 w-16 shrink-0" />
          <span className="font-logo text-[40px] font-black leading-none tracking-tight"><span className="text-white">dergaon</span> <span className="text-accent">hub</span></span>
        </div>
      )}
      <p>
        <Link to="/track" className="underline underline-offset-4">Track order</Link>
        {' · '}
        <Link to="/account" className="underline underline-offset-4">My orders</Link>
      </p>
      <nav className="grid grid-cols-2 gap-x-4 gap-y-2 py-2">
        {POLICY_LINKS.map(([slug, label]) => (
          <Link key={slug} to={`/policy/${slug}`} className="text-white/80 underline-offset-4 hover:underline">{label}</Link>
        ))}
      </nav>
      <p>
        Want a website for your shop?{' '}
        <a href={waLink(store.whatsapp, 'Hello, I would like a website for my shop.')} target="_blank" rel="noreferrer" className="font-semibold text-accent underline underline-offset-4">
          WhatsApp us
        </a>
      </p>
      <p className="pt-2 text-xs">© {new Date().getFullYear()} {LEGAL.COMPANY} · FSSAI: {LEGAL.FSSAI}</p>
    </footer>
  )
}
