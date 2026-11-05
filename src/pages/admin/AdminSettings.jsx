import { useEffect, useState } from 'react'
import { Home, LocateFixed, UserPlus } from 'lucide-react'
import Field from '../../components/Field.jsx'
import Toggle from '../../components/Toggle.jsx'
import LocationPicker from '../../components/LocationPicker.jsx'
import { lbtnDanger, lbtnDark, lbtnOutline, lcard, lfield, lfieldBase } from '../../components/ui.js'
import { adminAddRider, adminListRiders, getAutoRider, getCostRules, getPrivateSettings, getStore, resetDemo, saveCostRules, savePrivateSettings, saveStore, setAutoRider, setRiderActive } from '../../lib/store.js'
import { currentPosition, deliveryRules, packagingFee } from '../../lib/delivery.js'
import { placeName } from '../../lib/customerLocation.js'
import { countHouses, savedHouseCount } from '../../lib/houses.js'
import { rupee } from '../../lib/format.js'
import { useData } from '../../lib/useData.js'
import { CONFIG, DEMO_MODE, LEGAL } from '../../config.js'

// Orders per evening. Private: customers never see it, they only see the day their order comes.
function EveningLimit() {
  const { data } = useData(getPrivateSettings)
  const [value, setValue] = useState('')
  const [msg, setMsg] = useState('')
  if (!data) return null
  const save = async (e) => {
    e.preventDefault()
    setMsg('')
    try {
      await savePrivateSettings({ daily_order_cap: value || data.daily_order_cap })
      setMsg('Saved!')
    } catch (err) {
      setMsg(err.message)
    }
  }
  return (
    <form onSubmit={save} className={`${lcard} space-y-2 p-4`}>
      <h2 className="font-bold">Orders per evening <span className="ml-1 rounded bg-neutral-900 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">Private</span></h2>
      <p className="text-sm text-neutral-500">
        When an evening has this many orders, new orders go to the next day. Customers only see "We are facing heavy
        traffic today, so we will deliver your order tomorrow". The number is never shown to them.
      </p>
      {!data.ready && !DEMO_MODE && <p className="text-xs text-orange-700">Run supabase/migrations/014_private_cap.sql first.</p>}
      <div className="flex items-center gap-2">
        <input type="number" min="1" value={value || data.daily_order_cap} onChange={(e) => setValue(e.target.value)} className={`${lfieldBase} h-11 w-28`} />
        <button type="submit" className={`${lbtnDark} h-11`}>Save</button>
        {msg && <span className={`text-sm ${msg === 'Saved!' ? 'text-green-700' : 'text-red-600'}`}>{msg}</span>}
      </div>
    </form>
  )
}

