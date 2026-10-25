import { useRef, useState } from 'react'
import { Camera, X } from 'lucide-react'
import { compressImage } from '../lib/image.js'

// Tap to pick or take a photo. The photo is shrunk, then passed to onSave(dataUrl).
// onSave('') removes the photo.
export default function PhotoPicker({ photoUrl, onSave, label = 'Photo', fallback, className = 'h-14 w-14' }) {
  const input = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const pick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    setError('')
    try {
      await onSave(await compressImage(file))
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  return (
    <div className="shrink-0">
      <div className="relative">
        <button
          type="button"
          onClick={() => input.current?.click()}
          aria-label={photoUrl ? `Change ${label}` : `Add ${label}`}
          className={`flex items-center justify-center overflow-hidden rounded-xl border border-dashed border-neutral-300 bg-neutral-50 text-neutral-500 ${className}`}
        >
          {busy ? (
            <span className="text-xs">...</span>
          ) : photoUrl ? (
            <img src={photoUrl} alt="" className="h-full w-full object-contain" />
          ) : (
            fallback ?? <Camera size={20} />
          )}
          {!photoUrl && !busy && <Camera size={13} className="absolute bottom-1 right-1 rounded bg-white text-neutral-700" />}
        </button>
        {photoUrl && (
          <button type="button" onClick={() => onSave('')} aria-label={`Remove ${label}`} className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-neutral-900 text-white">
            <X size={13} />
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/*" onChange={pick} className="hidden" />
      {error && <p className="mt-1 max-w-48 text-xs text-red-600">{error}</p>}
    </div>
  )
}
