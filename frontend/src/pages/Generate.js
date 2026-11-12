import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import { jsPDF } from 'jspdf';
import { Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle, HeadingLevel } from 'docx';
import { saveAs } from 'file-saver';
import toast from 'react-hot-toast';
import LegalSectionsAssistant from '../components/LegalSectionsAssistant';

// Strip markdown and clean text for display and PDF
const cleanMarkdown = (text) => {
  return text
    .replace(/<[^>]*>/g, '')              // Remove ALL HTML tags
    .replace(/&nbsp;/g, ' ')             // Replace HTML entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/#{1,6}\s+/g, '')           // Remove headers ##, ###
    .replace(/\*\*\*(.*?)\*\*\*/g, '$1') // Remove bold+italic ***text***
    .replace(/\*\*(.*?)\*\*/g, '$1')     // Remove bold **text**
    .replace(/\*(.*?)\*/g, '$1')         // Remove italic *text*
    .replace(/__(.*?)__/g, '$1')         // Remove __bold__
    .replace(/_(.*?)_/g, '$1')           // Remove _italic_
    .replace(/`{3}[\s\S]*?`{3}/g, '')   // Remove code blocks
    .replace(/`(.*?)`/g, '$1')           // Remove inline code
    .replace(/^\s*[-*+]\s+/gm, '• ')    // Convert bullets to •
    .replace(/^\s*\d+\.\s+/gm, '')      // Remove numbered list markers
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove links keep text
    .replace(/^[-_*]{3,}$/gm, '')       // Remove horizontal rules
    .replace(/>\s+/g, '')               // Remove blockquotes
    .replace(/\n{3,}/g, '\n\n')         // Max 2 consecutive newlines
    // Remove "LEGAL DOCUMENT" if AI still generates it as first line
    .replace(/^LEGAL DOCUMENT\s*\n/i, '')
    .replace(/^LEGAL DOCUMENT\s*$/im, '')
    .trim();
};

