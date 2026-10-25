import { Routes, Route } from 'react-router-dom'
import CartProvider from './lib/CartProvider.jsx'

import Home from './pages/customer/Home.jsx'
import ShopPage from './pages/customer/ShopPage.jsx'
import Cart from './pages/customer/Cart.jsx'
import Checkout from './pages/customer/Checkout.jsx'
import OrderPlaced from './pages/customer/OrderPlaced.jsx'
import Track from './pages/customer/Track.jsx'
import Directory from './pages/customer/Directory.jsx'
import DirectoryAdd from './pages/customer/DirectoryAdd.jsx'

import Login from './pages/shop/Login.jsx'
import ShopArea from './pages/shop/ShopArea.jsx'
import CreateShop from './pages/shop/CreateShop.jsx'
import Orders from './pages/shop/Orders.jsx'
import OrderDetail from './pages/shop/OrderDetail.jsx'
import Products from './pages/shop/Products.jsx'
import AddFromLibrary from './pages/shop/AddFromLibrary.jsx'
import AddCustom from './pages/shop/AddCustom.jsx'
import Settings from './pages/shop/Settings.jsx'
import Status from './pages/shop/Status.jsx'

import AdminArea from './pages/admin/AdminArea.jsx'
import AdminHome from './pages/admin/AdminHome.jsx'
import AdminShops from './pages/admin/AdminShops.jsx'
import AdminShopReview from './pages/admin/AdminShopReview.jsx'
import DeliverySheet from './pages/admin/DeliverySheet.jsx'
import Settlement from './pages/admin/Settlement.jsx'
import AdminOrders from './pages/admin/AdminOrders.jsx'
import AdminCustomers from './pages/admin/AdminCustomers.jsx'
import AdminLibrary from './pages/admin/AdminLibrary.jsx'
import AdminDirectory from './pages/admin/AdminDirectory.jsx'

import NotFound from './pages/NotFound.jsx'

// One website, three areas (plan section 5):
//   customer site (no login), /shop (shop owners), /admin (founder only)
export default function App() {
  return (
    <CartProvider>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/s/:shopId" element={<ShopPage />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/order/:orderNumber" element={<OrderPlaced />} />
        <Route path="/track" element={<Track />} />
        <Route path="/track/:orderNumber" element={<Track />} />
        <Route path="/directory" element={<Directory />} />
        <Route path="/directory/add" element={<DirectoryAdd />} />

        <Route path="/shop/login" element={<Login />} />
        <Route path="/shop" element={<ShopArea />}>
          <Route index element={<Orders />} />
          <Route path="create" element={<CreateShop />} />
          <Route path="orders/:orderId" element={<OrderDetail />} />
          <Route path="products" element={<Products />} />
          <Route path="products/add" element={<AddFromLibrary />} />
          <Route path="products/custom" element={<AddCustom />} />
          <Route path="settings" element={<Settings />} />
          <Route path="status" element={<Status />} />
        </Route>

        <Route path="/admin" element={<AdminArea />}>
          <Route index element={<AdminHome />} />
          <Route path="shops" element={<AdminShops />} />
          <Route path="shops/:shopId" element={<AdminShopReview />} />
          <Route path="delivery" element={<DeliverySheet />} />
          <Route path="settlement" element={<Settlement />} />
          <Route path="orders" element={<AdminOrders />} />
          <Route path="orders/:orderId" element={<OrderDetail backTo="/admin/orders" />} />
          <Route path="customers" element={<AdminCustomers />} />
          <Route path="library" element={<AdminLibrary />} />
          <Route path="directory" element={<AdminDirectory />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </CartProvider>
  )
}