// Costs of one delivered order (update 034): the rider's pay with petrol, and the bag. They are taken off
// the profit on each order and in the daily summary. Private like the evening limit.
function CostsPerOrder() {
  const { data } = useData(getCostRules)
  const [v, setV] = useState(null)
  const [msg, setMsg] = useState('')
  if (!data) return null
  const form = v ?? data
  const set = (k) => (e) => setV({ ...form, [k]: e.target.value })
  const save = async (e) => {
    e.preventDefault()
    setMsg('')
    try {
      await saveCostRules(form)
      setV(null)
      setMsg('Saved!')
    } catch (err) {
      setMsg(err.message)
    }
  }
  return (
    <form onSubmit={save} className={`${lcard} space-y-3 p-4`}>
      <h2 className="font-bold">Costs per order <span className="ml-1 rounded bg-neutral-900 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">Private</span></h2>
      <p className="text-sm text-neutral-500">What one delivered order costs you besides the items: the rider's pay (petrol included) and the bag. Used for "Your profit" on each order and in the daily summary.</p>
      {!data.ready && !DEMO_MODE && <p className="text-xs text-orange-700">Run supabase/migrations/034_buy_prices.sql first.</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label={`Rider, up to ${form.rider_far_km} km (₹)`}><input type="number" min="0" step="0.5" value={form.rider_pay_near} onChange={set('rider_pay_near')} className={lfield} /></Field>
        <Field label="Rider, farther (₹)"><input type="number" min="0" step="0.5" value={form.rider_pay_far} onChange={set('rider_pay_far')} className={lfield} /></Field>
        <Field label="Near means up to (km)"><input type="number" min="0.5" step="0.5" value={form.rider_far_km} onChange={set('rider_far_km')} className={lfield} /></Field>
        <Field label="Bag / packing (₹)"><input type="number" min="0" step="0.5" value={form.packing_cost} onChange={set('packing_cost')} className={lfield} /></Field>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" className={`${lbtnDark} h-11`}>Save</button>
        {msg && <span className={`text-sm ${msg === 'Saved!' ? 'text-green-700' : 'text-red-600'}`}>{msg}</span>}
      </div>
    </form>
  )
}

const ROLES = [['rider', 'Rider'], ['executive', 'Executive'], ['collector', 'Price collector']]

// The team: riders log in on /partner, executives on /executive (the order desk, update 032).
// Each has their own email + password. "Remove access" locks them out at once.
function Riders() {
  const { data: riders, error: loadError } = useData(adminListRiders)
  const [form, setForm] = useState({ email: '', name: '', phone: '', role: 'rider' })
  const [error, setError] = useState('')
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  // Deactivate: the login stops working everywhere at once (the database checks "active" on every action).
  const toggleActive = (r) => {
    const place = r.role === 'executive' ? 'the dashboard' : 'the rider page'
    if (r.active && !window.confirm(`Deactivate ${r.name}? They can't open ${place} until you activate them again.`)) return
    setRiderActive(r.user_id, !r.active).catch((err) => setError(err.message))
  }

  const add = async (e) => {
    e.preventDefault()
    setError('')
    try {
      await adminAddRider(form)
      setForm({ email: '', name: '', phone: '', role: 'rider' })
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <section className={`${lcard} space-y-3 p-4`}>
      <div>
        <h2 className="font-bold">Team (executives and riders)</h2>
        <p className="text-sm text-neutral-500">
          <b>Executive</b> opens <b>{window.location.host}/executive</b>: orders, customers, WhatsApp, stock, carts. Never settings,
          payments, Jholzo Money, prices or deleting. <b>Rider</b> opens <b>{window.location.host}/partner</b>: only the orders
          assigned to them. <b>Price collector</b> opens <b>{window.location.host}/collect</b>: photos, MRP and wholesaler prices
          (Wholesale prices in the menu). <b>Deactivate</b> locks someone out at once; <b>Activate</b> gives the access back.
          {!DEMO_MODE && ' First create their login in Supabase → Authentication → Users → Add user (tick Auto confirm), then add the same email here.'}
        </p>
      </div>
      {loadError && <p className="rounded-xl bg-orange-50 p-3 text-xs text-orange-800">Run supabase/migrations/003_partners.sql in the Supabase SQL Editor first.</p>}
      {riders?.length > 0 && (
        <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">
          {riders.map((r) => (
            <li key={r.user_id} className={`flex items-center gap-3 px-3 py-2.5 ${r.active ? '' : 'opacity-50'}`}>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 font-semibold">
                  {r.name}
                  <span className={`rounded px-1.5 text-[11px] font-bold uppercase ${r.role === 'executive' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'}`}>{ROLES.find(([k]) => k === r.role)?.[1] ?? 'Rider'}</span>
                </span>
                <span className="block truncate text-xs text-neutral-500">{r.email}{r.phone ? ` · ${r.phone}` : ''}</span>
              </span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${r.active ? 'bg-green-100 text-green-800' : 'bg-neutral-200 text-neutral-600'}`}>
                {r.active ? 'Active' : 'Deactivated'}
              </span>
              <button type="button" onClick={() => toggleActive(r)} className={`${r.active ? lbtnDanger : lbtnOutline} min-h-9 text-sm`}>
                {r.active ? 'Deactivate' : 'Activate'}
              </button>
            </li>
          ))}
        </ul>
      )}
      <AutoRider riders={riders ?? []} />
      <form onSubmit={add} className="grid gap-2 sm:grid-cols-[1.4fr_1fr_1fr_auto_auto]">
        <input type="email" required placeholder="Login email" value={form.email} onChange={set('email')} className={lfield} />
        <input required placeholder="Name" value={form.name} onChange={set('name')} className={lfield} />
        <input inputMode="numeric" placeholder="Phone" value={form.phone} onChange={set('phone')} className={lfield} />
        <select value={form.role} onChange={set('role')} aria-label="Role" className={lfieldBase}>
          {ROLES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        <button type="submit" className={lbtnDark}><UserPlus size={17} /> Add</button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  )
}

// Every new order goes to this rider by themselves (update 039); picking one also hands them the open orders.
function AutoRider({ riders }) {
  const { data: current, reload } = useData(getAutoRider)
  const [msg, setMsg] = useState('')
  const options = riders.filter((r) => (r.role ?? 'rider') === 'rider' && (r.active || r.user_id === current))
  if (current === null && !DEMO_MODE) {
    return <p className="rounded-xl bg-orange-50 p-3 text-xs text-orange-800">Automatic assigning: run supabase/migrations/039_auto_assign.sql first.</p>
  }
  if (current === undefined) return null
  const pick = async (e) => {
    const id = e.target.value
    const name = riders.find((r) => r.user_id === id)?.name
    setMsg('')
    try {
      const n = await setAutoRider(id)
      setMsg(id ? `New orders now go to ${name}.${n ? ` ${n} open order${n === 1 ? '' : 's'} given to them now.` : ''}` : 'New orders are assigned by hand again.')
      reload()
    } catch (err) {
      setMsg(err.message)
    }
  }
  return (
    <div className="rounded-xl border border-neutral-200 p-3">
      <label className="flex flex-wrap items-center gap-2 text-sm font-semibold">
        New orders go to
        <select value={current ?? ''} onChange={pick} className={`${lfieldBase} h-10 min-w-40 flex-1`}>
          <option value="">Nobody (assign each order by hand)</option>
          {options.map((r) => <option key={r.user_id} value={r.user_id}>{r.name}</option>)}
        </select>
      </label>
      <p className="mt-1 text-xs text-neutral-500">Every new order (today's or tomorrow's) is assigned to this rider by itself. Picking someone also gives them all open orders not on their way yet. Only riders are listed: executives can't deliver orders.</p>
      {msg && <p className="mt-1 text-sm text-green-700">{msg}</p>}
    </div>
  )
}

function SettingsForm({ store }) {
  const [v, setV] = useState({ ...store, whatsapp: store.whatsapp.slice(-10) })
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [locMsg, setLocMsg] = useState('')
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value })
  const fetchMyLocation = async () => {
    setLocMsg('')
    try {
      setV({ ...v, location: await currentPosition() })
      setLocMsg('Location found. Check the pin and tap Save.')
    } catch (err) {
      setLocMsg(err.message)
    }
  }
  // Example charges with the numbers typed so far (before saving).
  const dr = deliveryRules(v)
  const slabsReady = v.mid_order_fee !== undefined || DEMO_MODE // after update 018
  // Place name of the delivery center pin.
  const [centerName, setCenterName] = useState('')
  useEffect(() => {
    let live = true
    placeName(v.location).then((n) => live && setCenterName(n))
    return () => {
      live = false
    }
  }, [v.location])
  const packs = { ...v, ...Object.fromEntries(['pack_fee_low', 'pack_fee_mid', 'pack_fee_high', 'pack_mid_from', 'pack_high_from'].map((k) => [k, Number(v[k]) || 0])) }

  const save = async (e) => {
    e.preventDefault()
    setMsg('')
    setError('')
    try {
      await saveStore(v)
      setMsg('Saved!')
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <section className={`${lcard} space-y-3 p-4`}>
        <h2 className="font-bold">Store</h2>
        <Field label="Store name"><input required value={v.name} onChange={set('name')} className={lfield} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone (customers call)"><input required inputMode="numeric" value={v.phone} onChange={set('phone')} className={lfield} /></Field>
          <Field label="WhatsApp"><input required inputMode="numeric" value={v.whatsapp} onChange={set('whatsapp')} className={lfield} /></Field>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 p-3">
          <span className="text-sm">
            <b>Show "Powered by {LEGAL.COMPANY}"</b>
            <span className="block text-neutral-500">Under the logo and on the PDF bill. The footer always shows "{LEGAL.GROUP_LINE}".</span>
            {v.show_powered_by === undefined && !DEMO_MODE && <span className="mt-1 block text-xs text-orange-700">Run supabase/migrations/010_powered_by.sql first.</span>}
          </span>
          {(v.show_powered_by !== undefined || DEMO_MODE) && (
            <Toggle checked={v.show_powered_by !== false} onChange={(on) => setV({ ...v, show_powered_by: on })} label="Show Powered by" />
          )}
        </div>
      </section>

      <section className={`${lcard} space-y-3 p-4`}>
        <h2 className="font-bold">Timing & delivery</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Order cut-off" hint="Orders before this go today, later ones tomorrow"><input type="time" value={v.cutoff_time} onChange={set('cutoff_time')} className={lfield} /></Field>
          <div />
          <Field label="Delivery starts"><input type="time" value={v.slot_start} onChange={set('slot_start')} className={lfield} /></Field>
          <Field label="Delivery ends"><input type="time" value={v.slot_end} onChange={set('slot_end')} className={lfield} /></Field>
          <Field label="Minimum order (₹)"><input type="number" min="0" value={v.min_order} onChange={set('min_order')} className={lfield} /></Field>
          <div />
        </div>
      </section>

      <section className={`${lcard} space-y-3 p-4`}>
        <h2 className="font-bold">Delivery area and delivery charge</h2>
        <p className="text-sm text-neutral-500">The delivery center is where distance is counted from (your home in Shantipur, Dergaon). Drag the pin or tap the map to move it, then Save. Distance only decides whether we deliver; the charge comes from the order value.</p>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm">
            <b>Delivery center:</b> {centerName || 'Pinned on map'}
            <span className="block text-xs text-neutral-500">{v.location.lat.toFixed(5)}, {v.location.lng.toFixed(5)}</span>
          </span>
          <button type="button" onClick={fetchMyLocation} className={`${lbtnDark} min-h-9 text-sm`}><LocateFixed size={16} /> Use my current location</button>
        </div>
        {locMsg && <p className="text-xs text-neutral-600">{locMsg}</p>}
        <LocationPicker value={v.location} onChange={(location) => setV({ ...v, location })} start={v.location} radiusKm={v.max_delivery_km} className="h-72" />
        <p className="flex items-center gap-2 text-xs text-neutral-600">
          <span className="inline-block h-3 w-3 shrink-0 rounded-full border-2 border-dashed border-[#1F6B3A] bg-[#5FA63F]/20" />
          Green circle = where we deliver: up to {v.max_delivery_km || 0} km by road (about {Math.round(((Number(v.max_delivery_km) || 0) / CONFIG.ROAD_FACTOR) * 10) / 10} km straight on the map, since roads bend).
        </p>
        <HouseCount point={v.location} km={Number(v.max_delivery_km) || 0} />
        <Field label="Deliver up to (km)" hint="Zone 1 = 4 · Zone 2 = 8 · Zone 3 = 12 · the circle changes as you type"><input type="number" min="1" value={v.max_delivery_km} onChange={set('max_delivery_km')} className={lfield} /></Field>

        <h3 className="pt-2 font-bold">Evening delivery ({v.slot_start}–{v.slot_end}) by order value</h3>
        {!slabsReady && <p className="text-xs text-orange-700">Run supabase/migrations/018_delivery_express.sql first.</p>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Small order: items below ₹"><input type="number" min="0" value={v.small_order_below ?? 99} onChange={set('small_order_below')} className={lfield} /></Field>
          <Field label="…pays delivery ₹"><input type="number" min="0" value={v.small_order_fee ?? 40} onChange={set('small_order_fee')} className={lfield} /></Field>
          <Field label="FREE delivery from ₹"><input type="number" min="0" disabled={!slabsReady} value={v.free_delivery_above ?? 299} onChange={set('free_delivery_above')} className={lfield} /></Field>
          <Field label="In between pays ₹"><input type="number" min="0" disabled={!slabsReady} value={v.mid_order_fee ?? 11} onChange={set('mid_order_fee')} className={lfield} /></Field>
        </div>
        <p className="rounded-xl bg-neutral-100 p-3 text-sm">
          Below {rupee(dr.smallBelow)} → {rupee(dr.smallFee)} · {rupee(dr.smallBelow)}–{rupee(dr.freeAbove - 1)} → {v.free_delivery ? 'FREE (launch offer)' : rupee(dr.midFee)} · {rupee(dr.freeAbove)}+ → FREE
          <span className="block text-xs text-neutral-500">Evening orders go in one round, so each costs you about ₹4–5 in petrol. Customers see "Add ₹X more for FREE delivery".</span>
        </p>

        <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-start justify-between gap-3">
            <span className="text-sm">
              <b>⚡ Express delivery</b>
              <span className="block text-neutral-600">Customers can pay extra to get the order within the time below, only between the Express hours. At other times orders go to the evening slot. Switch it on only when a rider is free.</span>
            </span>
            {slabsReady && <Toggle checked={!!v.express_on} onChange={(on) => setV({ ...v, express_on: on })} label="Express delivery" />}
          </div>
          {slabsReady && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Express charge ₹ (extra)"><input type="number" min="0" value={v.express_fee ?? 40} onChange={set('express_fee')} className={lfield} /></Field>
              <Field label="Delivered within (minutes)"><input type="number" min="15" max="240" value={v.express_minutes ?? 60} onChange={set('express_minutes')} className={lfield} /></Field>
              {v.express_from !== undefined || DEMO_MODE ? (
                <>
                  <Field label="Express from"><input type="time" value={v.express_from ?? '10:00'} onChange={set('express_from')} className={lfield} /></Field>
                  <Field label="Express until"><input type="time" value={v.express_until ?? '16:00'} onChange={set('express_until')} className={lfield} /></Field>
                </>
              ) : !DEMO_MODE && <p className="col-span-2 text-xs text-orange-700">Run supabase/migrations/027_express_hours.sql to set Express hours (10 AM – 4 PM).</p>}
            </div>
          )}
          <p className="text-xs text-neutral-600">A one-off trip costs about ₹40–50 (petrol + your time), so keep the charge near that.</p>
        </div>

        <div className="flex items-start justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <span className="text-sm">
            <b>Free delivery (launch offer)</b>
            <span className="block text-neutral-600">Makes the in-between slab FREE too (small orders still pay). Customers see the usual charge struck out and "FREE". Turn it off later and Save.</span>
            {v.free_delivery === undefined && !DEMO_MODE && <span className="mt-1 block text-xs text-orange-700">Run supabase/migrations/005_free_delivery.sql first.</span>}
          </span>
          {(v.free_delivery !== undefined || DEMO_MODE) && (
            <Toggle checked={!!v.free_delivery} onChange={(on) => setV({ ...v, free_delivery: on })} label="Free delivery" />
          )}
        </div>
      </section>

      <section className={`${lcard} space-y-3 p-4`}>
        <h2 className="font-bold">Packaging charge (by order value)</h2>
        <p className="text-sm text-neutral-500">Added to every order, based on the items total. Customers see it as "Packaging charge".</p>
        <div className="grid grid-cols-3 gap-3">
          <Field label={`Below ₹${packs.pack_mid_from}`}><input type="number" min="0" step="0.01" value={v.pack_fee_low} onChange={set('pack_fee_low')} className={lfield} /></Field>
          <Field label={`₹${packs.pack_mid_from} – ₹${packs.pack_high_from - 1}`}><input type="number" min="0" step="0.01" value={v.pack_fee_mid} onChange={set('pack_fee_mid')} className={lfield} /></Field>
          <Field label={`₹${packs.pack_high_from} and above`}><input type="number" min="0" step="0.01" value={v.pack_fee_high} onChange={set('pack_fee_high')} className={lfield} /></Field>
          <Field label="Middle slab starts at ₹"><input type="number" min="0" value={v.pack_mid_from} onChange={set('pack_mid_from')} className={lfield} /></Field>
          <Field label="Top slab starts at ₹"><input type="number" min="0" value={v.pack_high_from} onChange={set('pack_high_from')} className={lfield} /></Field>
        </div>
        <p className="rounded-xl bg-neutral-100 p-3 text-sm">
          Example: ₹300 order → {rupee(packagingFee(packs, 300))} · ₹650 → {rupee(packagingFee(packs, 650))} · ₹1200 → {rupee(packagingFee(packs, 1200))}
        </p>
      </section>

      <section className={`${lcard} space-y-3 p-4`}>
        <div className="flex items-start justify-between gap-3">
          <span className="text-sm">
            <b className="text-base">Refer & earn · Jholzo Money</b>
            <span className="block text-neutral-500">
              Every customer gets an invite code after their first order. When a new friend's first order is delivered, both get money in
              their Jholzo Money wallet. It is used at checkout, up to the limit per order. Cancelled orders give the used money back.
            </span>
            {v.referral_on === undefined && !DEMO_MODE && <span className="mt-1 block text-xs text-orange-700">Run supabase/migrations/017_wallet_referral.sql first.</span>}
          </span>
          {(v.referral_on !== undefined || DEMO_MODE) && (
            <Toggle checked={v.referral_on !== false} onChange={(on) => setV({ ...v, referral_on: on })} label="Refer and earn" />
          )}
        </div>
        {(v.referral_on !== undefined || DEMO_MODE) && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Inviter gets ₹"><input type="number" min="0" value={v.referrer_reward ?? 30} onChange={set('referrer_reward')} className={lfield} /></Field>
              <Field label="New friend gets ₹"><input type="number" min="0" value={v.friend_reward ?? 20} onChange={set('friend_reward')} className={lfield} /></Field>
              <Field label="Friend's first order at least ₹" hint="Items total, before delivery and packaging"><input type="number" min="0" value={v.referral_min_order ?? 200} onChange={set('referral_min_order')} className={lfield} /></Field>
              <Field label="Wallet use per order up to ₹"><input type="number" min="0" value={v.wallet_max_per_order ?? 50} onChange={set('wallet_max_per_order')} className={lfield} /></Field>
            </div>
            <p className="rounded-xl bg-neutral-100 p-3 text-sm">
              Cost per new customer: ₹{(Number(v.referrer_reward ?? 30) || 0) + (Number(v.friend_reward ?? 20) || 0)}, paid only after their first order is delivered.
              <span className="block text-xs text-neutral-500">Codes can't be used on your own number, from the inviter's phone, or after the first order. Add or take back money by hand in Customers.</span>
            </p>
          </>
        )}
      </section>

      <section className={`${lcard} space-y-3 p-4`}>
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm">
          <b>Phone OTP for new phones</b>
          <span className="block text-neutral-500">
            The first time a number orders (or logs in to "My orders") on a phone, we send a 4-digit SMS code. After that
            it is not asked again on that phone. Turn on only after the SMS account (MSG91) and the phone-otp
            function are set up (supabase/README.md), or customers can't order.
          </span>
          {v.otp_required === undefined && !DEMO_MODE && <span className="mt-1 block text-xs text-orange-700">Run supabase/migrations/016_phone_otp.sql first.</span>}
        </span>
        {(v.otp_required !== undefined || DEMO_MODE) && (
          <Toggle checked={!!v.otp_required} onChange={(on) => setV({ ...v, otp_required: on, otp_auto_off: false })} label="Phone OTP" />
        )}
      </div>
        {v.otp_auto_off && !v.otp_required && (
          <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">
            OTP switched itself off because SMS could not be sent (balance over or service down). Customers are ordering without OTP.
            Recharge the SMS account (MSG91), then turn it on again and Save.
          </p>
        )}
        {v.otp_credits_left !== undefined && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="OTP credits left" hint="Type the number after each recharge. Each SMS takes one off.">
              <input type="number" min="0" value={v.otp_credits_left ?? ''} onChange={set('otp_credits_left')} placeholder="Not counting" className={lfield} />
            </Field>
            <Field label="Warn me on Telegram at" hint="Also at 10 and at 0">
              <input type="number" min="1" value={v.otp_alert_at ?? 50} onChange={set('otp_alert_at')} className={lfield} />
            </Field>
          </div>
        )}
      </section>

      {(v.upi_id !== undefined || DEMO_MODE) && (
        <section className={`${lcard} space-y-3 p-4`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-bold">Payments: "Pay now by UPI"</h2>
              <p className="text-sm text-neutral-500">
                Customers pay to this UPI ID from GPay, PhonePe or Paytm, then enter the UPI Ref No. You confirm it on the
                admin home page ("Payments to check"). Leave the UPI ID empty to switch "Pay now" off.
              </p>
            </div>
            {v.upi_on !== undefined && (
              <Toggle checked={v.upi_on !== false} onChange={(on) => setV({ ...v, upi_on: on })} label="UPI payments" />
            )}
          </div>
          {v.upi_on === false && (
            <p className="rounded-xl bg-orange-50 p-3 text-sm text-orange-800">
              <b>UPI is off.</b> Checkout shows "Pay now by UPI" as temporarily unavailable and customers choose Cash on
              Delivery for any amount. The rider page hides "Show QR". Save changes to apply.
            </p>
          )}
          {v.upi_on === undefined && !DEMO_MODE && (
            <p className="rounded-xl bg-orange-50 p-3 text-xs text-orange-800">UPI on/off: run supabase/migrations/037_auto_confirm.sql in the Supabase SQL Editor first.</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Your UPI ID" hint="e.g. yourname@okaxis"><input value={v.upi_id ?? ''} onChange={set('upi_id')} placeholder="name@bank" className={lfield} /></Field>
            <Field label="Name shown in the UPI app"><input value={v.upi_name ?? ''} onChange={set('upi_name')} placeholder="Jholzo" className={lfield} /></Field>
            <Field label="Cash on delivery up to ₹" hint="Bigger orders pay online first (while UPI is on)"><input type="number" min="0" value={v.cod_limit ?? 350} onChange={set('cod_limit')} className={lfield} /></Field>
            {v.upi_pay_minutes !== undefined ? (
              <Field label="Time to pay (minutes)" hint="Not paid by then: the order is cancelled. 5 to 120."><input type="number" min="5" max="120" value={v.upi_pay_minutes} onChange={set('upi_pay_minutes')} className={lfield} /></Field>
            ) : (
              <p className="self-end text-xs text-orange-700">Pay timer: run supabase/migrations/023_upi_pay_timer.sql first.</p>
            )}
          </div>
        </section>
      )}

      <section className={`${lcard} space-y-3 p-4`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-bold">Automatic WhatsApp messages</h2>
            <p className="text-sm text-neutral-500">
              When on, customers get "Order placed", "Rider on the way" and "Arriving soon" on WhatsApp without anyone tapping Send.
              Needs the WhatsApp Cloud API set up first (supabase/README.md). When off, the rider page opens WhatsApp with the message ready.
            </p>
          </div>
          {v.whatsapp_auto !== undefined && !DEMO_MODE && (
            <Toggle checked={!!v.whatsapp_auto} onChange={(on) => setV({ ...v, whatsapp_auto: on })} label="Automatic WhatsApp messages" />
          )}
        </div>
        {DEMO_MODE ? (
          <p className="rounded-xl bg-neutral-100 p-3 text-xs text-neutral-600">Demo mode cannot send messages by itself.</p>
        ) : v.whatsapp_auto === undefined && (
          <p className="rounded-xl bg-orange-50 p-3 text-xs text-orange-800">Run supabase/migrations/003_partners.sql in the Supabase SQL Editor to use this.</p>
        )}
      </section>

      <section className={`${lcard} space-y-3 p-4`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-bold">Riders can confirm new orders</h2>
            <p className="text-sm text-neutral-500">
              Off: only you and the executive confirm (after calling the customer). Turn it on for days without an executive:
              a rider can then call and confirm the new orders assigned to them.
            </p>
          </div>
          {v.riders_confirm !== undefined && (
            <Toggle checked={!!v.riders_confirm} onChange={(on) => setV({ ...v, riders_confirm: on })} label="Riders can confirm new orders" />
          )}
        </div>
        {v.riders_confirm === undefined && (
          <p className="rounded-xl bg-orange-50 p-3 text-xs text-orange-800">Run supabase/migrations/032_team.sql in the Supabase SQL Editor to use this.</p>
        )}
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {msg && <p className="text-sm font-semibold text-green-700">{msg}</p>}
      <button type="submit" className={`${lbtnDark} h-12 w-full`}>Save changes</button>
    </form>
  )
}

// How many buildings are mapped inside the delivery circle (OpenStreetMap), counted when tapped.
function HouseCount({ point, km }) {
  const [state, setState] = useState({ busy: false, error: '' })
  const [, refresh] = useState(0)
  const saved = point && km > 0 ? savedHouseCount(point.lat, point.lng, km) : null
  const count = async () => {
    setState({ busy: true, error: '' })
    try {
      await countHouses(point.lat, point.lng, km)
      setState({ busy: false, error: '' })
      refresh((n) => n + 1)
    } catch (err) {
      setState({ busy: false, error: err.message })
    }
  }
  if (!point || !(km > 0)) return null
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
      <Home size={20} className="shrink-0 text-[#1F6B3A]" />
      <span className="min-w-0 flex-1 text-sm">
        {saved ? (
          <>
            <b className="text-lg">~{saved.total.toLocaleString('en-IN')}</b> buildings in this circle
            <span className="block text-xs text-neutral-500">Mapped on OpenStreetMap. Many village homes are not mapped yet, so real homes are more.</span>
          </>
        ) : (
          <span className="text-neutral-600">How many homes are inside this circle?</span>
        )}
        {state.error && <span className="block text-xs text-red-600">{state.error}</span>}
      </span>
      <button type="button" onClick={count} disabled={state.busy} className={`${lbtnOutline} min-h-9 px-3 text-sm`}>
        {state.busy ? 'Counting…' : saved ? 'Count again' : 'Count homes'}
      </button>
    </div>
  )
}

export default function AdminSettings() {
  const { data: store } = useData(getStore)
  if (!store) return null
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-black">Settings</h1>
      <SettingsForm store={store} />
      <EveningLimit />
      <CostsPerOrder />
      <Riders />
      {DEMO_MODE && (
        <button type="button" onClick={() => window.confirm('Reset all demo data?') && resetDemo()} className={`${lbtnDanger} w-full`}>
          Reset demo data
        </button>
      )}
    </div>
  )
}
