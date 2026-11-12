import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api';

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

export default function FirmLayout({ children }) {
  const { userProfile, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [firmCredits, setFirmCredits] = useState(0);

  useEffect(() => {
    api.firmGetStats()
      .then(res => setFirmCredits(res.data.stats?.totalCredits || 0))
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/firm/login');
  };

  const handleNav = (path) => {
    navigate(path);
    setMobileOpen(false);
  };

  return (
    <div className="workspace-root">

      {mobileOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`workspace-sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>

        {/* Logo */}
        <div className="sidebar-logo">
          <span className="sidebar-logo-icon">🏛️</span>
          {!collapsed && (
            <div>
              <span className="sidebar-logo-text">Lexora</span>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: '1px' }}>
                Law Firm
              </div>
            </div>
          )}
          <button
            className="sidebar-collapse-btn"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? '→' : '←'}
          </button>
        </div>

        {/* Nav */}
        <nav className="sidebar-nav">
          {firmNavItems.map(item => (
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

        {/* Bottom */}
        <div className="sidebar-bottom">
          {!collapsed && (
            <div className="sidebar-credits">
              <span className="credits-icon">🪙</span>
              <span className="credits-text">
                {firmCredits} Credits
              </span>
            </div>
          )}
          {!collapsed && (
            <div className="sidebar-user">
              <div className="sidebar-user-avatar">
                {(userProfile?.name || 'F')[0].toUpperCase()}
              </div>
              <div className="sidebar-user-info">
                <div className="sidebar-user-name">
                  {userProfile?.name || 'Firm Admin'}
                </div>
                <div className="sidebar-user-email">
                  {userProfile?.email || ''}
                </div>
              </div>
            </div>
          )}
          <button
            className="sidebar-logout-btn"
            onClick={handleLogout}
            title="Logout"
          >
            <span>🚪</span>
            {!collapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className={`workspace-main ${collapsed ? 'sidebar-collapsed' : ''}`}>
        <div className="mobile-topbar">
          <button
            className="mobile-menu-btn"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            ☰
          </button>
          <span className="mobile-logo">🏛️ Lexora Firm</span>
          <span className="mobile-credits">
            🪙 {firmCredits}
          </span>
        </div>
        <div className="workspace-content">
          {children}
        </div>
      </div>
    </div>
  );
}