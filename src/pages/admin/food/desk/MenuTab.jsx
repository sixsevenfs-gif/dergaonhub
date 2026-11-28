import { useMemo, useState } from 'react'
import { ClipboardCopy, ClipboardPaste, Download, Plus, Search, Star, Trash2, UtensilsCrossed } from 'lucide-react'
import { store } from './store.js'
import { DIETS, priceText } from './meta.js'
import { Button, Switch } from './ui.jsx'
import ItemSheet from './ItemSheet.jsx'
import PasteMenu from './PasteMenu.jsx'

// Sections in the order their first item was added; items without a section go last.
function grouped(items) {
  const map = new Map()
  for (const it of items) {
    const key = it.section?.trim() || ''
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(it)
  }
  const out = [...map.entries()]
  out.sort((a, b) => (a[0] === '' ? 1 : b[0] === '' ? -1 : 0))
  return out
}

function menuText(r, items) {
  const lines = [`${r.name || 'Menu'}`]
  for (const [section, list] of grouped(items)) {
    lines.push('', (section || 'Other items').toUpperCase())
    for (const it of list) lines.push(`${it.name}${it.diet ? ` (${it.diet === 'veg' ? 'V' : it.diet === 'egg' ? 'E' : 'NV'})` : ''} | ${priceText(it).replace(/ · /g, ' | ') || '?'}${it.available ? '' : ' (not available)'}`)
  }
  return lines.join('\n')
}

function csv(items) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const rows = [['Section', 'Item', 'Veg/Non-veg', 'Price', 'Sizes', 'Description', 'Available', 'Bestseller']]
  for (const it of items) {
    rows.push([it.section, it.name, it.diet, it.price ?? '', (it.variants || []).map((v) => `${v.label} ${v.price}`).join(' / '),
      it.description, it.available ? 'yes' : 'no', it.bestseller ? 'yes' : 'no'])
  }
  return rows.map((r) => r.map(esc).join(',')).join('\n')
}

export function DietMark({ diet, size = 14 }) {
  const d = DIETS.find((x) => x.id === diet)
  if (!d) return <span className="inline-block shrink-0 rounded-[3px] border border-stone-300" style={{ width: size, height: size }} />
  return (
    <span className={`grid shrink-0 place-items-center rounded-[3px] border-[1.5px] bg-white ${d.ring}`} style={{ width: size, height: size }} title={d.label}>
      <span className={`rounded-full ${d.dot}`} style={{ width: size * 0.45, height: size * 0.45 }} />
    </span>
  )
}

