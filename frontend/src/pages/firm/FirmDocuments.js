import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api';
import { jsPDF } from 'jspdf';
import toast from 'react-hot-toast';
import FirmLayout from './FirmLayout';

const cleanText = (text) => {
  if (!text) return '';
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

export default function FirmDocuments() {
  const navigate = useNavigate();
  // removed unused userProfile
  const [sharedDocs, setSharedDocs] = useState([]);
  const [privateDocs, setPrivateDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('shared');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewDoc, setViewDoc] = useState(null);

  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const res = await api.firmGetDocuments();
      setSharedDocs(res.data.sharedDocuments || []);
      setPrivateDocs(res.data.privateDocuments || []);
    } catch (err) {
      console.error('Load error:', err);
      toast.error('Failed to load documents');
    }
    setLoading(false);
  };

  const formatDate = (d) => new Date(d).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric'
  });

  const getCategoryIcon = (category) => {
    const icons = {
      'Property Law': '🏠', 'Corporate Law': '🏢', 'Criminal Law': '⚖️',
      'Employment Law': '💼', 'Taxation Law': '💰', 'Consumer Law': '🛒',
      'Cyber Law': '💻', 'Startup Law': '🚀', 'Civil Litigation': '📋',
      'Arbitration Law': '🤝', 'Intellectual Property Law': '💡',
      'Divorce / Family Law': '👨‍👩‍👧', 'Freeform': '✨'
    };
    return icons[category] || '📄';
  };

  const filterDocs = (docs) => docs.filter(doc =>
    searchQuery === '' ||
    doc.document_type_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doc.category_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const downloadPDF = (doc) => {
    try {
      const jsPDFDoc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = jsPDFDoc.internal.pageSize.getWidth();
      const pageHeight = jsPDFDoc.internal.pageSize.getHeight();
      const marginLeft = 25, marginRight = 25, marginTop = 30, marginBottom = 25;
      const maxWidth = pageWidth - marginLeft - marginRight;
      let y = marginTop;
      let pageNum = 1;

      const addHeader = () => {
        jsPDFDoc.setFillColor(15, 40, 80);
        jsPDFDoc.rect(0, 0, pageWidth, 18, 'F');
        jsPDFDoc.setFont('helvetica', 'bold');
        jsPDFDoc.setFontSize(11);
        jsPDFDoc.setTextColor(255, 255, 255);
        jsPDFDoc.text('⚖ LEXORA — AI GENERATED DOCUMENT', marginLeft, 12);
        jsPDFDoc.setTextColor(0, 0, 0);
      };

      const addFooter = (pn) => {
        jsPDFDoc.setDrawColor(200, 200, 200);
        jsPDFDoc.line(marginLeft, pageHeight - 15, pageWidth - marginRight, pageHeight - 15);
        jsPDFDoc.setFont('helvetica', 'normal');
        jsPDFDoc.setFontSize(8);
        jsPDFDoc.setTextColor(120, 120, 120);
        jsPDFDoc.text(doc.document_type_name || 'Legal Document', marginLeft, pageHeight - 9);
        jsPDFDoc.text(`Page ${pn}`, pageWidth - marginRight, pageHeight - 9, { align: 'right' });
        jsPDFDoc.text(new Date().toLocaleDateString('en-IN'), pageWidth / 2, pageHeight - 9, { align: 'center' });
        jsPDFDoc.setTextColor(0, 0, 0);
      };

      const addNewPage = () => {
        addFooter(pageNum);
        jsPDFDoc.addPage();
        pageNum++;
        addHeader();
        y = marginTop + 10;
      };

      addHeader();
      y = marginTop + 10;

      jsPDFDoc.setFont('helvetica', 'bold');
      jsPDFDoc.setFontSize(15);
      jsPDFDoc.setTextColor(15, 40, 80);
      jsPDFDoc.text(doc.document_type_name?.toUpperCase() || 'LEGAL DOCUMENT', pageWidth / 2, y, { align: 'center' });
      y += 10;

      jsPDFDoc.setDrawColor(220, 220, 220);
      jsPDFDoc.setLineWidth(0.3);
      jsPDFDoc.line(marginLeft, y, pageWidth - marginRight, y);
      y += 8;

      const cleanedText = cleanText(doc.generated_content || '');
      const paragraphs = cleanedText.split('\n');

      paragraphs.forEach((para) => {
        if (para.trim() === '') { y += 4; return; }
        const isHeading = (para.trim() === para.trim().toUpperCase() && para.trim().length > 3) || para.trim().endsWith(':');

        if (isHeading) {
          y += 4;
          if (y > pageHeight - marginBottom - 10) addNewPage();
          jsPDFDoc.setFont('helvetica', 'bold');
          jsPDFDoc.setFontSize(11);
          jsPDFDoc.setTextColor(15, 40, 80);
          jsPDFDoc.splitTextToSize(para.trim(), maxWidth).forEach(line => {
            if (y > pageHeight - marginBottom) addNewPage();
            jsPDFDoc.text(line, marginLeft, y);
            y += 6;
          });
          y += 2;
        } else {
          jsPDFDoc.setFont('helvetica', 'normal');
          jsPDFDoc.setFontSize(10);
          jsPDFDoc.setTextColor(30, 30, 30);
          jsPDFDoc.splitTextToSize(para.trim(), maxWidth).forEach(line => {
            if (y > pageHeight - marginBottom) addNewPage();
            jsPDFDoc.text(line, marginLeft, y);
            y += 5.5;
          });
          y += 2;
        }
      });

      addFooter(pageNum);
      const fileName = `${doc.document_type_name || 'Legal_Document'}_${new Date().toLocaleDateString('en-IN').replace(/\//g, '-')}.pdf`;
      jsPDFDoc.save(fileName);
      toast.success('PDF downloaded!');
    } catch (err) {
      console.error('PDF error:', err);
      toast.error('PDF download failed');
    }
  };

  const filteredShared = filterDocs(sharedDocs);
  const filteredPrivate = filterDocs(privateDocs);

  const DocTable = ({ docs, showSharedBy = false }) => (
    docs.length === 0 ? (
      <div className="firm-empty">
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>
          {showSharedBy ? '📁' : '🔒'}
        </div>
        <h3>{showSharedBy ? 'No shared documents yet' : 'No private documents'}</h3>
        <p>
          {searchQuery
            ? 'Try adjusting your search.'
            : showSharedBy
              ? 'Generate a document and click "Share with Firm" to share it here.'
              : 'Documents you generate but don\'t share appear here.'}
        </p>
        {!searchQuery && (
          <button
            className="firm-btn-primary"
            style={{ marginTop: '1rem' }}
            onClick={() => navigate('/generate')}
          >
            Generate Document
          </button>
        )}
      </div>
    ) : (
      <div className="firm-table-wrap">
        <table className="firm-table">
          <thead>
            <tr>
              <th>Document</th>
              <th>Category</th>
              {showSharedBy && <th>Shared By</th>}
              <th>Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {docs.map((doc) => (
              <tr key={doc.id}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span>{getCategoryIcon(doc.category_name)}</span>
                    <span style={{ fontWeight: 500 }}>{doc.document_type_name}</span>
                  </div>
                </td>
                <td>
                  <span style={{
                    padding: '0.2rem 0.6rem',
                    borderRadius: '999px',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    background: 'var(--primary-light)',
                    color: 'var(--accent)',
                  }}>
                    {doc.category_name}
                  </span>
                </td>
                {showSharedBy && (
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div className="firm-avatar" style={{ width: 28, height: 28, fontSize: '0.75rem' }}>
                        {(doc.shared_by_name || 'U')[0].toUpperCase()}
                      </div>
                      <span>{doc.shared_by_name}</span>
                    </div>
                  </td>
                )}
                <td style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                  {formatDate(doc.created_at)}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {doc.generated_content && (
                      <>
                        <button
                          className="firm-btn-outline"
                          style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                          onClick={() => setViewDoc(doc)}
                        >
                          👁 View
                        </button>
                        <button
                          className="firm-btn-outline"
                          style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                          onClick={() => downloadPDF(doc)}
                        >
                          ⬇️ PDF
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  );

  return (
    <FirmLayout>
      <div className="firm-page">

        {/* Header */}
        <div className="firm-page-header">
          <div>
            <h1 className="firm-page-title">📁 Documents</h1>
            <p className="firm-page-sub">
              Shared firm documents and your private documents
            </p>
          </div>
          <button className="firm-btn-primary" onClick={() => navigate('/generate')}>
            ✍️ Generate Document
          </button>
        </div>

        {/* Search */}
        <div className="firm-search-bar">
          <input
            type="text"
            placeholder="🔍 Search documents..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="firm-search-input"
          />
          <span className="firm-docs-count">
            {activeTab === 'shared' ? filteredShared.length : filteredPrivate.length} document
            {(activeTab === 'shared' ? filteredShared.length : filteredPrivate.length) !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Tabs */}
        <div className="firm-tabs">
          <button
            className={`firm-tab ${activeTab === 'shared' ? 'active' : ''}`}
            onClick={() => setActiveTab('shared')}
          >
            🏛️ Shared with Firm ({sharedDocs.length})
          </button>
          <button
            className={`firm-tab ${activeTab === 'private' ? 'active' : ''}`}
            onClick={() => setActiveTab('private')}
          >
            🔒 My Private Documents ({privateDocs.length})
          </button>
        </div>

        {loading ? (
          <div className="firm-loading">Loading documents...</div>
        ) : (
          <>
            {activeTab === 'shared' && <DocTable docs={filteredShared} showSharedBy={true} />}
            {activeTab === 'private' && <DocTable docs={filteredPrivate} showSharedBy={false} />}
          </>
        )}

      </div>

      {/* Document Viewer Modal */}
      {viewDoc && (
        <div className="firm-modal-overlay" onClick={() => setViewDoc(null)}>
          <div
            className="firm-modal"
            style={{ maxWidth: '800px', width: '95%', maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexShrink: 0 }}>
              <div>
                <h3 className="firm-modal-title" style={{ margin: 0 }}>{viewDoc.document_type_name}</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0' }}>
                  {viewDoc.category_name} • {formatDate(viewDoc.created_at)}
                  {viewDoc.shared_by_name && ` • Shared by ${viewDoc.shared_by_name}`}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button
                  className="firm-btn-primary"
                  style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                  onClick={() => downloadPDF(viewDoc)}
                >
                  ⬇️ Download PDF
                </button>
                <button
                  className="firm-btn-outline"
                  style={{ padding: '0.5rem 0.75rem', fontSize: '1rem' }}
                  onClick={() => setViewDoc(null)}
                >
                  ✕
                </button>
              </div>
            </div>
            <div style={{
              overflowY: 'auto',
              flex: 1,
              background: 'var(--bg-secondary)',
              borderRadius: '10px',
              padding: '1.5rem',
              border: '1px solid var(--border-color)'
            }}>
              <pre style={{
                fontFamily: 'Georgia, serif',
                fontSize: '0.875rem',
                lineHeight: 1.75,
                color: 'var(--text-primary)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                margin: 0
              }}>
                {cleanText(viewDoc.generated_content)}
              </pre>
            </div>
          </div>
        </div>
      )}

    </FirmLayout>
  );
}