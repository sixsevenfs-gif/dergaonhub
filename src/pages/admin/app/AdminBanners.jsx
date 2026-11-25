import { useRef, useState } from 'react'
import { ArrowDown, ArrowUp, ImagePlus, Pencil, Plus, Trash2 } from 'lucide-react'
import { lbtnDanger, lbtnDark, lbtnOutline, lcard, lfield } from '../../../components/ui.js'
import { useData } from '../../../lib/useData.js'
import { listProducts } from '../../../lib/store.js'
import { foodRestaurants } from '../../../lib/foodAdmin.js'
import { LINKS, bannerLive, deleteBanner, linkKind, listBanners, reorderBanners, saveBanner, uploadAppMedia } from '../../../lib/appAdmin.js'
import { NeedsUpdate } from '../food/FoodBits.jsx'
import LinkPicker from './LinkPicker.jsx'

const PLACES = [
  ['grocery', 'Grocery home'],
  ['food', 'Food home'],
]
const OPENS_TEXT = { grocery: 'Opens Grocery home', food: 'Opens Food home', product: 'Opens a product', restaurant: 'Opens a restaurant', none: 'Opens nothing' }

const when = (iso) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
// <input type="datetime-local"> wants the owner's local time without a zone.
const localInput = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

function stateOf(b) {
  if (!b.active) return ['Off', 'bg-neutral-100 text-neutral-600']
  if (bannerLive(b)) return [b.ends_at ? `Showing until ${when(b.ends_at)}` : 'Showing now', 'bg-green-50 text-green-700']
  if (b.ends_at && new Date(b.ends_at).getTime() <= Date.now()) return ['Ended', 'bg-neutral-100 text-neutral-600']
  return [`Starts ${when(b.starts_at)}`, 'bg-sky-50 text-sky-700']
}

function opensText(link, names) {
  const [kind, target] = linkKind(link)
  if (kind === 'url') return `Opens ${target}`
  const name = names?.[`${kind}:${target}`]
  return name ? `Opens ${name}` : OPENS_TEXT[kind]
}

// Names for "Opens Amul Butter · 100 g", only when a banner opens a product or a restaurant.
async function loadNames() {
  const [products, places] = await Promise.all([listProducts().catch(() => []), foodRestaurants().catch(() => [])])
  return Object.fromEntries([
    ...products.map((p) => [`product:${p.id}`, `${p.name}${p.size ? ` · ${p.size}` : ''}`]),
    ...places.map((r) => [`restaurant:${r.id}`, r.name.trim()]),
  ])
}

