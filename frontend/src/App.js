import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import Generate from './pages/Generate';
import AdminPanel from './pages/AdminPanel';
import LawGPT from './pages/LawGPT';
import Documents from './pages/Documents';
import Clients from './pages/Clients';
import Billing from './pages/Billing';
import Settings from './pages/Settings';
import EmailVerification from './pages/EmailVerification';
import ResetPassword from './pages/ResetPassword';
import LandingPage from './pages/LandingPage';
import Translate from './pages/Translate';
import AuthChoice from './pages/AuthChoice';
import FirmSignup from './pages/firm/FirmSignup';
import FirmLogin from './pages/firm/FirmLogin';
import FirmDashboard from './pages/firm/FirmDashboard';
import FirmMembers from './pages/firm/FirmMembers';
import FirmDocuments from './pages/firm/FirmDocuments';
import FirmClients from './pages/firm/FirmClients';
import JoinFirm from './pages/firm/JoinFirm';
import DraftReview from './pages/DraftReview';
import './App.css';

function ProtectedRoute({ children }) {
  const { user, userProfile } = useAuth();
  if (!user) {
    const isFirmRoute = window.location.pathname.startsWith('/firm');
    return <Navigate to={isFirmRoute ? '/firm/login' : '/login'} replace />;
  }
  if (!user.email_confirmed_at && !userProfile?.is_firm_member) {
    return <Navigate to="/verify-email" replace />;
  }
  return children;
}

function AdminRoute({ children }) {
  const { user, userProfile } = useAuth();
  try {
    if (!user) return <Navigate to="/login" replace />;
    if (!user.email_confirmed_at && !userProfile?.is_firm_member) {
    return <Navigate to="/verify-email" replace />;
  }
    if (!userProfile) return (
      <div className="loading-screen">
        <div className="spinner"></div>
      </div>
    );
    if (userProfile?.role !== 'admin') return <Navigate to="/dashboard" replace />;
    return children;
  } catch (e) {
    return <Navigate to="/login" replace />;
  }
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Toaster position="top-right" />
          <Routes>
            <Route path="/auth" element={<AuthChoice />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/verify-email" element={<EmailVerification />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/dashboard" element={
              <ProtectedRoute><Dashboard /></ProtectedRoute>
            } />
            <Route path="/generate" element={
              <ProtectedRoute><Generate /></ProtectedRoute>
            } />
            <Route path="/lawgpt" element={
              <ProtectedRoute><LawGPT /></ProtectedRoute>
            } />
            <Route path="/documents" element={
              <ProtectedRoute><Documents /></ProtectedRoute>
            } />
            <Route path="/clients" element={
              <ProtectedRoute><Clients /></ProtectedRoute>
            } />
            <Route path="/billing" element={
              <ProtectedRoute><Billing /></ProtectedRoute>
            } />
            <Route path="/translate" element={
              <ProtectedRoute><Translate /></   ProtectedRoute>
            } />
            <Route path="/settings" element={
              <ProtectedRoute><Settings /></ProtectedRoute>
            } />
            <Route path="/admin" element={
              <AdminRoute><AdminPanel /></AdminRoute>
            } />
            <Route path="/" element={<LandingPage />} />
<Route path="/firm/signup" element={<FirmSignup />} />
<Route path="/firm/login" element={<FirmLogin />} />
<Route path="/firm/join" element={<JoinFirm />} />
<Route path="/firm/dashboard" element={
  <ProtectedRoute><FirmDashboard /></ProtectedRoute>
} />
<Route path="/firm/members" element={
  <ProtectedRoute><FirmMembers /></ProtectedRoute>
} />
<Route path="/firm/documents" element={
  <ProtectedRoute><FirmDocuments /></ProtectedRoute>
} />
<Route path="/firm/clients" element={
  <ProtectedRoute><FirmClients /></ProtectedRoute>
} />
<Route path="/draft-review" element={
  <ProtectedRoute><DraftReview /></ProtectedRoute>
} />
<Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;