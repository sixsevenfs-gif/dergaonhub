import { useState } from 'react'
import { lbtnDanger, lbtnOutline, lcard } from '../../components/ui.js'
import { adminListCustomers, adminWalletAdjust, resetNoShows, setCustomerBlocked } from '../../lib/store.js'
import { rupee } from '../../lib/format.js'
import { useData } from '../../lib/useData.js'
import { CONFIG } from '../../config.js'
import OfferSender from './OfferSender.jsx'

// Add money (goodwill for a complaint) or take it back (minus amount), always with a reason.
async function adjustWallet(c) {
  const amount = window.prompt(`Jholzo Money for ${c.name || c.phone} (now ${rupee(c.wallet ?? 0)}).\nAmount to add, or minus to take back (e.g. 50 or -20):`)
  if (amount === null || !amount.trim()) return
  const note = window.prompt('Reason (the customer sees this):', 'Sorry for the trouble')
  if (note === null) return
  try {
    await adminWalletAdjust(c.id, Number(amount), note)
  } catch (err) {
    window.alert(err.message)
  }
}

export default function AdminCustomers() {
  const [onlyNoShows, setOnlyNoShows] = useState(true)
  const { data: customers = [] } = useData(adminListCustomers)
  const shown = customers.filter((c) => !onlyNoShows || c.no_show_count > 0 || c.blocked)

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">Customers</h1>
      <OfferSender />
      <p className="text-sm text-neutral-600">
        After {CONFIG.NO_SHOW_LIMIT} no-shows a number can't pay cash on delivery. Blocking a number stops all its orders.
      </p>
      <div className="flex gap-2">
        <button type="button" onClick={() => setOnlyNoShows(true)} className={`h-9 rounded-full border px-3 text-sm font-semibold ${onlyNoShows ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white'}`}>No-show list</button>
        <button type="button" onClick={() => setOnlyNoShows(false)} className={`h-9 rounded-full border px-3 text-sm font-semibold ${!onlyNoShows ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white'}`}>All ({customers.length})</button>
      </div>
      <div className={`${lcard} divide-y divide-neutral-100`}>
        {shown.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <span className="min-w-40 flex-1">
              <span className="block font-semibold">{c.name} {c.blocked && <span className="ml-1 rounded bg-red-100 px-1.5 text-xs font-bold text-red-700">Blocked</span>}</span>
              <span className="text-sm text-neutral-500">{c.phone} · {c.orders} orders · {c.completed} completed</span>
              {(c.referral_code || c.referred_by_name) && (
                <span className="block text-xs text-neutral-500">
                  {c.referral_code && <>Code <b>{c.referral_code}</b></>}
                  {c.referral_code && c.referred_by_name && ' · '}
                  {c.referred_by_name && <>Invited by {c.referred_by_name}</>}
                </span>
              )}
            </span>
            <button type="button" onClick={() => adjustWallet(c)} className={`${lbtnOutline} min-h-9 text-sm`} title="Jholzo Money: add or take back">
              {rupee(c.wallet ?? 0)}
            </button>
            <span className={`text-sm font-bold ${c.no_show_count ? 'text-orange-600' : 'text-neutral-400'}`}>{c.no_show_count} no-show</span>
            {c.no_show_count > 0 && <button type="button" onClick={() => resetNoShows(c.id)} className={`${lbtnOutline} min-h-9 text-sm`}>Reset</button>}
            <button type="button" onClick={() => setCustomerBlocked(c.id, !c.blocked)} className={`${c.blocked ? lbtnOutline : lbtnDanger} min-h-9 text-sm`}>
              {c.blocked ? 'Unblock' : 'Block'}
            </button>
          </div>
        ))}
        {!shown.length && <p className="p-4 text-neutral-500">No no-shows. Great!</p>}
      </div>
    </div>
  )
}
