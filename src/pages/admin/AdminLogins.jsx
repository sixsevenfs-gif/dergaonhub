import { useState } from 'react'
import { Check, Copy, Download, Phone, ShieldCheck } from 'lucide-react'
import { WhatsAppIcon } from '../../components/icons.jsx'
import { lbtnOutline, lcard } from '../../components/ui.js'
import { adminSignups } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { addDays, dateStr } from '../../lib/format.js'
import { downloadCSV } from '../../lib/report.js'
import { toWa, waLink } from '../../lib/whatsapp.js'

const RANGES = [
  ['today', 'Today'],
  ['yesterday', 'Yesterday'],
  ['week', 'Last 7 days'],
  ['all', 'All'],
]
const OTP = [
  ['all', 'All'],
  ['yes', 'With OTP'],
  ['no', 'Without OTP'],
]

const when = (iso) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`

function inRange(iso, range) {
  const day = dateStr(new Date(iso))
  const today = dateStr()
  if (range === 'today') return day === today
  if (range === 'yesterday') return day === addDays(today, -1)
  if (range === 'week') return day >= addDays(today, -6)
  return true
}

// Everyone who logged in on the site, each number once (first login decides the day), for offers.
// Saved from update 025 on; numbers that only got an OTP or ordered before it are filled in by the update.
export default function AdminLogins() {
  const { data: rows = [], error } = useData(adminSignups)
  const [range, setRange] = useState('today')
  const [otp, setOtp] = useState('all')
  const [noOrder, setNoOrder] = useState(false)
  const [copied, setCopied] = useState(false)

  const list = rows.filter((r) => inRange(r.first_at, range) && (otp === 'all' || r.verified === (otp === 'yes')) && (!noOrder || r.orders === 0))

  const copyNumbers = async () => {
    await navigator.clipboard.writeText(list.map((r) => `+91${r.phone}`).join(', '))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  const download = () => {
    const lines = [['Name', 'Phone', 'OTP verified', 'First login', 'Last login', 'Logins', 'Orders']]
    for (const r of list) lines.push([r.name, r.phone, r.verified ? 'Yes' : 'No', when(r.first_at), when(r.last_at), r.logins, r.orders])
    downloadCSV(`jholzo-logins-${range}-${dateStr()}.csv`, lines.map((l) => l.map(csvCell).join(',')).join('\r\n'))
  }

  const chip = (on) => `h-9 shrink-0 rounded-full border px-3 text-sm font-semibold ${on ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white'}`

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black">Logins</h1>
        <p className="text-sm text-neutral-600">Everyone who logged in, each number once. Use it to send offers on WhatsApp.</p>
      </div>
      {error && (
        <p className="rounded-xl bg-orange-50 p-3 text-sm text-orange-800">Run supabase/migrations/025_signups.sql in Supabase first.</p>
      )}

      <div className="flex gap-2 overflow-x-auto [scrollbar-width:none]">
        {RANGES.map(([k, label]) => <button key={k} type="button" onClick={() => setRange(k)} className={chip(range === k)}>{label}</button>)}
      </div>
      <div className="flex flex-wrap gap-2">
        {OTP.map(([k, label]) => <button key={k} type="button" onClick={() => setOtp(k)} className={chip(otp === k)}>{label}</button>)}
        <button type="button" onClick={() => setNoOrder(!noOrder)} className={chip(noOrder)}>No order yet</button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto text-lg font-bold">{list.length} {list.length === 1 ? 'person' : 'people'}</span>
        <button type="button" onClick={copyNumbers} disabled={!list.length} className={`${lbtnOutline} min-h-9 text-sm`}>
          {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copied' : 'Copy numbers'}
        </button>
        <button type="button" onClick={download} disabled={!list.length} className={`${lbtnOutline} min-h-9 text-sm`}>
          <Download size={15} /> CSV
        </button>
      </div>

      <ul className={`${lcard} divide-y divide-neutral-100`}>
        {list.map((r) => (
          <li key={r.phone} className="flex items-center gap-3 px-4 py-3">
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 font-semibold">
                <span className="truncate">{r.name || 'No name'}</span>
                {r.verified
                  ? <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-green-100 px-1.5 text-[11px] font-bold text-green-800"><ShieldCheck size={11} /> OTP</span>
                  : <span className="shrink-0 rounded bg-neutral-100 px-1.5 text-[11px] font-bold text-neutral-600">No OTP</span>}
              </span>
              <span className="block text-sm text-neutral-500">{r.phone} · {when(r.first_at)}</span>
              <span className="block text-xs text-neutral-500">
                {r.orders ? `${r.orders} order${r.orders > 1 ? 's' : ''}` : 'No order yet'}
                {r.logins > 1 && ` · logged in ${r.logins} times`}
              </span>
            </span>
            <a href={`tel:+91${r.phone}`} aria-label={`Call ${r.phone}`} className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-300 text-neutral-700"><Phone size={16} /></a>
            <a href={waLink(toWa(r.phone))} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${r.phone}`} className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#1FAF54] text-white"><WhatsAppIcon size={16} /></a>
          </li>
        ))}
        {!list.length && <li className="p-4 text-sm text-neutral-500">{rows.length ? 'Nobody in this filter.' : 'No logins yet.'}</li>}
      </ul>
      <p className="text-xs text-neutral-500">
        To send one offer to many people, use <b>Customers → Send an offer</b>, or paste the copied numbers into a WhatsApp Business broadcast list.
      </p>
    </div>
  )
}
