import { useMemo, useState } from 'react'
import { ClipboardCopy, Trash2 } from 'lucide-react'
import { store } from './store.js'
import { CHATGPT_PROMPT, parseMenu } from './menuText.js'
import { priceText } from './meta.js'
import { Button, Sheet } from './ui.jsx'
import { DietMark } from './MenuTab.jsx'

// Paste a whole menu as text (from ChatGPT, or typed) and add every item in one go.
export default function PasteMenu({ open, restaurantId, nextSort, toast, onClose, onAdded }) {
  const [text, setText] = useState('')
  const [skip, setSkip] = useState(() => new Set())
  const [busy, setBusy] = useState(false)
  const parsed = useMemo(() => parseMenu(text), [text])
  const chosen = parsed.filter((_, i) => !skip.has(i))

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(CHATGPT_PROMPT)
      toast('Copied. In ChatGPT: paste this, attach the menu photo, send.')
    } catch {
      toast(new Error('Could not copy on this phone.'))
    }
  }

  async function add() {
    setBusy(true)
    try {
      let sort = nextSort()
      const added = await store.addItems(restaurantId, chosen.map((it) => ({ ...it, available: true, bestseller: false, sort: sort++ })))
      toast(`${added.length} items added`)
      setText('')
      setSkip(new Set())
      onAdded(added)
    } catch (e) {
      toast(e)
    } finally {
      setBusy(false)
    }
  }

  let lastSection = null
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Paste a menu"
      footer={
        <Button className="w-full" busy={busy} disabled={!chosen.length} onClick={add}>
          {chosen.length ? `Add ${chosen.length} items` : 'Paste the menu text above'}
        </Button>
      }
    >
      <div className="space-y-3">
        <div className="rounded-2xl bg-fd-soft p-3.5 text-[13px] leading-relaxed text-ink/85">
          <b>Fast way:</b> copy the prompt below, open ChatGPT, paste it and attach the menu photo. Copy what it writes back and paste it here.
          <button onClick={copyPrompt} className="press mt-2.5 flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-[13px] font-semibold text-fd-red border border-fd-red/20">
            <ClipboardCopy size={15} /> Copy the ChatGPT prompt
          </button>
        </div>
        <textarea
          className="field font-mono text-[14px]"
          rows={8}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setSkip(new Set())
          }}
          placeholder={'MOMOS\nVeg Momos (V) | Half 60 | Full 100\nChicken Momos (NV) | Half 70 | Full 120\n\nBIRYANI\nChicken Biryani (NV) | 180'}
        />
        {parsed.length > 0 && (
          <div className="card overflow-hidden">
            <p className="border-b border-line bg-fd-page/70 px-3.5 py-2 text-[12.5px] font-semibold text-muted">
              Check before adding · tap the bin to leave a line out
            </p>
            <ul className="divide-y divide-line">
              {parsed.map((it, i) => {
                const head = it.section !== lastSection
                lastSection = it.section
                return (
                  <li key={i}>
                    {head && <p className="bg-white px-3.5 pt-2.5 text-[12px] font-bold uppercase tracking-wide text-fd-red">{it.section || 'No section'}</p>}
                    <div className={`flex items-center gap-2.5 px-3.5 py-2 ${skip.has(i) ? 'opacity-35 line-through' : ''}`}>
                      <DietMark diet={it.diet} size={13} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-semibold">{it.name}</span>
                        <span className="block text-[12px] text-muted">{priceText(it) || 'no price'}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setSkip((s) => {
                          const n = new Set(s)
                          n.has(i) ? n.delete(i) : n.add(i)
                          return n
                        })}
                        className="grid h-8 w-8 place-items-center rounded-full text-muted"
                        aria-label="Leave out"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>
    </Sheet>
  )
}
