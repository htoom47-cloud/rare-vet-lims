import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import Layout from './components/layout/Layout';
import ProtectedRoute from './components/layout/ProtectedRoute';
import Login from './pages/Login';
import RoleHome from './components/layout/RoleHome';
import Customers from './pages/Customers';
import Animals from './pages/Animals';
import Samples from './pages/Samples';
import Tests from './pages/Tests';
import Reports from './pages/Reports';
import LaboratoryReport from './pages/LaboratoryReport';
import VerifyReport from './pages/VerifyReport';
import ReportDemo from './pages/ReportDemo';
import ReportLive from './pages/ReportLive';
import Billing from './pages/Billing';
import AccountingReports from './pages/AccountingReports';
import InvoiceSettings from './pages/InvoiceSettings';
import PriceList from './pages/PriceList';
import Inventory from './pages/Inventory';
import Quality from './pages/Quality';
import Users from './pages/Users';
import AuditLogs from './pages/AuditLogs';
import Settings from './pages/Settings';
import Devices from './pages/Devices';
import DeviceReferenceRanges from './pages/DeviceReferenceRanges';
import TechnicianWorkbench from './pages/TechnicianWorkbench';
import VetReview from './pages/VetReview';
import WorkflowCase from './pages/WorkflowCase';
import Parasitology from './pages/Parasitology';
import ParasitologyUpload from './pages/ParasitologyUpload';
import ReceptionDisplay from './pages/ReceptionDisplay';

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
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
            <Route path="/login" element={<Login />} />
            {import.meta.env.DEV && <Route path="/report-demo" element={<ReportDemo />} />}
            <Route path="/report-live/:id" element={<ReportLive />} />
            <Route path="/verify/:code" element={<VerifyReport />} />
            <Route path="/reception-display" element={<ReceptionDisplay />} />
            <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route index element={<RoleHome />} />
              <Route path="customers" element={<ProtectedRoute permission="customers.view"><Customers /></ProtectedRoute>} />
              <Route path="animals" element={<ProtectedRoute permission="animals.view"><Animals /></ProtectedRoute>} />
              <Route path="samples" element={<ProtectedRoute permission="samples.view"><Samples /></ProtectedRoute>} />
              <Route path="workflow" element={<ProtectedRoute permission="samples.create"><WorkflowCase /></ProtectedRoute>} />
              <Route path="workbench" element={<ProtectedRoute permission="results.enter"><TechnicianWorkbench /></ProtectedRoute>} />
              <Route path="parasitology" element={<ProtectedRoute permissions={['results.enter', 'results.validate']}><Parasitology /></ProtectedRoute>} />
              <Route path="parasitology/upload" element={<ProtectedRoute permission="results.upload_images"><ParasitologyUpload /></ProtectedRoute>} />
              <Route path="vet-review" element={<ProtectedRoute permissions={['results.validate', 'results.edit', 'results.unvalidate', 'results.enter']}><VetReview /></ProtectedRoute>} />
              <Route path="price-list" element={<ProtectedRoute permissions={['price_list.view', 'tests.view']}><PriceList /></ProtectedRoute>} />
              <Route path="tests" element={<ProtectedRoute permission="tests.view"><Tests /></ProtectedRoute>} />
              <Route path="reports" element={<ProtectedRoute permission="reports.view"><Reports /></ProtectedRoute>} />
              <Route path="reports/:id/view" element={<ProtectedRoute permission="reports.view"><LaboratoryReport /></ProtectedRoute>} />
              <Route path="billing" element={<ProtectedRoute permission="billing.view"><Billing /></ProtectedRoute>} />
              <Route path="accounting" element={<ProtectedRoute permission="billing.view"><AccountingReports /></ProtectedRoute>} />
              <Route path="invoice-settings" element={<ProtectedRoute permission="billing.view"><InvoiceSettings /></ProtectedRoute>} />
              <Route path="inventory" element={<ProtectedRoute permission="inventory.view"><Inventory /></ProtectedRoute>} />
              <Route path="quality" element={<ProtectedRoute permission="quality.view"><Quality /></ProtectedRoute>} />
              <Route path="users" element={<ProtectedRoute permission="users.view" adminOnly><Users /></ProtectedRoute>} />
              <Route path="audit" element={<ProtectedRoute permission="audit.view"><AuditLogs /></ProtectedRoute>} />
              <Route path="settings" element={<ProtectedRoute permission="settings.view"><Settings /></ProtectedRoute>} />
              <Route path="devices" element={<ProtectedRoute permission="devices.view"><Devices /></ProtectedRoute>} />
              <Route path="device-reference-ranges" element={<ProtectedRoute permission="devices.view"><DeviceReferenceRanges /></ProtectedRoute>} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
