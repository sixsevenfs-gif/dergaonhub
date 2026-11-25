import { useEffect, useState } from 'react'
import { lfield } from '../../../components/ui.js'
import { useData } from '../../../lib/useData.js'
import { listProducts } from '../../../lib/store.js'
import { foodRestaurants } from '../../../lib/foodAdmin.js'
import { LINKS, linkKind } from '../../../lib/appAdmin.js'

const OPENS = [
  ['grocery', 'Grocery home'],
  ['food', 'Food home'],
  ['categories', 'All categories'],
  ['wallet', 'Jholzo Money'],
  ['product', 'A product'],
  ['restaurant', 'A restaurant'],
  ['url', 'A website link'],
  ['none', 'Nothing'],
]

/** Where a notification or banner opens in the apps. Calls onChange(link, complete): the link is '' for
 *  "Nothing", and also while a choice is not finished (no product picked yet, or a link without https://). */
export default function LinkPicker({ value = '', onChange, allowNone = false }) {
  const [initKind, initTarget] = linkKind(value)
  const [opens, setOpens] = useState(initKind === 'none' && !allowNone ? 'grocery' : initKind)
  const [target, setTarget] = useState(initTarget)
  const [url, setUrl] = useState(initKind === 'url' ? initTarget : 'https://jholzo.com/')
  const [q, setQ] = useState('')
  const { data: products } = useData(() => (opens === 'product' ? listProducts() : Promise.resolve([])), [opens])
  const { data: places } = useData(() => (opens === 'restaurant' ? foodRestaurants() : Promise.resolve([])), [opens])

  const link = opens === 'none' ? '' : opens === 'url' ? (/^https:\/\//.test(url.trim()) ? url.trim() : '')
    : ['grocery', 'food', 'categories', 'wallet'].includes(opens) ? LINKS[opens]() : target ? LINKS[opens](target) : ''
  const complete = opens === 'none' || link !== ''
  useEffect(() => { onChange(link, complete) }, [link, complete]) // eslint-disable-line react-hooks/exhaustive-deps

  const active = (products ?? []).filter((p) => p.status === 'active')
  const shown = active.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase())).slice(0, 50)
  // The chosen one stays in the list while searching (and when a saved link is shown again).
  const chosen = active.find((p) => String(p.id) === String(target))
  if (chosen && !shown.includes(chosen)) shown.unshift(chosen)
  const live = (places ?? []).filter((r) => (r.status === 'live' && r.fssai_number?.trim()) || String(r.id) === String(target))

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {OPENS.filter(([k]) => allowNone || k !== 'none').map(([k, l]) => (
          <button key={k} type="button" onClick={() => { setOpens(k); setTarget('') }}
            className={`h-9 rounded-full px-3 text-sm font-semibold ${opens === k ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700'}`}>{l}</button>
        ))}
      </div>
      {opens === 'product' && (
        <div className="mt-2 space-y-2">
          <input className={lfield} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a product" />
          <select className={lfield} value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Choose a product</option>
            {shown.map((p) => <option key={p.id} value={p.id}>{p.name}{p.size ? ` · ${p.size}` : ''}</option>)}
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
  )
}
