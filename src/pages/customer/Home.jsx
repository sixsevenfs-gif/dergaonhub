import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, Briefcase, ChevronRight, House, Plus, Search, Store } from 'lucide-react'
import Wordmark from '../../components/Wordmark.jsx'
import ShopCard from '../../components/ShopCard.jsx'
import ProductThumb from '../../components/ProductThumb.jsx'
import { card, field } from '../../components/ui.js'
import { listLiveShops, searchAll } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { isOpenNow, rupee } from '../../lib/format.js'

function Tile({ icon: Icon, title, note, to, onClick, soon }) {
  const body = (
    <>
      <div className="flex items-start justify-between">
        <Icon size={34} className={soon ? 'text-muted' : 'text-accent'} strokeWidth={1.75} />
        {soon && <span className="whitespace-nowrap rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-muted">Jaldi aa raha hai</span>}
      </div>
      <div className="mt-3 flex items-end justify-between gap-1">
        <div>
          <div className={`text-lg font-bold ${soon ? 'text-muted' : ''}`}>{title}</div>
          <div className="text-sm leading-snug text-muted">{note}</div>
        </div>
        <ChevronRight size={18} className="mb-0.5 shrink-0 text-muted" />
      </div>
    </>
  )
  const cls = `${card} block p-4 text-left ${soon ? 'opacity-60' : 'active:bg-white/5'}`
  if (soon) return <div className={cls}>{body}</div>
  if (to) return <Link to={to} className={cls}>{body}</Link>
  return <button type="button" onClick={onClick} className={cls}>{body}</button>
}

export default function Home() {
  const [q, setQ] = useState('')
  const { data: shops = [] } = useData(listLiveShops)
  const { data: results } = useData(() => (q.trim().length > 1 ? searchAll(q) : null), [q])
  const openCount = shops.filter((s) => isOpenNow(s)).length

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-28 pt-4">
      <header className="flex h-12 items-center justify-between">
        <Wordmark />
        <Link to="/shop" className="font-semibold text-accent underline underline-offset-4">Shop login</Link>
      </header>

      <h1 className="mt-8 text-[42px] font-black leading-[1.05] tracking-tight">
        Dergaon ka sab kuch, <span className="text-accent">ek jagah.</span>
      </h1>
      <p className="mt-3 text-lg text-muted">Order before 2 pm, delivery today between 5 and 8 pm.</p>

      <div className="relative mt-6">
        <Search size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search for shops, products, services..."
          className={`${field} h-14 bg-card pl-12`}
        />
      </div>

      {results ? (
        <section className="mt-5 space-y-3">
          {results.products.map((p) => (
            <Link key={p.id} to={`/s/${p.shop_id}?q=${encodeURIComponent(p.name)}`} className={`${card} flex items-center gap-3 p-3`}>
              <ProductThumb product={p} size="h-12 w-12" iconSize={22} className="bg-white/5" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{p.name} <span className="font-normal text-muted">{p.size}</span></div>
                <div className="text-sm text-muted">{p.shop_name}</div>
              </div>
              <div className="font-bold">{p.available ? rupee(p.price) : <span className="text-sm text-muted">Out of stock</span>}</div>
            </Link>
          ))}
          {results.shops.map((s) => <ShopCard key={s.id} shop={s} />)}
          {results.directory.map((d) => (
            <Link key={d.id} to={`/directory?q=${encodeURIComponent(d.name)}`} className={`${card} block p-3`}>
              <div className="font-semibold">{d.name}</div>
              <div className="text-sm text-muted">{d.category} · {d.area}</div>
            </Link>
          ))}
          {!results.products.length && !results.shops.length && !results.directory.length && (
            <p className="py-6 text-center text-muted">Kuch nahi mila. Dusra naam try karo.</p>
          )}
        </section>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <Tile icon={Store} title="Shops" note="Local shops, home delivery" onClick={() => document.getElementById('shops')?.scrollIntoView({ behavior: 'smooth' })} />
            <Tile icon={BookOpen} title="Directory" note="Doctors, tutors, services" to="/directory" />
            <Tile icon={Briefcase} title="Jobs" note="Find local jobs" soon />
            <Tile icon={House} title="Rent" note="Rooms, shops, properties" soon />
          </div>

          <section id="shops" className="mt-8 scroll-mt-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">Live Shops</h2>
              <span className="flex items-center gap-2 text-sm text-muted">
                {openCount} open now <span className="h-2.5 w-2.5 rounded-full bg-accent" />
              </span>
            </div>
            <div className="mt-3 space-y-3">
              {shops.map((s) => <ShopCard key={s.id} shop={s} />)}
              {!shops.length && <p className="py-6 text-center text-muted">Pehli shops jaldi aa rahi hain.</p>}
            </div>
          </section>
        </>
      )}

      <div className="fixed inset-x-0 bottom-0 bg-gradient-to-t from-ink via-ink/95 to-transparent px-4 pb-4 pt-6">
        <Link to="/shop" className="mx-auto flex h-14 max-w-md items-center justify-center gap-2 rounded-full bg-accent text-lg font-bold text-ink">
          <Plus size={22} /> Apni shop free mein list karo
        </Link>
      </div>
    </main>
  )
}
