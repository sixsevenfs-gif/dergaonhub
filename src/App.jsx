import { Navigate, Route, Routes } from 'react-router-dom'
import CartProvider from './lib/CartProvider.jsx'

import Home from './pages/customer/Home.jsx'
import Cart from './pages/customer/Cart.jsx'
import Checkout from './pages/customer/Checkout.jsx'
import Bill from './pages/customer/Bill.jsx'
import RequireLogin from './components/RequireLogin.jsx'
import LaunchCountdown from './components/LaunchCountdown.jsx'
import OrderPlaced from './pages/customer/OrderPlaced.jsx'
import Track from './pages/customer/Track.jsx'
import Login from './pages/customer/Login.jsx'
import Account from './pages/customer/Account.jsx'
import Wallet from './pages/customer/Wallet.jsx'
import Report from './pages/customer/Report.jsx'
import Policy from './pages/customer/Policy.jsx'
import LuckyDraw from './pages/customer/LuckyDraw.jsx'

import AdminArea from './pages/admin/AdminArea.jsx'
import AdminHome from './pages/admin/AdminHome.jsx'
import AdminOrders from './pages/admin/AdminOrders.jsx'
import AdminOrderDetail from './pages/admin/AdminOrderDetail.jsx'
import DeliverySheet from './pages/admin/DeliverySheet.jsx'
import DailySummary from './pages/admin/DailySummary.jsx'
import AdminProducts from './pages/admin/AdminProducts.jsx'
import TopItems from './pages/admin/TopItems.jsx'
import AdminComplaints from './pages/admin/AdminComplaints.jsx'
import AdminCustomers from './pages/admin/AdminCustomers.jsx'
import AdminSettings from './pages/admin/AdminSettings.jsx'
import AdminWaitlist from './pages/admin/AdminWaitlist.jsx'
import Partner from './pages/partner/Partner.jsx'

import NotFound from './pages/NotFound.jsx'

// One grocery store: the customer site, /admin for the founder and /partner for the delivery riders.
export default function App() {
  return (
    <CartProvider>
      {/* Opening day: covers the customer site until LAUNCH_AT (config.js). */}
      <LaunchCountdown />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/cart" element={<RequireLogin><Cart /></RequireLogin>} />
        <Route path="/checkout" element={<RequireLogin><Checkout /></RequireLogin>} />
        <Route path="/order/:orderNumber" element={<RequireLogin><OrderPlaced /></RequireLogin>} />
        <Route path="/bill/:orderNumber" element={<Bill />} />
        <Route path="/track" element={<RequireLogin><Track /></RequireLogin>} />
        <Route path="/track/:orderNumber" element={<RequireLogin><Track /></RequireLogin>} />
        <Route path="/login" element={<Login />} />
        <Route path="/account" element={<RequireLogin><Account /></RequireLogin>} />
        <Route path="/wallet" element={<RequireLogin><Wallet /></RequireLogin>} />
        <Route path="/report/:orderNumber" element={<RequireLogin><Report /></RequireLogin>} />
        <Route path="/policy/:slug" element={<Policy />} />
        <Route path="/lucky-draw" element={<LuckyDraw />} />

        <Route path="/partner" element={<Partner />} />

        <Route path="/admin" element={<AdminArea />}>
          <Route index element={<AdminHome />} />
          <Route path="orders" element={<AdminOrders />} />
          <Route path="orders/:orderId" element={<AdminOrderDetail />} />
          <Route path="delivery" element={<DeliverySheet />} />
          <Route path="summary" element={<DailySummary />} />
          <Route path="products" element={<AdminProducts />} />
          <Route path="top-items" element={<TopItems />} />
          <Route path="complaints" element={<AdminComplaints />} />
          <Route path="customers" element={<AdminCustomers />} />
          <Route path="waitlist" element={<AdminWaitlist />} />
          <Route path="settings" element={<AdminSettings />} />
        </Route>

        {/* Old links from the multi-shop version go to the store home. */}
        <Route path="/s/*" element={<Navigate to="/" replace />} />
        <Route path="/shop/*" element={<Navigate to="/" replace />} />
        <Route path="/directory/*" element={<Navigate to="/" replace />} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </CartProvider>
  )
}
