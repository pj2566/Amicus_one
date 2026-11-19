import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import Icon from './Icon';

const WORKSPACE = [
  { path: '/dashboard', icon: 'home', label: 'Overview', firmPath: '/firm/dashboard' },
  { path: '/generate', icon: 'pen', label: 'Drafting Studio' },
  { path: '/lawgpt', icon: 'book', label: 'Legal Research' },
  { path: '/translate', icon: 'languages', label: 'Vernacular Translator' },
  { path: '/draft-review', icon: 'checkCircle', label: 'Redline & Review' },
];

const RECORDS = [
  { path: '/documents', icon: 'archive', label: 'Matter Archive' },
  { path: '/clients', icon: 'users', label: 'Client Directory' },
  { path: '/billing', icon: 'card', label: 'Billing & Credits' },
];

const FIRM_RECORDS = [
  { path: '/firm/documents', icon: 'archive', label: 'Shared Documents' },
  { path: '/firm/clients', icon: 'users', label: 'Client Directory' },
  { path: '/firm/members', icon: 'briefcase', label: 'Team Members' },
];

export default function Layout({ children }) {
  const { userProfile, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [firmCredits, setFirmCredits] = useState(null);
  const isFirm = !!userProfile?.is_firm_member;

  // Firm members draw from the shared pool, so show that balance instead of the personal one
  useEffect(() => {
    if (!isFirm) return;
    api.firmGetCredits().then(res => setFirmCredits(res.data.credits)).catch(() => {});
  }, [isFirm]);

  const credits = isFirm ? firmCredits : userProfile?.credits;

  const go = (path) => { navigate(path); setOpen(false); };

  const handleLogout = async () => {
    await logout();
    navigate(isFirm ? '/firm/login' : '/login');
  };

  const NavItem = ({ item }) => {
    const path = isFirm && item.firmPath ? item.firmPath : item.path;
    return (
      <button className={`am-nav-item ${location.pathname === path ? 'active' : ''}`} onClick={() => go(path)}>
        <Icon name={item.icon} />
        <span>{item.label}</span>
      </button>
    );
  };

  const initials = (userProfile?.name || userProfile?.email || 'A')
    .replace(/^adv\.?\s*/i, '').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="am-shell">
      <aside className={`am-sidebar ${open ? 'open' : ''}`} onClick={e => e.target === e.currentTarget && setOpen(false)}>
        <div className="am-brand">
          <div className="am-brand-mark"><Icon name="scale" size={18} /></div>
          <span className="am-brand-name">Amicus One</span>
          <span className="am-brand-tag">{isFirm ? 'FIRM' : 'CHAMBERS'}</span>
        </div>

        <nav className="am-nav">
          {WORKSPACE.map(item => <NavItem key={item.path} item={item} />)}
          <div className="am-nav-divider" />
          <div className="am-nav-label">Records</div>
          {(isFirm ? FIRM_RECORDS : RECORDS).map(item => <NavItem key={item.path} item={item} />)}
          {userProfile?.role === 'admin' && <NavItem item={{ path: '/admin', icon: 'shield', label: 'Admin' }} />}
        </nav>

        <div className="am-sidebar-foot">
          <div className="am-allowance">
            <div>
              <div className="am-allowance-label">{isFirm ? 'Firm Allowance' : 'Drafting Allowance'}</div>
              <div className="am-allowance-value">{credits ?? '—'} Credits Available</div>
            </div>
            {!isFirm && <button className="am-link" onClick={() => go('/billing')}>Top up</button>}
          </div>
          <div className="am-user">
            <div className="am-avatar">{initials}</div>
            <div style={{ minWidth: 0 }}>
              <div className="am-user-name">{userProfile?.name || 'Advocate'}</div>
              <div className="am-user-sub">{userProfile?.specialization || userProfile?.law_firm || userProfile?.email || ''}</div>
            </div>
            <div className="am-user-actions">
              <button className="am-icon-btn" title="Settings" onClick={() => go('/settings')}><Icon name="settings" size={17} /></button>
              <button className="am-icon-btn" title="Sign out" onClick={handleLogout}><Icon name="logout" size={17} /></button>
            </div>
          </div>
        </div>
      </aside>

      <div className="am-main">
        <div className="am-topbar-mobile">
          <button className="am-icon-btn" onClick={() => setOpen(true)} aria-label="Open menu"><Icon name="menu" /></button>
          <span className="am-brand-name" style={{ fontSize: 19 }}>Amicus One</span>
          <span className="am-badge" style={{ marginLeft: 'auto' }}>{credits ?? '—'} credits</span>
        </div>
        <div className="am-content">{children}</div>
      </div>
    </div>
  );
}
