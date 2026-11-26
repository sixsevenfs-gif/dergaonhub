import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CircleCheck, Flame, Phone, RotateCcw, Send, Smartphone, StickyNote, Star } from 'lucide-react'
import { lbtn, lbtnOutline, lcard, lfield } from '../../../components/ui.js'
import { WhatsAppIcon } from '../../../components/icons.jsx'
import { useData } from '../../../lib/useData.js'
import { useAutoRefresh } from '../../../lib/useAutoRefresh.js'
import { useRole } from '../../../lib/role.js'
import { fmtDateTime, rupee } from '../../../lib/format.js'
import { toWa, waLink } from '../../../lib/whatsapp.js'
import { APP_NAME, KIND_LABEL, REFUND_HOW, fillReply, getTicket, photoLinks, quickReplies, resolveTicket, sendReply, setTicket } from '../../../lib/support.js'
import { deviceName } from '../../../lib/appUsers.js'
import { NeedsUpdate } from '../food/FoodBits.jsx'
import { KindIcon, StatusChip, TopicChip } from './SupportBits.jsx'

const HOW_LABEL = Object.fromEntries(REFUND_HOW)
const ORDER_STATUS = { placed: 'Placed', confirmed: 'Confirmed', picked: 'On the way', completed: 'Delivered', delivered: 'Delivered', cancelled: 'Cancelled', expired: 'Expired' }
const orderLink = (kind, id) => (kind === 'food' ? `/admin/food/orders/${id}` : `/admin/orders/${id}`)

