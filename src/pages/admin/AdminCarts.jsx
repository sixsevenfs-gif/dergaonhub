import { useState } from 'react'
import { Check, Phone } from 'lucide-react'
import ProductThumb from '../../components/ProductThumb.jsx'
import { WhatsAppIcon } from '../../components/icons.jsx'
import { lbtnOutline, lcard } from '../../components/ui.js'
import { adminCarts, getStore, markReminded } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { rupee, timeAgo } from '../../lib/format.js'
import { cartReminder } from '../../lib/carts.js'
import { toWa, waLink } from '../../lib/whatsapp.js'

// Carts that logged-in customers filled but didn't order (update 032). One friendly WhatsApp reminder per
// cart: the button opens WhatsApp with the message ready and marks the cart as reminded for everyone.
export default function AdminCarts() {
  const { data: carts, error } = useData(adminCarts)
  const { data: store } = useData(getStore)
  const [all, setAll] = useState(false)
  if (carts === undefined && !error) return null
  const list = carts ?? []
  const waiting = list.filter((c) => !c.reminded_at)
  const shown = all ? list : waiting
  const chip = (on) => `h-9 shrink-0 rounded-full border px-3 text-sm font-semibold ${on ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white'}`

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black">Carts</h1>
        <p className="text-sm text-neutral-600">
          Customers who added items and left without ordering. Send one reminder, not more. An order clears the cart from this list.
        </p>
      </div>
      {error && (
        <p className="rounded-xl bg-orange-50 p-3 text-sm text-orange-800">
          {/relation .*carts|carts.*does not exist|schema cache/i.test(error.message) ? 'Run supabase/migrations/032_team.sql in the Supabase SQL Editor first.' : error.message}
        </p>
      )}

      <div className="flex gap-2">
        <button type="button" onClick={() => setAll(false)} className={chip(!all)}>To remind ({waiting.length})</button>
        <button type="button" onClick={() => setAll(true)} className={chip(all)}>All ({list.length})</button>
      </div>

      <div className="space-y-2">
        {shown.map((c) => (
          <div key={c.phone} className={`${lcard} space-y-3 p-4`}>
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="block font-semibold">{c.name || 'Customer'}</span>
                <a href={`tel:${c.phone}`} className="flex items-center gap-1 text-sm text-neutral-600 underline"><Phone size={13} /> {c.phone}</a>
              </span>
              <span className="text-right">
                <span className="block text-lg font-black">{rupee(c.total)}</span>
                <span className="text-xs text-neutral-500">{c.count} item{c.count === 1 ? '' : 's'} · {timeAgo(c.updated_at)}</span>
              </span>
            </div>
            <ul className="space-y-1.5">
              {c.lines.map((l) => (
                <li key={l.id} className="flex items-center gap-2.5 text-sm">
                  <ProductThumb product={l.product} size="h-9 w-9" iconSize={16} className="border border-black/10 bg-white" />
                  <span className="min-w-0 flex-1 truncate">{l.product.name} <span className="text-neutral-500">{l.product.size}</span></span>
                  <b>×{l.qty}</b>
                </li>
              ))}
            </ul>
            {c.reminded_at ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-green-700">
                  <Check size={16} /> Reminded by {c.reminded_by_name} · {timeAgo(c.reminded_at)}
                </span>
                <a href={waLink(toWa(c.phone))} target="_blank" rel="noreferrer" className={`${lbtnOutline} min-h-9 text-sm`}>
                  <WhatsAppIcon size={15} /> Open chat
                </a>
              </div>
            ) : (
              <a
                href={waLink(toWa(c.phone), cartReminder(c, store))}
                target="_blank"
                rel="noreferrer"
                onClick={() => markReminded(c.phone).catch(() => {})}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#1FAF54] px-4 font-semibold text-white"
              >
                <WhatsAppIcon size={17} /> Send reminder on WhatsApp
              </a>
            )}
          </div>
        ))}
        {!shown.length && !error && (
          <p className={`${lcard} p-6 text-center text-sm text-neutral-500`}>
            {list.length ? 'Every cart has had its reminder.' : 'No carts waiting. When a logged-in customer adds items and leaves without ordering, it shows up here.'}
          </p>
        )}
      </div>
    </div>
  )
}
