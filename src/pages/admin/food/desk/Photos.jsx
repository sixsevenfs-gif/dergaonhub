import { useRef, useState } from 'react'
import { Camera, ChevronLeft, ChevronRight, FileText, ImagePlus, Loader2, Trash2 } from 'lucide-react'
import { Viewer } from './ui.jsx'
import CropSheet from './Crop.jsx'

// One photo (cover, dish). Phone shows "Take photo / Photo library" when tapped. With `aspect` the photo is
// cropped to that shape first (CropSheet), the shape the apps show.
export function SinglePhoto({ url, onPick, onRemove, busy, label = 'Add photo', tall = false, aspect = null, cropTitle }) {
  const input = useRef(null)
  const [view, setView] = useState(false)
  const [pending, setPending] = useState(null)
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => (url ? setView(true) : input.current?.click())}
        className={`press relative grid shrink-0 place-items-center overflow-hidden rounded-2xl border border-dashed border-fd-red/40 bg-fd-soft text-fd-red ${tall ? 'h-28 w-28' : 'h-20 w-20'}`}
      >
        {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <ImagePlus size={24} />}
        {busy && (
          <span className="absolute inset-0 grid place-items-center bg-white/70">
            <Loader2 className="animate-spin" size={20} />
          </span>
        )}
      </button>
      <div className="flex flex-col items-start gap-1.5">
        <button type="button" onClick={() => input.current?.click()} className="press inline-flex items-center gap-1.5 rounded-xl bg-white border border-line px-3 py-2 text-[13px] font-semibold">
          <Camera size={15} /> {url ? 'Change photo' : label}
        </button>
        {url && onRemove && (
          <button type="button" onClick={onRemove} className="inline-flex items-center gap-1 px-1 text-[12.5px] font-medium text-rose-700">
            <Trash2 size={13} /> Remove
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) (aspect ? setPending(f) : onPick(f))
        }}
      />
      {view && <Viewer src={url} onClose={() => setView(false)} />}
      <CropSheet file={pending} aspect={aspect || 1} title={cropTitle} onCancel={() => setPending(null)}
        onDone={(f) => { setPending(null); onPick(f) }} />
    </div>
  )
}

// Several papers / photos of one kind (FSSAI, menu card pages ...). PDFs allowed where pdf = true.
export function FileTiles({ files, onAdd, onDelete, busy, pdf = true }) {
  const input = useRef(null)
  const [view, setView] = useState(null)
  return (
    <div className="flex flex-wrap gap-2.5">
      {files.map((f) => (
        <div key={f.id} className="relative h-[84px] w-[84px] overflow-hidden rounded-2xl border border-line bg-white">
          <button type="button" className="h-full w-full" onClick={() => setView(f)}>
            {f.pdf ? (
              <span className="grid h-full place-items-center text-muted">
                <FileText size={26} />
                <span className="-mt-3 text-[11px] font-semibold">PDF</span>
              </span>
            ) : (
              <img src={f.url} alt="" className="h-full w-full object-cover" />
            )}
          </button>
          <button
            type="button"
            onClick={() => onDelete(f)}
            className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-white/95 text-rose-700 shadow"
            aria-label="Delete"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="press grid h-[84px] w-[84px] place-items-center rounded-2xl border border-dashed border-fd-red/40 bg-fd-soft text-fd-red"
      >
        {busy ? <Loader2 className="animate-spin" size={20} /> : (
          <span className="flex flex-col items-center gap-1 text-[11.5px] font-semibold">
            <Camera size={20} /> Add
          </span>
        )}
      </button>
      <input
        ref={input}
        type="file"
        accept={pdf ? 'image/*,application/pdf' : 'image/*'}
        multiple
        hidden
        onChange={(e) => {
          const list = [...(e.target.files || [])]
          e.target.value = ''
          if (list.length) onAdd(list)
        }}
      />
      {view && <Viewer src={view.url} pdf={view.pdf} onClose={() => setView(null)} />}
    </div>
  )
}

// Several cover photos (update 075): the app shows them one after another on the restaurant card and page. The
// first is the main one (also the photo apps from before the update show). Tap a photo to see it big.
export function CoverPhotos({ paths, urlOf, onAdd, onRemove, onMove, busy, max = 8, aspect = null }) {
  const input = useRef(null)
  const [view, setView] = useState('')
  // Photos waiting to be cropped one by one, and the ones done (added together at the end).
  const [queue, setQueue] = useState([])
  const [done, setDone] = useState([])
  function next(cropped) {
    const all = cropped ? [...done, cropped] : done
    const rest = queue.slice(1)
    if (rest.length) {
      setDone(all)
      setQueue(rest)
    } else {
      setQueue([])
      setDone([])
      if (all.length) onAdd(all)
    }
  }
  const room = max - paths.length
  return (
    <div>
      <div className="flex flex-wrap gap-2.5">
        {paths.map((p, k) => (
          <div key={p} className="relative h-28 w-28 overflow-hidden rounded-2xl border border-line bg-white">
            <button type="button" className="h-full w-full" onClick={() => setView(urlOf(p))} aria-label={`Cover photo ${k + 1}`}>
              <img src={urlOf(p)} alt="" className="h-full w-full object-cover" />
            </button>
            {k === 0 && <span className="absolute left-1.5 top-1.5 rounded-full bg-fd-red px-2 py-0.5 text-[10px] font-bold text-white">Main</span>}
            <button type="button" onClick={() => onRemove(p)} aria-label="Delete this photo"
              className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-white/95 text-rose-700 shadow">
              <Trash2 size={14} />
            </button>
            <div className="absolute inset-x-1 bottom-1 flex justify-between">
              {k > 0 ? (
                <button type="button" onClick={() => onMove(k, k - 1)} aria-label="Move earlier" className="grid h-7 w-7 place-items-center rounded-full bg-white/95 shadow">
                  <ChevronLeft size={16} />
                </button>
              ) : <span />}
              {k < paths.length - 1 && (
                <button type="button" onClick={() => onMove(k, k + 1)} aria-label="Move later" className="grid h-7 w-7 place-items-center rounded-full bg-white/95 shadow">
                  <ChevronRight size={16} />
                </button>
              )}
            </div>
          </div>
        ))}
        {room > 0 && (
          <button type="button" onClick={() => input.current?.click()} disabled={busy}
            className="press grid h-28 w-28 place-items-center rounded-2xl border border-dashed border-fd-red/40 bg-fd-soft text-fd-red">
            {busy ? <Loader2 className="animate-spin" size={22} /> : (
              <span className="flex flex-col items-center gap-1 text-[12px] font-semibold">
                <ImagePlus size={24} /> {paths.length ? 'Add more' : 'Add photos'}
              </span>
            )}
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])].slice(0, room)
          e.target.value = ''
          if (files.length) (aspect ? setQueue(files) : onAdd(files))
        }}
      />
      {view && <Viewer src={view} onClose={() => setView('')} />}
      <CropSheet file={queue[0] ?? null} aspect={aspect || 1}
        title={queue.length > 1 ? `Crop the cover photo (${done.length + 1} of ${done.length + queue.length})` : 'Crop the cover photo'}
        onCancel={() => next(null)} onDone={(f) => next(f)} />
    </div>
  )
}

