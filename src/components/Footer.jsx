import { Link } from 'react-router-dom'
import { Phone } from 'lucide-react'
import { WhatsAppIcon } from './icons.jsx'
import { waLink } from '../lib/whatsapp.js'

export default function Footer({ store }) {
  if (!store) return null
  return (
    <footer className="mt-10 space-y-3 border-t border-line pt-6 text-sm text-muted">
      <img src="/brand/png/dergaon-hub-logo-footer.png" alt="Dergaon Hub, powered by Malchetra Groups" className="mb-5 h-auto w-full max-w-[340px]" loading="lazy" />
      <p className="font-semibold text-white">Help chahiye?</p>
      <div className="flex gap-2">
        <a href={`tel:${store.phone}`} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-line text-white"><Phone size={17} /> Call</a>
        <a href={waLink(store.whatsapp, 'Namaste Dergaon Hub, mujhe help chahiye.')} target="_blank" rel="noreferrer" className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-line text-white">
          <WhatsAppIcon size={17} /> WhatsApp
        </a>
      </div>
      <p>
        <Link to="/track" className="underline underline-offset-4">Order track karo</Link>
        {' · '}
        <Link to="/account" className="underline underline-offset-4">Mere orders</Link>
      </p>
      <p>
        Apni dukaan ki website banwani hai?{' '}
        <a href={waLink(store.whatsapp, 'Namaste, mujhe apni dukaan ki website banwani hai.')} target="_blank" rel="noreferrer" className="font-semibold text-accent underline underline-offset-4">
          WhatsApp karo
        </a>
      </p>
    </footer>
  )
}
