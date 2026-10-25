import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ImageOff, Trash2 } from 'lucide-react'
import StatusBadge from '../../components/StatusBadge.jsx'
import { WhatsAppIcon } from '../../components/icons.jsx'
import { lbtnDanger, lbtnDark, lbtnOutline, lcard, lfield } from '../../components/ui.js'
import { adminGetShop, adminRemoveProduct, setShopStatus } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { fmtTime, rupee } from '../../lib/format.js'
import { waLink } from '../../lib/whatsapp.js'

export default function AdminShopReview() {
  const { shopId } = useParams()
  const { data } = useData(() => adminGetShop(shopId), [shopId])
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  if (data === undefined) return null
  if (!data) return <p className="text-neutral-500">Shop nahi mili.</p>
  const { shop, owner_email, products } = data

  const act = async (status, why = '') => {
    setError('')
    try {
      await setShopStatus(shop.id, status, why)
      setRejecting(false)
    } catch (err) {
      setError(err.message)
    }
  }

  const notifyText =
    shop.status === 'live'
      ? `Namaste! ${shop.name} ab dergaon. pe live hai. Link: ${window.location.origin}/s/${shop.id}`
      : shop.status === 'rejected'
        ? `Namaste! ${shop.name} ki listing mein kuch theek karna hai: ${shop.reject_reason}. Theek karke dobara Go Live dabaiye.`
        : ''

  const rows = [
    ['Owner', owner_email], ['Category', shop.category], ['Area', shop.area], ['Address', shop.address],
    ['Phone', shop.phone], ['WhatsApp', shop.whatsapp], ['Hours', `${fmtTime(shop.open_time)} – ${fmtTime(shop.close_time)}`],
    ['Pickup', shop.pickup_available ? 'Yes' : 'No'],
    ['Delivery', shop.delivery_available ? `Yes · min ${rupee(shop.min_order)} · fee ${rupee(shop.delivery_fee)} · cut-off ${fmtTime(shop.cutoff_time)} · ${shop.delivery_area.join(', ')}` : 'No'],
  ]

  return (
    <div className="space-y-4">
      <Link to="/admin/shops" className="flex items-center gap-2 text-sm text-neutral-600"><ArrowLeft size={18} /> Shops</Link>
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-black">{shop.name}</h1>
        <StatusBadge status={shop.status} />
      </div>

      <section className={`${lcard} divide-y divide-neutral-100 px-4`}>
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-3 py-2 text-sm"><span className="w-24 shrink-0 text-neutral-500">{k}</span><span>{v}</span></div>
        ))}
      </section>

      <section className={`${lcard} space-y-3 p-4`}>
        <div className="flex flex-wrap gap-2">
          {shop.status !== 'live' && <button type="button" onClick={() => act('live')} className={lbtnDark}>Approve</button>}
          {shop.status !== 'rejected' && <button type="button" onClick={() => setRejecting(true)} className={lbtnDanger}>Reject</button>}
          {shop.status !== 'hidden' && <button type="button" onClick={() => act('hidden')} className={lbtnOutline}>Hide</button>}
          {shop.status !== 'suspended' && <button type="button" onClick={() => act('suspended')} className={lbtnDanger}>Suspend</button>}
        </div>
        {rejecting && (
          <div className="flex gap-2">
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason, jaise: prices galat hain" className={lfield} />
            <button type="button" onClick={() => act('rejected', reason)} className={lbtnDanger}>Send</button>
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {notifyText && (
          <a href={waLink(shop.whatsapp, notifyText)} target="_blank" rel="noreferrer" className={`${lbtnOutline} w-full`}>
            <WhatsAppIcon size={17} /> Owner ko WhatsApp pe batao
          </a>
        )}
      </section>

      <section>
        <h2 className="font-bold">Products ({products.length})</h2>
        <p className="text-sm text-neutral-500">Category, price aur photo check karo. Galat product hata do.</p>
        <div className={`${lcard} mt-2 divide-y divide-neutral-100`}>
          {products.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-4 py-2">
              <span className="flex-1">
                <span className="block text-sm font-semibold">{p.name} <span className="font-normal text-neutral-500">{p.size}</span></span>
                <span className="flex items-center gap-2 text-xs text-neutral-500">
                  {p.photo_url ? 'Photo' : <><ImageOff size={12} /> No photo</>}
                  {!p.library_product_id && <span className="rounded bg-amber-100 px-1.5 text-amber-800">Custom · {p.review_status}</span>}
                  {!p.available && <span>Out of stock</span>}
                </span>
              </span>
              <span className="font-bold">{rupee(p.price)}</span>
              <button type="button" aria-label="Remove" onClick={() => window.confirm(`${p.name} hatana hai?`) && adminRemoveProduct(p.id)} className="flex h-9 w-9 items-center justify-center text-neutral-400">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          {!products.length && <p className="p-4 text-sm text-neutral-500">Koi product nahi.</p>}
        </div>
      </section>
    </div>
  )
}
