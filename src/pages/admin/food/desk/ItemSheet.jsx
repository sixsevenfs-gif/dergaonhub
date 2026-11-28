import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import { store } from './store.js'
import { DIETS } from './meta.js'
import { Area, Button, Chips, Field, Num, Sheet, Text, Toggle } from './ui.jsx'
import { SinglePhoto } from './Photos.jsx'

const blank = { section: '', name: '', description: '', diet: '', price: '', variants: [], photo: '', available: true, bestseller: false }

// Add or change one menu item. Only what is typed is saved; everything can stay empty.
export default function ItemSheet({ item, restaurantId, sections, nextSort, toast, onClose, onSaved, onDeleted }) {
  const [f, setF] = useState(blank)
  const [busy, setBusy] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const uploaded = useRef([]) // photos added while this sheet is open (removed again if not saved)
  const isNew = !item?.id

  useEffect(() => {
    if (!item) return
    uploaded.current = []
    setF({
      ...blank,
      ...item,
      price: item.price ?? '',
      variants: (item.variants || []).map((v) => ({ label: v.label ?? '', price: v.price ?? '' })),
    })
  }, [item])

  const set = (k, v) => setF((cur) => ({ ...cur, [k]: v }))
  const setVariant = (i, k, v) => setF((cur) => ({ ...cur, variants: cur.variants.map((x, j) => (j === i ? { ...x, [k]: v } : x)) }))

  async function photo(file) {
    setPhotoBusy(true)
    try {
      const path = await store.uploadPhoto(restaurantId, file, 'dish')
      uploaded.current.push(path)
      set('photo', path)
    } catch (e) {
      toast(e)
    } finally {
      setPhotoBusy(false)
    }
  }

  function close() {
    // Photos picked but never saved are not kept.
    for (const p of uploaded.current) if (p !== item?.photo) store.removePhoto(p).catch(() => {})
    uploaded.current = []
    onClose()
  }

  async function save() {
    setBusy(true)
    try {
      const variants = f.variants
        .filter((v) => String(v.label).trim() || String(v.price).trim())
        .map((v, i) => ({ label: String(v.label).trim() || `Option ${i + 1}`, price: v.price === '' ? null : Number(v.price) }))
      const prices = variants.map((v) => v.price).filter((p) => p != null && !Number.isNaN(p))
      const price = variants.length ? (prices.length ? Math.min(...prices) : null) : f.price === '' ? null : Number(f.price)
      const row = {
        id: item?.id,
        restaurant_id: restaurantId,
        section: f.section.trim(),
        name: f.name.trim(),
        description: f.description.trim(),
        diet: f.diet,
        price: Number.isNaN(price) ? null : price,
        variants,
        photo: f.photo,
        available: f.available,
        bestseller: f.bestseller,
        ...(isNew ? { sort: nextSort() } : {}),
      }
      const saved = await store.saveItem(row)
      // An old photo that was replaced is removed.
      if (item?.photo && item.photo !== f.photo) store.removePhoto(item.photo).catch(() => {})
      for (const p of uploaded.current) if (p !== f.photo) store.removePhoto(p).catch(() => {})
      uploaded.current = []
      onSaved(saved)
    } catch (e) {
      toast(e)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!confirm(`Delete ${item.name || 'this item'}?`)) return
    setBusy(true)
    try {
      await store.deleteItem(item)
      onDeleted(item)
    } catch (e) {
      toast(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open={!!item}
      onClose={close}
      title={isNew ? 'New item' : 'Edit item'}
      footer={
        <div className="flex gap-2">
          {!isNew && (
            <Button variant="danger" onClick={remove} disabled={busy} aria-label="Delete item">
              <Trash2 size={17} />
            </Button>
          )}
          <Button className="flex-1" busy={busy} onClick={save}>{isNew ? 'Add to menu' : 'Save'}</Button>
        </div>
      }
    >
      <div className="space-y-3.5">
        <Field label="Item name">
          <Text value={f.name} onChange={(v) => set('name', v)} placeholder="e.g. Chicken Biryani" autoFocus={isNew} />
        </Field>
        <Field label="Section" hint="Menu heading, like Biryani, Momos, Starters.">
          <Text value={f.section} onChange={(v) => set('section', v)} list="sections" placeholder="e.g. Momos" />
          <datalist id="sections">
            {sections.map((s) => <option key={s} value={s} />)}
          </datalist>
          {sections.length > 0 && (
            <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto">
              {sections.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => set('section', s)}
                  className={`press shrink-0 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold ${f.section === s ? 'border-fd-red bg-fd-red text-white' : 'border-line bg-white'}`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </Field>
        <Field label="Veg / non-veg">
          <Chips options={DIETS} value={f.diet} onChange={(v) => set('diet', v)} />
        </Field>

        {f.variants.length === 0 ? (
          <Field
            label="Price (menu price)"
            right={
              <button type="button" onClick={() => set('variants', [{ label: 'Half', price: '' }, { label: 'Full', price: '' }])} className="text-[12.5px] font-semibold text-fd-red">
                Half / Full?
              </button>
            }
          >
            <Num prefix="₹" decimals value={f.price} onChange={(v) => set('price', v)} placeholder="120" />
          </Field>
        ) : (
          <Field label="Sizes and prices">
            <div className="space-y-2">
              {f.variants.map((v, i) => (
                <div key={i} className="flex gap-2">
                  <input className="field flex-1" value={v.label} onChange={(e) => setVariant(i, 'label', e.target.value)} placeholder="Half / 6 pcs / Small" />
                  <div className="w-32 shrink-0">
                    <Num prefix="₹" decimals value={v.price} onChange={(val) => setVariant(i, 'price', val)} placeholder="0" />
                  </div>
                  <button
                    type="button"
                    onClick={() => set('variants', f.variants.filter((_, j) => j !== i))}
                    className="grid w-11 shrink-0 place-items-center rounded-2xl border border-line bg-white text-muted"
                    aria-label="Remove size"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => set('variants', [...f.variants, { label: '', price: '' }])} className="inline-flex items-center gap-1 text-[13px] font-semibold text-fd-red">
                <Plus size={15} /> Add size
              </button>
            </div>
          </Field>
        )}

        <Field label="Description (optional)">
          <Area rows={2} value={f.description} onChange={(v) => set('description', v)} placeholder="e.g. 8 pcs, served with red chutney" />
        </Field>
        <Field label="Photo (optional)" hint="Only a real photo of their dish. No photo is fine.">
          <SinglePhoto url={store.photoUrl(f.photo)} busy={photoBusy} onPick={photo} onRemove={() => set('photo', '')} label="Add dish photo" aspect={1} cropTitle="Crop the dish photo" />
        </Field>
        <div className="card space-y-3 p-3.5">
          <Toggle checked={f.available} onChange={(v) => set('available', v)} label="Available now" hint="Switch off when it is finished for the day." />
          <Toggle checked={f.bestseller} onChange={(v) => set('bestseller', v)} label="Bestseller" hint="Their most ordered dishes." />
        </div>
      </div>
    </Sheet>
  )
}
