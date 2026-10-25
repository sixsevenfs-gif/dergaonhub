import { Navigate, Route, Routes } from 'react-router-dom'
import CartProvider from './lib/CartProvider.jsx'

import Home from './pages/customer/Home.jsx'
import Cart from './pages/customer/Cart.jsx'
import Checkout from './pages/customer/Checkout.jsx'
import OrderPlaced from './pages/customer/OrderPlaced.jsx'
import Track from './pages/customer/Track.jsx'
import Login from './pages/customer/Login.jsx'
import Account from './pages/customer/Account.jsx'
import Report from './pages/customer/Report.jsx'
import Policy from './pages/customer/Policy.jsx'

import AdminArea from './pages/admin/AdminArea.jsx'
import AdminHome from './pages/admin/AdminHome.jsx'
import AdminOrders from './pages/admin/AdminOrders.jsx'
import AdminOrderDetail from './pages/admin/AdminOrderDetail.jsx'
import DeliverySheet from './pages/admin/DeliverySheet.jsx'
import DailySummary from './pages/admin/DailySummary.jsx'
import AdminProducts from './pages/admin/AdminProducts.jsx'
import AdminComplaints from './pages/admin/AdminComplaints.jsx'
import AdminCustomers from './pages/admin/AdminCustomers.jsx'
import AdminSettings from './pages/admin/AdminSettings.jsx'

import NotFound from './pages/NotFound.jsx'

// One grocery store: the customer site, and /admin for the founder.
export default function App() {
  return (
    <CartProvider>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/order/:orderNumber" element={<OrderPlaced />} />
        <Route path="/track" element={<Track />} />
        <Route path="/track/:orderNumber" element={<Track />} />
        <Route path="/login" element={<Login />} />
        <Route path="/account" element={<Account />} />
        <Route path="/report/:orderNumber" element={<Report />} />
        <Route path="/policy/:slug" element={<Policy />} />

        <Route path="/admin" element={<AdminArea />}>
          <Route index element={<AdminHome />} />
          <Route path="orders" element={<AdminOrders />} />
          <Route path="orders/:orderId" element={<AdminOrderDetail />} />
          <Route path="delivery" element={<DeliverySheet />} />
          <Route path="summary" element={<DailySummary />} />
          <Route path="products" element={<AdminProducts />} />
          <Route path="complaints" element={<AdminComplaints />} />
          <Route path="customers" element={<AdminCustomers />} />
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
