import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, CloudOff, Loader2, X } from 'lucide-react'
import { statusOf } from './meta.js'

export function TopBar({ title, onBack, right, children }) {
  return (
    <header className="rounded-2xl border border-line bg-fd-page">
      <div className="mx-auto flex h-14 max-w-2xl items-center gap-2 px-3">
        {onBack && (
          <button onClick={onBack} className="press grid h-10 w-10 place-items-center rounded-full bg-white border border-line" aria-label="Back">
            <ArrowLeft size={20} />
          </button>
        )}
        <div className="min-w-0 flex-1">{title}</div>
        {right}
      </div>
      {children}
    </header>
  )
}

export function Section({ title, icon: Icon, hint, children, id }) {
  return (
    <section id={id} className="card p-4">
      <div className="mb-3 flex items-center gap-2">
        {Icon && (
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-fd-soft text-fd-red">
            <Icon size={17} strokeWidth={2.2} />
          </span>
        )}
        <h2 className="text-[15px] font-semibold">{title}</h2>
      </div>
      {hint && <p className="-mt-1 mb-3 text-[13px] leading-snug text-muted">{hint}</p>}
      <div className="space-y-3.5">{children}</div>
    </section>
  )
}

export function Field({ label, hint, children, right }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-ink/80">{label}</span>
        {right}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[12px] leading-snug text-muted">{hint}</span>}
    </label>
  )
}

export function Text({ value, onChange, ...rest }) {
  return <input className="field" value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest} />
}

export function Area({ value, onChange, rows = 3, ...rest }) {
  return <textarea className="field" rows={rows} value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest} />
}

// Number typed as text (no spinner, no surprises on phones). Empty means "not filled".
export function Num({ value, onChange, prefix, suffix, decimals = false, placeholder }) {
  return (
    <div className="relative">
      {prefix && <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">{prefix}</span>}
      <input
        className={`field ${prefix ? 'pl-8' : ''} ${suffix ? 'pr-14' : ''}`}
        inputMode={decimals ? 'decimal' : 'numeric'}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value.replace(decimals ? /[^\d.]/g : /\D/g, ''))}
      />
      {suffix && <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[13px] text-muted">{suffix}</span>}
    </div>
  )
}

