import React, { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import Layout from '../components/Layout';
import toast from 'react-hot-toast';

const ACCEPTED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain'
];

const FILE_LABELS = ['Draft 1', 'Draft 2', 'Draft 3', 'Draft 4', 'Draft 5'];

const COLORS = ['#c9a84c', '#4c9ac9', '#4cc97a', '#c94c8a', '#9a4cc9'];

export default function DraftReview() {
  const { userProfile } = useAuth();
  const fileInputRef = useRef(null);

  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [draftsInfo, setDraftsInfo] = useState([]);
  const [dragOver, setDragOver] = useState(false);

  const handleFileAdd = (newFiles) => {
    const valid = Array.from(newFiles).filter(f => {
      if (!ACCEPTED_TYPES.includes(f.type)) {
        toast.error(`${f.name} — unsupported file type`);
        return false;
      }
      if (f.size > 25 * 1024 * 1024) {
        toast.error(`${f.name} — file too large (max 25MB)`);
        return false;
      }
      return true;
    });

    const combined = [...files, ...valid].slice(0, 5);
    setFiles(combined);
    if (combined.length > files.length) {
      toast.success(`${combined.length - files.length} file(s) added`);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFileAdd(e.dataTransfer.files);
  };

  const handleRemoveFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleAnalyse = async () => {
    if (files.length < 2) {
      toast.error('Please upload at least 2 drafts to compare');
      return;
    }
    setLoading(true);
    setAnalysis(null);
    try {
      const res = await api.analyseDrafts(files);
      setAnalysis(res.data.analysis);
      setDraftsInfo(res.data.draftsAnalysed || []);
      toast.success('Analysis complete!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Analysis failed. Please try again.');
    }
    setLoading(false);
  };

  const handleReset = () => {
    setFiles([]);
    setAnalysis(null);
    setDraftsInfo([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFileIcon = (type) => {
    if (type === 'application/pdf') return '📄';
    if (type.includes('word')) return '📝';
    if (type === 'text/plain') return '📃';
    return '📎';
  };

  const formatAnalysis = (text) => {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/^## (.*$)/gm, '<h3 class="analysis-h3">$1</h3>')
      .replace(/^### (.*$)/gm, '<h4 class="analysis-h4">$1</h4>')
      .replace(/\n/g, '<br/>');
  };

  return (
    <Layout>
      <div className="page-container">

        {/* Header */}
        <div className="page-header">
          <div>
            <h1 className="page-title">⚖️ Draft Review AI</h1>
            <p className="page-subtitle">
              Upload 2–5 drafts of the same document. AI will compare them in detail and recommend the strongest draft.
            </p>
          </div>
          {analysis && (
            <button className="dash-action-btn secondary" onClick={handleReset}>
              🔄 Start New Review
            </button>
          )}
        </div>

        {/* Upload Section */}
        {!analysis && (
          <div className="translate-card" style={{ marginBottom: '1.5rem' }}>
            <div className="translate-section-title">
              Upload Drafts to Compare
              <span style={{
                marginLeft: '0.75rem',
                fontSize: '0.8rem',
                color: 'var(--text-secondary)',
                fontWeight: 400
              }}>
                2 minimum · 5 maximum · PDF, DOCX, TXT
              </span>
            </div>

            {/* Drop Zone */}
            <div
              className={`translate-dropzone ${dragOver ? 'dragover' : ''} ${files.length >= 5 ? 'has-file' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => files.length < 5 && fileInputRef.current?.click()}
              style={{ cursor: files.length >= 5 ? 'default' : 'pointer' }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.doc,.txt"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => handleFileAdd(e.target.files)}
              />
              <div className="translate-dropzone-inner">
                <div className="translate-dropzone-icon">
                  {files.length >= 5 ? '✅' : '📂'}
                </div>
                <div className="translate-dropzone-text">
                  {files.length >= 5
                    ? 'Maximum 5 drafts uploaded'
                    : files.length > 0
                    ? `${files.length} draft(s) added — click to add more`
                    : <>Drag & drop drafts or <span className="translate-dropzone-link">browse files</span></>
                  }
                </div>
                <div className="translate-dropzone-hint">
                  PDF, DOCX, TXT — up to 25MB each
                </div>
              </div>
            </div>

            {/* File List */}
            {files.length > 0 && (
              <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {files.map((file, index) => (
                  <div
                    key={index}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.75rem 1rem',
                      background: 'var(--bg-primary)',
                      borderRadius: '8px',
                      border: `2px solid ${COLORS[index]}30`,
                    }}
                  >
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '6px',
                      background: COLORS[index],
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.75rem',
                      color: '#fff',
                      fontWeight: 700,
                      flexShrink: 0
                    }}>
                      {index + 1}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: '0.9rem',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>
                        {getFileIcon(file.type)} {file.name}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {FILE_LABELS[index]} · {formatFileSize(file.size)}
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRemoveFile(index); }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                        fontSize: '1.1rem',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        flexShrink: 0
                      }}
                      title="Remove"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Info notice */}
            <div className="translate-notice" style={{ marginTop: '1rem' }}>
              🔍 AI will compare all drafts section-by-section, identify weak clauses, risky wording, missing protections, and recommend the strongest draft. Free — no credits deducted.
            </div>

            {/* Analyse Button */}
            <button
              className="translate-btn-primary"
              onClick={handleAnalyse}
              disabled={files.length < 2 || loading}
              style={{ marginTop: '1rem' }}
            >
              {loading
                ? '⏳ Analysing drafts...'
                : files.length < 2
                ? `Upload ${2 - files.length} more draft${2 - files.length > 1 ? 's' : ''} to begin`
                : `⚖️ Compare ${files.length} Drafts`
              }
            </button>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="translate-card translate-loading-card">
            <div className="translate-spinner"></div>
            <div className="translate-loading-title">Analysing your drafts...</div>
            <div className="translate-loading-sub">
              Comparing clauses, protections, language quality, and legal risk across all {files.length} drafts
            </div>
            <div className="translate-loading-note">
              This may take 30–60 seconds for a thorough analysis.
            </div>
            <div className="translate-progress-bar">
              <div className="translate-progress-fill"></div>
            </div>
          </div>
        )}

        {/* Analysis Result */}
        {analysis && !loading && (
          <div>
            {/* Drafts analysed badges */}
            <div style={{
              display: 'flex',
              gap: '0.5rem',
              flexWrap: 'wrap',
              marginBottom: '1.5rem'
            }}>
              {draftsInfo.map((d, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.4rem 0.75rem',
                    borderRadius: '20px',
                    background: `${COLORS[i]}20`,
                    border: `1px solid ${COLORS[i]}40`,
                    fontSize: '0.8rem',
                    color: 'var(--text-primary)'
                  }}
                >
                  <span style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    background: COLORS[i],
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontSize: '0.65rem',
                    fontWeight: 700
                  }}>
                    {i + 1}
                  </span>
                  <span style={{
                    maxWidth: '180px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    {d.name}
                  </span>
                </div>
              ))}
            </div>

            {/* Analysis Card */}
            <div className="translate-card">
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '1.5rem',
                flexWrap: 'wrap',
                gap: '1rem'
              }}>
                <h2 style={{
                  fontSize: '1.2rem',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  margin: 0
                }}>
                  📊 Comparative Legal Analysis
                </h2>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    className="translate-btn-outline"
                    onClick={() => {
                      const blob = new Blob([analysis], { type: 'text/plain' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `Draft_Review_${new Date().toLocaleDateString('en-IN').replace(/\//g, '-')}.txt`;
                      a.click();
                      URL.revokeObjectURL(url);
                      toast.success('Report downloaded');
                    }}
                  >
                    ⬇️ Download Report
                  </button>
                  <button className="translate-btn-ghost" onClick={handleReset}>
                    🔄 New Review
                  </button>
                </div>
              </div>

              <div
                className="lawgpt-message-content"
                style={{
                  lineHeight: '1.8',
                  color: 'var(--text-primary)',
                  fontSize: '0.92rem',
                  whiteSpace: 'pre-wrap'
                }}
                dangerouslySetInnerHTML={{ __html: formatAnalysis(analysis) }}
              />
            </div>
          </div>
        )}

      </div>

      <style>{`
        .analysis-h3 {
          font-size: 1.05rem;
          font-weight: 700;
          color: var(--gold, #c9a84c);
          margin: 1.5rem 0 0.5rem 0;
          padding-bottom: 0.3rem;
          border-bottom: 1px solid var(--border-color);
        }
        .analysis-h4 {
          font-size: 0.95rem;
          font-weight: 600;
          color: var(--text-primary);
          margin: 1rem 0 0.3rem 0;
        }
      `}</style>
    </Layout>
  );
}