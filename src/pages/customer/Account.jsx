import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { ChevronRight, Gift, LogOut, MapPin, Package, Pencil, WalletMinimal } from 'lucide-react'
import TopBar from '../../components/TopBar.jsx'
import BottomNav from '../../components/BottomNav.jsx'
import Footer from '../../components/Footer.jsx'
import LocationSheet from '../../components/LocationSheet.jsx'
import { btnOutline, card, cx, field } from '../../components/ui.js'
import { HelpSupport } from '../../components/MyOrders.jsx'
import { currentCustomer, customerSignOut, getStore, myComplaints, myWallet, updateMyName } from '../../lib/store.js'
import { walletRules } from '../../lib/wallet.js'
import { useData } from '../../lib/useData.js'
import { saveDetails, useSavedDelivery } from '../../lib/customerLocation.js'
import { deliveryQuote } from '../../lib/delivery.js'
import { rupee } from '../../lib/format.js'

function Profile({ me }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(me.name ?? '')
  const [error, setError] = useState('')
  const save = async (e) => {
    e.preventDefault()
    try {
      await updateMyName(name)
      setEditing(false)
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }
  return (
    <section className={`${card} flex items-center gap-4 p-4`}>
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand text-2xl font-semibold uppercase text-white">
        {(me.name || '?').trim().charAt(0)}
      </span>
      <div className="min-w-0 flex-1">
        {editing ? (
          <form onSubmit={save} className="flex gap-2">
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className={`${field} h-10`} />
            <button type="submit" className="h-10 shrink-0 rounded-xl bg-brand px-3 text-sm font-semibold text-white">Save</button>
          </form>
        ) : (
          <button type="button" onClick={() => setEditing(true)} className="flex items-center gap-2 text-left text-lg font-semibold">
            {me.name || 'Add your name'} <Pencil size={15} className="text-muted" />
          </button>
        )}
        {error && <p className="text-xs text-red-700">{error}</p>}
        <p className="text-sm text-muted">+91 {me.phone}</p>
      </div>
    </section>
  )
}

function SavedAddress({ store }) {
  const { location, details } = useSavedDelivery()
  const [open, setOpen] = useState(false)
  const [address, setAddress] = useState(details.address ?? '')
  const [saved, setSaved] = useState(false)
  const quote = location ? deliveryQuote(store, location) : null

  const save = (e) => {
    e.preventDefault()
    saveDetails({ address: address.trim() })
    setSaved(true)
  }

  return (
    <section className={`${card} p-4`}>
      <h2 className="font-semibold">Delivery address</h2>
      <button type="button" onClick={() => setOpen(true)} className="mt-3 flex w-full items-center gap-3 rounded-xl border border-line p-3 text-left">
        <MapPin size={22} className={location ? 'text-brand' : 'text-muted'} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{location ? location.label || 'Pinned on map' : 'No location set'}</span>
          <span className="block text-xs text-muted">
            {quote ? (quote.tooFar ? 'Outside our delivery area for now' : 'We deliver here') : 'Choose your location on the map'}
          </span>
        </span>
        <span className="text-sm font-semibold text-brand">{location ? 'Change' : 'Set'}</span>
      </button>
      <form onSubmit={save} className="mt-3 space-y-2">
        <input value={address} onChange={(e) => { setAddress(e.target.value); setSaved(false) }} placeholder="House no., landmark (e.g. near the Namghar)" className={field} />
        <button type="submit" className={`${btnOutline} w-full`}>{saved ? 'Saved ✓' : 'Save address'}</button>
      </form>
      <p className="mt-2 text-xs text-muted">This address is filled in automatically at checkout.</p>
      {open && <LocationSheet store={store} onClose={() => setOpen(false)} />}
    </section>
  )
}

// "My account": profile, saved address and location, orders (with reorder), complaints, help.
export default function Account() {
  const me = currentCustomer()
  const { data: store } = useData(getStore)
  const { data: complaints = [] } = useData(myComplaints, [me?.phone])
  const { data: wallet } = useData(() => (me ? myWallet(me.phone) : null), [me?.phone])

  if (!me) return <Navigate to="/login?next=/account" replace />
  if (!store) return null

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-24 pt-4">
      <TopBar />
      <h1 className="mt-5 text-2xl font-semibold">My account</h1>

      <div className="mt-4 space-y-4">
        <Profile me={me} />
        {wallet && (
          <Link to="/wallet" className={`${card} flex items-center gap-3 p-4`}>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-mint text-brand"><WalletMinimal size={22} /></span>
            <span className="flex-1">
              <span className="block font-semibold">Jholzo Money · {rupee(wallet.locked ? 0 : wallet.balance)}</span>
              {walletRules(store).on && (
                <span className="flex items-center gap-1 text-[13px] text-brand"><Gift size={14} /> Refer & earn {rupee(walletRules(store).referrerReward)} per friend</span>
              )}
            </span>
            <ChevronRight size={20} className="text-muted" />
          </Link>
        )}
        <SavedAddress store={store} />

        <Link to="/track" className={`${card} flex items-center gap-3 p-4`}>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-mint text-brand"><Package size={22} /></span>
          <span className="flex-1 font-semibold">My orders</span>
          <ChevronRight size={20} className="text-muted" />
        </Link>

        {complaints.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold">My complaints</h2>
            <div className="mt-2 space-y-2">
              {complaints.map((k) => (
                <Link key={k.id} to={`/track/${k.order_number}`} className={`${card} block p-3 text-sm`}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">#{k.order_number} · {k.type}</span>
                    <span className={cx('rounded-full px-2 py-0.5 text-xs font-semibold', k.status === 'open' ? 'bg-orange-500/20 text-orange-700' : 'bg-green-500/20 text-green-700')}>
                      {k.status === 'open' ? 'Looking into it' : 'Solved'}
                    </span>
                  </div>
                  {k.admin_note && <p className="mt-1 text-brand">Reply: {k.admin_note}</p>}
                </Link>
              ))}
            </div>
          </section>
        )}

        <HelpSupport store={store} phone={me.phone} />

        <button type="button" onClick={customerSignOut} className={`${btnOutline} w-full`}><LogOut size={18} /> Logout</button>
      </div>

      <Footer store={store} />
      <BottomNav />
    </main>
  )
}