// Owner and executive: one help request: the conversation (with notes only the team sees), the customer and
// their orders, quick replies, and Resolve with a refund. Refreshes every 10 s; what you type stays.
export default function SupportTicket() {
  const { id } = useParams()
  const { isOwner } = useRole()
  const { data: t, error, reload, refresh } = useData(() => getTicket(id), [id])
  useAutoRefresh(refresh, 10_000)
  const paths = useMemo(() => (t?.messages ?? []).flatMap((m) => m.photos ?? []), [t])
  const { data: photos } = useData(() => photoLinks(paths), [paths.join('|')])
  const { data: replies } = useData(quickReplies)
  const [text, setText] = useState('')
  const [internal, setInternal] = useState(false)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState(null)
  const [resolving, setResolving] = useState(false)
  const [res, setRes] = useState({ resolution: '', amount: '', how: '', message: '' })

  if (t === null) return <NeedsUpdate n="069" what="help requests from the apps" />
  if (error) return <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error.message}</p>
  if (t === undefined) return <p className="text-sm text-neutral-500">Loading…</p>

  async function act(name, fn, done) {
    setBusy(name)
    setMsg(null)
    try {
      await fn()
      done?.()
      reload()
    } catch (err) {
      setMsg({ error: err.message })
    } finally {
      setBusy('')
    }
  }
  const send = () => act('send', () => sendReply(id, text, internal), () => {
    setText('')
    setInternal(false)
  })
  const resolve = () => act('resolve', () => resolveTicket(id, res), () => {
    setResolving(false)
    setRes({ resolution: '', amount: '', how: '', message: '' })
    setMsg({ ok: 'Resolved. The customer got a notification.' })
  })
  const c = t.customer ?? {}
  const app = c.app

  return (
    <div className="space-y-4">
      <div className={`${lcard} flex flex-wrap items-start gap-3 p-4`}>
        <KindIcon kind={t.kind} size="h-12 w-12" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-black">{t.ticket_number}</h1>
            <StatusChip status={t.status} />
            {t.priority === 'high' && <span className="flex items-center gap-0.5 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white"><Flame size={11} /> Urgent</span>}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-neutral-600">
            <TopicChip topic={t.topic} /> {KIND_LABEL[t.kind]} · opened {fmtDateTime(t.created_at)}{APP_NAME[t.source] ? ` · from the ${APP_NAME[t.source]} app ${t.app_version}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!!busy} onClick={() => act('priority', () => setTicket(id, { priority: t.priority === 'high' ? 'normal' : 'high' }))}
            className={`${lbtnOutline} h-9 px-3 text-sm`}><Flame size={15} /> {t.priority === 'high' ? 'Not urgent' : 'Urgent'}</button>
          {t.status === 'open' && (
            <button type="button" disabled={!!busy} onClick={() => act('status', () => setTicket(id, { status: 'pending' }))} className={`${lbtnOutline} h-9 px-3 text-sm`}>Waiting for customer</button>
          )}
          {t.status !== 'open' && (
            <button type="button" disabled={!!busy} onClick={() => act('status', () => setTicket(id, { status: 'open' }))} className={`${lbtnOutline} h-9 px-3 text-sm`}><RotateCcw size={15} /> Open again</button>
          )}
        </div>
      </div>

      {msg?.error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{msg.error}</p>}
      {msg?.ok && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{msg.ok}</p>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          {/* The conversation */}
          <div className={`${lcard} space-y-3 p-4`}>
            {t.messages.map((m) => (m.sender === 'system' ? (
              <p key={m.id} className="mx-auto max-w-md rounded-full bg-neutral-100 px-3 py-1.5 text-center text-xs font-semibold text-neutral-600">{m.body} · {fmtDateTime(m.created_at)}</p>
            ) : (
              <div key={m.id} className={`flex ${m.sender === 'customer' ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${m.internal ? 'border border-amber-300 bg-amber-50 text-amber-950'
                  : m.sender === 'customer' ? 'border border-neutral-200 bg-white' : 'bg-teal-700 text-white'}`}>
                  <p className={`mb-0.5 text-[11px] font-bold ${m.internal ? 'text-amber-700' : m.sender === 'customer' ? 'text-neutral-500' : 'text-white/75'}`}>
                    {m.internal ? <><StickyNote size={11} className="inline" /> Team note · {m.staff_name}</> : m.sender === 'customer' ? (t.customer_name || 'Customer') : `Jholzo Support · ${m.staff_name}`}
                  </p>
                  {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                  {m.photos?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {m.photos.map((p) => (photos?.[p] ? (
                        <a key={p} href={photos[p]} target="_blank" rel="noreferrer"><img src={photos[p]} alt="Customer's photo" className="h-28 w-28 rounded-xl object-cover" /></a>
                      ) : <span key={p} className="flex h-28 w-28 items-center justify-center rounded-xl bg-neutral-100 text-xs text-neutral-500">Photo</span>))}
                    </div>
                  )}
                  <p className={`mt-1 text-[11px] ${m.internal ? 'text-amber-700' : m.sender === 'customer' ? 'text-neutral-400' : 'text-white/60'}`}>{fmtDateTime(m.created_at)}</p>
                </div>
              </div>
            )))}
          </div>

          {/* Reply or team note */}
          <div className={`${lcard} space-y-3 p-4 ${internal ? 'border-amber-300 bg-amber-50/40' : ''}`}>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-xl bg-neutral-100 p-1 text-sm font-semibold">
                <button type="button" onClick={() => setInternal(false)} className={`h-8 rounded-lg px-3 ${!internal ? 'bg-white shadow-sm' : 'text-neutral-600'}`}>Reply to customer</button>
                <button type="button" onClick={() => setInternal(true)} className={`h-8 rounded-lg px-3 ${internal ? 'bg-amber-200 text-amber-950 shadow-sm' : 'text-neutral-600'}`}>Team note</button>
              </div>
              {replies?.length > 0 && !internal && (
                <select className={`${lfield} ml-auto h-9 w-auto max-w-56 text-sm`} value="" onChange={(e) => {
                  const q = replies.find((r) => r.id === e.target.value)
                  if (q) setText((old) => (old.trim() ? `${old.trim()}\n` : '') + fillReply(q.body, t))
                }}>
                  <option value="">Quick reply…</option>
                  {replies.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
                </select>
              )}
            </div>
            <textarea className={`${lfield} h-28 py-2`} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)}
              placeholder={internal ? 'Only the team sees this (what you checked, who you called)…' : `Write to ${t.customer_name?.split(' ')[0] || 'the customer'}… They get an app notification.`} />
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-neutral-500">{internal ? 'The customer never sees team notes.' : 'Shown as "Jholzo Support".'}</span>
              <button type="button" disabled={!!busy || !text.trim()} onClick={send} className={`${lbtn} ${internal ? 'bg-amber-500 text-white' : 'bg-teal-700 text-white'}`}>
                {internal ? <StickyNote size={16} /> : <Send size={16} />} {busy === 'send' ? 'Sending…' : internal ? 'Save note' : 'Send'}
              </button>
            </div>
          </div>

          {/* Resolve */}
          {t.status !== 'resolved' && (resolving ? (
            <div className={`${lcard} space-y-3 border-emerald-300 p-4`}>
              <h3 className="flex items-center gap-2 font-bold"><CircleCheck size={18} className="text-emerald-600" /> Resolve {t.ticket_number}</h3>
              <label className="block">
                <span className="text-sm font-semibold">What did you do? <span className="font-normal text-neutral-500">(only the team sees this)</span></span>
                <textarea className={`${lfield} mt-1 h-16 py-2`} maxLength={1000} value={res.resolution} onChange={(e) => setRes({ ...res, resolution: e.target.value })} placeholder="Sent the missing raita with the rider" />
              </label>
              <div>
                <span className="text-sm font-semibold">Refund <span className="font-normal text-neutral-500">(optional)</span></span>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <input className={`${lfield} w-28`} inputMode="decimal" value={res.amount} onChange={(e) => setRes({ ...res, amount: e.target.value.replace(/[^\d.]/g, '') })} placeholder="₹0" />
                  {REFUND_HOW.filter(([k]) => k !== 'wallet' || isOwner).map(([k, label]) => (
                    <button key={k} type="button" onClick={() => setRes({ ...res, how: k })}
                      className={`h-10 rounded-xl px-3 text-sm font-semibold ${res.how === k ? 'bg-emerald-700 text-white' : 'bg-neutral-100 text-neutral-700'}`}>{label}</button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-neutral-500">Jholzo Money goes into the customer's wallet right away (90 days, for grocery orders). UPI and cash: give it yourself, this keeps the record.</p>
              </div>
              <label className="block">
                <span className="text-sm font-semibold">Last message to the customer <span className="font-normal text-neutral-500">(optional)</span></span>
                <textarea className={`${lfield} mt-1 h-16 py-2`} maxLength={2000} value={res.message} onChange={(e) => setRes({ ...res, message: e.target.value })}
                  placeholder={fillReply('Sorry for the trouble, {name}. All sorted now!', t)} />
              </label>
              <div className="flex gap-2">
                <button type="button" disabled={!!busy} onClick={resolve} className={`${lbtn} bg-emerald-700 text-white`}><CircleCheck size={16} /> {busy === 'resolve' ? 'Resolving…' : 'Resolve'}</button>
                <button type="button" onClick={() => setResolving(false)} className={lbtnOutline}>Not yet</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setResolving(true)} className={`${lbtn} w-full bg-emerald-700 text-white`}><CircleCheck size={16} /> Resolve this request</button>
          ))}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-36 lg:self-start">
          <div className={`${lcard} p-4`}>
            <p className="text-xs font-bold uppercase tracking-wide text-neutral-500">Customer</p>
            <p className="mt-1 text-lg font-bold">{t.customer_name || 'Customer'}</p>
            <p className="text-sm text-neutral-600">{t.customer_phone}{c.blocked && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">Blocked</span>}</p>
            {t.customer_phone !== '0000000000' && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <a href={`tel:${t.customer_phone}`} className={`${lbtnOutline} h-10 text-sm`}><Phone size={15} /> Call</a>
                <a href={waLink(toWa(t.customer_phone), fillReply('Hello {name}, this is Jholzo about your request ' + t.ticket_number + '.', t))} target="_blank" rel="noreferrer" className={`${lbtnOutline} h-10 text-sm`}><WhatsAppIcon size={15} /> WhatsApp</a>
              </div>
            )}
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-xl bg-neutral-50 p-2"><dt className="text-xs text-neutral-500">Grocery orders</dt><dd className="font-bold">{c.grocery_orders ?? 0}</dd></div>
              <div className="rounded-xl bg-neutral-50 p-2"><dt className="text-xs text-neutral-500">Food orders</dt><dd className="font-bold">{c.food_orders ?? 0}</dd></div>
              <div className="rounded-xl bg-neutral-50 p-2"><dt className="text-xs text-neutral-500">Requests</dt><dd className="font-bold">{c.requests ?? 1}</dd></div>
              <div className="rounded-xl bg-neutral-50 p-2"><dt className="text-xs text-neutral-500">Refunds so far</dt><dd className="font-bold">{rupee(c.refunds ?? 0)}</dd></div>
            </dl>
            {app && (
              <p className="mt-3 flex items-start gap-2 text-xs text-neutral-600"><Smartphone size={14} className="mt-0.5 shrink-0" />
                {APP_NAME[app.platform]} app {app.app_version} · {deviceName(app.device_model)}{app.os_version ? ` (${app.platform === 'ios' ? 'iOS' : 'Android'} ${app.os_version})` : ''} · last open {fmtDateTime(app.last_seen_at)}</p>
            )}
          </div>

          {(t.order_number || t.recent?.length > 0) && (
            <div className={`${lcard} p-4`}>
              <p className="text-xs font-bold uppercase tracking-wide text-neutral-500">Orders</p>
              {t.order_number && (t.food_order_id || t.order_id) && (
                <Link to={orderLink(t.kind, t.food_order_id ?? t.order_id)} className="mt-2 block rounded-xl bg-teal-50 p-3 text-sm">
                  <span className="font-bold text-teal-900">This request: {t.order_number}</span>
                  {t.restaurant_name && <span className="block text-teal-800">{t.restaurant_name}</span>}
                </Link>
              )}
              <ul className="mt-2 space-y-1.5 text-sm">
                {(t.recent ?? []).map((o) => (
                  <li key={`${o.kind}-${o.id}`}>
                    <Link to={orderLink(o.kind, o.id)} className="flex items-center justify-between gap-2 rounded-lg px-1 py-1 hover:bg-neutral-50">
                      <span><span className="font-semibold">{o.order_number}</span> <span className="text-neutral-500">· {o.kind === 'food' ? 'Food' : 'Grocery'} · {ORDER_STATUS[o.status] ?? o.status}</span></span>
                      <span className="text-neutral-600">{rupee(o.total)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(t.status === 'resolved' || t.resolution || Number(t.refund_amount) > 0) && (
            <div className={`${lcard} p-4 text-sm`}>
              <p className="text-xs font-bold uppercase tracking-wide text-neutral-500">Resolution</p>
              {t.resolved_at && <p className="mt-1 text-neutral-600">Resolved {fmtDateTime(t.resolved_at)}</p>}
              {t.resolution && <p className="mt-1">{t.resolution}</p>}
              {Number(t.refund_amount) > 0 && <p className="mt-1 font-semibold">Refund {rupee(t.refund_amount)} · {HOW_LABEL[t.refund_how] ?? t.refund_how}</p>}
            </div>
          )}

          {t.rating && (
            <div className={`${lcard} p-4 text-sm`}>
              <p className="text-xs font-bold uppercase tracking-wide text-neutral-500">Customer's rating</p>
              <p className="mt-1 flex gap-0.5 text-amber-500">{[1, 2, 3, 4, 5].map((n) => <Star key={n} size={18} fill={n <= t.rating ? 'currentColor' : 'none'} />)}</p>
              {t.rating_comment && <p className="mt-1 text-neutral-700">“{t.rating_comment}”</p>}
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
