import React, { useState, useEffect } from 'react';
import Icon from '../../components/Icon';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api';
import FirmLayout from './FirmLayout';

export default function FirmDashboard() {
  const { userProfile } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [members, setMembers] = useState([]);
  const [recentDocs, setRecentDocs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [statsRes, membersRes, docsRes] = await Promise.all([
        api.firmGetStats(),
        api.firmGetMembers(),
        api.firmGetDocuments(),
      ]);
      setStats(statsRes.data.stats);
      setMembers(membersRes.data.members || []);
      const shared = docsRes.data.sharedDocuments || [];
      const priv = docsRes.data.privateDocuments || [];
      setRecentDocs([...shared, ...priv].slice(0, 5));
    } catch (err) {
      console.error('Dashboard load error:', err);
    }
    setLoading(false);
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
            <h1 className="firm-page-title">Firm Dashboard</h1>
            <p className="firm-page-sub">
              Welcome back, {userProfile?.name || 'Admin'} — manage your firm workspace
            </p>
          </div>
          <button
            className="firm-btn-primary"
            onClick={() => navigate('/generate')}
          >
            New Document
          </button>
        </div>

        {/* Stats Grid */}
        {loading ? (
          <div className="firm-loading">Loading dashboard...</div>
        ) : (
          <>
            <div className="firm-stats-grid">
              <div className="firm-stat-card">
                <div className="firm-stat-icon"><Icon name="card" /></div>
                <div className="firm-stat-val">{stats?.totalCredits ?? 0}</div>
                <div className="firm-stat-label">Firm Credits</div>
              </div>
              <div className="firm-stat-card">
                <div className="firm-stat-icon"><Icon name="users" /></div>
                <div className="firm-stat-val">{stats?.membersCount ?? 0}</div>
                <div className="firm-stat-label">Team Members</div>
              </div>
              <div className="firm-stat-card">
                <div className="firm-stat-icon"><Icon name="file" /></div>
                <div className="firm-stat-val">{stats?.docsCount ?? 0}</div>
                <div className="firm-stat-label">Total Documents</div>
              </div>
              <div className="firm-stat-card">
                <div className="firm-stat-icon"><Icon name="archive" /></div>
                <div className="firm-stat-val">{stats?.sharedDocsCount ?? 0}</div>
                <div className="firm-stat-label">Shared Documents</div>
              </div>
              <div className="firm-stat-card">
                <div className="firm-stat-icon"><Icon name="file" /></div>
                <div className="firm-stat-val">{stats?.pendingInvites ?? 0}</div>
                <div className="firm-stat-label">Pending Invites</div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="firm-section">
              <h2 className="firm-section-title">Quick Actions</h2>
              <div className="firm-actions-grid">
                {[
                  { icon: 'users', label: 'Manage Members', desc: 'Add, remove, reset passwords', action: () => navigate('/firm/members') },
                  { icon: 'archive', label: 'Shared Documents', desc: 'View firm document library', action: () => navigate('/firm/documents') },
                  { icon: 'pen', label: 'Drafting Studio', desc: 'Prepare a new legal instrument', action: () => navigate('/generate') },
                  { icon: 'book', label: 'Legal Research', desc: 'BNS, BNSS & BSA with verified citations', action: () => navigate('/lawgpt') },
                ].map((item) => (
                  <div key={item.label} className="firm-action-card" onClick={item.action}>
                    <div className="firm-action-icon"><Icon name={item.icon} /></div>
                    <div className="firm-action-title">{item.label}</div>
                    <div className="firm-action-desc">{item.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Team Members */}
            <div className="firm-section">
              <div className="firm-section-header">
                <h2 className="firm-section-title">Team Members</h2>
                <button
                  className="firm-btn-outline"
                  onClick={() => navigate('/firm/members')}
                >
                  Manage →
                </button>
              </div>
              <div className="firm-table-wrap">
                <table className="firm-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Credits</th>
                      <th>Documents</th>
                      <th>Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                          No members yet. Add members from Manage Members.
                        </td>
                      </tr>
                    ) : members.map((m) => (
                      <tr key={m.id}>
                        <td>
                          <div className="firm-member-name">
                            <div className="firm-avatar">
                              {(m.name || 'L')[0].toUpperCase()}
                            </div>
                            {m.name}
                          </div>
                        </td>
                        <td>{m.email}</td>
                        <td>
                          <span className={`firm-role-badge ${m.firm_role}`}>
                            {m.firm_role === 'admin' ? 'Admin' : 'Member'}
                          </span>
                        </td>
                        <td>{m.credits}</td>
                        <td>{m.documents_generated || 0}</td>
                        <td>{formatDate(m.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Recent Shared Documents */}
            <div className="firm-section">
              <div className="firm-section-header">
                <h2 className="firm-section-title">Recent Shared Documents</h2>
                <button
                  className="firm-btn-outline"
                  onClick={() => navigate('/firm/documents')}
                >
                  View All →
                </button>
              </div>
              {recentDocs.length === 0 ? (
                <div className="firm-empty">
                  No shared documents yet. Generate a document and share it with the firm.
                </div>
              ) : (
                <div className="firm-table-wrap">
                  <table className="firm-table">
                    <thead>
                      <tr>
                        <th>Document</th>
                        <th>Category</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentDocs.map((doc) => (
                        <tr key={doc.id}>
                          <td>{doc.document_type_name}</td>
                          <td>{doc.category_name}</td>
                          <td>{formatDate(doc.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </FirmLayout>
  );
}