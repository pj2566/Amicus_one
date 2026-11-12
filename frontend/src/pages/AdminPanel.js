import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import Layout from '../components/Layout';
import toast from 'react-hot-toast';

export default function AdminPanel() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [firms, setFirms] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [creditInputs, setCreditInputs] = useState({});
  const [firmCreditInputs, setFirmCreditInputs] = useState({});
  const [searchUser, setSearchUser] = useState('');
  const [searchFirm, setSearchFirm] = useState('');
  const [resetModal, setResetModal] = useState(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [firmMembersModal, setFirmMembersModal] = useState(null);
  const [firmMembers, setFirmMembers] = useState([]);
  const [firmMembersLoading, setFirmMembersLoading] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [usersRes, statsRes, firmsRes] = await Promise.all([
        api.getAdminUsers(),
        api.getAdminStats(),
        api.getAdminFirms(),
      ]);
      setUsers(usersRes.data.users || []);
      setStats(statsRes.data || {});
      setFirms(firmsRes.data.firms || []);
    } catch (err) {
      toast.error('Failed to load admin data');
    }
    setLoading(false);
  };

  // Add credits to individual lawyer
  const handleAddCredits = async (userId) => {
    const amount = parseInt(creditInputs[userId]);
    if (!amount || amount < 1) { toast.error('Enter a valid number'); return; }
    try {
      await api.addCredits(userId, amount);
      toast.success(`Added ${amount} credits!`);
      setCreditInputs({ ...creditInputs, [userId]: '' });
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add credits');
    }
  };

  // Add credits to firm pool
  const handleAddFirmCredits = async (firmId) => {
    const amount = parseInt(firmCreditInputs[firmId]);
    if (!amount || amount < 1) { toast.error('Enter a valid number'); return; }
    try {
      await api.adminAddFirmCredits(firmId, amount);
      toast.success(`Added ${amount} credits to firm pool!`);
      setFirmCreditInputs({ ...firmCreditInputs, [firmId]: '' });
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add firm credits');
    }
  };

  const handleResetPassword = async () => {
    if (!resetPassword || resetPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    setResetLoading(true);
    try {
      await api.adminResetPassword(resetModal.userId, resetPassword);
      toast.success(`Password reset for ${resetModal.name}`);
      setResetModal(null);
      setResetPassword('');
    } catch (err) {
      toast.error('Failed to reset password');
    }
    setResetLoading(false);
  };

  const handleBanUser = async (userId, name) => {
    if (!window.confirm(`Ban ${name}? They will not be able to login.`)) return;
    try {
      await api.adminBanUser(userId);
      toast.success(`${name} banned`);
      loadData();
    } catch (err) {
      toast.error('Failed to ban user');
    }
  };

  const handleDeleteUser = async (userId, name) => {
    if (!window.confirm(`Permanently delete ${name}? This cannot be undone.`)) return;
    try {
      await api.adminDeleteUser(userId);
      toast.success(`${name} deleted`);
      loadData();
      if (firmMembersModal) {
        const res = await api.getAdminFirmMembers(firmMembersModal.id);
        setFirmMembers(res.data.members || []);
      }
    } catch (err) {
      toast.error('Failed to delete user');
    }
  };

  const handleDeleteFirm = async (firmId, firmName) => {
    if (!window.confirm(`Permanently delete firm "${firmName}"? All members will lose firm access. This cannot be undone.`)) return;
    try {
      await api.adminDeleteFirm(firmId);
      toast.success(`Firm "${firmName}" deleted`);
      loadData();
    } catch (err) {
      toast.error('Failed to delete firm');
    }
  };

  const handleViewFirmMembers = async (firm) => {
    setFirmMembersModal(firm);
    setFirmMembersLoading(true);
    try {
      const res = await api.getAdminFirmMembers(firm.id);
      setFirmMembers(res.data.members || []);
    } catch (err) {
      toast.error('Failed to load firm members');
    }
    setFirmMembersLoading(false);
  };

  const formatDate = (d) => new Date(d).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric'
  });

  const filteredUsers = users.filter(u =>
    searchUser === '' ||
    u.name?.toLowerCase().includes(searchUser.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchUser.toLowerCase())
  );

  const filteredFirms = firms.filter(f =>
    searchFirm === '' ||
    f.firm_name?.toLowerCase().includes(searchFirm.toLowerCase()) ||
    f.email?.toLowerCase().includes(searchFirm.toLowerCase())
  );

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Loading admin data...</p>
    </div>
  );

  const UserActionsCell = ({ user }) => (
    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
      <button
        className="btn-small"
        style={{ background: '#6366f1' }}
        onClick={() => { setResetModal({ userId: user.id, name: user.name || user.email }); setResetPassword(''); }}
      >
        🔑
      </button>
      <button
        className="btn-small"
        style={{ background: '#f59e0b' }}
        onClick={() => handleBanUser(user.id, user.name || user.email)}
      >
        🚫
      </button>
      <button
        className="btn-small"
        style={{ background: '#ef4444' }}
        onClick={() => handleDeleteUser(user.id, user.name || user.email)}
      >
        🗑️
      </button>
    </div>
  );

  return (
    <Layout>
      <div className="page-container">

        {/* Header */}
        <div className="page-header">
          <div>
            <h1 className="page-title">👑 Admin Panel</h1>
            <p className="page-subtitle">Full platform control — users, firms, credits, and more</p>
          </div>
          <button className="dash-action-btn secondary" onClick={() => navigate('/dashboard')}>
            ← Dashboard
          </button>
        </div>

        {/* Stats */}
        <div className="dashboard-stats" style={{ marginBottom: '2rem' }}>
          {[
            { icon: '👥', value: stats.totalUsers || 0, label: 'Total Users' },
            { icon: '🏛️', value: stats.totalFirms || 0, label: 'Law Firms' },
            { icon: '📄', value: stats.totalDocuments || 0, label: 'Documents' },
            { icon: '🌐', value: stats.totalTranslations || 0, label: 'Translations' },
          ].map((s) => (
            <div key={s.label} className="dash-stat-card">
              <div className="dash-stat-icon">{s.icon}</div>
              <div className="dash-stat-content">
                <div className="dash-stat-number">{s.value}</div>
                <div className="dash-stat-label">{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="firm-tabs" style={{ marginBottom: '1.5rem' }}>
          <button className={`firm-tab ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>
            👤 Individual Lawyers ({users.filter(u => !u.is_firm_member).length})
          </button>
          <button className={`firm-tab ${activeTab === 'firms' ? 'active' : ''}`} onClick={() => setActiveTab('firms')}>
            🏛️ Law Firms ({firms.length})
          </button>
          <button className={`firm-tab ${activeTab === 'all' ? 'active' : ''}`} onClick={() => setActiveTab('all')}>
            📋 All Users ({users.length})
          </button>
        </div>

        {/* ── Individual Lawyers Tab ── */}
        {activeTab === 'users' && (
          <div>
            <div className="firm-search-bar" style={{ marginBottom: '1rem' }}>
              <input
                type="text"
                placeholder="🔍 Search by name or email..."
                value={searchUser}
                onChange={e => setSearchUser(e.target.value)}
                className="firm-search-input"
              />
            </div>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Credits</th>
                    <th>Docs</th>
                    <th>Role</th>
                    <th>Joined</th>
                    <th>Add Credits</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.filter(u => !u.is_firm_member).length === 0 ? (
                    <tr><td colSpan={8} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>No individual lawyers found</td></tr>
                  ) : filteredUsers.filter(u => !u.is_firm_member).map(user => (
                    <tr key={user.id}>
                      <td>{user.name || '—'}</td>
                      <td style={{ fontSize: '0.82rem' }}>{user.email}</td>
                      <td><strong>{user.credits}</strong></td>
                      <td>{user.documents_generated || 0}</td>
                      <td><span className={`role-badge ${user.role}`}>{user.role}</span></td>
                      <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{formatDate(user.created_at)}</td>
                      <td>
                        <div className="credit-add-row">
                          <input
                            type="number"
                            min="1"
                            placeholder="Amt"
                            value={creditInputs[user.id] || ''}
                            onChange={e => setCreditInputs({ ...creditInputs, [user.id]: e.target.value })}
                          />
                          <button className="btn-small" onClick={() => handleAddCredits(user.id)}>Add</button>
                        </div>
                      </td>
                      <td><UserActionsCell user={user} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Law Firms Tab ── */}
        {activeTab === 'firms' && (
          <div>
            <div className="firm-search-bar" style={{ marginBottom: '1rem' }}>
              <input
                type="text"
                placeholder="🔍 Search firms..."
                value={searchFirm}
                onChange={e => setSearchFirm(e.target.value)}
                className="firm-search-input"
              />
            </div>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Firm Name</th>
                    <th>Email</th>
                    <th>Members</th>
                    <th>Docs</th>
                    <th>Pool Credits</th>
                    <th>Add Credits to Pool</th>
                    <th>Registered</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFirms.length === 0 ? (
                    <tr><td colSpan={8} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>No firms found</td></tr>
                  ) : filteredFirms.map(firm => (
                    <tr key={firm.id}>
                      <td><strong>{firm.firm_name}</strong></td>
                      <td style={{ fontSize: '0.82rem' }}>{firm.email}</td>
                      <td>{firm.member_count || 0}</td>
                      <td>{firm.doc_count || 0}</td>
                      <td>
                        <strong style={{ color: 'var(--accent)' }}>🪙 {firm.total_credits}</strong>
                      </td>
                      <td>
                        <div className="credit-add-row">
                          <input
                            type="number"
                            min="1"
                            placeholder="Amt"
                            value={firmCreditInputs[firm.id] || ''}
                            onChange={e => setFirmCreditInputs({ ...firmCreditInputs, [firm.id]: e.target.value })}
                          />
                          <button
                            className="btn-small"
                            style={{ background: '#10b981' }}
                            onClick={() => handleAddFirmCredits(firm.id)}
                          >
                            Add
                          </button>
                        </div>
                      </td>
                      <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{formatDate(firm.created_at)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                          <button
                            className="btn-small"
                            style={{ background: '#6366f1' }}
                            onClick={() => handleViewFirmMembers(firm)}
                          >
                            👥 Members
                          </button>
                          <button
                            className="btn-small"
                            style={{ background: '#ef4444' }}
                            onClick={() => handleDeleteFirm(firm.id, firm.firm_name)}
                          >
                            🗑️ Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── All Users Tab ── */}
        {activeTab === 'all' && (
          <div>
            <div className="firm-search-bar" style={{ marginBottom: '1rem' }}>
              <input
                type="text"
                placeholder="🔍 Search by name or email..."
                value={searchUser}
                onChange={e => setSearchUser(e.target.value)}
                className="firm-search-input"
              />
            </div>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Type</th>
                    <th>Credits</th>
                    <th>Docs</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.length === 0 ? (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>No users found</td></tr>
                  ) : filteredUsers.map(user => (
                    <tr key={user.id}>
                      <td>{user.name || '—'}</td>
                      <td style={{ fontSize: '0.82rem' }}>{user.email}</td>
                      <td>
                        <span style={{
                          padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 600,
                          background: user.is_firm_member ? 'rgba(201,168,76,0.15)' : 'rgba(99,102,241,0.12)',
                          color: user.is_firm_member ? '#b8860b' : '#6366f1'
                        }}>
                          {user.is_firm_member ? `🏛️ ${user.firm_role === 'admin' ? 'Firm Admin' : 'Firm Member'}` : '👤 Lawyer'}
                        </span>
                      </td>
                      <td><strong>{user.credits}</strong></td>
                      <td>{user.documents_generated || 0}</td>
                      <td><UserActionsCell user={user} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>

      {/* Reset Password Modal */}
      {resetModal && (
        <div className="firm-modal-overlay" onClick={() => setResetModal(null)}>
          <div className="firm-modal" onClick={e => e.stopPropagation()}>
            <h3 className="firm-modal-title">🔑 Reset Password — {resetModal.name}</h3>
            <div className="firm-form-field">
              <label>New Password</label>
              <input
                type="password"
                value={resetPassword}
                onChange={e => setResetPassword(e.target.value)}
                placeholder="Min 6 characters"
                autoFocus
              />
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
              <button className="firm-btn-primary" disabled={resetLoading} onClick={handleResetPassword}>
                {resetLoading ? 'Resetting...' : 'Reset Password'}
              </button>
              <button className="firm-btn-outline" onClick={() => setResetModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Firm Members Modal */}
      {firmMembersModal && (
        <div className="firm-modal-overlay" onClick={() => setFirmMembersModal(null)}>
          <div className="firm-modal" style={{ maxWidth: '750px', width: '95%' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <h3 className="firm-modal-title" style={{ margin: 0 }}>
                  👥 {firmMembersModal.firm_name}
                </h3>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  🪙 Firm Pool Credits: <strong>{firmMembersModal.total_credits}</strong>
                </p>
              </div>
              <button className="firm-btn-outline" onClick={() => setFirmMembersModal(null)}>✕</button>
            </div>

            {firmMembersLoading ? (
              <div className="firm-loading">Loading members...</div>
            ) : firmMembers.length === 0 ? (
              <div className="firm-empty">No members found</div>
            ) : (
              <div className="firm-table-wrap">
                <table className="firm-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Docs</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {firmMembers.map(member => (
                      <tr key={member.id}>
                        <td>{member.name}</td>
                        <td style={{ fontSize: '0.82rem' }}>{member.email}</td>
                        <td>
                          <span className={`firm-role-badge ${member.firm_role}`}>
                            {member.firm_role === 'admin' ? '👑 Admin' : '👤 Member'}
                          </span>
                        </td>
                        <td>{member.documents_generated || 0}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <button
                              className="btn-small"
                              style={{ background: '#6366f1' }}
                              onClick={() => {
                                setFirmMembersModal(null);
                                setResetModal({ userId: member.id, name: member.name || member.email });
                                setResetPassword('');
                              }}
                            >
                              🔑 Reset
                            </button>
                            <button
                              className="btn-small"
                              style={{ background: '#ef4444' }}
                              onClick={() => handleDeleteUser(member.id, member.name || member.email)}
                            >
                              🗑️ Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

    </Layout>
  );
}