import { currentCustomer, getStore } from '../lib/store.js'
import { useData } from '../lib/useData.js'
import Login from '../pages/customer/Login.jsx'

// Anyone can browse the shop. The cart, checkout and account pages ask a new customer to create their
// account once (name + phone, and the SMS code when OTP is on). It is kept on this phone, so it is
// not asked again.
export default function RequireLogin({ children }) {
  const { data: store } = useData(getStore) // also re-renders after login / logout
  if (store === undefined) return null
  const me = currentCustomer()
  if (!me?.phone || (store?.otp_required && !me.verified)) return <Login gate />
  return children
}
