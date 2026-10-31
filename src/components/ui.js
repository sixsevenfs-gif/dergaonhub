// Shared class names so every page looks the same.
export const cx = (...c) => c.filter(Boolean).join(' ')

// Customer site (white pages, dark green buttons)
export const card = 'rounded-2xl border border-line bg-card shadow-[0_2px_10px_rgb(26_31_27/0.04)]'
export const field =
  'h-12 w-full rounded-xl border border-line bg-white px-4 text-ink placeholder:text-muted focus:border-brand focus:outline-none'
export const btnAccent =
  'flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand px-4 text-base font-semibold text-white shadow-[0_6px_16px_rgb(31_107_58/0.25)] active:scale-[.99] disabled:opacity-40 disabled:shadow-none'
export const btnOutline =
  'flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-line bg-white px-4 font-semibold text-ink active:bg-mint'
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
