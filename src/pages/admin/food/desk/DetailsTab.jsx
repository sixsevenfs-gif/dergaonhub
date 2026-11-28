import { useState } from 'react'
import { Clock, Handshake, LocateFixed, MapPin, MessageCircle, Phone, Plus, Receipt, StickyNote, Store, Trash2, UtensilsCrossed } from 'lucide-react'
import { store } from './store.js'
import { CUISINES, DAYS, DEALS, FOOD_TYPES, PAY_WHEN, waNumber } from './meta.js'
import { Area, Button, Chips, Field, Num, Section, Text, Toggle } from './ui.jsx'
import { CoverPhotos, SinglePhoto } from './Photos.jsx'

const QUICK_MINUTES = ['10', '15', '20', '30', '45']

export default function DetailsTab({ r, patch, toast, autoFocus, onDeleted }) {
  const [locating, setLocating] = useState(false)
  const [coverBusy, setCoverBusy] = useState(false)
  const [custom, setCustom] = useState('')
  const [deleting, setDeleting] = useState(false)
  const deal = DEALS.find((d) => d.id === r.deal_type)
  const extraCuisines = (r.cuisines || []).filter((c) => !CUISINES.includes(c))

  function locate() {
    if (!navigator.geolocation) return toast(new Error('This phone cannot share its location here.'))
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6))
        const lng = Number(pos.coords.longitude.toFixed(6))
        patch('lat', lat)
        patch('lng', lng)
        patch('maps_link', `https://maps.google.com/?q=${lat},${lng}`)
        setLocating(false)
        toast(`Location saved (about ${Math.round(pos.coords.accuracy)} m)`)
      },
      (err) => {
        setLocating(false)
        toast(new Error(err.code === 1 ? 'Location is blocked. Allow location for this site in the browser settings.' : 'Could not get the location. Try again outside.'))
      },
      { enableHighAccuracy: true, timeout: 15000 },
    )
  }

  // Update 075: several cover photos. Before it the database has only cover_photo (one photo, as before).
  const many = r.cover_photos !== undefined
  const covers = many ? (r.cover_photos?.length ? r.cover_photos : r.cover_photo ? [r.cover_photo] : []) : []
  const saveCovers = (list) => {
    patch('cover_photos', list)
    patch('cover_photo', list[0] ?? '')
  }

  async function addCovers(files) {
    setCoverBusy(true)
    let list = covers
    try {
      for (const f of files) {
        const path = await store.uploadPhoto(r.id, f, 'cover')
        list = [...list, path]
        saveCovers(list) // each photo is saved as soon as it is up
      }
    } catch (e) {
      toast(e)
    } finally {
      setCoverBusy(false)
    }
  }

  function removeCover(path) {
    saveCovers(covers.filter((p) => p !== path))
    store.removePhoto(path).catch(() => {})
  }

  function moveCover(from, to) {
    const list = [...covers]
    const [p] = list.splice(from, 1)
    list.splice(to, 0, p)
    saveCovers(list)
  }

  async function cover(file) {
    setCoverBusy(true)
    try {
      const old = r.cover_photo
      const path = await store.uploadPhoto(r.id, file, 'cover')
      patch('cover_photo', path)
      if (old) store.removePhoto(old).catch(() => {})
    } catch (e) {
      toast(e)
    } finally {
      setCoverBusy(false)
    }
  }

  async function remove() {
    if (!confirm(`Delete ${r.name || 'this restaurant'} with its menu and papers? This cannot be undone.`)) return
    setDeleting(true)
    try {
      await store.deleteRestaurant(r.id)
      toast('Restaurant deleted')
      onDeleted()
    } catch (e) {
      toast(e)
      setDeleting(false)
    }
  }

  return (
    <>
      <Section title="Restaurant" icon={Store}>
        <Field label="Name">
          <Text value={r.name} onChange={(v) => patch('name', v)} placeholder="e.g. Momo Point" autoFocus={autoFocus} />
        </Field>
        <Field label="Owner / contact person">
          <Text value={r.owner_name} onChange={(v) => patch('owner_name', v)} placeholder="Name" />
        </Field>
        <Field
          label="Phone"
          right={r.phone && <a href={`tel:${r.phone}`} className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-fd-red"><Phone size={13} /> Call</a>}
        >
          <Text value={r.phone} onChange={(v) => patch('phone', v)} inputMode="tel" placeholder="10-digit number" />
        </Field>
        <Field
          label="WhatsApp"
          right={
            r.whatsapp ? (
              <a href={`https://wa.me/${waNumber(r.whatsapp)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-fd-veg"><MessageCircle size={13} /> Open</a>
            ) : r.phone ? (
              <button type="button" onClick={() => patch('whatsapp', r.phone)} className="text-[12.5px] font-semibold text-fd-red">Same as phone</button>
            ) : null
          }
        >
          <Text value={r.whatsapp} onChange={(v) => patch('whatsapp', v)} inputMode="tel" placeholder="For sending orders" />
        </Field>
      </Section>

      <Section title="Location" icon={MapPin}>
        <Field label="Area">
          <Text value={r.area} onChange={(v) => patch('area', v)} placeholder="e.g. Dergaon Bazaar, Station Road" />
        </Field>
        <Field label="Address / landmark">
          <Area rows={2} value={r.address} onChange={(v) => patch('address', v)} placeholder="Near ... , opposite ..." />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button variant="soft" busy={locating} onClick={locate}>
            <LocateFixed size={16} /> {r.lat != null ? 'Update my location here' : 'Save my location here'}
          </Button>
          {r.maps_link && (
            <a href={r.maps_link} target="_blank" rel="noreferrer" className="press inline-flex items-center gap-2 rounded-2xl border border-line bg-white px-4 py-3 text-[14.5px] font-semibold">
              <MapPin size={16} /> Open in Maps
            </a>
          )}
        </div>
        <Field label="Google Maps link" hint="Standing at the restaurant? Tap the button above instead.">
          <Text value={r.maps_link} onChange={(v) => patch('maps_link', v)} placeholder="Paste a link (optional)" />
        </Field>
      </Section>

      <Section title="Food" icon={UtensilsCrossed}>
        <Field label="What they make">
          <Chips multi options={[...CUISINES, ...extraCuisines]} value={r.cuisines || []} onChange={(v) => patch('cuisines', v)} />
        </Field>
        <div className="flex gap-2">
          <input className="field" placeholder="Something else? (e.g. Waffles)" value={custom} onChange={(e) => setCustom(e.target.value)} />
          <button
            type="button"
            onClick={() => {
              const c = custom.trim()
              if (c && !(r.cuisines || []).includes(c)) patch('cuisines', [...(r.cuisines || []), c])
              setCustom('')
            }}
            className="press grid w-12 shrink-0 place-items-center rounded-2xl border border-line bg-white"
            aria-label="Add"
          >
            <Plus size={18} />
          </button>
        </div>
        <Field label="Veg / non-veg">
          <Chips options={FOOD_TYPES} value={r.food_type} onChange={(v) => patch('food_type', v)} />
        </Field>
        <Field label="Cost for two (about)">
          <Num prefix="₹" value={r.cost_for_two} onChange={(v) => patch('cost_for_two', v)} placeholder="300" />
        </Field>
        <Field label="Offer to show (optional)">
          <Text value={r.offer} onChange={(v) => patch('offer', v)} placeholder="e.g. 10% off on first order" />
        </Field>
        {many ? (
          <Field label="Cover photos" hint="Up to 8: shop front and their best dishes. The app shows them one after another on the restaurant card and page. The first one (Main) shows first; move photos with the arrows.">
            <CoverPhotos paths={covers} urlOf={(p) => store.photoUrl(p)} busy={coverBusy} onAdd={addCovers} onRemove={removeCover} onMove={moveCover} aspect={16 / 9} />
          </Field>
        ) : (
          <Field label="Cover photo" hint="Shop front or their best dish. Shown on the restaurant card in the app. (Several photos come with database update 075.)">
            <SinglePhoto
              url={store.photoUrl(r.cover_photo)}
              busy={coverBusy}
              onPick={cover}
              onRemove={() => {
                store.removePhoto(r.cover_photo).catch(() => {})
                patch('cover_photo', '')
              }}
              label="Add cover photo"
              aspect={16 / 9}
              cropTitle="Crop the cover photo"
              tall
            />
          </Field>
        )}
      </Section>

      <Section title="Timing" icon={Clock}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Opens at">
            <input type="time" className="field" value={r.opens_at || ''} onChange={(e) => patch('opens_at', e.target.value)} />
          </Field>
          <Field label="Closes at">
            <input type="time" className="field" value={r.closes_at || ''} onChange={(e) => patch('closes_at', e.target.value)} />
          </Field>
        </div>
        <Field label="Weekly off">
          <Chips options={DAYS.map((d) => ({ id: d, label: d.slice(0, 3) }))} value={r.closed_on} onChange={(v) => patch('closed_on', v)} />
        </Field>
        <Field label="Food ready in" hint="How long they take to make one order.">
          <Num suffix="min" value={r.prep_minutes} onChange={(v) => patch('prep_minutes', v)} placeholder="20" />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {QUICK_MINUTES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => patch('prep_minutes', m)}
                className={`press rounded-full border px-3 py-1.5 text-[12.5px] font-semibold ${String(r.prep_minutes ?? '') === m ? 'border-fd-red bg-fd-red text-white' : 'border-line bg-white'}`}
              >
                {m} min
              </button>
            ))}
          </div>
        </Field>
        <Field label="Delivery time to show customers" hint="Ready time + the ride. Leave empty and we will work it out later.">
          <Num suffix="min" value={r.delivery_minutes} onChange={(v) => patch('delivery_minutes', v)} placeholder="35" />
        </Field>
      </Section>

      <Section title="Charges" icon={Receipt}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Minimum order">
            <Num prefix="₹" value={r.min_order} onChange={(v) => patch('min_order', v)} placeholder="—" />
          </Field>
          <Field label="Packing per order">
            <Num prefix="₹" value={r.packing_fee} onChange={(v) => patch('packing_fee', v)} placeholder="—" />
          </Field>
        </div>
      </Section>

      <Section title="Deal" icon={Handshake} hint="What you agreed. Change it any time.">
        <Field label="How Jholzo earns">
          <Chips options={DEALS} value={r.deal_type} onChange={(v) => patch('deal_type', v)} />
        </Field>
        {deal && (
          <Field label={deal.label} hint={deal.hint}>
            <Num
              decimals
              prefix={deal.unit === '₹' ? '₹' : undefined}
              suffix={deal.unit === '%' ? '%' : 'a month'}
              value={r.deal_value}
              onChange={(v) => patch('deal_value', v)}
              placeholder={deal.unit === '%' ? '10' : '500'}
            />
          </Field>
        )}
        <Field label="Pay the restaurant">
          <Chips options={PAY_WHEN} value={r.pay_when} onChange={(v) => patch('pay_when', v)} />
        </Field>
        <Field label="Their UPI ID" hint="Or add a photo of their UPI QR under Papers.">
          <Text value={r.upi_id} onChange={(v) => patch('upi_id', v)} placeholder="name@okaxis" autoCapitalize="off" />
        </Field>
        <Toggle checked={!!r.agreement_signed} onChange={(v) => patch('agreement_signed', v)} label="Agreement signed" hint="Keep a photo of the signed page under Papers." />
      </Section>

      <Section title="Notes" icon={StickyNote}>
        <Area rows={4} value={r.notes} onChange={(v) => patch('notes', v)} placeholder="Anything to remember: what they said, when to go back, special dishes ..." />
        <Toggle checked={!!r.sticker_given} onChange={(v) => patch('sticker_given', v)} label="Jholzo sticker given" hint="Stuck on their door or counter." />
      </Section>

      <Button variant="danger" className="w-full" busy={deleting} onClick={remove}>
        <Trash2 size={16} /> Delete restaurant
      </Button>
    </>
  )
}