// Owner: the pictures at the top of the Grocery and Food home in the apps. No app update or review needed.
export default function AdminBanners() {
  const [place, setPlace] = useState('grocery')
  const [editing, setEditing] = useState(null) // null, 'new' or a banner
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [askDelete, setAskDelete] = useState(null)
  const { data: banners, reload } = useData(listBanners)
  const needNames = (banners ?? []).some((b) => ['product', 'restaurant'].includes(linkKind(b.link)[0]))
  const { data: names } = useData(() => (needNames ? loadNames() : Promise.resolve({})), [needNames])

  if (banners === null) return <NeedsUpdate n="066" what="the banners in the apps" />

  const all = banners ?? []
  const here = all.filter((b) => b.place === place)
  const showing = here.filter(bannerLive).length

  async function run(fn) {
    setBusy(true)
    setError('')
    try {
      await fn()
      reload()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const move = (i, by) => run(() => {
    const ids = here.map((b) => b.id)
    ;[ids[i], ids[i + by]] = [ids[i + by], ids[i]]
    return reorderBanners(ids)
  })

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Banners</h1>
        <p className="text-sm text-neutral-500">
          Pictures at the top of the home screen in the Jholzo app. A change shows in the apps within a minute, with no app update or review.
          When no banner is showing, the Grocery home shows its own two banners.
        </p>
      </div>

      <div className="flex gap-2">
        {PLACES.map(([k, l]) => {
          const n = all.filter((b) => b.place === k && bannerLive(b)).length
          return (
            <button key={k} type="button" onClick={() => { setPlace(k); setEditing(null); setAskDelete(null) }}
              className={`h-10 rounded-full px-4 text-sm font-semibold ${place === k ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700'}`}>
              {l}{n ? ` · ${n}` : ''}
            </button>
          )
        })}
      </div>

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {editing ? (
        <BannerEditor
          key={editing === 'new' ? `new-${place}` : editing.id}
          banner={editing === 'new' ? null : editing}
          place={place}
          nextSort={here.reduce((m, b) => Math.max(m, b.sort + 1), 0)}
          onDone={(saved) => { setEditing(null); if (saved) reload() }}
        />
      ) : (
        <button type="button" onClick={() => { setEditing('new'); setAskDelete(null) }} className={`${lbtnDark} w-full`}>
          <Plus size={16} /> Add a banner to {place === 'food' ? 'Food' : 'Grocery'} home
        </button>
      )}

      <p className="text-sm text-neutral-500">
        {here.length === 0 ? 'No banners here yet.' : `${showing} of ${here.length} showing now. They slide in this order.`}
      </p>

      <div className="space-y-3">
        {here.map((b, i) => {
          const [label, cls] = stateOf(b)
          return (
            <div key={b.id} className={`${lcard} overflow-hidden`}>
              <img src={b.image} alt="" className={`aspect-[2.2/1] w-full object-cover ${bannerLive(b) ? '' : 'opacity-50'}`} />
              <div className="space-y-2 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${cls}`}>{label}</span>
                  {b.title && <b className="truncate text-sm">{b.title}</b>}
                </div>
                <p className="truncate text-xs text-neutral-500">{opensText(b.link, names)}</p>
                {askDelete === b.id ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">Delete this banner?</span>
                    <button type="button" disabled={busy} onClick={() => { setAskDelete(null); run(() => deleteBanner(b.id)) }} className={`${lbtnDanger} min-h-9 px-3 text-sm`}>Yes, delete</button>
                    <button type="button" onClick={() => setAskDelete(null)} className={`${lbtnOutline} min-h-9 px-3 text-sm`}>No</button>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" aria-label="Move up" disabled={busy || i === 0} onClick={() => move(i, -1)} className={`${lbtnOutline} min-h-9 px-3 disabled:opacity-40`}><ArrowUp size={16} /></button>
                    <button type="button" aria-label="Move down" disabled={busy || i === here.length - 1} onClick={() => move(i, 1)} className={`${lbtnOutline} min-h-9 px-3 disabled:opacity-40`}><ArrowDown size={16} /></button>
                    <button type="button" disabled={busy} onClick={() => run(() => saveBanner({ ...b, active: !b.active }))} className={`${lbtnOutline} min-h-9 px-3 text-sm`}>
                      {b.active ? 'Turn off' : 'Turn on'}
                    </button>
                    <button type="button" onClick={() => { setEditing(b); setAskDelete(null) }} className={`${lbtnOutline} min-h-9 px-3 text-sm`}><Pencil size={14} /> Edit</button>
                    <button type="button" aria-label="Delete" onClick={() => setAskDelete(b.id)} className={`${lbtnDanger} min-h-9 px-3`}><Trash2 size={16} /></button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-neutral-500">The apps show these banners from iPhone version 1.1 and the next Android version. Older versions keep their own banners.</p>
    </div>
  )
}

function BannerEditor({ banner, place, nextSort, onDone }) {
  const [image, setImage] = useState(banner?.image ?? '')
  const [title, setTitle] = useState(banner?.title ?? '')
  const [link, setLink] = useState(banner?.link ?? LINKS[place]())
  const [linkDone, setLinkDone] = useState(true)
  const [active, setActive] = useState(banner?.active ?? true)
  const [starts, setStarts] = useState(localInput(banner?.starts_at))
  const [ends, setEnds] = useState(localInput(banner?.ends_at))
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const file = useRef(null)

  async function pick(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setBusy('photo')
    setError('')
    try {
      setImage(await uploadAppMedia(f, 'banners', 1320, 260))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  async function save() {
    setBusy('save')
    setError('')
    try {
      await saveBanner({ id: banner?.id, place, image, title, link, active, sort: banner?.sort ?? nextSort, starts_at: starts, ends_at: ends })
      onDone(true)
    } catch (err) {
      setError(err.message)
      setBusy('')
    }
  }

  return (
    <div className={`${lcard} space-y-4 border-neutral-900 p-4`}>
      <h3 className="font-bold">{banner ? 'Change banner' : `New banner · ${place === 'food' ? 'Food' : 'Grocery'} home`}</h3>

      <div>
        <span className="text-sm font-semibold">Picture</span>
        <p className="text-xs text-neutral-500">A wide picture, best 1320 × 600 (2.2 : 1). Keep words away from the edges.</p>
        {image ? (
          <div className="mt-2 space-y-2">
            <img src={image} alt="" className="aspect-[2.2/1] w-full rounded-2xl object-cover" />
            <button type="button" disabled={!!busy} onClick={() => file.current?.click()} className={`${lbtnOutline} min-h-10 px-3 text-sm`}>
              <ImagePlus size={16} /> {busy === 'photo' ? 'Uploading…' : 'Change picture'}
            </button>
          </div>
        ) : (
          <button type="button" disabled={!!busy} onClick={() => file.current?.click()}
            className="mt-2 flex aspect-[2.2/1] w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-neutral-300 text-sm font-semibold text-neutral-600">
            <ImagePlus size={22} /> {busy === 'photo' ? 'Uploading…' : 'Add a picture'}
          </button>
        )}
        <input ref={file} type="file" accept="image/*" className="hidden" onChange={pick} />
      </div>

      <label className="block">
        <span className="text-sm font-semibold">Name (optional)</span>
        <input className={`${lfield} mt-1`} maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Weekend fruit offer" />
        <span className="text-xs text-neutral-500">Not shown on the picture. Phones read it aloud for people who can't see well.</span>
      </label>

      <div>
        <span className="text-sm font-semibold">When they tap it, open</span>
        <div className="mt-2"><LinkPicker allowNone value={link} onChange={(l, done) => { setLink(l); setLinkDone(done) }} /></div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-semibold">Start (optional)</span>
          <input type="datetime-local" className={`${lfield} mt-1`} value={starts} onChange={(e) => setStarts(e.target.value)} />
          <span className="text-xs text-neutral-500">Empty: starts now.</span>
        </label>
        <label className="block">
          <span className="text-sm font-semibold">End (optional)</span>
          <input type="datetime-local" className={`${lfield} mt-1`} value={ends} onChange={(e) => setEnds(e.target.value)} />
          <span className="text-xs text-neutral-500">Empty: keeps showing.</span>
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" className="h-5 w-5" checked={active} onChange={(e) => setActive(e.target.checked)} /> Show this banner
      </label>

      {!linkDone && <p className="text-sm text-amber-700">Choose what it opens (a website link must start with https://).</p>}
      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="flex gap-2">
        <button type="button" disabled={!!busy || !image || !linkDone} onClick={save} className={lbtnDark}>{busy === 'save' ? 'Saving…' : banner ? 'Save changes' : 'Add banner'}</button>
        <button type="button" disabled={busy === 'save'} onClick={() => onDone(false)} className={lbtnOutline}>Cancel</button>
      </div>
    </div>
  )
}
