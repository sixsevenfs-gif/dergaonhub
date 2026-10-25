import { useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { Check, Circle, Clock, Copy, PartyPopper, XCircle } from 'lucide-react'
import { WhatsAppIcon } from '../../components/icons.jsx'
import { lbtnAccent, lbtnDark, lbtnOutline, lcard } from '../../components/ui.js'
import { goLive, listShopProducts } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { waLink } from '../../lib/whatsapp.js'

function CheckItem({ done, children }) {
  return (
    <li className="flex items-center gap-2">
      {done ? <Check size={20} className="text-green-600" /> : <Circle size={20} className="text-neutral-300" />}
      <span className={done ? '' : 'text-neutral-500'}>{children}</span>
    </li>
  )
}

export default function Status() {
  const { shop } = useOutletContext()
  const { data: products = [] } = useData(() => listShopProducts(shop.id), [shop.id])
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const link = `${window.location.origin}/s/${shop.id}`

  const submit = async () => {
    setError('')
    try {
      await goLive()
    } catch (err) {
      setError(err.message)
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  if (shop.status === 'live') {
    return (
      <section className={`${lcard} p-5 text-center`}>
        <PartyPopper size={44} className="mx-auto text-green-600" />
        <h1 className="mt-3 text-2xl font-black">You're live!</h1>
        <p className="text-neutral-600">Customers ab aapki shop dekh aur order kar sakte hain.</p>
        <div className="mt-4 break-all rounded-xl bg-neutral-100 p-3 text-sm font-semibold">{link}</div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={copy} className={lbtnOutline}><Copy size={17} /> {copied ? 'Copied' : 'Copy link'}</button>
          <a href={waLink('', `Ab ${shop.name} se online order karo: ${link}`)} target="_blank" rel="noreferrer" className={lbtnAccent}>
            <WhatsAppIcon size={17} /> Share
          </a>
        </div>
        <Link to="/shop" className="mt-4 block font-semibold underline">Orders dekho</Link>
      </section>
    )
  }

  if (shop.status === 'pending') {
    return (
      <section className={`${lcard} p-5 text-center`}>
        <Clock size={44} className="mx-auto text-amber-500" />
        <span className="mt-3 inline-block rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-800">Pending verification</span>
        <h1 className="mt-3 text-2xl font-black">Hum aaj hi verify karenge</h1>
        <p className="text-neutral-600">Approve hote hi aapko WhatsApp pe bata denge. Tab tak products aur price check kar lo.</p>
        <Link to="/shop/products" className={`${lbtnOutline} mt-4 w-full`}>Products dekho</Link>
      </section>
    )
  }

  if (shop.status === 'hidden' || shop.status === 'suspended') {
    return (
      <section className={`${lcard} p-5 text-center`}>
        <XCircle size={44} className="mx-auto text-neutral-400" />
        <h1 className="mt-3 text-2xl font-black">Shop abhi {shop.status}</h1>
        <p className="text-neutral-600">Admin se baat karo.</p>
      </section>
    )
  }

  // draft or rejected
  return (
    <section className={`${lcard} space-y-4 p-5`}>
      {shop.status === 'rejected' ? (
        <div className="rounded-xl bg-red-50 p-3">
          <span className="font-bold text-red-700">Rejected</span>
          <p className="text-sm text-red-700">Reason: {shop.reject_reason}</p>
          <p className="mt-1 text-sm text-neutral-600">Theek karo, phir dobara Go Live dabao.</p>
        </div>
      ) : (
        <h1 className="text-2xl font-black">Go Live ke liye ready?</h1>
      )}
      <ul className="space-y-2">
        <CheckItem done>Shop details aur delivery rules</CheckItem>
        <CheckItem done={products.length > 0}>Products with price ({products.length} added)</CheckItem>
        <CheckItem done={false}>Admin verification (Go Live ke baad)</CheckItem>
      </ul>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Link to="/shop/settings" className={lbtnOutline}>Edit details</Link>
        <button type="button" onClick={submit} disabled={!products.length} className={`${lbtnDark} flex-1`}>
          {shop.status === 'rejected' ? 'Fix done, resubmit' : 'Go Live'}
        </button>
      </div>
      {!products.length && <Link to="/shop/products/add" className="block text-center text-sm font-semibold underline">Pehle products add karo</Link>}
    </section>
  )
}
