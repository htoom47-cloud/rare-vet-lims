import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { LangProvider } from "./context/LangContext";
import { CountryProvider } from "./context/CountryContext";
import { CatalogProvider } from "./context/CatalogContext";
import { CartProvider } from "./context/CartContext";
import { Header } from "./components/Header";
import { Footer } from "./components/Footer";
import { BrandBackdrop } from "./components/BrandBackdrop";
import { Home } from "./pages/Home";
import { Shop } from "./pages/Shop";
import { ProductDetail } from "./pages/ProductDetail";
import { Cart } from "./pages/Cart";
import { Checkout } from "./pages/Checkout";
import { Contact } from "./pages/Contact";
import { AdminLogin } from "./pages/admin/AdminLogin";
import { AdminLayout } from "./pages/admin/AdminLayout";
import { AdminDashboard } from "./pages/admin/AdminDashboard";
import { AdminProducts } from "./pages/admin/AdminProducts";
import { AdminProductEdit } from "./pages/admin/AdminProductEdit";
import { AdminOrders } from "./pages/admin/AdminOrders";
import { AdminSettings } from "./pages/admin/AdminSettings";
import { AdminCoupons } from "./pages/admin/AdminCoupons";
import { AdminCustomers } from "./pages/admin/AdminCustomers";
import { AdminRevenue } from "./pages/admin/AdminRevenue";
import { AdminUsers } from "./pages/admin/AdminUsers";
import { AdminShipping } from "./pages/admin/AdminShipping";
import { AdminGuard } from "./pages/admin/AdminGuard";

function StoreLayout({ children }) {
  return (
    <div className="relative flex min-h-screen flex-col">
      <BrandBackdrop />
      <Header />
      <main className="relative z-10 flex-1">{children}</main>
      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <LangProvider>
      <CountryProvider>
        <CatalogProvider>
          <CartProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/admin/login" element={<AdminLogin />} />
                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<AdminDashboard />} />
                  <Route path="products" element={<AdminGuard perm="products"><AdminProducts /></AdminGuard>} />
                  <Route path="products/:id" element={<AdminGuard perm="products"><AdminProductEdit /></AdminGuard>} />
                  <Route path="orders" element={<AdminGuard perm="orders"><AdminOrders /></AdminGuard>} />
                  <Route path="customers" element={<AdminGuard perm="customers"><AdminCustomers /></AdminGuard>} />
                  <Route path="coupons" element={<AdminGuard perm="coupons"><AdminCoupons /></AdminGuard>} />
                  <Route path="revenue" element={<AdminGuard perm="revenue"><AdminRevenue /></AdminGuard>} />
                  <Route path="shipping" element={<AdminGuard perm="settings"><AdminShipping /></AdminGuard>} />
                  <Route path="users" element={<AdminGuard perm="users"><AdminUsers /></AdminGuard>} />
                  <Route path="settings" element={<AdminGuard perm="settings"><AdminSettings /></AdminGuard>} />
                </Route>
                <Route
                  path="*"
                  element={
                    <StoreLayout>
                      <Routes>
                        <Route path="/" element={<Home />} />
                        <Route path="/shop" element={<Shop />} />
                        <Route path="/product/:slug" element={<ProductDetail />} />
                        <Route path="/cart" element={<Cart />} />
                        <Route path="/checkout" element={<Checkout />} />
                        <Route path="/contact" element={<Contact />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                      </Routes>
                    </StoreLayout>
                  }
                />
              </Routes>
            </BrowserRouter>
          </CartProvider>
        </CatalogProvider>
      </CountryProvider>
    </LangProvider>
  );
}
