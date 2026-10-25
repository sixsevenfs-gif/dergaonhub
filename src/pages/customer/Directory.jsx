import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Clock, MapPin, Phone, Plus, Search } from 'lucide-react'
import TopBar from '../../components/TopBar.jsx'
import { WhatsAppIcon } from '../../components/icons.jsx'
import { card, cx, field } from '../../components/ui.js'
import { listDirectory } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { matches } from '../../lib/format.js'
import { waLink } from '../../lib/whatsapp.js'

export default function Directory() {
  const [params] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const [cat, setCat] = useState('')
  const { data: list = [] } = useData(listDirectory)
  const cats = [...new Set(list.map((d) => d.category))]
  const shown = list.filter((d) => (!cat || d.category === cat) && (!q.trim() || matches(`${d.name} ${d.category} ${d.area}`, q)))

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-28 pt-4">
      <TopBar />
      <h1 className="mt-5 text-3xl font-black">Directory</h1>
      <p className="text-muted">Dergaon ke doctors, tutors aur services. Seedha call karo.</p>

      <div className="relative mt-4">
        <Search size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Salon, repair, tuition..." className={`${field} bg-card pl-12`} />
      </div>

      <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
        {['', ...cats].map((c) => (
          <button key={c || 'all'} type="button" onClick={() => setCat(c)} className={cx('h-10 shrink-0 rounded-full border px-4 text-sm font-semibold', cat === c ? 'border-accent bg-accent text-ink' : 'border-line text-muted')}>
            {c || 'All'}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {shown.map((d) => (
          <div key={d.id} className={`${card} p-4`}>
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-lg font-bold">{d.name}</h3>
              <span className="shrink-0 rounded-full border border-line px-2.5 py-0.5 text-xs text-muted">{d.category}</span>
            </div>
            <p className="mt-1 flex items-center gap-1 text-sm text-muted"><MapPin size={14} /> {d.area}</p>
            {d.hours && <p className="mt-0.5 flex items-center gap-1 text-sm text-muted"><Clock size={14} /> {d.hours}</p>}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <a href={`tel:${d.phone}`} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-line font-semibold"><Phone size={18} /> Call</a>
              {d.whatsapp ? (
                <a href={waLink(d.whatsapp, 'Namaste, dergaon. se aapka number mila.')} target="_blank" rel="noreferrer" className="flex h-11 items-center justify-center gap-2 rounded-xl bg-accent font-semibold text-ink">
                  <WhatsAppIcon size={18} /> WhatsApp
                </a>
              ) : (
                <span className="flex h-11 items-center justify-center rounded-xl border border-line text-sm text-muted">No WhatsApp</span>
              )}
            </div>
          </div>
        ))}
        {!shown.length && <p className="py-8 text-center text-muted">Kuch nahi mila.</p>}
      </div>

      <div className="fixed inset-x-0 bottom-0 bg-gradient-to-t from-ink via-ink/95 to-transparent px-4 pb-4 pt-6">
        <Link to="/directory/add" className="mx-auto flex h-14 max-w-md items-center justify-center gap-2 rounded-full bg-accent text-lg font-bold text-ink">
          <Plus size={22} /> Apna business list karo
        </Link>
      </div>
    </main>
  )
}
