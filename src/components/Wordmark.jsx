import { Link } from 'react-router-dom'
import BrandMark from './BrandMark.jsx'
import { getStore } from '../lib/store.js'
import { useData } from '../lib/useData.js'
import { LEGAL } from '../config.js'

// The Dergaon Hub logo: mark + "dergaon hub" + "Powered by Malchetra Groups" (public/brand/).
// The "Powered by" line can be switched off in Admin → Settings.
// theme="light" is for the white admin header, where yellow text would be hard to read.
export default function Wordmark({ theme = 'dark' }) {
  const light = theme === 'light'
  const { data: store } = useData(getStore)
  const poweredBy = store?.show_powered_by !== false
  return (
    <Link to="/" aria-label="Dergaon Hub home" className="flex items-center gap-2">
      <BrandMark className="h-10 w-10 shrink-0" />
      <span className="flex flex-col">
        <span className="whitespace-nowrap font-logo text-[22px] font-black leading-none tracking-tight">
          <span className={light ? 'text-ink' : 'text-white'}>dergaon</span>{' '}
          <span className={light ? 'text-[#6E7F00]' : 'text-accent'}>hub</span>
        </span>
        {poweredBy && (
          <span className="mt-1 whitespace-nowrap font-tagline text-[7.5px] font-semibold uppercase leading-none tracking-[0.16em]">
            <span className={light ? 'text-[#76746D]' : 'text-[#8F8D86]'}>Powered by </span>
            <span className={light ? 'text-[#A07A2C]' : 'text-[#E2C27A]'}>{LEGAL.COMPANY}</span>
          </span>
        )}
      </span>
    </Link>
  )
}