export default function MenuTab({ r, items, setItems, toast }) {
  const [editing, setEditing] = useState(null) // item, or {} for a new one
  const [pasting, setPasting] = useState(false)
  const [q, setQ] = useState('')
  const [clearing, setClearing] = useState(false)
  const sections = useMemo(() => [...new Set(items.map((i) => i.section?.trim()).filter(Boolean))], [items])
  const shown = q.trim() ? items.filter((i) => `${i.name} ${i.section}`.toLowerCase().includes(q.trim().toLowerCase())) : items
  const nextSort = () => items.reduce((m, i) => Math.max(m, i.sort || 0), 0) + 1

  async function toggle(it) {
    const next = { ...it, available: !it.available }
    setItems((list) => list.map((x) => (x.id === it.id ? next : x)))
    try {
      await store.saveItem({ id: it.id, available: next.available })
    } catch (e) {
      setItems((list) => list.map((x) => (x.id === it.id ? it : x)))
      toast(e)
    }
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(menuText(r, items))
      toast('Menu copied. Paste it on WhatsApp to the owner to check prices.')
    } catch {
      toast(new Error('Could not copy on this phone.'))
    }
  }

  // Every dish of this restaurant goes (with its photos), to paste a fresh menu. Other restaurants are untouched.
  async function clearAll() {
    const ok = window.confirm(`Delete all ${items.length} dishes of ${r.name || 'this restaurant'}?\n\nTheir photos go too, and this can't be undone. Then you can paste the new menu.`)
    if (!ok) return
    setClearing(true)
    try {
      const n = await store.clearMenu(r.id)
      setItems([])
      setQ('')
      toast(`Menu cleared: ${n} dish${n === 1 ? '' : 'es'} deleted. Now tap Paste menu.`)
    } catch (e) {
      toast(e)
    }
    setClearing(false)
  }

  function download() {
    const blob = new Blob([csv(items)], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${(r.name || 'menu').replace(/[^\w]+/g, '-').toLowerCase()}-menu.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => setEditing({ section: sections.at(-1) || '' })}>
          <Plus size={18} strokeWidth={2.6} /> Add item
        </Button>
        <Button variant="white" onClick={() => setPasting(true)}>
          <ClipboardPaste size={17} /> Paste menu
        </Button>
      </div>

      {items.length > 0 && (
        <button onClick={clearAll} disabled={clearing} className="press flex w-full items-center justify-center gap-1.5 rounded-2xl border border-rose-200 bg-white py-2.5 text-[13.5px] font-semibold text-rose-700 disabled:opacity-50">
          <Trash2 size={15} /> {clearing ? 'Clearing…' : `Clear all menu (${items.length} dishes)`}
        </button>
      )}

      {items.length === 0 ? (
        <div className="card px-6 py-10 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-fd-soft text-fd-red">
            <UtensilsCrossed size={26} />
          </span>
          <h2 className="mt-4 text-[16px] font-semibold">No menu yet</h2>
          <p className="mx-auto mt-1 max-w-xs text-[13.5px] text-muted">
            Add items one by one, or tap <b>Paste menu</b>: turn a menu photo into text with ChatGPT and paste it all at once.
          </p>
        </div>
      ) : (
        <>
          {items.length > 8 && (
            <div className="relative">
              <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input className="field pl-10" placeholder="Search the menu" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          )}
          {grouped(shown).map(([section, list]) => (
            <section key={section || '—'} className="card overflow-hidden">
              <header className="flex items-center justify-between border-b border-line bg-fd-page/70 px-4 py-2.5">
                <h3 className="text-[14px] font-bold">{section || 'Other items'}</h3>
                <span className="text-[12px] font-semibold text-muted">{list.length}</span>
              </header>
              <ul className="divide-y divide-line">
                {list.map((it) => (
                  <li key={it.id} className="flex items-center gap-3 px-3 py-2.5">
                    <button type="button" onClick={() => setEditing(it)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      <span className="relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-fd-soft">
                        {it.photo ? <img src={store.photoUrl(it.photo)} alt="" className="h-full w-full object-cover" /> : <DietMark diet={it.diet} size={16} />}
                      </span>
                      <span className={`min-w-0 flex-1 ${it.available ? '' : 'opacity-50'}`}>
                        <span className="flex items-center gap-1.5">
                          {it.photo && <DietMark diet={it.diet} size={12} />}
                          <span className="truncate text-[14px] font-semibold">{it.name || 'Unnamed item'}</span>
                          {it.bestseller && <Star size={13} className="shrink-0 fill-fd-yellow text-fd-yellow" />}
                        </span>
                        <span className="block truncate text-[12.5px] text-muted">{priceText(it) || 'No price yet'}{it.available ? '' : ' · Not available'}</span>
                      </span>
                    </button>
                    <Switch small checked={!!it.available} onClick={() => toggle(it)} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <div className="flex flex-wrap justify-center gap-2 pt-1">
            <button onClick={copyText} className="press inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3.5 py-2 text-[12.5px] font-semibold">
              <ClipboardCopy size={14} /> Copy menu to send owner
            </button>
            <button onClick={download} className="press inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3.5 py-2 text-[12.5px] font-semibold">
              <Download size={14} /> Download (Excel)
            </button>
          </div>
        </>
      )}

      <ItemSheet
        item={editing}
        restaurantId={r.id}
        sections={sections}
        nextSort={nextSort}
        toast={toast}
        onClose={() => setEditing(null)}
        onSaved={(saved) => {
          setItems((list) => (list.some((x) => x.id === saved.id) ? list.map((x) => (x.id === saved.id ? saved : x)) : [...list, saved]))
          setEditing(null)
        }}
        onDeleted={(gone) => {
          setItems((list) => list.filter((x) => x.id !== gone.id))
          setEditing(null)
        }}
      />
      <PasteMenu
        open={pasting}
        restaurantId={r.id}
        nextSort={nextSort}
        toast={toast}
        onClose={() => setPasting(false)}
        onAdded={(added) => {
          setItems((list) => [...list, ...added])
          setPasting(false)
        }}
      />
    </>
  )
}
