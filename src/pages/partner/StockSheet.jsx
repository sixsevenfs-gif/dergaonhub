import { useState } from 'react'
import { PackageX, Search, X } from 'lucide-react'
import ProductThumb from '../../components/ProductThumb.jsx'
import Toggle from '../../components/Toggle.jsx'
import { card, field } from '../../components/ui.js'
import { listProducts, setProductAvailable } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { matches, rupee } from '../../lib/format.js'

const MAX = 60 // rows shown at once: the rider searches for the item, nobody scrolls the whole shop

// "Item not at the shop?" on the rider page: switch it Out of stock so customers stop ordering it,
// and back on when the shop has it again. Only the stock switch (update 052); prices stay with the owner.
export default function StockButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`${card} mt-3 flex w-full items-center gap-3 p-4 text-left active:bg-mint-soft`}>
        <PackageX size={20} className="text-brand" />
        <span className="flex-1">
          <span className="block font-semibold">Item not at the shop?</span>
          <span className="block text-xs text-muted">Mark it out of stock, so nobody orders it</span>
        </span>
        <span className="rounded-full bg-mint px-3 py-1.5 text-xs font-semibold text-brand">Stock</span>
      </button>
      {open && <StockSheet onClose={() => setOpen(false)} />}
    </>
  )
}

function StockSheet({ onClose }) {
  const [q, setQ] = useState('')
  const [onlyOut, setOnlyOut] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const { data: products, error: loadError } = useData(() => listProducts({ includeHidden: false }))
  const found = (products ?? []).filter((p) => (!onlyOut || !p.available) && (!q.trim() || matches(`${p.name} ${p.size} ${p.keywords}`, q)))
  const shown = found.slice(0, MAX)
  const outCount = (products ?? []).filter((p) => !p.available).length

  const flip = async (p, on) => {
    setError('')
    setBusy(p.id)
    try {
      await setProductAvailable(p.id, on)
    } catch (err) {
      // Before update 052 runs in the database, only the owner and the order desk may do this.
      setError(/order desk/i.test(err.message) ? 'Riders cannot change stock yet. Ask the admin to switch it on.' : err.message)
    }
    setBusy('')
  }

  return (
    <div role="dialog" aria-label="Stock" className="fixed inset-0 z-[1100] flex flex-col bg-white font-ui">
      <div className="mx-auto flex w-full max-w-md items-center gap-2 px-4 pt-3">
        <h2 className="flex-1 text-xl font-semibold">Stock</h2>
        <button type="button" aria-label="Close" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-full border border-line text-muted"><X size={20} /></button>
      </div>
      <div className="mx-auto w-full max-w-md px-4 pb-3">
        <p className="text-sm text-muted">Switch an item off when the shop does not have it. Customers see "Out of stock". Switch it on when it is back.</p>
        <div className="mt-3 flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search item" className={`${field} pl-10`} />
          </div>
          <button
            type="button" aria-pressed={onlyOut} onClick={() => setOnlyOut(!onlyOut)}
            className={`h-12 shrink-0 rounded-xl border px-3 text-sm font-semibold ${onlyOut ? 'border-brand bg-brand text-white' : 'border-line bg-white text-ink'}`}
          >
            Out of stock ({outCount})
          </button>
        </div>
        {(error || loadError) && <p className="mt-2 rounded-xl bg-red-500/10 p-3 text-sm text-red-700">{error || loadError.message}</p>}
      </div>
      <div className="flex-1 overflow-y-auto border-t border-line">
        <ul className="mx-auto max-w-md divide-y divide-line/60 px-4 pb-10">
          {shown.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-2.5">
              <ProductThumb product={p} size="h-12 w-12" iconSize={22} className={`border border-line bg-white ${p.available ? '' : 'opacity-50'}`} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold leading-tight">{p.name}</span>
                <span className="text-sm text-muted">{p.size} · {rupee(p.price)}</span>
              </span>
              <span className={`shrink-0 text-xs font-semibold ${p.available ? 'text-emerald-700' : 'text-red-700'}`}>{p.available ? 'In stock' : 'Out of stock'}</span>
              <span className={busy === p.id ? 'pointer-events-none opacity-50' : ''}>
                <Toggle checked={p.available} onChange={(v) => flip(p, v)} label={`${p.name} in stock`} />
              </span>
            </li>
          ))}
          {products && !shown.length && (
            <li className="py-10 text-center text-muted">{onlyOut && !q.trim() ? 'Nothing is out of stock.' : 'No item found.'}</li>
          )}
          {found.length > MAX && (
            <li className="py-4 text-center text-sm text-muted">Showing {MAX} of {found.length} items. Search to find the others.</li>
          )}
        </ul>
      </div>
    </div>
  )
}
