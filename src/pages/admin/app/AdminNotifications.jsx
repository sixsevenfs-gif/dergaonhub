import { useMemo, useRef, useState } from 'react'
import { Bell, ImagePlus, Send, Smartphone, X } from 'lucide-react'
import { lbtnDark, lbtnOutline, lcard, lfield } from '../../../components/ui.js'
import { useData } from '../../../lib/useData.js'
import { listProducts } from '../../../lib/store.js'
import { foodRestaurants } from '../../../lib/foodAdmin.js'
import { AUDIENCES, LINKS, pushAudience, pushCampaigns, sendPush, uploadAppMedia } from '../../../lib/appAdmin.js'
import { NeedsUpdate } from '../food/FoodBits.jsx'

const OPENS = [
  ['grocery', 'Grocery home'],
  ['food', 'Food home'],
  ['product', 'A product'],
  ['restaurant', 'A restaurant'],
  ['url', 'A website link'],
]
const AUDIENCE_LABEL = Object.fromEntries(AUDIENCES)
const phonesIn = (text) => [...new Set((text.match(/[6-9][0-9]{9}/g) ?? []))]

// Owner: send an offer or news to the apps (Android and iPhone). Order updates go out by themselves.
export default function AdminNotifications() {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [image, setImage] = useState('')
  const [opens, setOpens] = useState('grocery')
  const [target, setTarget] = useState('')
  const [url, setUrl] = useState('https://jholzo.com/')
  const [audience, setAudience] = useState('all')
  const [numbers, setNumbers] = useState('')
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState(null)
  const [confirm, setConfirm] = useState(false)
  const [q, setQ] = useState('')
  const file = useRef(null)
  const phones = useMemo(() => phonesIn(numbers), [numbers])
  const { data: reach } = useData(() => pushAudience(audience, phones), [audience, phones.join()])
  const { data: history, reload } = useData(pushCampaigns)
  const { data: products } = useData(() => (opens === 'product' ? listProducts() : Promise.resolve([])), [opens])
  const { data: places } = useData(() => (opens === 'restaurant' ? foodRestaurants() : Promise.resolve([])), [opens])

  if (reach === null || history === null) return <NeedsUpdate n="065" what="notifications to the apps" />

  const link = opens === 'url' ? url.trim() : opens === 'grocery' || opens === 'food' ? LINKS[opens]() : target ? LINKS[opens](target) : ''
  const shownProducts = (products ?? []).filter((p) => p.status === 'active' && (!q || p.name.toLowerCase().includes(q.toLowerCase()))).slice(0, 50)
  const live = (places ?? []).filter((r) => r.status === 'live' && r.fssai_number?.trim())
  const problem = !title.trim() ? 'Write a title.' : !body.trim() ? 'Write the message.'
    : (opens === 'product' || opens === 'restaurant') && !target ? `Choose the ${opens}.`
    : opens === 'url' && !/^https:\/\//.test(url.trim()) ? 'The link must start with https://'
    : audience === 'phones' && !phones.length ? 'Add at least one 10-digit number.' : ''

  async function pick(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setBusy('photo')
    setMsg(null)
    try {
      setImage(await uploadAppMedia(f, 'push', 1024, 200))
    } catch (err) {
      setMsg({ error: err.message })
    } finally {
      setBusy('')
    }
  }

  async function send() {
    setConfirm(false)
    setBusy('send')
    setMsg(null)
    try {
      const r = await sendPush({ title, body, image, link, audience, phones })
      setMsg({ ok: `Sent to ${r.sent ?? 0} phone${r.sent === 1 ? '' : 's'}${r.failed ? ` (${r.failed} could not be reached)` : ''}.` })
      setTitle('')
      setBody('')
      setImage('')
      reload()
    } catch (err) {
      setMsg({ error: err.message })
      reload()
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Notifications</h1>
        <p className="text-sm text-neutral-500">Send an offer or news to the Jholzo app on Android and iPhone. Order updates (confirmed, on the way, delivered) go out by themselves.</p>
      </div>
      {reach && (
        <div className="grid grid-cols-3 gap-2 text-center">
          {[['Android', reach.android], ['iPhone', reach.ios], ['Logged in', reach.logged_in]].map(([l, n]) => (
            <div key={l} className={`${lcard} p-3`}><p className="text-xl font-bold">{n}</p><p className="text-xs text-neutral-500">{l}</p></div>
          ))}
        </div>
      )}

      <div className={`${lcard} space-y-4 p-4`}>
        <label className="block">
          <span className="flex justify-between text-sm font-semibold"><span>Title</span><span className="font-normal text-neutral-400">{title.length}/60</span></span>
          <input className={`${lfield} mt-1`} maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Weekend offer 🎉" />
        </label>
        <label className="block">
          <span className="flex justify-between text-sm font-semibold"><span>Message</span><span className="font-normal text-neutral-400">{body.length}/180</span></span>
          <textarea className={`${lfield} mt-1 h-24 py-2`} maxLength={180} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Flat 10% off on fruits and vegetables today. Order now!" />
        </label>

        <div>
          <span className="text-sm font-semibold">Picture (optional)</span>
          <p className="text-xs text-neutral-500">Shows big on Android. iPhones show the text.</p>
          {image ? (
            <div className="relative mt-2 w-fit">
              <img src={image} alt="" className="h-28 rounded-xl object-cover" />
              <button type="button" aria-label="Remove picture" onClick={() => setImage('')} className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-neutral-900 text-white"><X size={14} /></button>
            </div>
          ) : (
            <button type="button" disabled={busy === 'photo'} onClick={() => file.current?.click()} className={`${lbtnOutline} mt-2 min-h-10 px-3 text-sm`}>
              <ImagePlus size={16} /> {busy === 'photo' ? 'Uploading…' : 'Add a picture'}
            </button>
          )}
          <input ref={file} type="file" accept="image/*" className="hidden" onChange={pick} />
        </div>

        <div>
          <span className="text-sm font-semibold">When they tap it, open</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {OPENS.map(([k, l]) => (
              <button key={k} type="button" onClick={() => { setOpens(k); setTarget('') }}
                className={`h-9 rounded-full px-3 text-sm font-semibold ${opens === k ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700'}`}>{l}</button>
            ))}
          </div>
          {opens === 'product' && (
            <div className="mt-2 space-y-2">
              <input className={lfield} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a product" />
              <select className={lfield} value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">Choose a product</option>
                {shownProducts.map((p) => <option key={p.id} value={p.id}>{p.name}{p.size ? ` · ${p.size}` : ''}</option>)}
              </select>
            </div>
          )}
          {opens === 'restaurant' && (
            <select className={`${lfield} mt-2`} value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">Choose a restaurant</option>
              {live.map((r) => <option key={r.id} value={r.id}>{r.name.trim()}</option>)}
            </select>
          )}
          {opens === 'url' && <input className={`${lfield} mt-2`} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://jholzo.com/…" />}
        </div>

        <div>
          <span className="text-sm font-semibold">Send to</span>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {AUDIENCES.map(([k, l]) => (
              <label key={k} className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm ${audience === k ? 'border-neutral-900 bg-neutral-50 font-semibold' : 'border-neutral-200'}`}>
                <input type="radio" name="audience" checked={audience === k} onChange={() => setAudience(k)} /> {l}
              </label>
            ))}
          </div>
          {audience === 'phones' && (
            <textarea className={`${lfield} mt-2 h-20 py-2`} value={numbers} onChange={(e) => setNumbers(e.target.value)} placeholder="10-digit numbers, separated by commas or new lines" />
          )}
          {reach && <p className="mt-2 text-sm"><Smartphone size={14} className="mr-1 inline" />Goes to <b>{reach.audience}</b> phone{reach.audience === 1 ? '' : 's'}.</p>}
        </div>
      </div>

      <div className={`${lcard} p-4`}>
        <p className="text-xs font-semibold uppercase text-neutral-500">Preview</p>
        <div className="mt-2 rounded-2xl bg-neutral-100 p-3">
          <div className="flex items-start gap-3 rounded-xl bg-white p-3 shadow-sm">
            <img src="/icons/icon-192.png" alt="" className="h-9 w-9 shrink-0 rounded-lg" onError={(e) => { e.currentTarget.style.display = 'none' }} />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-neutral-500">Jholzo · now</p>
              <p className="truncate text-sm font-bold">{title || 'Title'}</p>
              <p className="line-clamp-3 text-sm text-neutral-700">{body || 'Your message shows here.'}</p>
              {image && <img src={image} alt="" className="mt-2 max-h-40 w-full rounded-lg object-cover" />}
            </div>
          </div>
        </div>
      </div>

      {msg?.error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{msg.error}</p>}
      {msg?.ok && <p className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{msg.ok}</p>}
      {problem && (title || body) && <p className="text-sm text-amber-700">{problem}</p>}

      {confirm ? (
        <div className={`${lcard} space-y-3 border-neutral-900 p-4`}>
          <p className="font-bold">Send "{title.trim()}" to {reach?.audience ?? '?'} phones now?</p>
          <p className="text-sm text-neutral-500">It can't be taken back once it is sent.</p>
          <div className="flex gap-2">
            <button type="button" onClick={send} className={lbtnDark}><Send size={16} /> Yes, send</button>
            <button type="button" onClick={() => setConfirm(false)} className={lbtnOutline}>Not now</button>
          </div>
        </div>
      ) : (
        <button type="button" disabled={!!problem || busy === 'send' || reach?.audience === 0} onClick={() => setConfirm(true)} className={`${lbtnDark} w-full`}>
          <Send size={16} /> {busy === 'send' ? 'Sending…' : 'Send notification'}
        </button>
      )}

      <div className={`${lcard} p-4`}>
        <h3 className="flex items-center gap-2 font-bold"><Bell size={16} /> Sent before</h3>
        {(history ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">Nothing sent yet.</p>
        ) : (
          <div className="mt-2 divide-y divide-neutral-100">
            {history.map((c) => (
              <div key={c.id} className="py-2 text-sm">
                <div className="flex justify-between gap-2"><b className="truncate">{c.title}</b><span className="shrink-0 text-xs text-neutral-500">{new Date(c.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span></div>
                <p className="line-clamp-2 text-neutral-600">{c.body}</p>
                <p className="text-xs text-neutral-500">
                  {AUDIENCE_LABEL[c.audience] ?? c.audience} · {c.status === 'sent' ? `sent to ${c.sent}${c.failed ? `, ${c.failed} failed` : ''}` : c.status}{c.error ? ` · ${c.error}` : ''}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
