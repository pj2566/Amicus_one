import React, { useState, useRef } from 'react';
import Icon from '../components/Icon';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import { jsPDF } from 'jspdf';
import { Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle } from 'docx';
import { saveAs } from 'file-saver';
import toast from 'react-hot-toast';
import Layout from '../components/Layout';

const LANGUAGES = [
  { value: 'Hindi',   label: 'Hindi' },
  { value: 'Marathi', label: 'Marathi' },
  { value: 'Bengali', label: 'Bengali' },
  { value: 'Tamil',   label: 'Tamil' },
  { value: 'Kannada', label: 'Kannada' },
  { value: 'Telugu',  label: 'Telugu' },
  { value: 'Gujarati', label: 'Gujarati' },
  { value: 'Malayalam', label: 'Malayalam' },
  { value: 'Punjabi', label: 'Punjabi' },
  { value: 'Odia',    label: 'Odia' },
  { value: 'Urdu',    label: 'Urdu' },
];

const ACCEPTED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
  'image/jpeg',
  'image/png',
  'image/webp',
];

const cleanText = (text) =>
  text
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const splitIntoPages = (text, wordsPerPage = 400) => {
  const words = text.split(' ');
  const pages = [];
  for (let i = 0; i < words.length; i += wordsPerPage) {
    pages.push(words.slice(i, i + wordsPerPage).join(' '));
  }
  return pages.length > 0 ? pages : [''];
};

