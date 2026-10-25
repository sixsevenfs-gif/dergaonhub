import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Check } from 'lucide-react'
import Wordmark from '../../components/Wordmark.jsx'
import DirectoryForm from '../../components/DirectoryForm.jsx'
import { btnAccent, card, field } from '../../components/ui.js'

export default function DirectoryAdd() {
  const [done, setDone] = useState(false)
  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-10 pt-4">
      <header className="flex h-12 items-center justify-between">
        <Wordmark />
        <Link to="/directory" className="flex items-center gap-2 text-muted"><ArrowLeft size={20} /> Back</Link>
      </header>
      <h1 className="mt-5 text-3xl font-black">Apna business list karo</h1>
      <p className="text-muted">Free listing. Customers aapko seedha call ya WhatsApp karenge.</p>

      <section className={`${card} mt-4 p-4`}>
        {done ? (
          <div className="py-6 text-center">
            <Check size={44} className="mx-auto text-accent" />
            <p className="mt-3 text-lg font-bold">Thank you! Listing mil gayi.</p>
            <p className="text-muted">Verify hone ke baad Directory mein dikhegi.</p>
            <Link to="/directory" className={`${btnAccent} mt-5`}>Directory dekho</Link>
          </div>
        ) : (
          <DirectoryForm fieldClass={field} labelClass="mb-1 block text-sm text-muted" buttonClass={`${btnAccent} h-14`} onDone={() => setDone(true)} />
        )}
      </section>
    </main>
  )
}
