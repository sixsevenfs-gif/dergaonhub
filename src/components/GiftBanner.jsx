import { Link } from 'react-router-dom'
import { ChevronRight, Gift } from 'lucide-react'
import { currentCustomer, myWallet } from '../lib/store.js'
import { useData } from '../lib/useData.js'
import { rupee } from '../lib/format.js'
import { activeGifts, validTill } from '../lib/wallet.js'

// Home: gift money waiting for the customer (update 051), so they see it without opening the wallet.
export default function GiftBanner() {
  const me = currentCustomer()
  const { data: wallet } = useData(() => (me ? myWallet(me.phone) : null), [me?.phone])
  const gifts = activeGifts(wallet)
  if (!gifts.length) return null
  const amount = gifts.reduce((s, g) => s + g.left, 0)
  return (
    <Link to="/wallet" className="mt-4 flex items-center gap-3 rounded-2xl border border-amber-300 bg-gradient-to-r from-[#FFF1C9] to-[#FFFBEF] p-3.5 shadow-[0_4px_14px_rgb(183_121_31/0.15)]">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#F6C343] text-[#7A4B00]"><Gift size={24} /></span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold leading-snug text-[#5C3A00]">{rupee(amount)} Jholzo Money for you! 🎁</span>
        <span className="block text-[13px] leading-snug text-[#7A5A1F]">Use it before {validTill(gifts[0].expires_at)}. It comes off your bill at checkout.</span>
      </span>
      <ChevronRight size={20} className="shrink-0 text-[#B7791F]" />
    </Link>
  )
}
