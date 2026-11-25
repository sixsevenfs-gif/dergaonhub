import { Link } from 'react-router-dom'
import { ArrowRight, Bell, CheckCircle2, Image, LogIn, RefreshCw, Smartphone, Sparkles, Users, Wrench } from 'lucide-react'
import { lcard } from '../../../components/ui.js'
import { useData } from '../../../lib/useData.js'
import { AUDIENCES, appControl, appOverview, bannersOn, compareVersions, listBanners, newestSeen, updateFor } from '../../../lib/appAdmin.js'
import { NeedsUpdate } from '../food/FoodBits.jsx'
import AppHeader from './AppHeader.jsx'
import { AppHomePreview, PhoneFrame } from './AppPreview.jsx'

const AUDIENCE_LABEL = Object.fromEntries(AUDIENCES)
const when = (iso) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

// Owner: the App part's home: phones with the app, the versions they run, and what is live in the apps now
// (status, update, banners, the last notification), with the home screen as customers see it.
export default function AdminAppHome() {
  const { data: ov } = useData(appOverview)
  const { data: control } = useData(appControl)
  const { data: banners } = useData(listBanners)
  if (ov === null || control === null || banners === null) return <NeedsUpdate n="066" what="the App Control Center" />

  const d = ov?.devices ?? { total: 0, android: 0, ios: 0, logged_in: 0, new_7d: 0 }
  const grocery = bannersOn(banners, 'grocery')
  const food = bannersOn(banners, 'food')
  const maxPhones = Math.max(1, ...(ov?.versions ?? []).map((v) => v.phones))
  // Phones below the newest version seen on that app are the ones an update reaches.
  const newest = newestSeen(ov?.versions)
  const behind = (v) => updateFor(control, v.platform) && newest[v.platform] && v.version !== '?' && compareVersions(v.version, newest[v.platform]) < 0

  return (
    <div className="space-y-4">
      <AppHeader title="Your app, live" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric Icon={Smartphone} tone="bg-violet-100 text-violet-700" label="Phones with the app" value={d.total} note={`Android ${d.android} · iPhone ${d.ios}`} />
        <Metric Icon={LogIn} tone="bg-emerald-100 text-emerald-700" label="Logged in" value={d.logged_in} note={d.total ? `${Math.round((d.logged_in / d.total) * 100)}% of phones` : '—'} />
        <Metric Icon={Users} tone="bg-sky-100 text-sky-700" label="New this week" value={d.new_7d} note="phones that got the app" />
        <Metric Icon={Bell} tone="bg-amber-100 text-amber-700" label="Notifications, 30 days" value={ov?.campaigns?.sent_30d ?? 0} note={`${ov?.campaigns?.count_30d ?? 0} sent${ov?.campaigns?.failed_30d ? ` · ${ov.campaigns.failed_30d} failed` : ''}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <StateCard to="/admin/app/status" Icon={control?.app_status === 'maintenance' ? Wrench : CheckCircle2}
              tone={control?.app_status === 'maintenance' ? 'border-amber-300 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}
              title="App status" value={control?.app_status === 'maintenance' ? 'Maintenance: app locked' : 'Live: everything open'} />
            <StateCard to="/admin/app/updates" Icon={RefreshCw}
              tone={control?.update_mode === 'force' ? 'border-red-200 bg-red-50' : control?.update_mode === 'soft' ? 'border-sky-200 bg-sky-50' : 'border-neutral-200 bg-white'}
              title="App update" value={control?.update_mode === 'off' ? 'No update asked'
                : `${control?.update_mode === 'force' ? 'Mandatory' : 'Normal'} update · ${control?.update_platforms === 'both' ? 'both apps' : `${control?.update_platforms === 'ios' ? 'iPhone' : 'Android'} only`}`} />
          </div>

          <div className={`${lcard} p-4`}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 font-bold"><Sparkles size={17} className="text-violet-600" /> Versions on phones</h3>
              <span className="text-xs text-neutral-500">from the phones that opened the app</span>
            </div>
            {(ov?.versions ?? []).length === 0 ? (
              <p className="mt-3 text-sm text-neutral-500">No phones yet. They show here once people open the new app.</p>
            ) : (
              <div className="mt-3 space-y-2.5">
                {ov.versions.map((v) => (
                  <div key={`${v.platform}-${v.version}`}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold">{v.platform === 'ios' ? 'iPhone' : 'Android'} {v.version}
                        {behind(v) && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">{control.update_mode === 'force' ? 'must update' : 'asked to update'}</span>}
                      </span>
                      <span className="text-neutral-500">{v.phones}</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-neutral-100">
                      <div className={`h-2 rounded-full ${v.platform === 'ios' ? 'bg-sky-500' : 'bg-emerald-500'}`} style={{ width: `${(v.phones / maxPhones) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={`${lcard} p-4`}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 font-bold"><Image size={17} className="text-violet-600" /> Banners showing</h3>
              <Link to="/admin/app/banners" className="flex items-center gap-1 text-sm font-semibold text-violet-700">Manage <ArrowRight size={14} /></Link>
            </div>
            <p className="mt-1 text-sm text-neutral-500">Grocery home {grocery.length} · Food home {food.length}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[...new Map([...grocery, ...food].map((b) => [b.id, b])).values()].slice(0, 6).map((b) => (
                <img key={b.id} src={b.image} alt={b.title} className="aspect-[2.2/1] w-full rounded-xl object-cover shadow-sm" />
              ))}
              {grocery.length + food.length === 0 && <p className="col-span-full text-sm text-neutral-500">No banner is showing in the apps.</p>}
            </div>
          </div>

          <div className={`${lcard} p-4`}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 font-bold"><Bell size={17} className="text-violet-600" /> Last notification</h3>
              <Link to="/admin/app/notifications" className="flex items-center gap-1 text-sm font-semibold text-violet-700">Send one <ArrowRight size={14} /></Link>
            </div>
            {ov?.last_campaign ? (
              <div className="mt-2 rounded-2xl bg-neutral-50 p-3 text-sm">
                <p className="font-bold">{ov.last_campaign.title}</p>
                <p className="text-neutral-600">{ov.last_campaign.body}</p>
                <p className="mt-1 text-xs text-neutral-500">{when(ov.last_campaign.created_at)} · {AUDIENCE_LABEL[ov.last_campaign.audience] ?? ov.last_campaign.audience} · reached {ov.last_campaign.sent ?? 0}</p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-neutral-500">Nothing sent yet. Order updates (confirmed, on the way, delivered) go out by themselves.</p>
            )}
          </div>
        </div>

        <aside className="lg:sticky lg:top-36 lg:self-start">
          <PhoneFrame label="Grocery home now"><AppHomePreview place="grocery" banners={grocery} /></PhoneFrame>
        </aside>
      </div>
    </div>
  )
}

function Metric({ Icon, tone, label, value, note }) {
  return (
    <div className={`${lcard} p-4`}>
      <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}><Icon size={20} /></span>
      <p className="mt-3 text-xs font-semibold text-neutral-500">{label}</p>
      <p className="text-2xl font-black">{value}</p>
      <p className="text-xs text-neutral-500">{note}</p>
    </div>
  )
}

function StateCard({ to, Icon, tone, title, value }) {
  return (
    <Link to={to} className={`flex items-center gap-3 rounded-2xl border p-4 transition hover:shadow-md ${tone}`}>
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white shadow-sm"><Icon size={20} /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</span>
        <span className="block font-bold">{value}</span>
      </span>
      <ArrowRight size={16} className="text-neutral-400" />
    </Link>
  )
}
