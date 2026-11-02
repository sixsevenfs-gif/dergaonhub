import { useState } from 'react'
import { createPortal } from 'react-dom'
import FastImg from './FastImg.jsx'
import ProductThumb from './ProductThumb.jsx'

// Product photo next to an order item, so the admin and the rider see what to pick without searching the shop.
// Tap it to see it big. An item whose product was deleted (or has no photo) shows the category icon.
export default function ItemPhoto({ item, size, className = '' }) {
  const [big, setBig] = useState(false)
  const photo = item.product?.photo_url
  const thumb = <ProductThumb product={item.product} size={size} width={200} className={`border border-black/10 bg-white ${className}`} />
  if (!photo) return thumb
  return (
    <>
      <button
        type="button"
        aria-label={`See the photo of ${item.name_snapshot}`}
        onClick={(e) => {
          e.preventDefault() // in the rider's tick row: tapping the photo must not tick the item
          setBig(true)
        }}
        className="shrink-0"
      >
        {thumb}
      </button>
      {big &&
        createPortal(
          <div role="dialog" aria-label={item.name_snapshot} onClick={() => setBig(false)} className="fixed inset-0 z-[1200] flex flex-col items-center justify-center gap-3 bg-black/85 p-5">
            <FastImg src={photo} alt={item.name_snapshot} className="max-h-[70vh] w-full max-w-md rounded-2xl bg-white object-contain p-3" />
            <p className="max-w-md text-center text-lg font-semibold text-white">{item.name_snapshot} × {item.quantity}</p>
            <p className="text-sm text-white/60">Tap anywhere to close</p>
          </div>,
          document.body,
        )}
    </>
  )
}
