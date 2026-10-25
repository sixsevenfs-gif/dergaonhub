import { Link } from 'react-router-dom'
import Wordmark from '../../components/Wordmark.jsx'

// Stage 1 shows Shops and Directory; Jobs, Rent, Bus & train come later (plan section 14).
const tiles = [
  { label: 'Shops', note: 'Order karo', live: true },
  { label: 'Directory', note: 'Call / WhatsApp', live: true },
  { label: 'Jobs', note: 'Jaldi aa raha', live: false },
  { label: 'Rent', note: 'Jaldi aa raha', live: false },
]

export default function Home() {
  return (
    <main className="mx-auto min-h-screen max-w-md px-4 py-5">
      <header className="flex items-center justify-between">
        <Wordmark />
        <Link to="/shop" className="text-sm text-muted underline underline-offset-4">
          Shop login
        </Link>
      </header>

      <h1 className="mt-10 text-4xl font-black leading-tight">
        Dergaon ka sab kuch, <span className="text-accent">ek jagah.</span>
      </h1>

      <p className="mt-3 text-muted">Order before 2 pm, delivery today between 5 and 8 pm.</p>

      <input
        type="search"
        placeholder="Search atta, rice, shop..."
        className="mt-6 h-12 w-full rounded-xl border border-line bg-card px-4 text-white placeholder:text-muted focus:border-accent focus:outline-none"
      />

      <div className="mt-6 grid grid-cols-2 gap-3">
        {tiles.map((t) => (
          <div
            key={t.label}
            className={`rounded-2xl border border-line bg-card p-4 ${t.live ? '' : 'opacity-40'}`}
          >
            <div className="text-lg font-bold">{t.label}</div>
            <div className="text-sm text-muted">{t.note}</div>
          </div>
        ))}
      </div>

      <Link
        to="/shop"
        className="mt-6 flex h-12 w-full items-center justify-center rounded-xl bg-accent font-bold text-ink"
      >
        Apni shop free mein list karo
      </Link>
    </main>
  )
}
