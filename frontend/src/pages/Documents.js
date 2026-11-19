import React, { useEffect, useState, useCallback } from 'react';
import Icon from '../components/Icon';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import Layout from '../components/Layout';
import toast from 'react-hot-toast';

export default function Documents() {
  const { userProfile } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (userProfile?.is_firm_member) {
      navigate('/firm/documents', { replace: true });
    }
  }, [userProfile, navigate]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('All');
  const [sortBy, setSortBy] = useState('newest');
  const [viewDoc, setViewDoc] = useState(null);

  const loadDocuments = useCallback(async () => {
    try {
      const res = await api.getHistory();
      setDocuments(res.data.documents || []);
    } catch (err) {
      toast.error('Failed to load documents');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const categories = ['All', ...new Set(documents.map(d => d.category_name).filter(Boolean))];

  const filtered = documents
    .filter(doc => {
      const matchSearch = searchQuery === '' ||
        doc.document_type_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.category_name?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchCategory = filterCategory === 'All' || doc.category_name === filterCategory;
      return matchSearch && matchCategory;
    })
    .sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.created_at) - new Date(a.created_at);
      if (sortBy === 'oldest') return new Date(a.created_at) - new Date(b.created_at);
      if (sortBy === 'name') return a.document_type_name?.localeCompare(b.document_type_name);
      return 0;
    });

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Just now';
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric'
    });
  };

  const getCategoryIcon = (category) => {
    const icons = {
      'Property Law': '', 'Corporate Law': '', 'Criminal Law': '',
      'Employment Law': '', 'Taxation Law': '', 'Consumer Law': '',
      'Cyber Law': '', 'Startup Law': '', 'Civil Litigation': '',
      'Arbitration Law': '', 'Intellectual Property Law': '',
      'Divorce / Family Law': '‍‍'
    };
    return icons[category] || '';
  };

  return (
    <Layout>
      <div className="page-container">

        {/* Page Header */}
        <div className="page-header">
          <div>
            <h1 className="page-title">Matter Archive</h1>
            <p className="page-subtitle">Every instrument prepared in your chambers</p>
          </div>
          <button
            className="dash-action-btn primary"
            onClick={() => navigate('/generate')}
          >
            New Document
          </button>
        </div>

        {/* Filters */}
        <div className="filters-bar">
          <input
            type="text"
            className="filter-search"
            placeholder="Search documents..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          <select
            className="filter-select"
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
          >
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <select
            className="filter-select"
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="name">By Name</option>
          </select>
        </div>

        {/* Stats Bar */}
        <div className="docs-stats-bar">
          <span className="docs-count">
            {filtered.length} document{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Documents List */}
        {loading ? (
          <div className="skeleton-list">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="skeleton-card" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-page-state">
            <div className="empty-icon"><Icon name="file" /></div>
            <h3>No documents found</h3>
            <p>
              {searchQuery || filterCategory !== 'All'
                ? 'Try adjusting your search or filter.'
                : 'Generate your first legal document to get started.'}
            </p>
            {!searchQuery && filterCategory === 'All' && (
              <button
                className="dash-action-btn primary"
                onClick={() => navigate('/generate')}
              >
                Generate Document
              </button>
            )}
          </div>
        ) : (
          <div className="documents-grid">
            {filtered.map(doc => (
              <div key={doc.id} className="document-card">
                <div className="doc-card-header">
                  <div className="doc-card-icon">
                    {getCategoryIcon(doc.category_name)}
                  </div>
                  <div className="doc-card-meta">
                    <div className="doc-card-type">{doc.document_type_name}</div>
                    <div className="doc-card-category">{doc.category_name}</div>
                  </div>
                </div>
                <div className="doc-card-date">
                  {formatDate(doc.created_at)}
                </div>
                <div className="doc-card-actions">
                  <button
                    className="doc-btn view"
                    onClick={() => setViewDoc(doc)}
                  >
                    View
                  </button>
                  <button
                    className="doc-btn generate"
                    onClick={() => navigate('/generate')}
                  >
                    New Similar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Document Viewer Modal */}
        {viewDoc && (
          <div className="modal-overlay" onClick={() => setViewDoc(null)}>
            <div className="modal-box" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <h3 className="modal-title">{viewDoc.document_type_name}</h3>
                  <p className="modal-subtitle">{viewDoc.category_name} • {formatDate(viewDoc.created_at)}</p>
                </div>
                <button className="modal-close" onClick={() => setViewDoc(null)}>×</button>
              </div>
              <div className="modal-body">
                {viewDoc.generated_content ? (
                  <pre className="modal-content">{viewDoc.generated_content}</pre>
                ) : (
                  <p className="modal-no-content">Document content not available.</p>
                )}
              </div>
            </div>
          </div>
        )}

      </div>
    </Layout>
  );
}