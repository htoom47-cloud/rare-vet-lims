import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { PortalProvider } from './context/PortalContext';
import { ThemeProvider } from './context/ThemeContext';
import ProtectedPortalRoute from './components/portal/ProtectedPortalRoute';
import PortalLogin from './pages/PortalLogin';
import PortalDashboard from './pages/PortalDashboard';
import PortalReports from './pages/PortalReports';
import PortalAnimals from './pages/PortalAnimals';
import PortalAnimalDetail from './pages/PortalAnimalDetail';
import PortalCompareHub from './pages/PortalCompareHub';
import PortalAnimalCompare from './pages/PortalAnimalCompare';
import PortalReportView from './pages/PortalReportView';
import PortalDocuments from './pages/PortalDocuments';
import PortalInvoices from './pages/PortalInvoices';

const HomePage = lazy(() => import('./pages/public/HomePage'));
const ServicesPage = lazy(() => import('./pages/public/ServicesPage'));
const TestsPage = lazy(() => import('./pages/public/TestsPage'));
const EquipmentPage = lazy(() => import('./pages/public/EquipmentPage'));
const QualityPage = lazy(() => import('./pages/public/QualityPage'));
const FaqPage = lazy(() => import('./pages/public/FaqPage'));
const ContactPage = lazy(() => import('./pages/public/ContactPage'));
const ContentPage = lazy(() => import('./pages/public/ContentPage'));

function PageLoader() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" aria-label="Loading" />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <PortalProvider>
          <Toaster
            position="top-center"
            containerClassName="no-print"
            toastOptions={{
              duration: 4000,
              style: {
                background: '#302419',
                color: '#FDFAF3',
                borderRadius: '12px',
                padding: '12px 16px',
                fontSize: '14px',
                boxShadow: '0 4px 16px rgba(74, 55, 40, 0.2)',
              },
              success: { iconTheme: { primary: '#C5A059', secondary: '#302419' } },
              error: { iconTheme: { primary: '#ef4444', secondary: '#FDFAF3' } },
            }}
          />
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/services" element={<ServicesPage />} />
              <Route path="/tests" element={<TestsPage />} />
              <Route path="/equipment" element={<EquipmentPage />} />
              <Route path="/quality" element={<QualityPage />} />
              <Route path="/faq" element={<FaqPage />} />
              <Route path="/contact" element={<ContactPage />} />
              <Route path="/articles" element={<ContentPage page="articles" />} />
              <Route path="/news" element={<ContentPage page="news" />} />
              <Route path="/partners" element={<ContentPage page="partners" />} />
              <Route path="/careers" element={<ContentPage page="careers" />} />
              <Route path="/privacy" element={<ContentPage page="privacy" />} />
              <Route path="/terms" element={<ContentPage page="terms" />} />
              <Route path="/login" element={<PortalLogin />} />
              <Route path="/dashboard" element={<ProtectedPortalRoute><PortalDashboard /></ProtectedPortalRoute>} />
              <Route path="/reports" element={<ProtectedPortalRoute><PortalReports /></ProtectedPortalRoute>} />
              <Route path="/animals" element={<ProtectedPortalRoute><PortalAnimals /></ProtectedPortalRoute>} />
              <Route path="/animals/:animalId" element={<ProtectedPortalRoute><PortalAnimalDetail /></ProtectedPortalRoute>} />
              <Route path="/animals/:animalId/compare" element={<ProtectedPortalRoute><PortalAnimalCompare /></ProtectedPortalRoute>} />
              <Route path="/compare" element={<ProtectedPortalRoute><PortalCompareHub /></ProtectedPortalRoute>} />
              <Route path="/documents" element={<ProtectedPortalRoute><PortalDocuments /></ProtectedPortalRoute>} />
              <Route path="/invoices" element={<ProtectedPortalRoute><PortalInvoices /></ProtectedPortalRoute>} />
              <Route path="/reports/:id" element={<ProtectedPortalRoute><PortalReportView /></ProtectedPortalRoute>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </PortalProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
