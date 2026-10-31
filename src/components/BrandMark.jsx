// App icon: a white jhola (bag) with a leaf on dark green.
export default function BrandMark({ className = 'h-10 w-10' }) {
  return (
    <svg viewBox="0 0 128 128" className={className} aria-hidden="true">
      <rect width="128" height="128" rx="28" fill="#1F6B3A" />
      <path d="M42 52v-9a22 22 0 0 1 44 0v9" fill="none" stroke="#fff" strokeWidth="8" strokeLinecap="round" />
      <path d="M27 50h74l-6.5 49a10 10 0 0 1-9.9 8.7H43.4a10 10 0 0 1-9.9-8.7Z" fill="#fff" />
      <path d="M48 95c0-19 13-30 32-30 0 19-12 30-32 30Z" fill="#5FA63F" />
      <path d="M51 92l22-22" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  )
}

// The leaf that sits on the "O" of the wordmark.
export function Leaf({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M3 21C3 10 10 3.5 22 2.5 21 14 14 21 3 21Z" fill="#5FA63F" />
      <path d="M4.5 19.5 15 9" stroke="#fff" strokeOpacity=".75" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
