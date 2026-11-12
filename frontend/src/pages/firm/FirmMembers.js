import React, { useState, useEffect } from 'react';
import { api } from '../../api';
import toast from 'react-hot-toast';
import FirmLayout from './FirmLayout';

export default function FirmMembers() {
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [firmCredits, setFirmCredits] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('members');

  // Add member form
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', email: '', password: '' });
  const [addLoading, setAddLoading] = useState(false);

  // Invite form
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [generatedCode, setGeneratedCode] = useState(null);

  // Reset password
  const [resetMemberId, setResetMemberId] = useState(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  // Credit distribution
  const [distributeInputs, setDistributeInputs] = useState({});
  const [distributingId, setDistributingId] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [membersRes, invitesRes, creditsRes] = await Promise.all([
        api.firmGetMembers(),
        api.firmGetInvites(),
        api.firmGetStats(),
      ]);
      setMembers(membersRes.data.members || []);
      setInvites(invitesRes.data.invites || []);
      setFirmCredits(creditsRes.data.stats?.totalCredits || 0);
    } catch (err) {
      toast.error('Failed to load members');
    }
    setLoading(false);
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    if (addForm.password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    setAddLoading(true);
    try {
      await api.firmAddMember(addForm);
      toast.success(`${addForm.name} added successfully!`);
      setAddForm({ name: '', email: '', password: '' });
      setShowAddForm(false);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add member');
    }
    setAddLoading(false);
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    setInviteLoading(true);
    try {
      const res = await api.firmInviteEmail(inviteEmail);
      setGeneratedCode(res.data.inviteCode);
      toast.success('Invite code generated!');
      setInviteEmail('');
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create invite');
    }
    setInviteLoading(false);
  };

  const handleRemoveMember = async (memberId, name) => {
    if (!window.confirm(`Remove ${name} from the firm?`)) return;
    try {
      await api.firmRemoveMember(memberId);
      toast.success(`${name} removed from firm`);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to remove member');
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (resetPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    setResetLoading(true);
    try {
      await api.firmResetPassword(resetMemberId, resetPassword);
      toast.success('Password reset successfully');
      setResetMemberId(null);
      setResetPassword('');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to reset password');
    }
    setResetLoading(false);
  };

  const handleDistributeCredits = async (memberId, memberName) => {
    const amount = parseInt(distributeInputs[memberId]);
    if (!amount || amount < 1) { toast.error('Enter a valid number'); return; }
    if (amount > firmCredits) { toast.error('Not enough credits in firm pool'); return; }
    setDistributingId(memberId);
    try {
      await api.firmDistributeCredits(memberId, amount);
      toast.success(`${amount} credits given to ${memberName}`);
      setDistributeInputs({ ...distributeInputs, [memberId]: '' });
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to distribute credits');
    }
    setDistributingId(null);
  };

  const formatDate = (d) => new Date(d).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric'
  });

  return (
    <FirmLayout>
      <div className="firm-page">

        {/* Header */}
        <div className="firm-page-header">
          <div>
            <h1 className="firm-page-title">👥 Team Members</h1>
            <p className="firm-page-sub">
              Manage your firm's lawyers and staff —
              <strong> 🪙 {firmCredits} credits in firm pool</strong>
            </p>
          </div>
          <button
            className="firm-btn-primary"
            onClick={() => setShowAddForm(!showAddForm)}
          >
            {showAddForm ? '✕ Cancel' : '+ Add Member'}
          </button>
        </div>

        {/* Add Member Form */}
        {showAddForm && (
          <div className="firm-form-card">
            <h3 className="firm-form-title">Add New Member Directly</h3>
            <form onSubmit={handleAddMember} className="firm-form">
              <div className="firm-form-grid">
                <div className="firm-form-field">
                  <label>Full Name</label>
                  <input
                    type="text"
                    value={addForm.name}
                    onChange={e => setAddForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="Adv. Member Name"
                    required
                  />
                </div>
                <div className="firm-form-field">
                  <label>Email Address</label>
                  <input
                    type="email"
                    value={addForm.email}
                    onChange={e => setAddForm(p => ({ ...p, email: e.target.value }))}
                    placeholder="member@firm.com"
                    required
                  />
                </div>
                <div className="firm-form-field">
                  <label>Temporary Password</label>
                  <input
                    type="password"
                    value={addForm.password}
                    onChange={e => setAddForm(p => ({ ...p, password: e.target.value }))}
                    placeholder="Min 6 characters"
                    required
                  />
                </div>
              </div>
              <button type="submit" className="firm-btn-primary" disabled={addLoading}>
                {addLoading ? 'Adding member...' : 'Add Member →'}
              </button>
            </form>
          </div>
        )}

        {/* Tabs */}
        <div className="firm-tabs">
          <button
            className={`firm-tab ${activeTab === 'members' ? 'active' : ''}`}
            onClick={() => setActiveTab('members')}
          >
            👥 Members ({members.length})
          </button>
          <button
            className={`firm-tab ${activeTab === 'invites' ? 'active' : ''}`}
            onClick={() => setActiveTab('invites')}
          >
            📨 Invite via Code
          </button>
        </div>

        {/* Members Tab */}
        {activeTab === 'members' && (
          <div className="firm-section">
            {loading ? (
              <div className="firm-loading">Loading members...</div>
            ) : members.length === 0 ? (
              <div className="firm-empty">
                No members yet. Add members using the button above or invite via code.
              </div>
            ) : (
              <div className="firm-members-list">
                {members.map((m) => (
                  <div key={m.id} className="firm-member-card">
                    <div className="firm-member-avatar">
                      {(m.name || 'L')[0].toUpperCase()}
                    </div>
                    <div className="firm-member-info">
                      <div className="firm-member-name-row">
                        <span className="firm-member-name-text">{m.name}</span>
                        <span className={`firm-role-badge ${m.firm_role}`}>
                          {m.firm_role === 'admin' ? '👑 Admin' : '👤 Member'}
                        </span>
                      </div>
                      <div className="firm-member-email">{m.email}</div>
                      <div className="firm-member-meta">
                        <span>🪙 {m.credits} personal credits</span>
                        <span>📄 {m.documents_generated || 0} docs</span>
                        <span>📅 Joined {formatDate(m.created_at)}</span>
                      </div>
                    </div>

                    <div className="firm-member-actions">
                      {/* Distribute credits from pool */}
                      <div className="credit-add-row" style={{ marginBottom: '0.5rem' }}>
                        <input
                          type="number"
                          min="1"
                          placeholder="Credits"
                          value={distributeInputs[m.id] || ''}
                          onChange={e => setDistributeInputs({ ...distributeInputs, [m.id]: e.target.value })}
                          style={{ width: '80px' }}
                        />
                        <button
                          className="btn-small"
                          style={{ background: '#10b981', fontSize: '0.75rem' }}
                          disabled={distributingId === m.id}
                          onClick={() => handleDistributeCredits(m.id, m.name)}
                        >
                          {distributingId === m.id ? '...' : '🪙 Give'}
                        </button>
                      </div>

                      {m.firm_role !== 'admin' && (
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            className="firm-btn-outline"
                            onClick={() => { setResetMemberId(m.id); setResetPassword(''); }}
                          >
                            🔑 Reset
                          </button>
                          <button
                            className="firm-btn-danger"
                            onClick={() => handleRemoveMember(m.id, m.name)}
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Invites Tab */}
        {activeTab === 'invites' && (
          <div className="firm-section">
            <div className="firm-form-card">
              <h3 className="firm-form-title">Generate Invite Code</h3>
              <p className="firm-form-desc">
                Generate a code and share it with the lawyer. They can use it to join your firm at <strong>/firm/join</strong>.
              </p>
              <form onSubmit={handleInvite} className="firm-invite-form">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  placeholder="lawyer@email.com (optional)"
                  className="firm-invite-input"
                />
                <button type="submit" className="firm-btn-primary" disabled={inviteLoading}>
                  {inviteLoading ? 'Generating...' : '📨 Generate Invite Code'}
                </button>
              </form>

              {generatedCode && (
                <div className="firm-invite-code-box">
                  <div className="firm-invite-code-label">Share this invite code:</div>
                  <div className="firm-invite-code">{generatedCode}</div>
                  <div className="firm-invite-code-note">
                    Share this code with the lawyer. They can join at <strong>lexora.in/firm/join</strong>
                  </div>
                  <button
                    className="firm-btn-outline"
                    onClick={() => {
                      navigator.clipboard.writeText(generatedCode);
                      toast.success('Code copied!');
                    }}
                  >
                    📋 Copy Code
                  </button>
                </div>
              )}
            </div>

            {invites.length > 0 && (
              <div className="firm-table-wrap" style={{ marginTop: '1.5rem' }}>
                <h3 className="firm-form-title">Previous Invites</h3>
                <table className="firm-table">
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Code</th>
                      <th>Status</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invites.map((inv) => (
                      <tr key={inv.id}>
                        <td>{inv.email || '—'}</td>
                        <td><code className="firm-code">{inv.invite_code}</code></td>
                        <td>
                          <span className={`firm-status-badge ${inv.status}`}>
                            {inv.status}
                          </span>
                        </td>
                        <td>{formatDate(inv.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Reset Password Modal */}
        {resetMemberId && (
          <div className="firm-modal-overlay" onClick={() => setResetMemberId(null)}>
            <div className="firm-modal" onClick={e => e.stopPropagation()}>
              <h3 className="firm-modal-title">🔑 Reset Member Password</h3>
              <form onSubmit={handleResetPassword}>
                <div className="firm-form-field">
                  <label>New Password</label>
                  <input
                    type="password"
                    value={resetPassword}
                    onChange={e => setResetPassword(e.target.value)}
                    placeholder="Min 6 characters"
                    required
                    autoFocus
                  />
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                  <button type="submit" className="firm-btn-primary" disabled={resetLoading}>
                    {resetLoading ? 'Resetting...' : 'Reset Password'}
                  </button>
                  <button
                    type="button"
                    className="firm-btn-outline"
                    onClick={() => setResetMemberId(null)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </FirmLayout>
  );
}