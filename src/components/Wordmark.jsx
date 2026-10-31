import { Link } from 'react-router-dom'
import { Leaf } from './BrandMark.jsx'
import { getStore } from '../lib/store.js'
import { useData } from '../lib/useData.js'
import { LEGAL } from '../config.js'

// The JHOLZO wordmark: heavy green letters with a leaf on the "O".
// onBrand: white letters for the green home header. The "Powered by" line can be switched off
// in Admin → Settings.
export function JholzoText({ onBrand = false, className = '' }) {
  return (
    <span role="img" aria-label={LEGAL.BRAND} className={`inline-flex items-baseline font-logo font-black uppercase leading-none tracking-[-0.03em] ${onBrand ? 'text-white' : 'text-brand-dark'} ${className}`}>
      JH
      <span className="relative">
        O
        <Leaf className="absolute -top-[0.42em] left-[0.38em] h-[0.5em] w-[0.5em] -rotate-6" />
      </span>
      LZO
    </span>
  )
}

export default function Wordmark({ onBrand = false }) {
  const { data: store } = useData(getStore)
  const poweredBy = store?.show_powered_by !== false
  return (
    // fromLogo: the home page goes back to its start (no category, search or "All products") even when already on it.
    <Link to="/" state={{ fromLogo: Date.now() }} onClick={() => window.scrollTo({ top: 0 })} aria-label={`${LEGAL.BRAND} home`} className="flex flex-col pt-1.5">
      <JholzoText onBrand={onBrand} className="text-[26px]" />
      {poweredBy && (
        <span className={`mt-1 whitespace-nowrap text-[7.5px] font-semibold uppercase leading-none tracking-[0.16em] ${onBrand ? 'text-white/65' : 'text-muted'}`}>
          Powered by <span className={onBrand ? 'text-white' : 'text-brand'}>{LEGAL.COMPANY}</span>
        </span>
      )}
    </Link>
  )
}
