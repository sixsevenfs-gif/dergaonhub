import { Link } from 'react-router-dom'
import { ChevronRight, ShoppingBag } from 'lucide-react'
import FastImg from './FastImg.jsx'
import { realPhoto } from '../lib/productInfo.js'
import { itemsText, rupee } from '../lib/format.js'

// Floating "View cart" pill in the middle above the bottom bar, like the Android app's: photos of the last
// items added (newest first), "View cart", "2 items · ₹170".
export default function CartPill({ lines, products, count, total }) {
  const shown = Object.keys(lines)
    .map((id) => products.find((p) => p.id === id))
    .filter(Boolean)
    .slice(-3)
    .reverse()
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 flex justify-center px-4 pb-3">
      <Link
        to="/cart"
        className="pointer-events-auto flex h-[54px] items-center gap-2.5 rounded-full bg-brand py-[7px] pl-[7px] pr-3.5 text-white shadow-[0_8px_22px_rgb(31_107_58/0.35)] transition-transform active:scale-[0.98]"
      >
        <span className="flex">
          {shown.length ? (
            shown.map((p, i) => (
              <span
                key={p.id}
                style={{ zIndex: shown.length - i }}
                className={`relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border-2 border-brand bg-white ${i ? '-ml-3.5' : ''}`}
              >
                {realPhoto(p.photo_url) ? (
                  <FastImg src={p.photo_url} width={120} alt="" className="h-full w-full object-contain p-[5px]" />
                ) : (
                  <ShoppingBag size={17} className="text-brand" />
                )}
              </span>
            ))
          ) : (
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15"><ShoppingBag size={20} /></span>
          )}
        </span>
        <span className="leading-tight">
          <span className="block whitespace-nowrap text-[14.5px] font-bold">View cart</span>
          <span className="block whitespace-nowrap text-[11.5px] text-white/85">{itemsText(count)} · {rupee(total)}</span>
        </span>
        <ChevronRight size={22} className="-mr-1" />
      </Link>
    </div>
  )
}
