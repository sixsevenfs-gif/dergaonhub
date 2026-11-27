import { useState } from 'react'
import { Download } from 'lucide-react'
import { lbtnDark, lbtnOutline, lcard, lfieldBase } from '../../../components/ui.js'
import { useData } from '../../../lib/useData.js'
import { dateStr, rupee } from '../../../lib/format.js'
import { downloadCSV } from '../../../lib/report.js'
import { foodPayoutHistory, foodPayouts, payoutsCSV, recordFoodPayout, whenText } from '../../../lib/foodAdmin.js'
import { NeedsUpdate } from './FoodBits.jsx'

const WHEN = { pickup: 'pays at pickup', daily: 'paid daily', weekly: 'paid weekly' }

// Owner: what each restaurant is owed (their menu price of delivered dishes) and what was paid: by you here, or by
// the rider at pickup (update 073).
export default function FoodPayouts() {
  const { data: rows, error, reload } = useData(foodPayouts)
  const [open, setOpen] = useState('')

  if (rows === null) return <NeedsUpdate n="064" what="what each restaurant is owed" />
  const owedAll = (rows ?? []).reduce((s, r) => s + Math.max(0, Number(r.owed)), 0)

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Payouts</h1>
          <p className="text-sm text-neutral-500">Restaurants earn their menu price for every delivered dish. Your markup and fees stay with Jholzo.</p>
        </div>
        <button type="button" disabled={!rows?.length} onClick={() => downloadCSV(`jholzo-payouts-${dateStr()}.csv`, payoutsCSV(rows))}
          className={`${lbtnOutline} min-h-10 shrink-0 text-sm`} title="Download (Excel / Google Sheets)">
          <Download size={15} /> CSV
        </button>
      </div>
      {rows && (
        <div className={`${lcard} p-4`}>
          <p className="text-xs font-semibold text-neutral-500">To pay restaurants now</p>
          <p className="mt-1 text-3xl font-bold">{rupee(owedAll)}</p>
        </div>
      )}
      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error.message}</p>}
      {rows === undefined && <p className="text-sm text-neutral-500">Loading…</p>}
      <div className="space-y-3">
        {(rows ?? []).map((r) => (
          <Payout key={r.id} r={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? '' : r.id)} onPaid={reload} />
        ))}
      </div>
    </div>
  )
}

function Payout({ r, open, onToggle, onPaid }) {
  const owed = Number(r.owed)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const { data: history } = useData(() => (open ? foodPayoutHistory(r.id) : Promise.resolve(null)), [open, r.id, r.paid])

  async function pay() {
    setBusy(true)
    setMsg('')
    try {
      await recordFoodPayout(r.id, amount || owed, note)
      setAmount('')
      setNote('')
      onPaid()
    } catch (e) {
      setMsg(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`${lcard} p-4`}>
      <button type="button" onClick={onToggle} className="flex w-full items-start justify-between gap-2 text-left">
        <span className="min-w-0">
          <b className="block truncate">{r.name}</b>
          <span className="text-xs text-neutral-500">
            {r.delivered_orders} delivered orders · earned {rupee(r.earned)}
            {Number(r.paid_at_pickup) > 0 && ` · riders paid ${rupee(r.paid_at_pickup)} at pickup`} · paid {rupee(r.paid)}{r.pay_when ? ` · ${WHEN[r.pay_when] ?? r.pay_when}` : ''}
          </span>
        </span>
        <span className={`shrink-0 text-lg font-bold ${owed > 0 ? 'text-red-600' : 'text-neutral-400'}`}>{owed > 0 ? rupee(owed) : 'Paid up'}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-3 border-t border-neutral-100 pt-3">
          {r.upi_id && <p className="text-sm">UPI: <b className="select-all">{r.upi_id}</b></p>}
          {r.last_paid && <p className="text-xs text-neutral-500">Last paid {whenText(r.last_paid)}</p>}
          <div className="flex flex-wrap gap-2">
            <input className={`${lfieldBase} w-32`} inputMode="decimal" placeholder={owed > 0 ? String(owed) : 'Amount'} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} />
            <input className={`${lfieldBase} min-w-0 flex-1`} placeholder="Note (cash, UPI ref…)" value={note} onChange={(e) => setNote(e.target.value)} />
            <button type="button" disabled={busy || (!amount && owed <= 0)} onClick={pay} className={lbtnDark}>{busy ? 'Saving…' : 'Mark paid'}</button>
          </div>
          {msg && <p className="text-sm text-red-600">{msg}</p>}
          {(history ?? []).length > 0 && (
            <div className="divide-y divide-neutral-100 text-sm">
              {history.map((p) => (
                <div key={p.id} className="flex justify-between gap-2 py-1.5">
                  <span className="text-neutral-500">{whenText(p.created_at)}{p.note ? ` · ${p.note}` : ''}</span>
                  <b>{rupee(p.amount)}</b>
                </div>
              ))}
            </div>
          )}
          {r.phone && <a href={`tel:+91${r.phone}`} className={`${lbtnOutline} min-h-10 px-3 text-sm`}>Call restaurant</a>}
        </div>
      )}
    </div>
  )
}
