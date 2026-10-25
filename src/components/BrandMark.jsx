// The bag-with-leaf mark from public/brand/mlc-foodhub-icon.svg, drawn inline so it never has to load.
export default function BrandMark({ className = 'h-10 w-10' }) {
  return (
    <svg viewBox="0 0 128 128" className={className} aria-hidden="true">
      <rect width="128" height="128" rx="28" fill="#0B0B0B" />
      <path d="M42 52v-9a22 22 0 0 1 44 0v9" fill="none" stroke="#E8FF3A" strokeWidth="8" strokeLinecap="round" />
      <path d="M27 50h74l-6.5 49a10 10 0 0 1-9.9 8.7H43.4a10 10 0 0 1-9.9-8.7Z" fill="#E8FF3A" />
      <path d="M48 95c0-19 13-30 32-30 0 19-12 30-32 30Z" fill="#0B0B0B" />
      <path d="M51 92l22-22" stroke="#E8FF3A" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  )
}
