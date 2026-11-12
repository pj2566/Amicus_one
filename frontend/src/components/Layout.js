import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { path: '/dashboard', icon: '📊', label: 'Dashboard' },
  { path: '/generate', icon: '✍️', label: 'Drafting Workspace' },
  { path: '/lawgpt', icon: '⚖️', label: 'LawGPT Workspace' },
  { path: '/translate', icon: '🌐', label: 'Translate Document' },
  { path: '/draft-review', icon: '🔍', label: 'Draft Review AI' },
  { path: '/documents', icon: '📄', label: 'Documents' },
  { path: '/clients', icon: '👥', label: 'Clients' },
  { path: '/billing', icon: '💳', label: 'Billing & Credits' },
  { path: '/settings', icon: '⚙️', label: 'Settings' },
];

const firmNavItems = [
  { path: '/firm/dashboard', icon: '📊', label: 'Dashboard' },
  { path: '/firm/members', icon: '👥', label: 'Team Members' },
  { path: '/firm/documents', icon: '📁', label: 'Shared Documents' },
  { path: '/firm/clients', icon: '👤', label: 'Clients' },
  { path: '/generate', icon: '✍️', label: 'Generate Document' },
  { path: '/lawgpt', icon: '⚖️', label: 'LawGPT Research' },
  { path: '/translate', icon: '🌐', label: 'Translate Document' },
  { path: '/draft-review', icon: '🔍', label: 'Draft Review AI' },
  { path: '/settings', icon: '⚙️', label: 'Settings' },
];

export default function Layout({ children }) {
  const { userProfile, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate(userProfile?.is_firm_member ? '/firm/login' : '/login');
  };

  const handleNav = (path) => {
    if (path === '/dashboard' && userProfile?.is_firm_member) {
      navigate('/firm/dashboard');
    } else {
      navigate(path);
    }
    setMobileOpen(false);
  };

  return (
    <div className="workspace-root">
      {mobileOpen && (
        <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} />
      )}
      <aside className={`workspace-sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-logo">
          <span className="sidebar-logo-icon">⚖️</span>
          {!collapsed && <span className="sidebar-logo-text">Lexora</span>}
          <button className="sidebar-collapse-btn" onClick={() => setCollapsed(!collapsed)} title={collapsed ? 'Expand' : 'Collapse'}>
            {collapsed ? '→' : '←'}
          </button>
        </div>
        <nav className="sidebar-nav">
          {(userProfile?.is_firm_member ? firmNavItems : navItems).map(item => (
            <button
              key={item.path}
              className={`sidebar-nav-item ${location.pathname === item.path ? 'active' : ''}`}
              onClick={() => handleNav(item.path)}
              title={collapsed ? item.label : ''}
            >
              <span className="nav-icon">{item.icon}</span>
              {!collapsed && <span className="nav-label">{item.label}</span>}
              {!collapsed && location.pathname === item.path && (
                <span className="nav-active-dot" />
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          {!collapsed && (
            <div className="sidebar-credits">
              <span className="credits-icon">🪙</span>
              <span className="credits-text">{userProfile?.credits ?? 0} Credits</span>
            </div>
          )}
          {!collapsed && (
            <div className="sidebar-user">
              <div className="sidebar-user-avatar">
                {(userProfile?.name || 'L')[0].toUpperCase()}
              </div>
              <div className="sidebar-user-info">
                <div className="sidebar-user-name">{userProfile?.name || 'Lawyer'}</div>
                <div className="sidebar-user-email">{userProfile?.email || ''}</div>
              </div>
            </div>
          )}
          <button className="sidebar-logout-btn" onClick={handleLogout} title="Logout">
            <span>🚪</span>
            {!collapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>
      <div className={`workspace-main ${collapsed ? 'sidebar-collapsed' : ''}`}>
        <div className="mobile-topbar">
          <button className="mobile-menu-btn" onClick={() => setMobileOpen(!mobileOpen)}>☰</button>
          <span className="mobile-logo">⚖️ Lexora</span>
          <span className="mobile-credits">🪙 {userProfile?.credits ?? 0}</span>
        </div>
        <div className="workspace-content">{children}</div>
      </div>
    </div>
  );
}