export default function Generate() {
  const { userProfile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [firmCredits, setFirmCredits] = useState(null);

  useEffect(() => {
    if (userProfile?.is_firm_member) {
      api.firmGetStats()
        .then(res => setFirmCredits(res.data.stats?.totalCredits || 0))
        .catch(() => {});
    }
  }, [userProfile]);

  const [step, setStep] = useState(1);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedDocType, setSelectedDocType] = useState(null);
  const [formData, setFormData] = useState({});
  const [editedDoc, setEditedDoc] = useState('');
  const [loading, setLoading] = useState(false);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [selectedLanguage, setSelectedLanguage] = useState('English');
  const [documentLength, setDocumentLength] = useState('medium');
  const [customPages, setCustomPages] = useState(4);
  const [currentPage, setCurrentPage] = useState(1);
  const [pages, setPages] = useState([]);
  const [selectedSections, setSelectedSections] = useState([]);
  const [clients, setClients] = useState([]);
  const [linkedClientId, setLinkedClientId] = useState('');
  const [linkingDoc, setLinkingDoc] = useState(false);
  const [linkedDocId, setLinkedDocId] = useState(null);
  const [linkSuccess, setLinkSuccess] = useState(false);
  // Freeform mode state
  const [mode, setMode] = useState('');
  const [freeformPrompt, setFreeformPrompt] = useState('');
  const [freeformFiles, setFreeformFiles] = useState([]);
  const [freeformLoading, setFreeformLoading] = useState(false);
  const [freeformLanguage, setFreeformLanguage] = useState('English');
  const [freeformLength, setFreeformLength] = useState('medium');
  const [freeformCustomPages, setFreeformCustomPages] = useState(4);
  const freeformFileRef = React.useRef(null);
  const [sharedWithFirm, setSharedWithFirm] = useState(false);
  const [sharingDoc, setSharingDoc] = useState(false);

  const handleAddSection = (section) => {
    setSelectedSections(prev => {
      if (prev.find(s => s.section_number === section.section_number)) return prev;
      return [...prev, section];
    });
  };

  const handleRemoveSection = (sectionNumber) => {
    setSelectedSections(prev =>
      prev.filter(s => s.section_number !== sectionNumber)
    );
  };

  const handleAddAllSections = (sections) => {
    setSelectedSections(prev => {
      const existingIds = prev.map(s => s.id);
      const newOnes = sections.filter(s => !existingIds.includes(s.id));
      return [...prev, ...newOnes];
    });
  };

  React.useEffect(() => {
    console.log('Generate.js selectedSections count:', selectedSections.length);
  }, [selectedSections]);

  const loadCategories = useCallback(async () => {
    try {
      const res = await api.getCategories();
      setCategories(res.data.categories || []);
    } catch (err) {
      console.error('Categories error:', err);
      toast.error('Failed to load categories. Is the backend running?');
    }
    setCategoriesLoading(false);
  }, []);

  useEffect(() => {
    loadCategories();
    loadClients();
  }, [loadCategories]);

  const loadClients = async () => {
    try {
      const res = await api.getClients();
      setClients(res.data.clients || []);
    } catch (err) {
      console.error('Failed to load clients');
    }
  };

  const handleCategorySelect = (cat) => {
    setSelectedCategory(cat);
    setStep(2);
  };

  const handleDocTypeSelect = (dt) => {
    setSelectedDocType(dt);
    setFormData({});
    setStep(3);
  };

  const handleFormChange = (fieldId, value) => {
    setFormData(prev => ({ ...prev, [fieldId]: value }));
  };

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!userProfile) {
      toast.error('Please login again.');
      return;
    }
    if (userProfile.is_firm_member) {
      if (firmCredits !== null && firmCredits <= 0) {
        toast.error('No firm credits remaining. Contact your firm admin.');
        return;
      }
    } else if (userProfile.credits <= 0) {
      toast.error('No credits remaining. Contact admin.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.generateDocument({
        categoryName: selectedCategory.name,
        documentTypeName: selectedDocType.name,
        documentTypeId: selectedDocType.id,
        formData,
        language: selectedLanguage,
        documentLength: documentLength,
        customPages: customPages,
        selectedSections: selectedSections.map(s =>
          `${s.section_number} (${s.act_short}): ${s.description}`
        )
      });
      const content = res.data.content;
      setEditedDoc(content);

      const splitIntoPages = (text) => {
        const words = text.split(' ');
        const wordsPerPage = 400;
        const pageArray = [];
        for (let i = 0; i < words.length; i += wordsPerPage) {
          pageArray.push(words.slice(i, i + wordsPerPage).join(' '));
        }
        return pageArray;
      };

      setPages(splitIntoPages(content));
      setCurrentPage(1);
      setLinkedDocId(res.data.documentId);
      setLinkedClientId('');
      setLinkSuccess(false);
      setSharedWithFirm(false);
      await refreshProfile();
      toast.success('Document generated successfully! 🎉');
      setStep(4);
    } catch (err) {
      console.error('Generate error:', err);
      if (err.response?.status === 402) {
        toast.error('No credits remaining!');
      } else if (err.response?.data?.error) {
        toast.error(err.response.data.error);
      } else {
        toast.error('Generation failed. Make sure backend is running.');
      }
    }
    setLoading(false);
  };

  const handleFreeformGenerate = async () => {
    if (!freeformPrompt.trim()) {
      toast.error('Please describe what document you want to generate');
      return;
    }
    if (!userProfile) {
      toast.error('Please login again.');
      return;
    }
    if (userProfile.is_firm_member) {
      if (firmCredits !== null && firmCredits <= 0) {
        toast.error('No firm credits remaining. Contact your firm admin.');
        return;
      }
    } else if (userProfile.credits <= 0) {
      toast.error('No credits remaining. Contact admin.');
      return;
    }
    setFreeformLoading(true);
    try {
      const res = await api.freeformGenerate(
        freeformPrompt,
        freeformLanguage,
        freeformLength,
        freeformCustomPages,
        freeformFiles
      );
      const content = res.data.content;
      setEditedDoc(content);
      const words = content.split(' ');
      const pageArray = [];
      for (let i = 0; i < words.length; i += 400) {
        pageArray.push(words.slice(i, i + 400).join(' '));
      }
      setPages(pageArray);
      setCurrentPage(1);
      setLinkedDocId(res.data.documentId);
      setLinkedClientId('');
      setLinkSuccess(false);
      setSharedWithFirm(false);
      await refreshProfile();
      toast.success('Document generated successfully! 🎉');
      setStep(4);
    } catch (err) {
      console.error('Freeform error:', err);
      if (err.response?.status === 402) {
        toast.error('No credits remaining!');
      } else {
        toast.error(err.response?.data?.error || 'Generation failed.');
      }
    }
    setFreeformLoading(false);
  };

  const handleBack = () => {
    if (step === 4 && mode === 'freeform') { setStep(1); setMode(''); }
    else if (step === 1 && mode !== '') { setMode(''); }
    else if (step === 1) {
      const isFirm = userProfile?.firm_role || userProfile?.is_firm_member;
      navigate(isFirm ? '/firm/dashboard' : '/dashboard');
    }
    else if (step === 2) { setStep(1); setSelectedCategory(null); }
    else if (step === 3) { setStep(2); setSelectedDocType(null); }
    else if (step === 4) { setStep(3); }
  };

  // ─────────────────────────────────────────────
  // PDF DOWNLOAD — Professional Indian Legal Format
  // ─────────────────────────────────────────────
  const downloadPDF = () => {
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const marginLeft = 28;
      const marginRight = 25;
      const marginTop = 28;
      const marginBottom = 22;
      const maxWidth = pageWidth - marginLeft - marginRight;
      let y = marginTop;
      let pageNum = 1;

      // Clean text and remove "LEGAL DOCUMENT" if AI still generates it
      let cleanedText = cleanMarkdown(editedDoc);

      // Also fix single underscore signature lines → proper long lines
      cleanedText = cleanedText.replace(/^Signature:\s*_\s*$/gm, 'Signature: ______________________________');
      cleanedText = cleanedText.replace(/^Name:\s*_\s*$/gm, 'Name:      ______________________________');
      cleanedText = cleanedText.replace(/^Address:\s*_\s*$/gm, 'Address:   ______________________________');
      cleanedText = cleanedText.replace(/^Date:\s*_\s*$/gm, 'Date:      ______________________________');
      cleanedText = cleanedText.replace(/^Place:\s*_\s*$/gm, 'Place:     ______________________________');
      cleanedText = cleanedText.replace(/^Seal:\s*_\s*$/gm, 'Seal:      ______________________________');
      cleanedText = cleanedText.replace(/^_+\s*$/gm, '______________________________');

      // ── Page number footer ──
      const addFooter = (num) => {
        doc.setFont('times', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(130, 130, 130);
        doc.text(
          String(num),
          pageWidth / 2,
          pageHeight - 8,
          { align: 'center' }
        );
        doc.setTextColor(0, 0, 0);
      };

      // ── New page ──
      const addNewPage = () => {
        addFooter(pageNum);
        doc.addPage();
        pageNum++;
        y = marginTop;
      };

      // ── Document Title — centered, bold, black ──
      const docName = selectedDocType?.name?.toUpperCase() || '';
      if (docName && docName !== 'LEGAL DOCUMENT') {
        doc.setFont('times', 'bold');
        doc.setFontSize(16);
        doc.setTextColor(0, 0, 0);
        doc.text(docName, pageWidth / 2, y, { align: 'center' });
        y += 7;

        // Underline under title
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.5);
        const titleWidth = doc.getTextWidth(docName);
        doc.line(
          pageWidth / 2 - titleWidth / 2,
          y,
          pageWidth / 2 + titleWidth / 2,
          y
        );
        y += 12;
      }

      // ── Process content line by line ──
      const paragraphs = cleanedText.split('\n');

      paragraphs.forEach((para) => {
        const trimmed = para.trim();

        // Skip blank lines — add spacing
        if (trimmed === '') {
          y += 4;
          return;
        }

        // Skip separator lines like %%%%% ----- ======
        if (/^[%\-=_]{3,}$/.test(trimmed)) {
          return;
        }

        // Skip if it's just "LEGAL DOCUMENT" (fallback check)
        if (/^LEGAL DOCUMENT$/i.test(trimmed)) {
          return;
        }

        // ── Detect major section headings ──
        // ALL CAPS, length > 3, does NOT start with a digit (to avoid clause numbers)
        const isMajorHeading =
          trimmed === trimmed.toUpperCase() &&
          trimmed.length > 3 &&
          !/^\d/.test(trimmed) &&
          !/^[(\[{]/.test(trimmed) &&
          !/Rs\./.test(trimmed) &&
          !/\d{4}/.test(trimmed);

        if (isMajorHeading) {
          // Extra space before heading
          y += 7;
          if (y > pageHeight - marginBottom - 12) addNewPage();

          doc.setFont('times', 'bold');
          doc.setFontSize(11.5);
          doc.setTextColor(0, 0, 0);
          const headingLines = doc.splitTextToSize(trimmed, maxWidth);
          headingLines.forEach(line => {
            if (y > pageHeight - marginBottom) addNewPage();
            doc.text(line, marginLeft, y);
            y += 7;
          });
          y += 2;

        } else if (trimmed.startsWith('•')) {
          // ── Bullet point ──
          if (y > pageHeight - marginBottom) addNewPage();

          doc.setFont('times', 'normal');
          doc.setFontSize(11);
          doc.setTextColor(0, 0, 0);
          const bulletLines = doc.splitTextToSize(trimmed, maxWidth - 5);
          bulletLines.forEach((line, idx) => {
            if (y > pageHeight - marginBottom) addNewPage();
            doc.text(line, marginLeft + (idx === 0 ? 0 : 5), y);
            y += 7;
          });
          y += 1;

        } else {
          // ── Normal paragraph / clause ──
          doc.setFont('times', 'normal');
          doc.setFontSize(11);
          doc.setTextColor(0, 0, 0);
          const paraLines = doc.splitTextToSize(trimmed, maxWidth);
          paraLines.forEach(line => {
            if (y > pageHeight - marginBottom) addNewPage();
            doc.text(line, marginLeft, y);
            y += 7;
          });
          y += 4; // paragraph spacing after each clause
        }
      });

      // ── Footer on last page ──
      addFooter(pageNum);

      // ── Save ──
      const fileName = `${selectedDocType?.name || 'Legal_Document'}_${new Date()
        .toLocaleDateString('en-IN')
        .replace(/\//g, '-')}.pdf`;
      doc.save(fileName);
      toast.success('PDF downloaded!');
    } catch (err) {
      console.error('PDF error:', err);
      toast.error('PDF download failed');
    }
  };

  // ─────────────────────────────────────────────
  // WORD DOWNLOAD — Professional Indian Legal Format
  // ─────────────────────────────────────────────
  const downloadDOCX = async () => {
    try {
      let cleanedText = cleanMarkdown(editedDoc);

      // Fix single underscore signature lines
      cleanedText = cleanedText.replace(/^Signature:\s*_\s*$/gm, 'Signature: ______________________________');
      cleanedText = cleanedText.replace(/^Name:\s*_\s*$/gm, 'Name:      ______________________________');
      cleanedText = cleanedText.replace(/^Address:\s*_\s*$/gm, 'Address:   ______________________________');
      cleanedText = cleanedText.replace(/^Date:\s*_\s*$/gm, 'Date:      ______________________________');
      cleanedText = cleanedText.replace(/^Place:\s*_\s*$/gm, 'Place:     ______________________________');
      cleanedText = cleanedText.replace(/^Seal:\s*_\s*$/gm, 'Seal:      ______________________________');
      cleanedText = cleanedText.replace(/^_+\s*$/gm, '______________________________');

      const paragraphs = cleanedText.split('\n');
      const children = [];

      // ── Document Title ──
      const docName = selectedDocType?.name?.toUpperCase() || '';
      if (docName && docName !== 'LEGAL DOCUMENT') {
        children.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 0, after: 240 },
            children: [
              new TextRun({
                text: docName,
                bold: true,
                size: 32, // 16pt
                color: '000000',
                font: 'Times New Roman',
              }),
            ],
          })
        );

        // Thin divider under title
        children.push(
          new Paragraph({
            border: {
              bottom: { color: '000000', style: BorderStyle.SINGLE, size: 6 },
            },
            spacing: { before: 0, after: 360 },
            children: [],
          })
        );
      }

      // ── Document content ──
      paragraphs.forEach((para) => {
        const trimmed = para.trim();

        // Empty line → spacing
        if (trimmed === '') {
          children.push(new Paragraph({
            spacing: { before: 0, after: 120 },
            children: []
          }));
          return;
        }

        // Skip separator lines
        if (/^[%\-=_]{3,}$/.test(trimmed)) {
          return;
        }

        // Skip "LEGAL DOCUMENT" line
        if (/^LEGAL DOCUMENT$/i.test(trimmed)) {
          return;
        }

        // ── Major section heading ──
        const isMajorHeading =
          trimmed === trimmed.toUpperCase() &&
          trimmed.length > 3 &&
          !/^\d/.test(trimmed) &&
          !/^[(\[{]/.test(trimmed) &&
          !/Rs\./.test(trimmed) &&
          !/\d{4}/.test(trimmed);

        if (isMajorHeading) {
          children.push(
            new Paragraph({
              spacing: { before: 400, after: 200 },
              children: [
                new TextRun({
                  text: trimmed,
                  bold: true,
                  size: 24, // 12pt
                  color: '000000',
                  font: 'Times New Roman',
                }),
              ],
            })
          );

        } else if (trimmed.startsWith('•')) {
          // ── Bullet point ──
          children.push(
            new Paragraph({
              bullet: { level: 0 },
              spacing: { before: 80, after: 80 },
              children: [
                new TextRun({
                  text: trimmed.replace(/^•\s*/, ''),
                  size: 22, // 11pt
                  color: '000000',
                  font: 'Times New Roman',
                }),
              ],
            })
          );

        } else {
          // ── Normal clause / paragraph ──
          children.push(
            new Paragraph({
              spacing: { before: 80, after: 200 },
              children: [
                new TextRun({
                  text: trimmed,
                  size: 22, // 11pt
                  color: '000000',
                  font: 'Times New Roman',
                }),
              ],
            })
          );
        }
      });

      // ── Build and save ──
      const doc = new Document({
        styles: {
          default: {
            document: {
              run: {
                font: 'Times New Roman',
                size: 22,
                color: '000000',
              },
              paragraph: {
                spacing: { line: 360, lineRule: 'auto' }, // 1.5 line spacing
              },
            },
          },
        },
        sections: [
          {
            properties: {
              page: {
                margin: {
                  top: 1440,   // 1 inch
                  bottom: 1440,
                  left: 1440,
                  right: 1260,
                },
              },
            },
            children,
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      const fileName = `${selectedDocType?.name || 'Legal_Document'}_${new Date()
        .toLocaleDateString('en-IN')
        .replace(/\//g, '-')}.docx`;
      saveAs(blob, fileName);
      toast.success('Word document downloaded!');
    } catch (err) {
      console.error('DOCX error:', err);
      toast.error('Word download failed');
    }
  };

  if (categoriesLoading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Loading categories...</p>
    </div>
  );

  return (
    <div className="app-container">
      <nav className="navbar">
        <button className="btn-ghost" onClick={handleBack}>← Back</button>
        <div className="nav-logo">⚖️ Lexora</div>
        <span className="credits-badge">
          🪙 {userProfile?.is_firm_member ? (firmCredits ?? '...') : (userProfile?.credits ?? 0)} Credits
        </span>
      </nav>

      <main className="main-content">
        {/* Progress Steps — hide on mode selector */}
        {mode !== '' && (
        <div className="progress-steps">
          {['Category', 'Document Type', 'Fill Form', 'Result'].map((label, i) => (
            <div key={i} className={`progress-step
              ${step > i + 1 ? 'done' : ''}
              ${step === i + 1 ? 'active' : ''}`}>
              <div className="step-circle">
                {step > i + 1 ? '✓' : i + 1}
              </div>
              <span>{label}</span>
            </div>
          ))}
        </div>
        )}

        {/* ── MODE SELECTOR ── */}
        {step === 1 && mode === '' && (
          <div className="mode-selector-wrap">
            <h2 className="mode-selector-title">Choose Your Drafting Mode</h2>
            <p className="mode-selector-sub">
              Select how you want to generate your legal document today.
            </p>
            <div className="mode-selector-grid">

              <div className="mode-card" onClick={() => setMode('guided')}>
                <div className="mode-card-icon">📋</div>
                <div className="mode-card-title">Guided Mode</div>
                <div className="mode-card-desc">
                  Choose from 12 legal categories and 80+ document types.
                  Fill a smart form and AI generates a complete professional document.
                  Best for standard Indian legal documents.
                </div>
                <div className="mode-card-tags">
                  <span className="mode-tag">12 Categories</span>
                  <span className="mode-tag">80+ Doc Types</span>
                  <span className="mode-tag">Smart Forms</span>
                </div>
                <div className="mode-card-btn">Select Guided Mode →</div>
              </div>

              <div className="mode-card mode-card-freeform" onClick={() => setMode('freeform')}>
                <div className="mode-card-icon">✨</div>
                <div className="mode-card-title">Freeform Mode</div>
                <div className="mode-card-desc">
                  Describe exactly what you need in plain language.
                  Upload reference documents for context. AI drafts
                  any legal document — fully customizable, no restrictions.
                </div>
                <div className="mode-card-tags">
                  <span className="mode-tag">Any Document</span>
                  <span className="mode-tag">Upload References</span>
                  <span className="mode-tag">Full Control</span>
                </div>
                <div className="mode-card-btn mode-card-btn-freeform">Select Freeform Mode →</div>
              </div>

            </div>
          </div>
        )}

        {/* ── FREEFORM MODE UI ── */}
        {step === 1 && mode === 'freeform' && (
          <div className="freeform-wrap">

            <div className="freeform-header">
              <h2 className="freeform-title">✨ Freeform Document Generation</h2>
              <p className="freeform-sub">
                Describe your document in plain language. Upload reference files if needed.
                AI will draft a complete, professional legal document.
              </p>
            </div>

            {/* Prompt */}
            <div className="freeform-card">
              <div className="freeform-section-label">What document do you need?</div>
              <textarea
                className="freeform-prompt-input"
                placeholder={`Describe exactly what you need. For example:\n\n"Draft a rent agreement between Rajesh Sharma (landlord) and Amit Gupta (tenant) for a 2BHK flat in Pune at ₹18,000/month for 11 months starting February 2025. Include maintenance clause and lock-in period of 6 months."\n\nOr:\n\n"Generate an NDA for a software company sharing trade secrets with a vendor. Include non-compete for 2 years."`}
                value={freeformPrompt}
                onChange={e => setFreeformPrompt(e.target.value)}
                rows={7}
              />
              <div className="freeform-prompt-hint">
                💡 Be specific — mention party names, amounts, dates, jurisdiction, and any special clauses you need.
              </div>
            </div>

            {/* File Upload */}
            <div className="freeform-card">
              <div className="freeform-section-label">
                Upload Reference Documents <span className="freeform-optional">(Optional)</span>
              </div>
              <p className="freeform-upload-desc">
                Upload existing drafts, templates, or related documents. AI will use them as reference to match style and structure.
                Supports PDF, DOCX, TXT — any number of pages.
              </p>
              <div
                className="freeform-dropzone"
                onClick={() => freeformFileRef.current?.click()}
              >
                <input
                  ref={freeformFileRef}
                  type="file"
                  multiple
                  accept=".pdf,.docx,.doc,.txt"
                  style={{ display: 'none' }}
                  onChange={e => {
                    const newFiles = Array.from(e.target.files);
                    setFreeformFiles(prev => {
                      const existing = prev.map(f => f.name);
                      const unique = newFiles.filter(f => !existing.includes(f.name));
                      return [...prev, ...unique];
                    });
                    e.target.value = '';
                  }}
                />
                <div className="freeform-dropzone-icon">📂</div>
                <div className="freeform-dropzone-text">
                  Click to upload reference documents
                </div>
                <div className="freeform-dropzone-hint">
                  PDF, DOCX, TXT — Multiple files supported — Any page count
                </div>
              </div>

              {freeformFiles.length > 0 && (
                <div className="freeform-files-list">
                  {freeformFiles.map((file, i) => (
                    <div key={i} className="freeform-file-item">
                      <span className="freeform-file-icon">📄</span>
                      <span className="freeform-file-name">{file.name}</span>
                      <span className="freeform-file-size">
                        {(file.size / 1024).toFixed(0)} KB
                      </span>
                      <button
                        className="freeform-file-remove"
                        onClick={() => setFreeformFiles(prev => prev.filter((_, idx) => idx !== i))}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Language + Length */}
            <div className="freeform-card">
              <div className="freeform-settings-grid">
                <div>
                  <div className="freeform-section-label">🌐 Document Language</div>
                  <select
                    className="language-select"
                    value={freeformLanguage}
                    onChange={e => setFreeformLanguage(e.target.value)}
                  >
                    <option value="English">🇬🇧 English</option>
                    <option value="Hindi">🇮🇳 Hindi</option>
                    <option value="Marathi">🇮🇳 Marathi</option>
                    <option value="Bengali">🇮🇳 Bengali</option>
                    <option value="Tamil">🇮🇳 Tamil</option>
                    <option value="Kannada">🇮🇳 Kannada</option>
                    <option value="Telugu">🇮🇳 Telugu</option>
                  </select>
                </div>
                <div>
                  <div className="freeform-section-label">📄 Document Length</div>
                  <div className="length-options">
                    {[
                      { value: 'short', label: 'Short', desc: '1-2 pages', icon: '📃' },
                      { value: 'medium', label: 'Medium', desc: '3-4 pages', icon: '📄' },
                      { value: 'detailed', label: 'Detailed', desc: '5-6 pages', icon: '📋' },
                      { value: 'comprehensive', label: 'Comprehensive', desc: '8-10 pages', icon: '📚' },
                      { value: 'custom', label: 'Custom', desc: 'Your choice', icon: '✏️' },
                    ].map(opt => (
                      <div
                        key={opt.value}
                        className={`length-option ${freeformLength === opt.value ? 'selected' : ''}`}
                        onClick={() => setFreeformLength(opt.value)}
                      >
                        <span className="length-icon">{opt.icon}</span>
                        <span className="length-label">{opt.label}</span>
                        <span className="length-desc">{opt.desc}</span>
                      </div>
                    ))}
                  </div>
                  {freeformLength === 'custom' && (
                    <div className="custom-pages-input" style={{ marginTop: '1rem' }}>
                      <label>Number of pages:</label>
                      <div className="custom-pages-controls">
                        <button
                          type="button"
                          className="page-count-btn"
                          onClick={() => setFreeformCustomPages(p => Math.max(1, p - 1))}
                        >−</button>
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={freeformCustomPages}
                          onChange={e => setFreeformCustomPages(
                            Math.min(100, Math.max(1, parseInt(e.target.value) || 1))
                          )}
                          className="custom-pages-number"
                        />
                        <button
                          type="button"
                          className="page-count-btn"
                          onClick={() => setFreeformCustomPages(p => Math.min(100, p + 1))}
                        >+</button>
                        <span className="pages-label">pages (max 100)</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Credit notice + Generate button */}
            <div className="freeform-card freeform-generate-card">
              <div className="freeform-credit-row">
                <span className="freeform-credit-note">
                  ⚡ This will use <strong>1 credit</strong>. You have <strong>{userProfile?.is_firm_member ? (firmCredits ?? '...') : (userProfile?.credits ?? 0)} credits</strong>.
                </span>
              </div>
              <button
                className="btn-primary btn-large"
                onClick={handleFreeformGenerate}
                disabled={freeformLoading || !freeformPrompt.trim() || (userProfile?.is_firm_member ? (firmCredits !== null && firmCredits <= 0) : (userProfile?.credits ?? 0) <= 0)}
              >
                {freeformLoading ? (
                  <span>
                    {freeformLength === 'short' && '⏳ Generating (~15 sec)...'}
                    {freeformLength === 'medium' && '⏳ Generating (~30 sec)...'}
                    {freeformLength === 'detailed' && '⏳ Generating (~60 sec)...'}
                    {freeformLength === 'comprehensive' && '⏳ Generating (~2 min)...'}
                    {freeformLength === 'custom' && `⏳ Generating ${freeformCustomPages} pages...`}
                  </span>
                ) : '✨ Generate Document (1 Credit)'}
              </button>
            </div>

          </div>
        )}

        {/* Step 1: Categories */}
        {step === 1 && mode === 'guided' && (
          <div>
            <h2>Select Legal Category</h2>
            {categories.length === 0 ? (
              <div className="empty-state">
                <p>No categories found. Check if backend is running.</p>
                <button className="btn-primary"
                  style={{width:'auto', padding:'10px 20px'}}
                  onClick={loadCategories}>
                  Retry
                </button>
              </div>
            ) : (
              <div className="category-grid">
                {categories.map(cat => (
                  <div key={cat.id} className="category-card"
                    onClick={() => handleCategorySelect(cat)}>
                    <div className="category-icon">{cat.icon}</div>
                    <div className="category-name">{cat.name}</div>
                    <div className="category-count">
                      {cat.document_types?.length || 0} document types
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Document Types */}
        {step === 2 && selectedCategory && (
          <div>
            <h2>{selectedCategory.icon} {selectedCategory.name}</h2>
            <p style={{marginBottom:'16px', color:'#718096'}}>
              Select the document you want to generate:
            </p>
            <div className="doctype-grid">
              {selectedCategory.document_types?.map(dt => (
                <div key={dt.id} className="doctype-card"
                  onClick={() => handleDocTypeSelect(dt)}>
                  <h3>{dt.name}</h3>
                  <p>{dt.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Form */}
        {step === 3 && selectedDocType && (
          <div>
            <h2>Fill Details: {selectedDocType.name}</h2>

            {/* Document Length Selector */}
            <div className="length-selector">
              <label>📄 Document Length:</label>
              <div className="length-options">
                {[
                  { value: 'short', label: 'Short', desc: '1-2 pages', icon: '📃' },
                  { value: 'medium', label: 'Medium', desc: '3-4 pages', icon: '📄' },
                  { value: 'detailed', label: 'Detailed', desc: '5-6 pages', icon: '📋' },
                  { value: 'comprehensive', label: 'Comprehensive', desc: '8-10 pages', icon: '📚' },
                  { value: 'custom', label: 'Custom', desc: 'Your choice', icon: '✏️' }
                ].map(opt => (
                  <div
                    key={opt.value}
                    className={`length-option ${documentLength === opt.value ? 'selected' : ''}`}
                    onClick={() => setDocumentLength(opt.value)}>
                    <span className="length-icon">{opt.icon}</span>
                    <span className="length-label">{opt.label}</span>
                    <span className="length-desc">{opt.desc}</span>
                  </div>
                ))}
              </div>

              {/* Custom Pages Input */}
              {documentLength === 'custom' && (
                <div className="custom-pages-input">
                  <label>Enter number of pages required:</label>
                  <div className="custom-pages-controls">
                    <button
                      type="button"
                      className="page-count-btn"
                      onClick={() => setCustomPages(p => Math.max(1, p - 1))}>
                      −
                    </button>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={customPages}
                      onChange={e => setCustomPages(
                        Math.min(100, Math.max(1, parseInt(e.target.value) || 1))
                      )}
                      className="custom-pages-number"
                    />
                    <button
                      type="button"
                      className="page-count-btn"
                      onClick={() => setCustomPages(p => Math.min(100, p + 1))}>
                      +
                    </button>
                    <span className="pages-label">pages</span>
                  </div>
                  <p className="custom-pages-note">
                    ⚡ More pages = more generation time. Max 100 pages.
                  </p>
                </div>
              )}
            </div>

            <div className="language-selector">
              <label>🌐 Document Language:</label>
              <select
                value={selectedLanguage}
                onChange={e => setSelectedLanguage(e.target.value)}
                className="language-select">
                <option value="English">🇬🇧 English</option>
                <option value="Hindi">🇮🇳 Hindi</option>
                <option value="Marathi">🇮🇳 Marathi</option>
                <option value="Bengali">🇮🇳 Bengali</option>
                <option value="Tamil">🇮🇳 Tamil</option>
                <option value="Kannada">🇮🇳 Kannada</option>
                <option value="Telugu">🇮🇳 Telugu</option>
              </select>
            </div>

            <LegalSectionsAssistant
              categoryName={selectedCategory?.name}
              documentTypeName={selectedDocType?.name}
              formData={formData}
              selectedSections={selectedSections}
              onAddSection={handleAddSection}
              onRemoveSection={handleRemoveSection}
              onAddAllSections={handleAddAllSections}
            />

            <p className="credit-notice">
              ⚡ This will use 1 credit. You have {userProfile?.is_firm_member ? (firmCredits ?? '...') : (userProfile?.credits ?? 0)} credits.
            </p>
            <form onSubmit={handleGenerate} className="document-form">
              {selectedDocType.fields?.map(field => (
                <div key={field.id} className="form-group">
                  <label>
                    {field.label}
                    {field.required && <span className="required"> *</span>}
                  </label>
                  {field.type === 'textarea' ? (
                    <textarea
                      value={formData[field.id] || ''}
                      onChange={e => handleFormChange(field.id, e.target.value)}
                      placeholder={`Enter ${field.label.toLowerCase()}`}
                      required={field.required}
                      rows={3}
                    />
                  ) : (
                    <input
                      type={field.type}
                      value={formData[field.id] || ''}
                      onChange={e => handleFormChange(field.id, e.target.value)}
                      placeholder={`Enter ${field.label.toLowerCase()}`}
                      required={field.required}
                    />
                  )}
                </div>
              ))}
              <button
                type="submit"
                className="btn-primary btn-large"
                disabled={loading || (userProfile?.is_firm_member ? (firmCredits !== null && firmCredits <= 0) : (userProfile?.credits ?? 0) <= 0)}>
                {loading ? (
                  <span>
                    {documentLength === 'short' && '⏳ Generating (~10 sec)...'}
                    {documentLength === 'medium' && '⏳ Generating (~20 sec)...'}
                    {documentLength === 'detailed' && '⏳ Generating (~40 sec)...'}
                    {documentLength === 'comprehensive' && '⏳ Generating (~90 sec)...'}
                    {documentLength === 'custom' && `⏳ Generating ${customPages} pages (~${Math.ceil(customPages * 5)} sec)...`}
                  </span>
                ) : '✨ Generate Document (1 Credit)'}
              </button>
            </form>
          </div>
        )}

        {/* Step 4: Result */}
        {step === 4 && (
          <div>
            <div className="result-header">
              <h2>✅ {selectedDocType?.name} Generated!</h2>
              <div style={{display:'flex', gap:'10px', flexWrap:'wrap'}}>
                <button
                  className="btn-primary"
                  style={{width:'auto', padding:'10px 20px'}}
                  onClick={downloadPDF}>
                  ⬇️ Download PDF
                </button>
                <button
                  className="btn-outline"
                  style={{width:'auto', padding:'10px 20px'}}
                  onClick={downloadDOCX}>
                  📝 Download Word
                </button>
              </div>
            </div>

            {pages.length > 0 && (
              <div className="page-view-container">
                <div className="page-navigation">
                  <button
                    className="page-nav-btn"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}>
                    ← Prev
                  </button>
                  <div className="page-indicator-wrap">
                    <span className="page-indicator">
                      Page {currentPage} of {pages.length}
                    </span>
                    <div className="page-dots">
                      {pages.map((_, i) => (
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
                    disabled={currentPage === pages.length}>
                    Next →
                  </button>
                </div>

                <div className="document-page">
                  <div className="page-header-bar">
                    <span>{selectedDocType?.name}</span>
                    <span>Page {currentPage} of {pages.length}</span>
                  </div>
                  <div className="page-content">
                    {cleanMarkdown(pages[currentPage - 1] || '').split('\n').map((line, i) => (
                      <p key={i} className={line.trim() === '' ? 'page-empty-line' : 'page-line'}>
                        {line || '\u00A0'}
                      </p>
                    ))}
                  </div>
                  <div className="page-footer-bar">
                    <span>{selectedDocType?.name}</span>
                    <span>{currentPage}</span>
                  </div>
                </div>

                <div className="page-navigation" style={{marginTop:'12px'}}>
                  <button
                    className="page-nav-btn"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}>
                    ← Prev
                  </button>
                  <span className="page-indicator">
                    Page {currentPage} of {pages.length}
                  </span>
                  <button
                    className="page-nav-btn"
                    onClick={() => setCurrentPage(p => Math.min(pages.length, p + 1))}
                    disabled={currentPage === pages.length}>
                    Next →
                  </button>
                </div>
              </div>
            )}

            <div className="edit-section">
              <h3>✏️ Edit Document</h3>
              <p className="edit-note">
                Make changes below — page view updates automatically:
              </p>
              <textarea
                className="document-editor"
                value={cleanMarkdown(editedDoc)}
                onChange={e => {
                  setEditedDoc(e.target.value);
                  const words = e.target.value.split(' ');
                  const pageArray = [];
                  for (let i = 0; i < words.length; i += 400) {
                    pageArray.push(words.slice(i, i + 400).join(' '));
                  }
                  setPages(pageArray);
                }}
                rows={15}
              />
            </div>

            {/* Share with Firm */}
            {userProfile?.is_firm_member && linkedDocId && (
              <div className="link-client-section">
                <h3 className="link-client-title">🏛️ Share with Firm</h3>
                {sharedWithFirm ? (
                  <div className="link-client-success">
                    ✅ Document shared with firm successfully
                  </div>
                ) : (
                  <div className="link-client-row">
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
                      Share this document with your firm's shared document library.
                      All firm members will be able to view it.
                    </p>
                    <button
                      className="btn-outline"
                      style={{ width: 'auto', padding: '10px 20px', flexShrink: 0 }}
                      disabled={sharingDoc}
                      onClick={async () => {
                        setSharingDoc(true);
                        try {
                          await api.shareDocumentWithFirm(linkedDocId);
                          setSharedWithFirm(true);
                          toast.success('Document shared with firm!');
                        } catch (err) {
                          toast.error('Failed to share document');
                        }
                        setSharingDoc(false);
                      }}
                    >
                      {sharingDoc ? 'Sharing...' : '🏛️ Share with Firm'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Link to Client */}
            <div className="link-client-section">
              <h3 className="link-client-title">👥 Link to Client</h3>
              {linkSuccess ? (
                <div className="link-client-success">
                  ✅ Document linked to client successfully
                </div>
              ) : (
                <div className="link-client-row">
                  <select
                    className="link-client-select"
                    value={linkedClientId}
                    onChange={e => setLinkedClientId(e.target.value)}
                    disabled={linkingDoc}
                  >
                    <option value="">— Select a client (optional) —</option>
                    {clients.map(client => (
                      <option key={client.id} value={client.id}>
                        {client.name} {client.phone ? `(${client.phone})` : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn-outline"
                    style={{ width: 'auto', padding: '10px 20px' }}
                    disabled={!linkedClientId || linkingDoc}
                    onClick={async () => {
                      if (!linkedClientId || !linkedDocId) return;
                      setLinkingDoc(true);
                      try {
                        await api.linkDocumentToClient(linkedDocId, linkedClientId);
                        setLinkSuccess(true);
                        toast.success('Document linked to client!');
                      } catch (err) {
                        toast.error('Failed to link document');
                      }
                      setLinkingDoc(false);
                    }}
                  >
                    {linkingDoc ? 'Linking...' : '🔗 Link'}
                  </button>
                </div>
              )}
              {clients.length === 0 && (
                <p className="link-client-note">
                  No clients yet.{' '}
                  <span
                    className="link-client-add"
                    onClick={() => navigate('/clients')}
                  >
                    Add a client →
                  </span>
                </p>
              )}
            </div>

            <div className="result-actions">
              <button
                className="btn-primary"
                style={{width:'auto', padding:'12px 24px'}}
                onClick={downloadPDF}>
                ⬇️ Download PDF
              </button>
              <button
                className="btn-outline"
                style={{width:'auto', padding:'12px 24px'}}
                onClick={downloadDOCX}>
                📝 Download Word
              </button>
              <button
                className="btn-outline"
                onClick={() => {
                  const isFirm = userProfile?.firm_role || userProfile?.is_firm_member;
                  navigate(isFirm ? '/firm/dashboard' : '/dashboard');
                }}>
                Back to Dashboard
              </button>
              <button
                className="btn-outline"
                onClick={() => {
                  setStep(1);
                  setSelectedCategory(null);
                  setSelectedDocType(null);
                  setEditedDoc('');
                  setPages([]);
                  setCurrentPage(1);
                  setLinkedClientId('');
                  setLinkedDocId(null);
                  setLinkSuccess(false);
                  setSharedWithFirm(false);
                }}>
                Generate Another
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}