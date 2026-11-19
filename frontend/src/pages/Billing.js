import React, { useEffect, useState, useCallback } from 'react';
import Icon from '../components/Icon';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import Layout from '../components/Layout';
import toast from 'react-hot-toast';

export default function Billing() {
  const { userProfile } = useAuth();
  const [stats, setStats] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('All');

  const loadData = useCallback(async () => {
    try {
      const [statsRes, logsRes] = await Promise.all([
        api.getBillingStats(),
        api.getUsageLogs()
      ]);
      setStats(statsRes.data.stats);
      setLogs(logsRes.data.logs || []);
    } catch (err) {
      toast.error('Failed to load billing data');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  const getActionIcon = (type) => {
    const icons = {
      document_generated: '',
      lawgpt_message: '',
      pdf_uploaded: '',
      default: ''
    };
    return icons[type] || icons.default;
  };

  const getActionColor = (type) => {
    const colors = {
      document_generated: '#1E3A8A',
      lawgpt_message: '#92400E',
      pdf_uploaded: '#166534'
    };
    return colors[type] || '#888';
  };

  const filteredLogs = logs.filter(log =>
    filterType === 'All' || log.action_type === filterType
  );

  const creditUsagePercent = stats
    ? Math.min(100, Math.round(
        (stats.totalCreditsUsed / Math.max(1, stats.totalCreditsUsed + stats.creditsRemaining)) * 100
      ))
    : 0;

  return (
    <Layout>
      <div className="page-container">

        {/* Page Header */}
        <div className="page-header">
          <div>
            <h1 className="page-title">Billing & Credits</h1>
            <p className="page-subtitle">Track your usage and credit balance</p>
          </div>
        </div>

        {loading ? (
          <div className="skeleton-list">
            {[1, 2, 3].map(i => <div key={i} className="skeleton-card" />)}
          </div>
        ) : (
          <>
            {/* Credits Overview */}
            <div className="billing-stats-grid">
              <div className="billing-stat-card highlight">
                <div className="billing-stat-icon"><Icon name="card" /></div>
                <div className="billing-stat-content">
                  <div className="billing-stat-number">
                    {userProfile?.credits ?? stats?.creditsRemaining ?? 0}
                  </div>
                  <div className="billing-stat-label">Credits Remaining</div>
                </div>
              </div>

              <div className="billing-stat-card">
                <div className="billing-stat-icon"><Icon name="trending" /></div>
                <div className="billing-stat-content">
                  <div className="billing-stat-number">
                    {stats?.totalCreditsUsed ?? 0}
                  </div>
                  <div className="billing-stat-label">Total Credits Used</div>
                </div>
              </div>

              <div className="billing-stat-card">
                <div className="billing-stat-icon"><Icon name="file" /></div>
                <div className="billing-stat-content">
                  <div className="billing-stat-number">
                    {userProfile?.documents_generated ?? stats?.documentsGenerated ?? 0}
                  </div>
                  <div className="billing-stat-label">Documents Generated</div>
                </div>
              </div>

              <div className="billing-stat-card">
                <div className="billing-stat-icon"><Icon name="scale" /></div>
                <div className="billing-stat-content">
                  <div className="billing-stat-number">
                    {stats?.lawgptCount ?? 0}
                  </div>
                  <div className="billing-stat-label">Research Sessions</div>
                </div>
              </div>
            </div>

            {/* Credit Usage Bar */}
            <div className="billing-section">
              <h2 className="section-title">Credit Usage</h2>
              <div className="credit-usage-card">
                <div className="credit-usage-header">
                  <span>Used: {stats?.totalCreditsUsed ?? 0} credits</span>
                  <span>Remaining: {userProfile?.credits ?? 0} credits</span>
                </div>
                <div className="credit-progress-bar">
                  <div
                    className="credit-progress-fill"
                    style={{ width: `${creditUsagePercent}%` }}
                  />
                </div>
                <div className="credit-usage-footer">
                  <span>{creditUsagePercent}% used</span>
                  <span className="credit-refill-note">
                    Contact admin to add more credits
                  </span>
                </div>

                {/* Usage Breakdown */}
                <div className="usage-breakdown">
                  <div className="usage-breakdown-item">
                    <span className="ub-dot" style={{ background: '#1E3A8A' }} />
                    <span className="ub-label">Document Generation</span>
                    <span className="ub-count">
                      {stats?.docCount ?? 0} times
                    </span>
                  </div>
                  <div className="usage-breakdown-item">
                    <span className="ub-dot" style={{ background: '#92400E' }} />
                    <span className="ub-label">Research Questions</span>
                    <span className="ub-count">
                      {stats?.lawgptCount ?? 0} messages
                    </span>
                  </div>
                  <div className="usage-breakdown-item">
                    <span className="ub-dot" style={{ background: '#166534' }} />
                    <span className="ub-label">PDF Uploads</span>
                    <span className="ub-count">
                      {stats?.pdfCount ?? 0} files
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Usage History */}
            <div className="billing-section">
              <div className="section-header">
                <h2 className="section-title">Usage History</h2>
                <select
                  className="filter-select"
                  value={filterType}
                  onChange={e => setFilterType(e.target.value)}
                >
                  <option value="All">All Activity</option>
                  <option value="document_generated">Documents</option>
                  <option value="lawgpt_message">LawGPT</option>
                  <option value="pdf_uploaded">PDF Uploads</option>
                </select>
              </div>

              {filteredLogs.length === 0 ? (
                <div className="empty-page-state">
                  <div className="empty-icon"><Icon name="trending" /></div>
                  <h3>No activity yet</h3>
                  <p>Your usage history will appear here.</p>
                </div>
              ) : (
                <div className="usage-log-list">
                  {filteredLogs.map(log => (
                    <div key={log.id} className="usage-log-item">
                      <div
                        className="usage-log-icon"
                        style={{ color: getActionColor(log.action_type) }}
                      >
                        {getActionIcon(log.action_type)}
                      </div>
                      <div className="usage-log-info">
                        <div className="usage-log-label">
                          {log.action_label || log.action_type}
                        </div>
                        <div className="usage-log-date">
                          {formatDate(log.created_at)}
                        </div>
                      </div>
                      {log.credits_used > 0 && (
                        <div className="usage-log-credits">
                          -{log.credits_used} 
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}