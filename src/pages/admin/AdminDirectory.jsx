import StatusBadge from '../../components/StatusBadge.jsx'
import DirectoryForm from '../../components/DirectoryForm.jsx'
import { lbtnDark, lbtnOutline, lcard, lfield } from '../../components/ui.js'
import { adminListDirectory, setDirectoryStatus } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'

export default function AdminDirectory() {
  const { data: list = [] } = useData(adminListDirectory)
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-black">Directory listings</h1>
      <div className={`${lcard} divide-y divide-neutral-100`}>
        {list.map((d) => (
          <div key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <span className="min-w-40 flex-1">
              <span className="flex items-center gap-2 font-semibold">{d.name} <StatusBadge status={d.status} /></span>
              <span className="text-sm text-neutral-500">{d.category} · {d.area} · {d.phone}{d.hours ? ` · ${d.hours}` : ''}</span>
            </span>
            {d.status !== 'live' && <button type="button" onClick={() => setDirectoryStatus(d.id, 'live')} className={`${lbtnDark} min-h-9 text-sm`}>Approve</button>}
            {d.status !== 'hidden' && <button type="button" onClick={() => setDirectoryStatus(d.id, 'hidden')} className={`${lbtnOutline} min-h-9 text-sm`}>Hide</button>}
          </div>
        ))}
      </div>
      <section className={`${lcard} p-4`}>
        <h2 className="mb-3 font-bold">Add listing (goes live directly)</h2>
        <DirectoryForm asAdmin fieldClass={lfield} labelClass="mb-1 block text-sm font-medium text-neutral-700" buttonClass={`${lbtnDark} w-full`} />
      </section>
    </div>
  )
}
