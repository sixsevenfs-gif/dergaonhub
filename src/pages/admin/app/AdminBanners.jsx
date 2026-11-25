import { useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Eye, EyeOff, ImagePlus, Pencil, Plus, Trash2, X } from 'lucide-react'
import { lbtn, lbtnDanger, lbtnOutline, lcard, lfield } from '../../../components/ui.js'
import { useData } from '../../../lib/useData.js'
import { listProducts } from '../../../lib/store.js'
import { foodRestaurants } from '../../../lib/foodAdmin.js'
import { LINKS, PLACES, bannerLive, deleteBanner, linkKind, listBanners, reorderBanners, saveBanner, uploadAppMedia } from '../../../lib/appAdmin.js'
import { NeedsUpdate } from '../food/FoodBits.jsx'
import AppHeader from './AppHeader.jsx'
import { AppHomePreview, PhoneFrame } from './AppPreview.jsx'
import LinkPicker from './LinkPicker.jsx'

const PLACE_LABEL = Object.fromEntries(PLACES)
const OPENS_TEXT = {
  grocery: 'Opens Grocery home', food: 'Opens Food home', categories: 'Opens all categories', wallet: 'Opens Jholzo Money (invite friends)',
  product: 'Opens a product', restaurant: 'Opens a restaurant', none: 'Opens nothing',
}

const when = (iso) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
// <input type="datetime-local"> wants the owner's local time without a zone.
const localInput = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
const onPlace = (b, place) => b.place === place || b.place === 'both'

