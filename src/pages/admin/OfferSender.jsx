import { useState } from 'react'
import { Check, Copy, Megaphone } from 'lucide-react'
import { WhatsAppIcon } from '../../components/icons.jsx'
import { lbtnOutline, lcard, lfield } from '../../components/ui.js'
import { adminContacts } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { dateStr, addDays } from '../../lib/format.js'
import { toWa, waLink } from '../../lib/whatsapp.js'

const SENT_KEY = 'dergaonhub-offer-sent'
const DEFAULT_TEXT = `Hello! 🎉 Special offer from Jholzo:

[write your offer here]

Order now: ${window.location.origin}`

const readSent = () => {
  try {
    return JSON.parse(localStorage.getItem(SENT_KEY)) ?? { text: '', phones: [] }
  } catch {
    return { text: '', phones: [] }
  }
}

// Offers on WhatsApp to every customer: write the message once, then tap Send on each number
// (WhatsApp opens with the message ready). Without the WhatsApp Business API there is no way to
// send to many people in one tap; "Copy numbers" helps make a broadcast list in WhatsApp Business.
export default function OfferSender() {
  const { data: contacts = [] } = useData(adminContacts)
  const [text, setText] = useState(() => readSent().text || DEFAULT_TEXT)
  const [recent, setRecent] = useState(false)
  const [sent, setSent] = useState(() => readSent().phones)
  const [copied, setCopied] = useState(false)

  const since = addDays(dateStr(), -30)
  const list = contacts.filter((c) => !recent || c.last.slice(0, 10) >= since)
  const done = list.filter((c) => sent.includes(c.phone)).length

  const mark = (phone) => {
    const next = [...new Set([...sent, phone])]
    setSent(next)
    try {
      localStorage.setItem(SENT_KEY, JSON.stringify({ text, phones: next }))
    } catch {
      // storage blocked: ticks last until reload
    }
  }
  const startNew = () => {
    setSent([])
    try {
      localStorage.setItem(SENT_KEY, JSON.stringify({ text, phones: [] }))
    } catch {
      // ignore
    }
  }
  const copyNumbers = async () => {
    await navigator.clipboard.writeText(list.map((c) => `+91${c.phone}`).join(', '))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section className={`${lcard} space-y-3 p-4`}>
      <div>
        <h2 className="flex items-center gap-2 font-bold"><Megaphone size={18} /> Send an offer on WhatsApp</h2>
        <p className="text-sm text-neutral-500">
          Everyone who ordered or received an order ({contacts.length} numbers). Write the message, then tap <b>Send</b> on each
          number. Sent numbers get a tick, so you can stop and continue later.
        </p>
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} className={`${lfield} h-auto py-2 text-sm`} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setRecent(!recent)} className={`h-9 rounded-full border px-3 text-sm font-semibold ${recent ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white'}`}>
          Ordered in last 30 days
        </button>
        <button type="button" onClick={copyNumbers} className={`${lbtnOutline} min-h-9 text-sm`}>
          {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copied' : 'Copy numbers'}
        </button>
        <span className="ml-auto text-sm text-neutral-500">{done} / {list.length} sent</span>
        {done > 0 && <button type="button" onClick={startNew} className="text-sm font-semibold text-neutral-500 underline">New offer</button>}
      </div>
      <ul className="max-h-96 divide-y divide-neutral-100 overflow-y-auto rounded-xl border border-neutral-200">
        {list.map((c) => {
          const isSent = sent.includes(c.phone)
          return (
            <li key={c.phone} className={`flex items-center gap-3 px-3 py-2 ${isSent ? 'opacity-50' : ''}`}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{c.name}</span>
                <span className="text-xs text-neutral-500">{c.phone} · {c.orders} order{c.orders > 1 ? 's' : ''}</span>
              </span>
              <a
                href={waLink(toWa(c.phone), text)}
                target="_blank"
                rel="noreferrer"
                onClick={() => mark(c.phone)}
                className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold ${isSent ? 'border border-neutral-300 text-neutral-600' : 'bg-[#1FAF54] text-white'}`}
              >
                {isSent ? <Check size={15} /> : <WhatsAppIcon size={15} />} {isSent ? 'Sent' : 'Send'}
              </a>
            </li>
          )
        })}
        {!list.length && <li className="p-4 text-sm text-neutral-500">No customers yet.</li>}
      </ul>
      <p className="text-xs text-neutral-500">
        Tip: in WhatsApp Business you can make a <b>broadcast list</b> with the copied numbers and send to all at once
        (only people who saved your number receive it).
      </p>
    </section>
  )
}