export function Chips({ options, value, onChange, multi = false, allowClear = true }) {
  const picked = (id) => (multi ? (value || []).includes(id) : value === id)
  const tap = (id) => {
    if (multi) {
      const v = value || []
      onChange(v.includes(id) ? v.filter((x) => x !== id) : [...v, id])
    } else {
      onChange(picked(id) && allowClear ? '' : id)
    }
  }
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const id = typeof o === 'string' ? o : o.id
        const label = typeof o === 'string' ? o : o.label
        const on = picked(id)
        return (
          <button
            type="button"
            key={id}
            onClick={() => tap(id)}
            className={`press rounded-full border px-3.5 py-2 text-[13.5px] font-medium transition-colors ${
              on ? 'border-fd-red bg-fd-red text-white shadow-sm' : 'border-line bg-white text-ink'
            }`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

export function Toggle({ checked, onChange, label, hint }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex w-full items-center gap-3 text-left">
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium">{label}</span>
        {hint && <span className="block text-[12px] text-muted">{hint}</span>}
      </span>
      <Switch checked={checked} />
    </button>
  )
}

export function Switch({ checked, onClick, small = false }) {
  const w = small ? 'h-6 w-10' : 'h-7 w-12'
  const k = small ? 'h-5 w-5' : 'h-6 w-6'
  const move = small ? 'translate-x-4' : 'translate-x-5'
  return (
    <span
      role="switch"
      aria-checked={checked}
      onClick={onClick}
      className={`relative inline-flex shrink-0 items-center rounded-full p-0.5 transition-colors ${w} ${checked ? 'bg-fd-veg' : 'bg-stone-300'}`}
    >
      <span className={`${k} rounded-full bg-white shadow transition-transform ${checked ? move : ''}`} />
    </span>
  )
}

export function Button({ variant = 'red', className = '', children, busy, ...rest }) {
  const look = {
    red: 'bg-fd-red text-white shadow-[0_6px_16px_rgb(226_35_26/0.28)]',
    soft: 'bg-fd-soft text-fd-red-dark',
    white: 'bg-white border border-line text-ink',
    danger: 'bg-white border border-rose-200 text-rose-700',
  }[variant]
  return (
    <button
      type="button"
      disabled={busy || rest.disabled}
      className={`press inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-[14.5px] font-semibold disabled:opacity-60 ${look} ${className}`}
      {...rest}
    >
      {busy && <Loader2 size={17} className="animate-spin" />}
      {children}
    </button>
  )
}

export function StatusChip({ status }) {
  const s = statusOf(status)
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[12px] font-semibold ${s.tone}`}>{s.label}</span>
}

export function SaveBadge({ state, onRetry }) {
  if (state === 'saving')
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12px] font-medium text-muted border border-line">
        <Loader2 size={13} className="animate-spin" /> Saving
      </span>
    )
  if (state === 'error')
    return (
      <button onClick={onRetry} className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1.5 text-[12px] font-semibold text-rose-700 border border-rose-200">
        <CloudOff size={13} /> Not saved · Retry
      </button>
    )
  if (state === 'saved')
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-[12px] font-semibold text-emerald-700 border border-emerald-200">
        <Check size={13} /> Saved
      </span>
    )
  return null
}

// Bottom sheet for forms (item editor, paste menu).
export function Sheet({ open, onClose, title, children, footer }) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="fade-in absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="sheet-up relative flex max-h-[92dvh] w-full max-w-2xl flex-col rounded-t-[28px] bg-fd-page" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex items-center gap-2 px-4 pb-2 pt-3">
          <span className="absolute left-1/2 top-2 h-1.5 w-10 -translate-x-1/2 rounded-full bg-stone-300" />
          <h3 className="mt-3 flex-1 text-[17px] font-semibold">{title}</h3>
          <button onClick={onClose} className="mt-3 grid h-9 w-9 place-items-center rounded-full bg-white border border-line" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4">{children}</div>
        {footer && <div className="border-t border-line bg-white px-4 py-3">{footer}</div>}
      </div>
    </div>
  )
}

const ToastCtx = createContext(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastHost({ children }) {
  const [toast, setToast] = useState(null)
  const timer = useRef(null)
  const show = useCallback((text, kind = 'ok') => {
    clearTimeout(timer.current)
    setToast({ text: text instanceof Error ? text.message : String(text), kind: text instanceof Error ? 'error' : kind, key: Date.now() })
    timer.current = setTimeout(() => setToast(null), 3200)
  }, [])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4 sm:bottom-6" style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
          <div key={toast.key} className={`toast-in max-w-md rounded-2xl px-4 py-3 text-[14px] font-medium text-white shadow-lg ${toast.kind === 'error' ? 'bg-rose-700' : 'bg-ink'}`}>
            {toast.text}
          </div>
        </div>
      )}
    </ToastCtx.Provider>
  )
}

export function Spinner({ label = 'Loading' }) {
  return (
    <div className="grid place-items-center py-20 text-muted">
      <Loader2 className="animate-spin" />
      <span className="mt-2 text-[13px]">{label}</span>
    </div>
  )
}

// Photo viewer over everything; tap anywhere to close.
export function Viewer({ src, pdf, onClose }) {
  if (!src) return null
  return (
    <div className="fade-in fixed inset-0 z-[70] flex flex-col bg-black/90" onClick={onClose}>
      <div className="flex justify-end p-3" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}>
        <button className="grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white" aria-label="Close">
          <X size={20} />
        </button>
      </div>
      <div className="flex flex-1 items-center justify-center p-3" onClick={(e) => e.stopPropagation()}>
        {pdf ? (
          <a href={src} target="_blank" rel="noreferrer" className="rounded-2xl bg-white px-5 py-3 font-semibold">Open the PDF</a>
        ) : (
          <img src={src} alt="" className="max-h-full max-w-full rounded-xl object-contain" />
        )}
      </div>
    </div>
  )
}
