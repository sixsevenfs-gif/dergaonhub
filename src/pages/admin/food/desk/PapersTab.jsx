import { useState } from 'react'
import { BadgeCheck, FileSignature, FileText, QrCode, Receipt, Store } from 'lucide-react'
import { store } from './store.js'
import { FILE_KINDS } from './meta.js'
import { go } from './nav.js'
import { Field, Section, Text, Toggle } from './ui.jsx'
import { FileTiles } from './Photos.jsx'

const kindHint = (id) => FILE_KINDS.find((k) => k.id === id)?.hint

function expiryNote(date) {
  if (!date) return null
  const days = Math.round((new Date(date) - new Date()) / 86400000)
  if (days < 0) return { text: 'Expired. Ask them to renew before going live.', tone: 'text-rose-700' }
  if (days <= 60) return { text: `Expires in ${days} days.`, tone: 'text-amber-700' }
  return { text: 'Valid.', tone: 'text-emerald-700' }
}

export default function PapersTab({ r, patch, files, setFiles, toast }) {
  const [busy, setBusy] = useState('')
  const of = (kind) => files.filter((f) => f.kind === kind)

  async function add(kind, list) {
    setBusy(kind)
    try {
      for (const file of list) {
        const row = await store.addFile(r.id, kind, file)
        setFiles((cur) => [...cur, row])
      }
    } catch (e) {
      toast(e)
    } finally {
      setBusy('')
    }
  }

  async function remove(file) {
    if (!confirm('Delete this photo?')) return
    try {
      await store.deleteFile(file)
      setFiles((cur) => cur.filter((x) => x.id !== file.id))
    } catch (e) {
      toast(e)
    }
  }

  const tiles = (kind, pdf = true) => <FileTiles files={of(kind)} busy={busy === kind} onAdd={(l) => add(kind, l)} onDelete={remove} pdf={pdf} />
  const exp = expiryNote(r.fssai_expiry)

  return (
    <>
      <p className="px-1 text-[12.5px] leading-snug text-muted">
        Papers stay private: only you and your executives can see them. A photo or the number is enough; add whichever you get.
      </p>

      <Section title="FSSAI licence" icon={BadgeCheck} hint="Needed before they go live in the app. The number is on the certificate (14 digits).">
        <Field label="FSSAI number">
          <Text value={r.fssai_number} onChange={(v) => patch('fssai_number', v.replace(/\s/g, ''))} inputMode="numeric" placeholder="e.g. 20319001000123" />
        </Field>
        <Field label="Valid till">
          <input type="date" className="field" value={r.fssai_expiry || ''} onChange={(e) => patch('fssai_expiry', e.target.value)} />
          {exp && <span className={`mt-1 block text-[12px] font-semibold ${exp.tone}`}>{exp.text}</span>}
        </Field>
        <Field label="Photo of the certificate">{tiles('fssai')}</Field>
      </Section>

      <Section title="Menu card" icon={FileText} hint={kindHint('menu')}>
        {tiles('menu', false)}
        <button onClick={() => go(`r/${r.id}/menu`)} className="text-[13px] font-semibold text-fd-red">Type the menu from these photos →</button>
      </Section>

      <Section title="UPI QR" icon={QrCode} hint={kindHint('upi')}>
        {tiles('upi', false)}
      </Section>

      <Section title="Agreement" icon={FileSignature} hint={kindHint('agreement')}>
        <Toggle checked={!!r.agreement_signed} onChange={(v) => patch('agreement_signed', v)} label="Signed" />
        {tiles('agreement')}
      </Section>

      <Section title="GST (if they have it)" icon={Receipt} hint="Small restaurants often do not have GST. That is fine.">
        <Field label="GST number">
          <Text value={r.gst_number} onChange={(v) => patch('gst_number', v.toUpperCase().replace(/\s/g, ''))} autoCapitalize="characters" placeholder="15 letters and numbers" />
        </Field>
        {tiles('gst')}
      </Section>

      <Section title="Shop & other photos" icon={Store} hint="Shop front, counter, kitchen, trade licence, anything else.">
        <Field label="Shop & kitchen">{tiles('shop', false)}</Field>
        <Field label="Trade licence">{tiles('trade')}</Field>
        <Field label="Other">{tiles('other')}</Field>
      </Section>
    </>
  )
}
