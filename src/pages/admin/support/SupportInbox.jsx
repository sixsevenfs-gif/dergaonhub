import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Flame, Search } from 'lucide-react'
import { lcard, lfield } from '../../../components/ui.js'
import { useData } from '../../../lib/useData.js'
import { useAutoRefresh } from '../../../lib/useAutoRefresh.js'
import { APP_NAME, KINDS, listTickets, since, supportCounts } from '../../../lib/support.js'
import { NeedsUpdate } from '../food/FoodBits.jsx'
import { KindIcon, StatusChip, SupportHeader, TopicChip } from './SupportBits.jsx'

const TABS = [['open', 'Needs reply'], ['pending', 'Waiting for customer'], ['resolved', 'Resolved'], ['all', 'All']]

// Owner and executive: every help request from the apps (update 069). "Needs reply" puts urgent ones first,
// then whoever has waited longest. Refreshes by itself.
export default function SupportInbox() {
  const [status, setStatus] = useState('open')
  const [kind, setKind] = useState('')
  const [search, setSearch] = useState('')
  const { data: list, error, refresh } = useData(() => listTickets({ status, kind, search }), [status, kind, search])
  const { data: counts, refresh: refreshCounts } = useData(supportCounts)
  useAutoRefresh(() => {
    refresh()
    refreshCounts()
  }, 15_000)
  if (list === null) return <NeedsUpdate n="069" what="help requests from the apps" />

  return (
    <div className="space-y-4">
      <SupportHeader title="Inbox" text="Requests customers send from the app: about a food order, a grocery order or the app. You get a Telegram message for each one, and the customer gets a notification for each answer.">
        <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full bg-white/15 px-2.5 py-1">{counts?.open ?? 0} need a reply</span>
          {counts?.urgent > 0 && <span className="flex items-center gap-1 rounded-full bg-red-500/90 px-2.5 py-1"><Flame size={12} /> {counts.urgent} urgent</span>}
          <span className="rounded-full bg-white/15 px-2.5 py-1">{counts?.pending ?? 0} waiting for the customer</span>
        </div>
      </SupportHeader>

      <div className="flex gap-1 overflow-x-auto rounded-2xl bg-white p-1 [scrollbar-width:none]">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" onClick={() => setStatus(k)}
            className={`h-9 shrink-0 rounded-xl px-3 text-sm font-semibold ${status === k ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}>
            {label}{k === 'open' && counts?.open > 0 ? ` (${counts.open})` : ''}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {[['', 'Everything'], ...KINDS].map(([k, label]) => (
          <button key={k || 'all'} type="button" onClick={() => setKind(k)}
            className={`h-8 rounded-full px-3 text-xs font-bold ${kind === k ? 'bg-teal-700 text-white' : 'bg-white text-neutral-700 ring-1 ring-neutral-200'}`}>{label}</button>
        ))}
        <label className="relative ml-auto w-full sm:w-64">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input className={`${lfield} pl-9`} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Request, phone, name or order" />
        </label>
      </div>

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error.message}</p>}
      {list === undefined ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : list.length === 0 ? (
        <div className={`${lcard} p-8 text-center`}>
          <p className="text-3xl">{status === 'open' ? '🎉' : '📭'}</p>
          <p className="mt-2 font-bold">{status === 'open' ? 'Nobody is waiting for a reply.' : 'No requests here.'}</p>
          <p className="text-sm text-neutral-500">{search ? 'Try another search.' : 'New requests show here by themselves.'}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {list.map((t) => (
            <li key={t.id}>
              <Link to={`/admin/support/${t.id}`} className={`${lcard} flex items-start gap-3 p-3 transition hover:shadow-md ${t.priority === 'high' && t.status === 'open' ? 'border-red-300' : ''}`}>
                <div className="relative">
                  <KindIcon kind={t.kind} />
                  {t.support_unread && t.status !== 'resolved' && <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-red-500 ring-2 ring-white" aria-label="Unread" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-bold">{t.ticket_number}</span>
                    {t.priority === 'high' && t.status !== 'resolved' && <span className="flex items-center gap-0.5 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white"><Flame size={11} /> Urgent</span>}
                    <TopicChip topic={t.topic} />
                    {status === 'all' && <StatusChip status={t.status} />}
                  </div>
                  <p className="mt-0.5 truncate text-sm font-semibold text-neutral-800">
                    {t.customer_name || 'Customer'} · {t.customer_phone}
                    {t.order_number && <span className="font-normal text-neutral-500"> · {t.order_number}{t.restaurant_name ? ` (${t.restaurant_name})` : ''}</span>}
                  </p>
                  <p className="truncate text-sm text-neutral-500">{t.last_from === 'support' ? 'You: ' : ''}{t.last_preview}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 text-xs text-neutral-500">
                  <span className={t.status === 'open' && t.last_from === 'customer' && Date.now() - new Date(t.last_message_at) > 30 * 60_000 ? 'font-bold text-red-600' : ''}>{since(t.last_message_at)}</span>
                  {APP_NAME[t.source] && <span>{APP_NAME[t.source]}</span>}
                  {t.rating && <span className="text-amber-600">{'★'.repeat(t.rating)}</span>}
                  <ChevronRight size={16} className="text-neutral-300" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
