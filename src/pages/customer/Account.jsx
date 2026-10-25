import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ChevronRight, LogOut, MapPin, Package, Pencil, Phone, RotateCcw } from 'lucide-react'
import TopBar from '../../components/TopBar.jsx'
import Footer from '../../components/Footer.jsx'
import LocationSheet from '../../components/LocationSheet.jsx'
import { WhatsAppIcon } from '../../components/icons.jsx'
import { btnAccent, btnOutline, card, cx, field } from '../../components/ui.js'
import { currentCustomer, customerSignOut, getStore, listProducts, myComplaints, ordersByPhone, updateMyName } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { useCart } from '../../lib/cart-context.js'
import { saveDetails, useSavedDelivery } from '../../lib/customerLocation.js'
import { deliveryQuote } from '../../lib/delivery.js'
import { dayLabel, fmtDateTime, itemsText, rupee, statusLabel } from '../../lib/format.js'
import { waLink } from '../../lib/whatsapp.js'

const STATUS_STYLE = {
  placed: 'bg-accent text-ink', confirmed: 'bg-blue-500/20 text-blue-200',
  completed: 'bg-green-500/20 text-green-300', cancelled: 'bg-white/10 text-muted',
}

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
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent text-2xl font-black uppercase text-ink">
        {(me.name || '?').trim().charAt(0)}
      </span>
      <div className="min-w-0 flex-1">
        {editing ? (
          <form onSubmit={save} className="flex gap-2">
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className={`${field} h-10`} />
            <button type="submit" className="h-10 shrink-0 rounded-xl bg-accent px-3 text-sm font-bold text-ink">Save</button>
          </form>
        ) : (
          <button type="button" onClick={() => setEditing(true)} className="flex items-center gap-2 text-left text-lg font-bold">
            {me.name || 'Add your name'} <Pencil size={15} className="text-muted" />
          </button>
        )}
        {error && <p className="text-xs text-red-300">{error}</p>}
        <p className="text-sm text-muted">+91 {me.phone}</p>
      </div>
    </section>
  )
}

