import { Link, Navigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import TopBar from '../../components/TopBar.jsx'
import Footer from '../../components/Footer.jsx'
import { getStore } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { POLICIES } from '../../content/policies.jsx'
import { LEGAL } from '../../config.js'
import { usePageTitle } from '../../lib/usePageTitle.js'

export default function Policy() {
  const { slug } = useParams()
  const { data: store } = useData(getStore)
  const policy = POLICIES[slug]
  usePageTitle(policy?.title, `/policy/${slug}`)

  if (!policy) return <Navigate to="/" replace />
  if (!store) return null

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-10 pt-4">
      <TopBar />
      <Link to="/" className="mt-4 flex items-center gap-2 text-sm text-muted"><ArrowLeft size={16} /> Home</Link>
      <h1 className="mt-3 text-2xl font-semibold">{policy.title}</h1>
      <article className="text-[15px] text-ink/80">{policy.body(store)}</article>
      <p className="mt-8 text-xs text-muted">Last updated: {LEGAL.LAST_UPDATED}</p>
      <Footer store={store} />
    </main>
  )
}
