import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import Layout from '../components/Layout';


export default function Dashboard() {
  const { userProfile, refreshProfile } = useAuth();
  const navigate = useNavigate();

  // Redirect firm members to firm dashboard
  useEffect(() => {
    if (userProfile?.is_firm_member) {
      navigate('/firm/dashboard', { replace: true });
    }
  }, [userProfile, navigate]);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [stats, setStats] = useState(null);

  const loadData = useCallback(async () => {
    try {
      const [historyRes, statsRes] = await Promise.all([
        api.getHistory(),
        api.getBillingStats()
      ]);
      setHistory(historyRes.data.documents || []);
      setStats(statsRes.data.stats || null);
    } catch (err) {
      console.error('Dashboard load error:', err);
      try {
        const historyRes = await api.getHistory();
        setHistory(historyRes.data.documents || []);
      } catch (e) {
        setHistory([]);
      }
    }
    setHistoryLoading(false);
  }, []);

 // eslint-disable-next-line react-hooks/exhaustive-deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    refreshProfile();
    loadData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Just now';
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric'
    });
  };

  const getCategoryIcon = (category) => {
    const icons = {
      'Property Law': '🏠', 'Corporate Law': '🏢', 'Criminal Law': '⚖️',
      'Family Law': '👨‍👩‍👧', 'Employment Law': '💼', 'Taxation Law': '💰',
      'Consumer Law': '🛒', 'Cyber Law': '💻', 'Startup Law': '🚀',
      'Civil Litigation': '📋', 'Arbitration Law': '🤝',
      'Intellectual Property Law': '💡', 'Divorce / Family Law': '👨‍👩‍👧'
    };
    return icons[category] || '📄';
  };

  return (
    <Layout>
      <div className="dashboard-page">

        {/* Welcome Header */}
        <div className="dashboard-header">
          <div>
            <h1 className="dashboard-welcome">
              Good {new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 17 ? 'Afternoon' : 'Evening'},
              {' '}{userProfile?.name || 'Advocate'} 👋
            </h1>
            <p className="dashboard-subtext">
              Here's your legal workspace overview for today.
            </p>
          </div>
          <div className="dashboard-header-actions">
            <button
              className="dash-action-btn primary"
              onClick={() => navigate('/generate')}
            >
              ✍️ New Draft
            </button>
            <button
              className="dash-action-btn secondary"
              onClick={() => navigate('/lawgpt')}
            >
              ⚖️ LawGPT
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="dashboard-stats">
          <div className="dash-stat-card">
            <div className="dash-stat-icon">🪙</div>
            <div className="dash-stat-content">
              <div className="dash-stat-number">
                {userProfile?.credits ?? 0}
              </div>
              <div className="dash-stat-label">Credits Remaining</div>
            </div>
          </div>

          <div className="dash-stat-card">
            <div className="dash-stat-icon">📄</div>
            <div className="dash-stat-content">
              <div className="dash-stat-number">
                {userProfile?.documents_generated ?? 0}
              </div>
              <div className="dash-stat-label">Documents Generated</div>
            </div>
          </div>

          <div className="dash-stat-card">
            <div className="dash-stat-icon">⚖️</div>
            <div className="dash-stat-content">
              <div className="dash-stat-number">
                {stats?.lawgptCount ?? userProfile?.lawgpt_usage ?? 0}
              </div>
              <div className="dash-stat-label">LawGPT Sessions</div>
            </div>
          </div>

          <div className="dash-stat-card">
            <div className="dash-stat-icon">💾</div>
            <div className="dash-stat-content">
              <div className="dash-stat-number">
                {history.length}
              </div>
              <div className="dash-stat-label">Saved Documents</div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="dashboard-section">
          <h2 className="section-title">Quick Actions</h2>
          <div className="quick-actions-grid">
            {[
              { icon: '✍️', label: 'Generate New Draft', desc: 'Create a legal document using AI', path: '/generate', color: '#c9a84c' },
              { icon: '⚖️', label: 'Open LawGPT', desc: 'AI legal research assistant', path: '/lawgpt', color: '#4c9ac9' },
              { icon: '📄', label: 'View Documents', desc: 'Browse your saved drafts', path: '/documents', color: '#4cc97a' },
              { icon: '👥', label: 'Manage Clients', desc: 'View and add client records', path: '/clients', color: '#c94c8a' },
            ].map((action, i) => (
              <div
                key={i}
                className="quick-action-card"
                onClick={() => navigate(action.path)}
                style={{ '--action-color': action.color }}
              >
                <div className="qa-icon" style={{ background: action.color + '22', color: action.color }}>
                  {action.icon}
                </div>
                <div className="qa-content">
                  <div className="qa-label">{action.label}</div>
                  <div className="qa-desc">{action.desc}</div>
                </div>
                <div className="qa-arrow">→</div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Documents */}
        <div className="dashboard-section">
          <div className="section-header">
            <h2 className="section-title">Recent Documents</h2>
            <button
              className="section-link"
              onClick={() => navigate('/documents')}
            >
              View All →
            </button>
          </div>

          {historyLoading ? (
            <div className="dash-skeleton-list">
              {[1, 2, 3].map(i => (
                <div key={i} className="skeleton-item" />
              ))}
            </div>
          ) : history.length === 0 ? (
            <div className="dash-empty">
              <div className="dash-empty-icon">📄</div>
              <p>No documents yet.</p>
              <button
                className="dash-action-btn primary"
                onClick={() => navigate('/generate')}
              >
                Generate Your First Document
              </button>
            </div>
          ) : (
            <div className="recent-docs-list">
              {history.slice(0, 5).map(doc => (
                <div key={doc.id} className="recent-doc-item">
                  <div className="doc-item-icon">
                    {getCategoryIcon(doc.category_name)}
                  </div>
                  <div className="doc-item-info">
                    <div className="doc-item-name">
                      {doc.document_type_name}
                    </div>
                    <div className="doc-item-category">
                      {doc.category_name}
                    </div>
                  </div>
                  <div className="doc-item-date">
                    {formatDate(doc.created_at)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </Layout>
  );
}