function stateOf(b) {
  if (!b.active) return ['Off', 'bg-neutral-100 text-neutral-600']
  if (bannerLive(b)) return [b.ends_at ? `Showing until ${when(b.ends_at)}` : 'Showing now', 'bg-emerald-50 text-emerald-700']
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

// Owner: the pictures that slide at the top of the app's home (Grocery, Food or both). As many as wanted, in any
// order, with times; the app's own two banners are in the list too. The phone shows the result before saving.
export default function AdminBanners() {
  const [filter, setFilter] = useState('all')
  const [previewPlace, setPreviewPlace] = useState('grocery')
  const [editing, setEditing] = useState(null) // null, 'new' or a banner
  const [draft, setDraft] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [askDelete, setAskDelete] = useState(null)
  const { data: banners, reload } = useData(listBanners)
  const needNames = (banners ?? []).some((b) => ['product', 'restaurant'].includes(linkKind(b.link)[0]))
  const { data: names } = useData(() => (needNames ? loadNames() : Promise.resolve({})), [needNames])

  if (banners === null) return <NeedsUpdate n="066" what="the banners in the apps" />

  const all = banners ?? []
  const shown = filter === 'all' ? all : all.filter((b) => onPlace(b, filter))
  // The phone: running banners on that home, with the one being edited in its place (or at the end when new).
  const place = draft && draft.place !== 'both' ? draft.place : previewPlace
  let preview = all.filter((b) => onPlace(b, place) && bannerLive(b) && b.id !== draft?.id)
  if (draft?.image && onPlace(draft, place) && bannerLive(draft)) {
    preview = [...preview, { ...draft, id: draft.id ?? 'draft' }].sort((a, b) => a.sort - b.sort)
  }

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

  const move = (b, by) => run(() => {
    const ids = all.map((x) => x.id)
    const i = ids.indexOf(b.id)
    const j = i + by
    if (j < 0 || j >= ids.length) return Promise.resolve()
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    return reorderBanners(ids)
  })

  function startEdit(b) {
    setEditing(b)
    setAskDelete(null)
    setDraft(b === 'new' ? null : { ...b })
    if (b !== 'new' && b.place !== 'both') setPreviewPlace(b.place)
  }

  return (
    <div className="space-y-4">
      <AppHeader title="Banners" text="The pictures that slide at the top of the app's home. Add as many as you like, change their order, switch them off or delete them. Both apps show the change within a minute." />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

          {editing ? (
            <BannerEditor
              key={editing === 'new' ? 'new' : editing.id}
              banner={editing === 'new' ? null : editing}
              defaultPlace={filter === 'all' ? previewPlace : filter}
              nextSort={all.reduce((m, b) => Math.max(m, b.sort + 1), 0)}
              onDraft={setDraft}
              onDone={(saved) => { setEditing(null); setDraft(null); if (saved) reload() }}
            />
          ) : (
            <button type="button" onClick={() => startEdit('new')} className={`${lbtn} w-full bg-violet-700 text-white`}>
              <Plus size={16} /> Add a banner
            </button>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {[['all', `All · ${all.length}`], ['grocery', `Grocery home · ${all.filter((b) => onPlace(b, 'grocery') && bannerLive(b)).length} live`], ['food', `Food home · ${all.filter((b) => onPlace(b, 'food') && bannerLive(b)).length} live`]].map(([k, l]) => (
              <button key={k} type="button" onClick={() => { setFilter(k); if (k !== 'all') setPreviewPlace(k) }}
                className={`h-9 rounded-full px-3 text-sm font-semibold ${filter === k ? 'bg-violet-700 text-white' : 'bg-white text-neutral-700 ring-1 ring-neutral-200'}`}>{l}</button>
            ))}
          </div>

          {shown.length === 0 && <p className={`${lcard} p-6 text-center text-sm text-neutral-500`}>No banners here. Add one, and it shows in both apps.</p>}

          <div className="space-y-3">
            {shown.map((b) => {
              const [label, cls] = stateOf(b)
              const i = all.indexOf(b)
              return (
                <div key={b.id} className={`${lcard} overflow-hidden ${editing?.id === b.id ? 'ring-2 ring-violet-500' : ''}`}>
                  <div className="grid sm:grid-cols-[220px_minmax(0,1fr)]">
                    <img src={b.image} alt="" className={`aspect-[2.2/1] w-full object-cover ${bannerLive(b) ? '' : 'opacity-50 grayscale'}`} />
                    <div className="space-y-2 p-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${cls}`}>{label}</span>
                        <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-bold text-violet-700">{PLACE_LABEL[b.place]}</span>
                      </div>
                      {b.title && <p className="truncate text-sm font-bold">{b.title}</p>}
                      <p className="truncate text-xs text-neutral-500">{opensText(b.link, names)}</p>
                      {askDelete === b.id ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold">Delete this banner?</span>
                          <button type="button" disabled={busy} onClick={() => { setAskDelete(null); run(() => deleteBanner(b.id)) }} className={`${lbtnDanger} min-h-9 px-3 text-sm`}>Yes, delete</button>
                          <button type="button" onClick={() => setAskDelete(null)} className={`${lbtnOutline} min-h-9 px-3 text-sm`}>No</button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          <button type="button" aria-label="Move up" disabled={busy || i === 0} onClick={() => move(b, -1)} className={`${lbtnOutline} min-h-9 px-2.5 disabled:opacity-40`}><ArrowUp size={16} /></button>
                          <button type="button" aria-label="Move down" disabled={busy || i === all.length - 1} onClick={() => move(b, 1)} className={`${lbtnOutline} min-h-9 px-2.5 disabled:opacity-40`}><ArrowDown size={16} /></button>
                          <button type="button" disabled={busy} onClick={() => run(() => saveBanner({ ...b, active: !b.active }))} className={`${lbtnOutline} min-h-9 px-3 text-sm`}>
                            {b.active ? <><EyeOff size={14} /> Turn off</> : <><Eye size={14} /> Turn on</>}
                          </button>
                          <button type="button" onClick={() => startEdit(b)} className={`${lbtnOutline} min-h-9 px-3 text-sm`}><Pencil size={14} /> Edit</button>
                          <button type="button" aria-label="Delete" onClick={() => setAskDelete(b.id)} className={`${lbtnDanger} min-h-9 px-2.5`}><Trash2 size={16} /></button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <p className="text-xs text-neutral-500">Best picture size 1320 × 600 (wide, 2.2 : 1). Banners show from iPhone version 1.1 and Android 1.1.0; older apps keep their own two.</p>
        </div>

        <aside className="space-y-3 lg:sticky lg:top-36 lg:self-start">
          <div className="mx-auto flex max-w-[280px] rounded-full bg-white p-1 ring-1 ring-neutral-200">
            {[['grocery', 'Grocery home'], ['food', 'Food home']].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setPreviewPlace(k)} disabled={!!draft && draft.place !== 'both'}
                className={`h-8 flex-1 rounded-full text-xs font-bold ${place === k ? (k === 'food' ? 'bg-red-600 text-white' : 'bg-[#1F6B3A] text-white') : 'text-neutral-600'}`}>{l}</button>
            ))}
          </div>
          <PhoneFrame label={draft ? 'Preview before saving' : 'Live in the apps'}>
            <AppHomePreview place={place} banners={preview} highlightId={draft ? (draft.id ?? 'draft') : null} />
          </PhoneFrame>
        </aside>
      </div>
    </div>
  )
}

function BannerEditor({ banner, defaultPlace, nextSort, onDraft, onDone }) {
  const [v, setV] = useState(() => ({
    id: banner?.id, place: banner?.place ?? (defaultPlace === 'food' ? 'food' : 'grocery'), image: banner?.image ?? '', title: banner?.title ?? '',
    link: banner?.link ?? LINKS[defaultPlace === 'food' ? 'food' : 'grocery'](), active: banner?.active ?? true, sort: banner?.sort ?? nextSort,
    starts_at: localInput(banner?.starts_at), ends_at: localInput(banner?.ends_at),
  }))
  const [linkDone, setLinkDone] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const file = useRef(null)

  // Every change shows in the phone at once.
  function set(patch) {
    const next = { ...v, ...patch }
    setV(next)
    const at = (x) => {
      const d = x ? new Date(x) : null
      return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null
    }
    onDraft({ ...next, starts_at: at(next.starts_at), ends_at: at(next.ends_at) })
  }

  async function pick(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setBusy('photo')
    setError('')
    try {
      set({ image: await uploadAppMedia(f, 'banners', 1320, 260) })
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
      await saveBanner(v)
      onDone(true)
    } catch (err) {
      setError(err.message)
      setBusy('')
    }
  }

  return (
    <div className={`${lcard} space-y-4 border-violet-300 p-4 shadow-lg`}>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-black">{banner ? 'Change banner' : 'New banner'}</h3>
        <button type="button" aria-label="Close" onClick={() => onDone(false)} className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100"><X size={16} /></button>
      </div>

      <div>
        <span className="text-sm font-semibold">Picture</span>
        <p className="text-xs text-neutral-500">Wide, best 1320 × 600 (2.2 : 1). Keep words away from the edges.</p>
        {v.image ? (
          <div className="mt-2 space-y-2">
            <img src={v.image} alt="" className="aspect-[2.2/1] w-full rounded-2xl object-cover" />
            <button type="button" disabled={!!busy} onClick={() => file.current?.click()} className={`${lbtnOutline} min-h-10 px-3 text-sm`}>
              <ImagePlus size={16} /> {busy === 'photo' ? 'Uploading…' : 'Change picture'}
            </button>
          </div>
        ) : (
          <button type="button" disabled={!!busy} onClick={() => file.current?.click()}
            className="mt-2 flex aspect-[2.2/1] w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-violet-300 bg-violet-50/50 text-sm font-semibold text-violet-700">
            <ImagePlus size={24} /> {busy === 'photo' ? 'Uploading…' : 'Add a picture'}
          </button>
        )}
        <input ref={file} type="file" accept="image/*" className="hidden" onChange={pick} />
      </div>

      <div>
        <span className="text-sm font-semibold">Shows on</span>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {PLACES.map(([k, l]) => (
            <button key={k} type="button" onClick={() => set({ place: k })}
              className={`h-10 rounded-xl text-sm font-semibold ${v.place === k ? 'bg-violet-700 text-white' : 'bg-neutral-100 text-neutral-700'}`}>{l}</button>
          ))}
        </div>
      </div>

      <label className="block">
        <span className="text-sm font-semibold">Name (optional)</span>
        <input className={`${lfield} mt-1`} maxLength={80} value={v.title} onChange={(e) => set({ title: e.target.value })} placeholder="Weekend fruit offer" />
        <span className="text-xs text-neutral-500">Not shown on the picture. Phones read it aloud for people who can&apos;t see well.</span>
      </label>

      <div>
        <span className="text-sm font-semibold">When they tap it, open</span>
        <div className="mt-2"><LinkPicker allowNone value={v.link} onChange={(l, done) => { if (l !== v.link) set({ link: l }); setLinkDone(done) }} /></div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-semibold">Start (optional)</span>
          <input type="datetime-local" className={`${lfield} mt-1`} value={v.starts_at} onChange={(e) => set({ starts_at: e.target.value })} />
          <span className="text-xs text-neutral-500">Empty: starts now.</span>
        </label>
        <label className="block">
          <span className="text-sm font-semibold">End (optional)</span>
          <input type="datetime-local" className={`${lfield} mt-1`} value={v.ends_at} onChange={(e) => set({ ends_at: e.target.value })} />
          <span className="text-xs text-neutral-500">Empty: keeps showing.</span>
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" className="h-5 w-5 accent-violet-700" checked={v.active} onChange={(e) => set({ active: e.target.checked })} /> Show this banner
      </label>

      {!linkDone && <p className="text-sm text-amber-700">Choose what it opens (a website link must start with https://).</p>}
      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="flex gap-2">
        <button type="button" disabled={!!busy || !v.image || !linkDone} onClick={save} className={`${lbtn} bg-violet-700 text-white`}>{busy === 'save' ? 'Saving…' : banner ? 'Save changes' : 'Add banner'}</button>
        <button type="button" disabled={busy === 'save'} onClick={() => onDone(false)} className={lbtnOutline}>Cancel</button>
      </div>
    </div>
  )
}
