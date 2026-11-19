import { jsPDF } from 'jspdf';
import React, { useEffect, useState, useCallback } from 'react';
import Icon from '../../components/Icon';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api';
import FirmLayout from './FirmLayout';
import toast from 'react-hot-toast';

const emptyForm = {
  name: '', phone: '', email: '',
  address: '', notes: '', previous_matters: ''
};

export default function FirmClients() {
  const { userProfile } = useAuth();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [formData, setFormData] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [viewClient, setViewClient] = useState(null);
  const [clientDocs, setClientDocs] = useState([]);
  const [clientDocsLoading, setClientDocsLoading] = useState(false);

  const loadClients = useCallback(async () => {
    try {
      const res = await api.getClients();
      setClients(res.data.clients || []);
    } catch (err) {
      toast.error('Failed to load clients');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const handleOpenAdd = () => {
    setEditingClient(null);
    setFormData(emptyForm);
    setShowForm(true);
  };

  const handleOpenEdit = (client) => {
    setEditingClient(client);
    setFormData({
      name: client.name || '',
      phone: client.phone || '',
      email: client.email || '',
      address: client.address || '',
      notes: client.notes || '',
      previous_matters: client.previous_matters || ''
    });
    setShowForm(true);
    setViewClient(null);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('Client name is required');
      return;
    }
    setSaving(true);
    try {
      if (editingClient) {
        const res = await api.updateClient(editingClient.id, formData);
        setClients(prev =>
          prev.map(c => c.id === editingClient.id ? res.data.client : c)
        );
        toast.success('Client updated');
      } else {
        const res = await api.createClient(formData);
        setClients(prev => [res.data.client, ...prev]);
        toast.success('Client added');
      }
      setShowForm(false);
      setFormData(emptyForm);
    } catch (err) {
      toast.error('Failed to save client');
    }
    setSaving(false);
  };

  const handleDelete = async (clientId) => {
    if (!window.confirm('Delete this client?')) return;
    try {
      await api.deleteClient(clientId);
      setClients(prev => prev.filter(c => c.id !== clientId));
      setViewClient(null);
      toast.success('Client deleted');
    } catch (err) {
      toast.error('Failed to delete client');
    }
  };

  const filtered = clients.filter(c =>
    searchQuery === '' ||
    c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.phone?.includes(searchQuery)
  );

  const loadClientDocs = async (clientId) => {
    setClientDocsLoading(true);
    setClientDocs([]);
    try {
      const res = await api.getDocumentsByClient(clientId);
      setClientDocs(res.data.documents || []);
    } catch (err) {
      setClientDocs([]);
    }
    setClientDocsLoading(false);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric'
    });
  };

  const getInitials = (name) => {
    return name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
  };

  const avatarColors = [
    '#1E3A8A', '#92400E', '#166534', '#7F1D1D',
    '#475569', '#c94c4c', '#4cc9c9', '#c98a4c'
  ];

  const getAvatarColor = (name) => {
    const index = (name?.charCodeAt(0) || 0) % avatarColors.length;
    return avatarColors[index];
  };

  const handleViewDoc = (doc) => {
    const win = window.open('', '_blank');
    win.document.write(`
      <html>
        <head>
          <title>${doc.document_type_name}</title>
          <style>
            body { font-family: 'Segoe UI', sans-serif; max-width: 900px; margin: 40px auto; padding: 20px; line-height: 1.7; color: #1a1a1a; }
            h1 { color: #1a1a2e; border-bottom: 2px solid #1E3A8A; padding-bottom: 10px; }
            pre { white-space: pre-wrap; font-family: 'Segoe UI', sans-serif; font-size: 14px; }
          </style>
        </head>
        <body>
          <h1>${doc.document_type_name}</h1>
          <p style="color:#888">${doc.category_name} — ${formatDate(doc.created_at)}</p>
          <hr/>
          <pre>${doc.generated_content || 'Content not available'}</pre>
        </body>
      </html>
    `);
    win.document.close();
  };

  const handleDownloadDoc = (doc) => {
    try {
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const marginLeft = 25, marginRight = 25, marginTop = 28, marginBottom = 22;
      const maxWidth = pageWidth - marginLeft - marginRight;
      let y = marginTop;
      let pageNum = 1;

      const addFooter = (num) => {
        pdf.setFont('times', 'normal');
        pdf.setFontSize(9);
        pdf.setTextColor(130, 130, 130);
        pdf.text(String(num), pageWidth / 2, pageHeight - 8, { align: 'center' });
        pdf.setTextColor(0, 0, 0);
      };

      const addNewPage = () => {
        addFooter(pageNum);
        pdf.addPage();
        pageNum++;
        y = marginTop;
      };

      pdf.setFont('times', 'bold');
      pdf.setFontSize(16);
      pdf.setTextColor(0, 0, 0);
      const title = doc.document_type_name.toUpperCase();
      pdf.text(title, pageWidth / 2, y, { align: 'center' });
      y += 10;

      const cleanText = (doc.generated_content || '')
        .replace(/<[^>]*>/g, '')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/#{1,6}\s+/g, '');

      const paragraphs = cleanText.split('\n');
      paragraphs.forEach(para => {
        if (!para.trim()) { y += 3; return; }
        const isHeading = para.trim() === para.trim().toUpperCase() && para.trim().length > 3 && !/^\d/.test(para.trim());
        pdf.setFont('times', isHeading ? 'bold' : 'normal');
        pdf.setFontSize(isHeading ? 11.5 : 11);
        pdf.setTextColor(0, 0, 0);
        const lines = pdf.splitTextToSize(para.trim(), maxWidth);
        lines.forEach(line => {
          if (y > pageHeight - marginBottom) addNewPage();
          pdf.text(line, marginLeft, y);
          y += 7;
        });
        y += isHeading ? 2 : 4;
      });

      addFooter(pageNum);
      pdf.save(`${doc.document_type_name}_${formatDate(doc.created_at)}.pdf`);
    } catch (err) {
      console.error('PDF error:', err);
      toast.error('PDF download failed');
    }
  };

  return (
    <FirmLayout>
      <div className="page-container">

        {/* Page Header */}
        <div className="page-header">
          <div>
            <h1 className="page-title">Firm Clients</h1>
            <p className="page-subtitle">
              Manage client records for {userProfile?.name || 'your firm'}
            </p>
          </div>
          <button className="dash-action-btn primary" onClick={handleOpenAdd}>
            + Add Client
          </button>
        </div>

        {/* Search */}
        <div className="filters-bar">
          <input
            type="text"
            className="filter-search"
            placeholder="Search clients by name, email or phone..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          <span className="docs-count">
            {filtered.length} client{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Clients Grid */}
        {loading ? (
          <div className="skeleton-list">
            {[1, 2, 3].map(i => <div key={i} className="skeleton-card" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-page-state">
            <div className="empty-icon"><Icon name="users" /></div>
            <h3>{searchQuery ? 'No clients found' : 'No clients yet'}</h3>
            <p>
              {searchQuery
                ? 'Try a different search term.'
                : 'Add your first client to get started.'}
            </p>
            {!searchQuery && (
              <button className="dash-action-btn primary" onClick={handleOpenAdd}>
                Add First Client
              </button>
            )}
          </div>
        ) : (
          <div className="clients-grid">
            {filtered.map(client => (
              <div
                key={client.id}
                className="client-card"
                onClick={() => {
                  setViewClient(client);
                  loadClientDocs(client.id);
                }}
              >
                <div className="client-card-header">
                  <div
                    className="client-avatar"
                    style={{ background: getAvatarColor(client.name) }}
                  >
                    {getInitials(client.name)}
                  </div>
                  <div className="client-info">
                    <div className="client-name">{client.name}</div>
                    {client.email && (
                      <div className="client-email">{client.email}</div>
                    )}
                  </div>
                </div>
                {client.phone && (
                  <div className="client-detail">{client.phone}</div>
                )}
                {client.address && (
                  <div className="client-detail">{client.address}</div>
                )}
                {client.previous_matters && (
                  <div className="client-matters">
                    {client.previous_matters.slice(0, 60)}
                    {client.previous_matters.length > 60 ? '...' : ''}
                  </div>
                )}
                <div className="client-card-footer">
                  <span className="client-date">Added {formatDate(client.created_at)}</span>
                  <div className="client-actions">
                    <button
                      className="client-btn edit"
                      onClick={e => { e.stopPropagation(); handleOpenEdit(client); }}
                    >
                      
                    </button>
                    <button
                      className="client-btn delete"
                      onClick={e => { e.stopPropagation(); handleDelete(client.id); }}
                    >
                      
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add/Edit Form Modal */}
        {showForm && (
          <div className="modal-overlay" onClick={() => setShowForm(false)}>
            <div className="modal-box" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3 className="modal-title">
                  {editingClient ? 'Edit Client' : '+ Add New Client'}
                </h3>
                <button className="modal-close" onClick={() => setShowForm(false)}>×</button>
              </div>
              <form onSubmit={handleSave} className="client-form">
                <div className="form-row">
                  <div className="form-group">
                    <label>Full Name <span className="required">*</span></label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                      placeholder="Client full name"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Phone Number</label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={e => setFormData(p => ({ ...p, phone: e.target.value }))}
                      placeholder="+91 XXXXX XXXXX"
                    />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Email Address</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={e => setFormData(p => ({ ...p, email: e.target.value }))}
                      placeholder="client@email.com"
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Address</label>
                  <textarea
                    value={formData.address}
                    onChange={e => setFormData(p => ({ ...p, address: e.target.value }))}
                    placeholder="Client address"
                    rows={2}
                  />
                </div>
                <div className="form-group">
                  <label>Previous Matters</label>
                  <textarea
                    value={formData.previous_matters}
                    onChange={e => setFormData(p => ({ ...p, previous_matters: e.target.value }))}
                    placeholder="Previous legal matters handled..."
                    rows={2}
                  />
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <textarea
                    value={formData.notes}
                    onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))}
                    placeholder="Additional notes about this client..."
                    rows={2}
                  />
                </div>
                <div className="form-actions">
                  <button
                    type="button"
                    className="dash-action-btn secondary"
                    onClick={() => setShowForm(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="dash-action-btn primary"
                    disabled={saving}
                  >
                    {saving ? 'Saving...' : editingClient ? 'Update Client' : 'Add Client'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* View Client Modal */}
        {viewClient && (
          <div className="modal-overlay" onClick={() => setViewClient(null)}>
            <div className="modal-box" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    className="client-avatar large"
                    style={{ background: getAvatarColor(viewClient.name) }}
                  >
                    {getInitials(viewClient.name)}
                  </div>
                  <div>
                    <h3 className="modal-title">{viewClient.name}</h3>
                    <p className="modal-subtitle">Added {formatDate(viewClient.created_at)}</p>
                  </div>
                </div>
                <button className="modal-close" onClick={() => setViewClient(null)}>×</button>
              </div>
              <div className="modal-body">
                <div className="client-view-grid">
                  {viewClient.phone && (
                    <div className="client-view-item">
                      <span className="cvi-label">Phone</span>
                      <span className="cvi-value">{viewClient.phone}</span>
                    </div>
                  )}
                  {viewClient.email && (
                    <div className="client-view-item">
                      <span className="cvi-label">Email</span>
                      <span className="cvi-value">{viewClient.email}</span>
                    </div>
                  )}
                  {viewClient.address && (
                    <div className="client-view-item full">
                      <span className="cvi-label">Address</span>
                      <span className="cvi-value">{viewClient.address}</span>
                    </div>
                  )}
                  {viewClient.previous_matters && (
                    <div className="client-view-item full">
                      <span className="cvi-label">Previous Matters</span>
                      <span className="cvi-value">{viewClient.previous_matters}</span>
                    </div>
                  )}
                  {viewClient.notes && (
                    <div className="client-view-item full">
                      <span className="cvi-label">Notes</span>
                      <span className="cvi-value">{viewClient.notes}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Client Documents */}
              <div className="client-docs-section">
                <h4 className="client-docs-title">
                  Linked Documents
                  <span className="client-docs-count">{clientDocs.length}</span>
                </h4>
                {clientDocsLoading ? (
                  <div className="client-docs-loading">Loading...</div>
                ) : clientDocs.length === 0 ? (
                  <div className="client-docs-empty">
                    No documents linked to this client yet.
                    Generate a document and link it to this client from the Generate page.
                  </div>
                ) : (
                  <div className="client-docs-list">
                    {clientDocs.map(doc => (
                      <div key={doc.id} className="client-doc-item">
                        <div className="client-doc-info">
                          <div className="client-doc-name">{doc.document_type_name}</div>
                          <div className="client-doc-category">
                            {doc.category_name} — {formatDate(doc.created_at)}
                          </div>
                        </div>
                        <div className="client-doc-btns">
                          <button
                            className="client-doc-btn view-btn"
                            onClick={() => handleViewDoc(doc)}
                          >
                            View
                          </button>
                          <button
                            className="client-doc-btn download-btn"
                            onClick={() => handleDownloadDoc(doc)}
                          >
                            PDF
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button
                  className="dash-action-btn secondary"
                  onClick={() => handleOpenEdit(viewClient)}
                >
                  Edit
                </button>
                <button
                  className="dash-action-btn danger"
                  onClick={() => handleDelete(viewClient.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </FirmLayout>
  );
}