function SavedAddress({ store }) {
  const { location, details } = useSavedDelivery()
  const [open, setOpen] = useState(false)
  const [address, setAddress] = useState(details.address ?? '')
  const [area, setArea] = useState(details.area ?? '')
  const [saved, setSaved] = useState(false)
  const quote = location ? deliveryQuote(store, location) : null

  const save = (e) => {
    e.preventDefault()
    saveDetails({ address: address.trim(), area })
    setSaved(true)
  }

  return (
    <section className={`${card} p-4`}>
      <h2 className="font-bold">Delivery address</h2>
      <button type="button" onClick={() => setOpen(true)} className="mt-3 flex w-full items-center gap-3 rounded-xl border border-line p-3 text-left">
        <MapPin size={22} className={location ? 'text-accent' : 'text-muted'} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{location ? location.label || 'Pinned on map' : 'No location set'}</span>
          <span className="block text-xs text-muted">
            {quote ? (quote.tooFar ? `${quote.km} km · outside delivery area` : `${quote.km} km away · delivery fee ${rupee(quote.fee)}`) : 'Choose your location on the map'}
          </span>
        </span>
        <span className="text-sm font-semibold text-accent">{location ? 'Change' : 'Set'}</span>
      </button>
      <form onSubmit={save} className="mt-3 space-y-2">
        <input value={address} onChange={(e) => { setAddress(e.target.value); setSaved(false) }} placeholder="House no., landmark (e.g. near the Namghar)" className={field} />
        <select value={area} onChange={(e) => { setArea(e.target.value); setSaved(false) }} className={field}>
          <option value="">Choose area</option>
          {store.delivery_area.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <button type="submit" className={`${btnOutline} w-full`}>{saved ? 'Saved ✓' : 'Save address'}</button>
      </form>
      <p className="mt-2 text-xs text-muted">This address is filled in automatically at checkout.</p>
      {open && <LocationSheet store={store} onClose={() => setOpen(false)} />}
    </section>
  )
}

// "My account": profile, saved address and location, orders (with reorder), complaints, help.
export default function Account() {
  const navigate = useNavigate()
  const me = currentCustomer()
  const { setQty } = useCart()
  const { data: store } = useData(getStore)
  const { data: products = [] } = useData(listProducts)
  const { data: orders = [] } = useData(() => (me ? ordersByPhone(me.phone) : []), [me?.phone])
  const { data: complaints = [] } = useData(myComplaints, [me?.phone])
  const [note, setNote] = useState('')

  if (!me) return <Navigate to="/login?next=/account" replace />
  if (!store) return null

  // Adds the items of a past order to the cart again (skipping ones that are out of stock).
  const reorder = (o) => {
    let added = 0
    for (const i of o.items) {
      const p = products.find((x) => x.id === i.product_id)
      if (p?.available) {
        setQty(p.id, i.quantity)
        added++
      }
    }
    if (added) navigate('/cart')
    else setNote('Items from this order are not available right now.')
  }

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-10 pt-4">
      <TopBar />
      <h1 className="mt-5 text-3xl font-black">My account</h1>

      <div className="mt-4 space-y-4">
        <Profile me={me} />
        <SavedAddress store={store} />

        <section>
          <h2 className="text-lg font-bold">My orders ({orders.length})</h2>
          {note && <p className="mt-1 text-sm text-orange-300">{note}</p>}
          <div className="mt-2 space-y-3">
            {orders.map((o) => (
              <div key={o.id} className={`${card} p-4`}>
                <Link to={`/track/${o.order_number}`} className="flex items-center gap-3">
                  <Package size={24} className="shrink-0 text-muted" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 font-bold">
                      #{o.order_number}
                      <span className={cx('rounded-full px-2 py-0.5 text-xs font-bold', STATUS_STYLE[o.status])}>{statusLabel(o.status)}</span>
                    </span>
                    <span className="block text-sm text-muted">{fmtDateTime(o.created_at)} · {itemsText(o.item_count)}</span>
                    <span className="block text-sm text-muted">Delivery {dayLabel(o.delivery_date)}</span>
                  </span>
                  <span className="font-bold">{rupee(o.total)}</span>
                  <ChevronRight size={18} className="text-muted" />
                </Link>
                <p className="mt-2 line-clamp-1 text-xs text-muted">{o.items.map((i) => `${i.name_snapshot} ×${i.quantity}`).join(', ')}</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => reorder(o)} className={`${btnOutline} min-h-10 text-sm`}><RotateCcw size={16} /> Order again</button>
                  <Link to={`/report/${o.order_number}`} className={`${btnOutline} min-h-10 text-sm`}>Report problem</Link>
                </div>
              </div>
            ))}
            {!orders.length && (
              <div className={`${card} py-8 text-center`}>
                <p className="text-muted">No orders yet.</p>
                <Link to="/" className={`${btnAccent} mx-auto mt-4 max-w-60`}>Start shopping</Link>
              </div>
            )}
          </div>
        </section>

        {complaints.length > 0 && (
          <section>
            <h2 className="text-lg font-bold">My complaints</h2>
            <div className="mt-2 space-y-2">
              {complaints.map((k) => (
                <Link key={k.id} to={`/track/${k.order_number}`} className={`${card} block p-3 text-sm`}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">#{k.order_number} · {k.type}</span>
                    <span className={cx('rounded-full px-2 py-0.5 text-xs font-bold', k.status === 'open' ? 'bg-orange-500/20 text-orange-300' : 'bg-green-500/20 text-green-300')}>
                      {k.status === 'open' ? 'Looking into it' : 'Solved'}
                    </span>
                  </div>
                  {k.admin_note && <p className="mt-1 text-accent">Reply: {k.admin_note}</p>}
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className={`${card} p-4`}>
          <h2 className="font-bold">Help</h2>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <a href={`tel:${store.phone}`} className={`${btnOutline} min-h-10 text-sm`}><Phone size={16} /> Call us</a>
            <a href={waLink(store.whatsapp, `Hello Dergaon Hub, I'm writing from +91 ${me.phone}.`)} target="_blank" rel="noreferrer" className={`${btnOutline} min-h-10 text-sm`}>
              <WhatsAppIcon size={16} /> WhatsApp
            </a>
          </div>
        </section>

        <button type="button" onClick={customerSignOut} className={`${btnOutline} w-full`}><LogOut size={18} /> Logout</button>
      </div>

      <Footer store={store} />
    </main>
  )
}
