import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Check, Copy, Gift, Share2, ShoppingBag, Truck, UserPlus, WalletMinimal } from 'lucide-react'
import BottomNav from '../../components/BottomNav.jsx'
import { WhatsAppIcon } from '../../components/icons.jsx'
import { btnAccent, card } from '../../components/ui.js'
import { currentCustomer, getStore, myWallet } from '../../lib/store.js'
import { useData } from '../../lib/useData.js'
import { fmtDateTime, rupee } from '../../lib/format.js'
import { ENTRY_LABEL, inviteLink, inviteMessage, walletRules } from '../../lib/wallet.js'

function Header() {
  const navigate = useNavigate()
  return (
    <header className="flex h-14 items-center gap-3">
      <button type="button" aria-label="Back" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))} className="-ml-2 flex h-11 w-11 items-center justify-center text-ink">
        <ArrowLeft size={24} />
      </button>
      <h1 className="flex-1 text-xl font-semibold text-ink">Jholzo Money</h1>
    </header>
  )
}

// Invite code, copy and share on WhatsApp.
function InviteCard({ code, store }) {
  const r = walletRules(store)
  const [copied, setCopied] = useState(false)
  const message = inviteMessage(code, store)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // clipboard blocked: the code is on screen to read out
    }
  }
  const share = async () => {
    try {
      await navigator.share({ title: 'Jholzo', text: message })
    } catch {
      // share sheet closed
    }
  }
  return (
    <section className="mt-4 overflow-hidden rounded-[22px] bg-mint">
      <div className="p-5">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-brand"><Gift size={22} /></span>
        <h2 className="mt-3 text-lg font-semibold leading-snug text-ink">Invite friends, earn {rupee(r.referrerReward)} each</h2>
        <p className="mt-1 text-sm text-muted">
          Your friend gets {rupee(r.friendReward)} too. Both rewards come when their first order (items worth {rupee(r.minOrder)} or more) is delivered.
        </p>

        <p className="mt-4 text-xs font-medium uppercase tracking-[0.14em] text-muted">Your invite code</p>
        <div className="mt-1.5 flex items-center gap-2 rounded-2xl border-2 border-dashed border-brand/40 bg-white p-1.5 pl-4">
          <span className="flex-1 text-xl font-bold tracking-[0.12em] text-brand">{code}</span>
          <button type="button" onClick={copy} className="flex h-10 items-center gap-1.5 rounded-xl bg-mint px-3 text-sm font-semibold text-brand">
            {copied ? <><Check size={16} /> Copied</> : <><Copy size={16} /> Copy</>}
          </button>
        </div>

        <div className="mt-3 flex gap-2">
          <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer" className={`${btnAccent} flex-1`}>
            <WhatsAppIcon size={20} /> Share on WhatsApp
          </a>
          {typeof navigator !== 'undefined' && navigator.share && (
            <button type="button" aria-label="Share" onClick={share} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-brand">
              <Share2 size={20} />
            </button>
          )}
        </div>
        <p className="mt-2 break-all text-center text-[11px] text-muted">{inviteLink(code)}</p>
      </div>
    </section>
  )
}

const steps = (r) => [
  [UserPlus, 'Share your code', 'Send it to friends in Dergaon on WhatsApp.'],
  [ShoppingBag, 'Friend orders', `They use your code on their first order of ${rupee(r.minOrder)} or more.`],
  [Truck, 'Order delivered', 'You both get Jholzo Money in your wallet.'],
]

export default function Wallet() {
  const me = currentCustomer()
  const { data: store } = useData(getStore)
  const { data: wallet, loading } = useData(() => (me ? myWallet(me.phone) : null), [me?.phone])
  if (!store || loading) return null
  const r = walletRules(store)

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 pb-24 pt-2">
      <Header />

      {!wallet ? (
        <p className={`${card} mt-4 p-4 text-sm text-muted`}>Jholzo Money is not switched on yet. Please check back soon.</p>
      ) : (
        <>
          <section className="relative mt-2 overflow-hidden rounded-[22px] bg-gradient-to-br from-[#2E7D46] to-brand-dark p-5 text-white">
            <WalletMinimal size={120} strokeWidth={1} className="absolute -bottom-6 -right-6 text-white/10" />
            <p className="text-sm text-white/80">Available balance</p>
            <p className="mt-1 text-[34px] font-bold leading-none">{rupee(wallet.locked ? 0 : wallet.balance)}</p>
            <p className="mt-3 text-[13px] text-white/85">Use up to {rupee(r.maxPerOrder)} on every order at checkout.</p>
          </section>

          {wallet.locked || !wallet.code ? (
            <section className={`${card} mt-4 p-5 text-center`}>
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-mint text-brand"><Gift size={26} /></span>
              <h2 className="mt-3 font-semibold">Place your first order to unlock</h2>
              <p className="mt-1 text-sm text-muted">
                After your first order from this phone you get your own invite code. Share it and earn {rupee(r.referrerReward)} for every friend.
              </p>
              <Link to="/" className={`${btnAccent} mt-4`}>Start shopping</Link>
            </section>
          ) : (
            r.on && <InviteCard code={wallet.code} store={store} />
          )}

          {r.on && (
            <section className="mt-6">
              <h2 className="text-[17px] font-semibold">How it works</h2>
              <div className="mt-3 space-y-3">
                {steps(r).map(([Icon, title, note], i) => (
                  <div key={title} className="flex items-center gap-3">
                    <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-mint text-brand">
                      <Icon size={20} />
                      <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">{i + 1}</span>
                    </span>
                    <span>
                      <span className="block text-sm font-semibold">{title}</span>
                      <span className="text-[13px] text-muted">{note}</span>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {!wallet.locked && wallet.friends?.length > 0 && (
            <section className="mt-6">
              <h2 className="text-[17px] font-semibold">Friends you invited ({wallet.friends.length})</h2>
              <div className={`${card} mt-3 divide-y divide-line`}>
                {wallet.friends.map((f, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-mint text-sm font-semibold text-brand">{f.name[0]?.toUpperCase()}</span>
                    <span className="flex-1 font-medium">{f.name}</span>
                    {f.earned ? (
                      <span className="text-sm font-semibold text-brand">+{rupee(r.referrerReward)} earned</span>
                    ) : (
                      <span className="text-xs text-muted">Waiting for first delivery</span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {!wallet.locked && (
            <section className="mt-6">
              <h2 className="text-[17px] font-semibold">History</h2>
              {wallet.entries.length ? (
                <div className={`${card} mt-3 divide-y divide-line`}>
                  {wallet.entries.map((e) => (
                    <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{ENTRY_LABEL[e.kind] ?? 'Jholzo Money'}</span>
                        <span className="block truncate text-xs text-muted">{e.note}{e.order_number && e.kind !== 'order_payment' && e.kind !== 'refund' ? ` · #${e.order_number}` : ''}</span>
                        <span className="text-[11px] text-muted">{fmtDateTime(e.created_at)}</span>
                      </span>
                      <span className={`font-semibold ${e.amount >= 0 ? 'text-brand' : 'text-ink'}`}>
                        {e.amount >= 0 ? '+' : '−'}{rupee(Math.abs(e.amount))}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted">No money yet. Invite a friend to earn your first reward.</p>
              )}
            </section>
          )}
        </>
      )}
      <BottomNav />
    </main>
  )
}
