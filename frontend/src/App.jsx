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
import Billing from './pages/Billing';
import Inventory from './pages/Inventory';
import Quality from './pages/Quality';
import Users from './pages/Users';
import AuditLogs from './pages/AuditLogs';
import Settings from './pages/Settings';
import TechnicianWorkbench from './pages/TechnicianWorkbench';
import VetReview from './pages/VetReview';
import WorkflowCase from './pages/WorkflowCase';

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <Toaster position="top-center" />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route index element={<RoleHome />} />
              <Route path="customers" element={<ProtectedRoute permission="customers.view"><Customers /></ProtectedRoute>} />
              <Route path="animals" element={<ProtectedRoute permission="animals.view"><Animals /></ProtectedRoute>} />
              <Route path="samples" element={<ProtectedRoute permission="samples.view"><Samples /></ProtectedRoute>} />
              <Route path="workflow" element={<ProtectedRoute permission="samples.create"><WorkflowCase /></ProtectedRoute>} />
              <Route path="workbench" element={<ProtectedRoute permission="results.enter"><TechnicianWorkbench /></ProtectedRoute>} />
              <Route path="vet-review" element={<ProtectedRoute permission="results.validate"><VetReview /></ProtectedRoute>} />
              <Route path="tests" element={<ProtectedRoute permission="tests.view"><Tests /></ProtectedRoute>} />
              <Route path="reports" element={<ProtectedRoute permission="reports.view"><Reports /></ProtectedRoute>} />
              <Route path="billing" element={<ProtectedRoute permission="billing.view"><Billing /></ProtectedRoute>} />
              <Route path="inventory" element={<ProtectedRoute permission="inventory.view"><Inventory /></ProtectedRoute>} />
              <Route path="quality" element={<ProtectedRoute permission="quality.view"><Quality /></ProtectedRoute>} />
              <Route path="users" element={<ProtectedRoute permission="users.view" adminOnly><Users /></ProtectedRoute>} />
              <Route path="audit" element={<ProtectedRoute permission="audit.view"><AuditLogs /></ProtectedRoute>} />
              <Route path="settings" element={<ProtectedRoute permission="settings.view"><Settings /></ProtectedRoute>} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
