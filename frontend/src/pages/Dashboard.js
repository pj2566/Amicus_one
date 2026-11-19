import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import Layout from '../components/Layout';
import Icon from '../components/Icon';

const WORKFLOWS = [
  { icon: 'file', title: 'Guided Legal Drafting', path: '/generate',
    desc: 'Standard Indian instruments across 12 practice areas, with a live engrossment preview as you fill the details.' },
  { icon: 'search', title: 'Statutory Research', path: '/lawgpt',
    desc: 'BNS, BNSS & BSA answered from the official text, with every citation verified and old-code equivalents noted.' },
  { icon: 'swap', title: 'Courtroom Translation', path: '/translate',
    desc: 'Translate deeds and orders between English and Hindi, Marathi, Bengali, Tamil and more — scanned PDFs included.' },
  { icon: 'clipboard', title: 'Comparative Draft Audit', path: '/draft-review',
    desc: 'Compare up to 5 versions of an agreement to surface missing protections, indemnity gaps and risk.' },
];

const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export default function Dashboard() {
  const { userProfile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [history, setHistory] = useState([]);
  const [clients, setClients] = useState([]);
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);

  // Redirect firm members to firm dashboard
  useEffect(() => {
    if (userProfile?.is_firm_member) navigate('/firm/dashboard', { replace: true });
  }, [userProfile, navigate]);

  const loadData = useCallback(async () => {
    const [h, c, l] = await Promise.allSettled([api.getHistory(), api.getClients(), api.lawgptGetChats()]);
    if (h.status === 'fulfilled') setHistory(h.value.data.documents || []);
    if (c.status === 'fulfilled') setClients(c.value.data.clients || []);
    if (l.status === 'fulfilled') setChats(l.value.data.chats || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    refreshProfile();
    loadData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
  const dateLine = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const draftsThisWeek = history.filter(d => new Date(d.created_at).getTime() > weekAgo).length;
  const linkedClients = new Set(history.map(d => d.client_id).filter(Boolean)).size;
  const clientName = id => clients.find(c => c.id === id)?.name;

  return (
    <Layout>
      <div className="am-page">
        <div className="am-page-head">
          <div>
            <div className="am-eyebrow">{dateLine}</div>
            <h1 className="am-title">{greeting}, {userProfile?.name || 'Advocate'}</h1>
          </div>
          <div className="am-page-actions">
            <button className="am-btn" onClick={() => navigate('/lawgpt')}>Open Research</button>
            <button className="am-btn am-btn-primary" onClick={() => navigate('/generate')}>
              <Icon name="plus" size={16} /> New Legal Draft
            </button>
          </div>
        </div>

        <div className="am-stats">
          <div className="am-stat">
            <div className="am-stat-label">Drafts Prepared</div>
            <div className="am-stat-value">{userProfile?.documents_generated ?? history.length}</div>
            <div className={`am-stat-note ${draftsThisWeek ? 'up' : ''}`}>{draftsThisWeek ? `+${draftsThisWeek} this week` : 'None this week'}</div>
          </div>
          <div className="am-stat">
            <div className="am-stat-label">Client Directory</div>
            <div className="am-stat-value">{clients.length}</div>
            <div className="am-stat-note">{linkedClients} linked to drafts</div>
          </div>
          <div className="am-stat">
            <div className="am-stat-label">Research Briefs</div>
            <div className="am-stat-value">{chats.length}</div>
            <div className="am-stat-note">BNS · BNSS · BSA verified</div>
          </div>
          <div className="am-stat accent">
            <div className="am-stat-label">Allowance Balance</div>
            <div className="am-stat-value">{userProfile?.credits ?? 0}</div>
            <div className="am-stat-note">1 credit / standard draft</div>
          </div>
        </div>

        <div className="am-section-label">Chambers Workflows</div>
        <div className="am-workflows">
          {WORKFLOWS.map(w => (
            <button key={w.title} className="am-workflow" onClick={() => navigate(w.path)}>
              <div className="am-workflow-icon"><Icon name={w.icon} size={19} /></div>
              <div>
                <div className="am-workflow-title">{w.title}</div>
                <div className="am-workflow-desc">{w.desc}</div>
              </div>
              <Icon name="chevronRight" className="am-workflow-arrow" />
            </button>
          ))}
        </div>

        <div className="am-section-label">
          Recent Chambers Folio
          <button className="am-link" onClick={() => navigate('/documents')}>View full register <Icon name="arrowRight" size={15} /></button>
        </div>
        <div className="am-table-wrap">
          <table className="am-table">
            <thead>
              <tr><th>Instrument / Title</th><th>Practice Area</th><th>Client</th><th>Prepared</th><th>Action</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="5" className="am-empty">Loading your folio…</td></tr>
              ) : history.length === 0 ? (
                <tr><td colSpan="5" className="am-empty">
                  No drafts yet. <button className="am-link" onClick={() => navigate('/generate')}>Prepare your first instrument</button>
                </td></tr>
              ) : history.slice(0, 6).map(doc => (
                <tr key={doc.id}>
                  <td>{doc.document_type_name}</td>
                  <td>{doc.category_name}</td>
                  <td>{clientName(doc.client_id) || <span style={{ color: 'var(--am-ink-4)' }}>—</span>}</td>
                  <td>
                    <span className={`am-badge ${doc.is_shared_with_firm ? 'navy' : ''}`}>{formatDate(doc.created_at)}</span>
                  </td>
                  <td><button className="am-link" onClick={() => navigate('/documents')}>Open</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