export default function Translate() {
  const { userProfile, refreshProfile } = useAuth();
  const dashboardPath = userProfile?.is_firm_member ? '/firm/dashboard' : '/dashboard';
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [step, setStep] = useState(1); // 1=upload, 2=translating, 3=result
  const [selectedFile, setSelectedFile] = useState(null);
  const [language, setLanguage] = useState('Hindi');
  const [direction, setDirection] = useState('to-english'); // or 'from-english'
  const sourceLanguage = direction === 'to-english' ? language : 'English';
  const targetLanguage = direction === 'to-english' ? 'English' : language;
  const hasCredits = userProfile?.is_firm_member || (userProfile?.credits ?? 0) > 0;
  const [, setTranslatedText] = useState('');
  const [editedText, setEditedText] = useState('');
  const [pages, setPages] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [fileName, setFileName] = useState('');
  const [progress, setProgress] = useState('');
  const [dragOver, setDragOver] = useState(false);

  // ── File handling ──────────────────────────────────────
  const handleFileSelect = (file) => {
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error('Only PDF, DOCX, TXT or image (JPG, PNG) files are supported');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      toast.error('File size must be under 25MB');
      return;
    }
    setSelectedFile(file);
    setFileName(file.name);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    handleFileSelect(file);
  };

  // ── Translation ────────────────────────────────────────
  const handleTranslate = async () => {
    if (!selectedFile) { toast.error('Please select a file'); return; }
    // Firm members draw from the firm pool; the server checks the actual balance
    if (!hasCredits) {
      toast.error('No credits remaining. Please top up.');
      return;
    }

    setStep(2);
    setProgress('Uploading and extracting text...');

    try {
      setProgress('Translating document — this may take a few minutes for large files...');
      const res = await api.translateDocument(selectedFile, sourceLanguage, targetLanguage);
      const translated = res.data.translatedText;
      const cleaned = cleanText(translated);

      setTranslatedText(cleaned);
      setEditedText(cleaned);
      setPages(splitIntoPages(cleaned));
      setCurrentPage(1);
      await refreshProfile();
      toast.success(`Document translated! ${res.data.chunksProcessed} sections processed.`);
      setStep(3);
    } catch (err) {
      console.error('Translation error:', err);
      if (err.response?.status === 402) {
        toast.error('No credits remaining!');
      } else {
        toast.error(err.response?.data?.error || 'Translation failed. Try again.');
      }
      setStep(1);
      setProgress('');
    }
  };

  // ── PDF Download ───────────────────────────────────────
  const downloadPDF = () => {
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const marginLeft = 25, marginRight = 25, marginTop = 30, marginBottom = 25;
      const maxWidth = pageWidth - marginLeft - marginRight;
      let y = marginTop;
      let pageNum = 1;

      const addHeader = () => {
        doc.setFillColor(15, 40, 80);
        doc.rect(0, 0, pageWidth, 18, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(255, 255, 255);
        doc.text('LEXORA — TRANSLATED DOCUMENT', marginLeft, 12);
        doc.setTextColor(0, 0, 0);
      };

      const addFooter = (pn) => {
        doc.setDrawColor(200, 200, 200);
        doc.line(marginLeft, pageHeight - 15, pageWidth - marginRight, pageHeight - 15);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(120, 120, 120);
        doc.text(`Translated from ${sourceLanguage} to ${targetLanguage}`, marginLeft, pageHeight - 9);
        doc.text(`Page ${pn}`, pageWidth - marginRight, pageHeight - 9, { align: 'right' });
        doc.text(`${new Date().toLocaleDateString('en-IN')}`, pageWidth / 2, pageHeight - 9, { align: 'center' });
        doc.setTextColor(0, 0, 0);
      };

      const addNewPage = () => {
        addFooter(pageNum);
        doc.addPage();
        pageNum++;
        addHeader();
        y = marginTop + 10;
      };

      addHeader();
      y = marginTop + 10;

      // Title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.setTextColor(15, 40, 80);
      const title = fileName.replace(/\.[^/.]+$/, '').toUpperCase() || 'TRANSLATED DOCUMENT';
      doc.text(title, pageWidth / 2, y, { align: 'center' });
      y += 6;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.text(`Translated from ${sourceLanguage} to ${targetLanguage} — Amicus One`, pageWidth / 2, y, { align: 'center' });
      y += 10;

      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.3);
      doc.line(marginLeft, y, pageWidth - marginRight, y);
      y += 8;

      const paragraphs = editedText.split('\n');
      paragraphs.forEach((para) => {
        if (para.trim() === '') { y += 4; return; }
        const isHeading =
          (para.trim() === para.trim().toUpperCase() && para.trim().length > 3) ||
          para.trim().endsWith(':');

        if (isHeading) {
          y += 4;
          if (y > pageHeight - marginBottom - 10) addNewPage();
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(11);
          doc.setTextColor(15, 40, 80);
          doc.splitTextToSize(para.trim(), maxWidth).forEach(line => {
            if (y > pageHeight - marginBottom) addNewPage();
            doc.text(line, marginLeft, y);
            y += 6;
          });
          y += 2;
        } else {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(10);
          doc.setTextColor(30, 30, 30);
          doc.splitTextToSize(para.trim(), maxWidth).forEach(line => {
            if (y > pageHeight - marginBottom) addNewPage();
            doc.text(line, marginLeft, y);
            y += 5.5;
          });
          y += 2;
        }
      });

      // Disclaimer
      if (y > pageHeight - marginBottom - 20) addNewPage();
      doc.setFillColor(245, 245, 245);
      doc.rect(marginLeft, y, maxWidth, 16, 'F');
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 100, 100);
      doc.text('This document was translated using Amicus One. Please verify accuracy with a qualified legal professional.', marginLeft + 3, y + 6);
      doc.text(`${sourceLanguage} → ${targetLanguage} | Translated: ${new Date().toLocaleDateString('en-IN')}`, marginLeft + 3, y + 11);

      addFooter(pageNum);

      const outName = `${fileName.replace(/\.[^/.]+$/, '') || 'Translated'}_${targetLanguage}_${new Date().toLocaleDateString('en-IN').replace(/\//g, '-')}.pdf`;
      doc.save(outName);
      toast.success('PDF downloaded!');
    } catch (err) {
      console.error('PDF error:', err);
      toast.error('PDF download failed');
    }
  };

  // ── DOCX Download ──────────────────────────────────────
  const downloadDOCX = async () => {
    try {
      const paragraphs = editedText.split('\n');
      const children = [];

      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [
            new TextRun({
              text: fileName.replace(/\.[^/.]+$/, '').toUpperCase() || 'TRANSLATED DOCUMENT',
              bold: true, size: 32, color: '0F2850',
            }),
          ],
        })
      );
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 300 },
          children: [
            new TextRun({
              text: `Translated from ${sourceLanguage} to ${targetLanguage} — Amicus One`,
              color: '666666', size: 20,
            }),
          ],
        })
      );
      children.push(
        new Paragraph({
          border: { bottom: { color: 'CCCCCC', style: BorderStyle.SINGLE, size: 6 } },
          spacing: { after: 300 },
          children: [],
        })
      );

      paragraphs.forEach((para) => {
        if (para.trim() === '') {
          children.push(new Paragraph({ spacing: { after: 100 } }));
          return;
        }
        const isHeading =
          (para.trim() === para.trim().toUpperCase() && para.trim().length > 3) ||
          para.trim().endsWith(':');

        if (isHeading) {
          children.push(
            new Paragraph({
              spacing: { before: 300, after: 150 },
              children: [new TextRun({ text: para.trim(), bold: true, color: '0F2850', size: 24 })],
            })
          );
        } else if (para.trim().startsWith('•')) {
          children.push(
            new Paragraph({
              bullet: { level: 0 },
              spacing: { after: 120 },
              children: [new TextRun({ text: para.trim().replace(/^•\s*/, ''), size: 22 })],
            })
          );
        } else {
          children.push(
            new Paragraph({
              spacing: { after: 160 },
              children: [new TextRun({ text: para.trim(), size: 22 })],
            })
          );
        }
      });

      children.push(
        new Paragraph({
          spacing: { before: 300 },
          children: [
            new TextRun({
              text: `This document was translated using Amicus One from ${sourceLanguage} to ${targetLanguage}. Please verify with a legal professional.`,
              italics: true, color: '888888', size: 18,
            }),
          ],
        })
      );

      const docx = new Document({
        sections: [{
          properties: { page: { margin: { top: 1000, bottom: 1000, left: 1200, right: 1200 } } },
          children,
        }],
      });

      const blob = await Packer.toBlob(docx);
      const outName = `${fileName.replace(/\.[^/.]+$/, '') || 'Translated'}_${targetLanguage}_${new Date().toLocaleDateString('en-IN').replace(/\//g, '-')}.docx`;
      saveAs(blob, outName);
      toast.success('Word document downloaded!');
    } catch (err) {
      console.error('DOCX error:', err);
      toast.error('Word download failed');
    }
  };

  // ── Reset ──────────────────────────────────────────────
  const handleReset = () => {
    setStep(1);
    setSelectedFile(null);
    setFileName('');
    setTranslatedText('');
    setEditedText('');
    setPages([]);
    setCurrentPage(1);
    setProgress('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── UPDATE PAGES when editing ─────────────────────────
  const handleEditChange = (val) => {
    setEditedText(val);
    setPages(splitIntoPages(val));
  };

  // ─────────────────────────────────────────────────────
  return (
    <Layout>
      <div className="translate-root">

        {/* Page Header */}
        <div className="translate-header">
          <div>
            <h1 className="translate-title">Document Translator</h1>
            <p className="translate-subtitle">
              Translate legal documents between English and Indian languages — with full context preserved across all pages. Scanned PDFs and photos are supported.
            </p>
          </div>
          <div className="translate-credit-badge">
            {userProfile?.is_firm_member ? 'Firm Pool' : (userProfile?.credits ?? 0)} Credits
          </div>
        </div>

        {/* ── STEP 1: Upload ── */}
        {step === 1 && (
          <div className="translate-card">
            <div className="translate-section-title">Step 1 — Choose direction and language</div>
            <div className="translate-lang-grid" style={{ marginBottom: '0.75rem' }}>
              <button
                className={`translate-lang-btn ${direction === 'to-english' ? 'active' : ''}`}
                onClick={() => setDirection('to-english')}
              >
                {language} → English
              </button>
              <button
                className={`translate-lang-btn ${direction === 'from-english' ? 'active' : ''}`}
                onClick={() => setDirection('from-english')}
              >
                English → {language}
              </button>
            </div>
            <div className="translate-lang-grid">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.value}
                  className={`translate-lang-btn ${language === lang.value ? 'active' : ''}`}
                  onClick={() => setLanguage(lang.value)}
                >
                  {lang.label}
                </button>
              ))}
            </div>

            <div className="translate-section-title" style={{ marginTop: '1.5rem' }}>
              Step 2 — Upload document
            </div>
            <div
              className={`translate-dropzone ${dragOver ? 'dragover' : ''} ${selectedFile ? 'has-file' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.doc,.txt,.jpg,.jpeg,.png,.webp"
                style={{ display: 'none' }}
                onChange={(e) => handleFileSelect(e.target.files[0])}
              />
              {selectedFile ? (
                <div className="translate-file-selected">
                  <div className="translate-file-icon"><Icon name="file" /></div>
                  <div className="translate-file-info">
                    <div className="translate-file-name">{fileName}</div>
                    <div className="translate-file-size">
                      {(selectedFile.size / 1024).toFixed(1)} KB
                    </div>
                  </div>
                  <button
                    className="translate-file-remove"
                    onClick={(e) => { e.stopPropagation(); handleReset(); }}
                  >
                    
                  </button>
                </div>
              ) : (
                <div className="translate-dropzone-inner">
                  <div className="translate-dropzone-icon"><Icon name="upload" /></div>
                  <div className="translate-dropzone-text">
                    Drag & drop or <span className="translate-dropzone-link">browse file</span>
                  </div>
                  <div className="translate-dropzone-hint">
                    PDF (including scanned), DOCX, TXT or a photo — up to 25MB
                  </div>
                </div>
              )}
            </div>

            <div className="translate-notice">
              Translation costs <strong>1 credit</strong>. You have <strong>{userProfile?.is_firm_member ? 'firm pool' : (userProfile?.credits ?? 0)} credits</strong>.
              Context is preserved across all pages — no broken storyline.
            </div>

            <button
              className="translate-btn-primary"
              onClick={handleTranslate}
              disabled={!selectedFile || !hasCredits}
            >
              Translate to {targetLanguage} (1 Credit)
            </button>
          </div>
        )}

        {/* ── STEP 2: Translating ── */}
        {step === 2 && (
          <div className="translate-card translate-loading-card">
            <div className="translate-spinner"></div>
            <div className="translate-loading-title">Translating your document...</div>
            <div className="translate-loading-sub">{progress}</div>
            <div className="translate-loading-note">
              Large documents (50–100 pages) may take 2–5 minutes.<br />
              Each section is translated with full context from the previous section.
            </div>
            <div className="translate-progress-bar">
              <div className="translate-progress-fill"></div>
            </div>
          </div>
        )}

        {/* ── STEP 3: Result ── */}
        {step === 3 && (
          <div>
            {/* Result Header */}
            <div className="translate-result-header">
              <div>
                <h2 className="translate-result-title">Translation Complete!</h2>
                <p className="translate-result-sub">
                  {fileName} — translated from {sourceLanguage} to {targetLanguage}
                </p>
              </div>
              <div className="translate-result-actions">
                {/* The PDF export's built-in fonts only cover Latin script; use Word for Indian scripts */}
                {targetLanguage === 'English' && (
                  <button className="translate-btn-primary" onClick={downloadPDF}>
                    Download PDF
                  </button>
                )}
                <button className="translate-btn-outline" onClick={downloadDOCX}>
                  Download Word
                </button>
                <button className="translate-btn-ghost" onClick={handleReset}>
                  Translate Another
                </button>
              </div>
            </div>

            {/* Page viewer */}
            {pages.length > 0 && (
              <div className="translate-card" style={{ marginBottom: '1.5rem' }}>
                <div className="page-navigation">
                  <button
                    className="page-nav-btn"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    ← Prev
                  </button>
                  <div className="page-indicator-wrap">
                    <span className="page-indicator">
                      Page {currentPage} of {pages.length}
                    </span>
                    <div className="page-dots">
                      {pages.slice(0, 20).map((_, i) => (
                        <span
                          key={i}
                          className={`page-dot ${currentPage === i + 1 ? 'active' : ''}`}
                          onClick={() => setCurrentPage(i + 1)}
                        />
                      ))}
                    </div>
                  </div>
                  <button
                    className="page-nav-btn"
                    onClick={() => setCurrentPage(p => Math.min(pages.length, p + 1))}
                    disabled={currentPage === pages.length}
                  >
                    Next →
                  </button>
                </div>

                <div className="document-page" style={{ marginTop: '1rem' }}>
                  <div className="page-header-bar">
                    <span>{fileName}</span>
                    <span>Page {currentPage} of {pages.length} — {sourceLanguage} → {targetLanguage}</span>
                  </div>
                  <div className="page-content">
                    {(pages[currentPage - 1] || '').split('\n').map((line, i) => (
                      <p key={i} className={line.trim() === '' ? 'page-empty-line' : 'page-line'}>
                        {line || '\u00A0'}
                      </p>
                    ))}
                  </div>
                  <div className="page-footer-bar">
                    <span>Amicus One — AI Translated Document</span>
                    <span>{currentPage}</span>
                  </div>
                </div>

                <div className="page-navigation" style={{ marginTop: '12px' }}>
                  <button
                    className="page-nav-btn"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    ← Prev
                  </button>
                  <span className="page-indicator">Page {currentPage} of {pages.length}</span>
                  <button
                    className="page-nav-btn"
                    onClick={() => setCurrentPage(p => Math.min(pages.length, p + 1))}
                    disabled={currentPage === pages.length}
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}

            {/* Edit section */}
            <div className="translate-card">
              <h3 className="translate-edit-title">Edit Translation</h3>
              <p className="translate-edit-note">
                Make corrections below — page view updates automatically:
              </p>
              <textarea
                className="document-editor"
                value={editedText}
                onChange={(e) => handleEditChange(e.target.value)}
                rows={15}
              />
            </div>

            {/* Bottom actions */}
            <div className="result-actions" style={{ marginTop: '1.5rem' }}>
              <button className="btn-primary" style={{ width: 'auto', padding: '12px 24px' }} onClick={downloadPDF}>
                Download PDF
              </button>
              <button className="btn-outline" style={{ width: 'auto', padding: '12px 24px' }} onClick={downloadDOCX}>
                Download Word
              </button>
              Back to Dashboard
              <button className="btn-outline" onClick={handleReset}>
                Translate Another
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}