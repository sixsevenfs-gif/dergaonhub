import Wordmark from './Wordmark.jsx'

// Placeholder for areas that later build steps will fill in.
export default function ComingSoon({ title, step }) {
  return (
    <main className="mx-auto min-h-screen max-w-md px-4 py-5">
      <Wordmark />
      <div className="mt-10 rounded-2xl border border-line bg-card p-6">
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="mt-2 text-muted">Jaldi aa raha hai. (Build step {step})</p>
      </div>
    </main>
  )
}
