import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { PortalProvider } from './context/PortalContext';
import { ThemeProvider } from './context/ThemeContext';
import ProtectedPortalRoute from './components/portal/ProtectedPortalRoute';
import LabHome from './pages/LabHome';
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
          <Routes>
            <Route path="/" element={<LabHome />} />
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
        </PortalProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
