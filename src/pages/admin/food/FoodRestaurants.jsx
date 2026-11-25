import { Phone } from 'lucide-react'
import { lbtnOutline, lcard } from '../../../components/ui.js'
import { useData } from '../../../lib/useData.js'
import { FOOD_DESK_URL } from '../../../config.js'
import { foodRestaurants, fssaiDaysLeft } from '../../../lib/foodAdmin.js'

const STATUS = {
  talking: ['Talking', 'bg-neutral-100 text-neutral-700'],
  agreed: ['Agreed', 'bg-sky-100 text-sky-800'],
  ready: ['Ready', 'bg-amber-100 text-amber-800'],
  live: ['Live', 'bg-green-100 text-green-800'],
  paused: ['Paused', 'bg-orange-100 text-orange-800'],
  dropped: ['Not doing', 'bg-neutral-200 text-neutral-500'],
}

// Every restaurant in the Food Desk: is it in the app, what is missing. Editing stays in the Food Desk.
export default function FoodRestaurants() {
  const { data: rows, error } = useData(foodRestaurants)
  const list = (rows ?? []).slice().sort((a, b) => (a.status === 'dropped') - (b.status === 'dropped'))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Restaurants</h1>
        <p className="text-sm text-neutral-500">
          A restaurant shows in the app when it is <b>Live</b> and has an <b>FSSAI number</b>. Add or change restaurants, menus and photos in the Food Desk
          {FOOD_DESK_URL ? <> (<a href={FOOD_DESK_URL} target="_blank" rel="noreferrer" className="underline">open it</a>)</> : ''}.
        </p>
      </div>
      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error.message}</p>}
      {rows === undefined && <p className="text-sm text-neutral-500">Loading…</p>}
      {rows && rows.length === 0 && <p className={`${lcard} p-6 text-center text-sm text-neutral-500`}>No restaurants yet. Add them in the Food Desk.</p>}
      <div className="space-y-3">
        {list.map((r) => {
          const inApp = r.status === 'live' && r.fssai_number?.trim()
          const left = fssaiDaysLeft(r.fssai_expiry)
          const [label, cls] = STATUS[r.status] ?? [r.status, 'bg-neutral-100']
          const missing = [
            !r.fssai_number?.trim() && 'FSSAI number',
            !r.cover_photo && 'cover photo',
            r.menu === 0 && 'menu',
            r.status !== 'live' && 'Live status',
            !r.deal_type && 'deal',
          ].filter(Boolean)
          const phone = r.phone || r.whatsapp
          return (
            <div key={r.id} className={`${lcard} p-4 ${r.status === 'dropped' ? 'opacity-60' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-bold">{r.name?.trim() || 'No name yet'}</p>
                  <p className="text-xs text-neutral-500">{[r.area, r.opens_at && r.closes_at ? `${r.opens_at}–${r.closes_at}` : '', r.closed_on ? `off ${r.closed_on}` : ''].filter(Boolean).join(' · ')}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${cls}`}>{label}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <span className={inApp ? 'font-semibold text-green-700' : 'text-neutral-500'}>{inApp ? '● In the app' : '○ Not in the app'}</span>
                <span>{r.menu} dishes{r.off ? ` (${r.off} off)` : ''}</span>
                <span>{r.photos} dish photos</span>
                {r.deal_type && <span>Deal: {r.deal_type}{r.deal_value ? ` ${Number(r.deal_value)}${r.deal_type === 'monthly' ? ' ₹/month' : '%'}` : ''}</span>}
              </div>
              <p className="mt-1 text-sm">
                FSSAI: {r.fssai_number?.trim() || <span className="text-red-600">missing</span>}
                {left !== null && <span className={left <= 30 ? ' font-semibold text-red-600' : ' text-neutral-500'}> · {left < 0 ? 'ended' : `${left} days left`}</span>}
              </p>
              {missing.length > 0 && r.status !== 'dropped' && <p className="mt-1 text-xs text-amber-700">Missing: {missing.join(', ')}</p>}
              {phone && <a href={`tel:+91${phone}`} className={`${lbtnOutline} mt-3 min-h-10 px-3 text-sm`}><Phone size={15} /> Call</a>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
