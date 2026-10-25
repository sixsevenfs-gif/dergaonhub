// Shared class names so every page looks the same.
export const cx = (...c) => c.filter(Boolean).join(' ')

// Customer site (dark)
export const card = 'rounded-2xl border border-line bg-card'
export const field =
  'h-12 w-full rounded-xl border border-line bg-ink px-4 text-white placeholder:text-muted/70 focus:border-accent focus:outline-none'
export const btnAccent =
  'flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 text-lg font-bold text-ink active:scale-[.99] disabled:opacity-40'
export const btnOutline =
  'flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line px-4 font-semibold text-white active:bg-white/5'
export const btnWhatsApp =
  'flex min-h-14 w-full items-center justify-center gap-3 rounded-xl bg-[#1FAF54] px-4 text-lg font-bold text-white active:scale-[.99]'

// Shop dashboard and admin (light)
export const lcard = 'rounded-2xl border border-neutral-200 bg-white'
export const lfieldBase =
  'h-11 rounded-xl border border-neutral-300 bg-white px-3 text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none'
export const lfield = `${lfieldBase} w-full`
export const lbtn =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 font-semibold active:scale-[.99] disabled:opacity-40'
export const lbtnDark = `${lbtn} bg-neutral-900 text-white`
export const lbtnAccent = `${lbtn} bg-accent text-ink`
export const lbtnOutline = `${lbtn} border border-neutral-300 bg-white text-neutral-900`
export const lbtnDanger = `${lbtn} border border-red-200 bg-white text-red-600`
