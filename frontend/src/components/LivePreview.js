import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api';

// ── Field grouping for the drafting studio ────────────────
// Document types only list flat fields, so they are grouped by what their names describe.
const GROUPS = [
  { key: 'parties', title: 'Contracting Parties', test: /(name|father|husband|wife|party|parties|landlord|lessor|lessee|tenant|seller|vendor|buyer|purchaser|employer|employee|accused|complainant|petitioner|respondent|plaintiff|defendant|donor|donee|company|client|founder|investor|licensor|licensee|guardian|child)/ },
  { key: 'money', title: 'Financial Consideration', test: /(rent|amount|deposit|price|salary|fee|consideration|value|compensation|loan|sum|payment|maintenance|stipend|ctc|penalty|refund|tax|gst|turnover|share|equity|esop)/ },
  { key: 'dates', title: 'Dates & Term', test: /(date|duration|term|period|month|year|days|tenure|notice|deadline|start|end|commence|expiry)/ },
  { key: 'subject', title: 'Subject Matter', test: /(property|premises|address|location|description|area|product|service|goods|work|scope|trademark|copyright|invention|business|role|designation|position)/ },
];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];

export const groupFields = (fields = []) => {
  const buckets = Object.fromEntries([...GROUPS.map(g => [g.key, []]), ['other', []]]);
  for (const f of fields) {
    const id = `${f.id} ${f.label || ''}`.toLowerCase();
    // Addresses of people belong with the parties, not the subject matter
    const isPartyAddress = /address/.test(id) && GROUPS[0].test.test(id) && !/property|premises/.test(id);
    const group = isPartyAddress ? GROUPS[0] : GROUPS.find(g => g.test.test(id));
    buckets[group ? group.key : 'other'].push(f);
  }
  const order = ['parties', 'subject', 'money', 'dates', 'other'];
  return order
    .filter(k => buckets[k].length)
    .map((k, i) => ({ key: k, title: `${ROMAN[i]}. ${k === 'other' ? 'Further Particulars' : GROUPS.find(g => g.key === k).title}`, fields: buckets[k] }));
};

// ── Value formatting for the engrossment ──────────────────
const formatValue = (field, value) => {
  if (!value) return '';
  // Indian digit grouping: 200000 → 2,00,000
  if (field?.type === 'number' && !Number.isNaN(Number(value))) return Number(value).toLocaleString('en-IN');
  if (field?.type === 'date') {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  return value;
};

const humanise = key => key.toLowerCase().replace(/_/g, ' ');

// Replace [PLACEHOLDER] tokens with filled values or highlighted blanks
const renderClause = (content, fieldsById, formData) =>
  content.split(/(\[[A-Z0-9_]+\])/g).map((part, i) => {
    const m = part.match(/^\[([A-Z0-9_]+)\]$/);
    if (!m) return <React.Fragment key={i}>{part}</React.Fragment>;
    const key = m[1].toLowerCase();
    const field = fieldsById[key];
    let value = formData[key];
    if (!value && key === 'date') value = new Date().toISOString().slice(0, 10);
    const shown = formatValue(field || (key === 'date' ? { type: 'date' } : null), value);
    return shown
      ? <span key={i} className="am-fill">{shown}</span>
      : <span key={i} className="am-blank">{field?.label || humanise(m[1])}</span>;
  });

const PAGE_LABEL = { short: '1–2', medium: '3–4', detailed: '5–6', comprehensive: '8–10' };

export default function LivePreview({ categoryName, docType, formData, language, documentLength, customPages }) {
  const [template, setTemplate] = useState(undefined);
  const fieldsById = useMemo(() => Object.fromEntries((docType.fields || []).map(f => [f.id, f])), [docType]);

  useEffect(() => {
    let cancelled = false;
    setTemplate(undefined);
    api.getDocumentTemplate(docType.id, language === 'Hindi' ? 'Hindi' : 'English')
      .then(res => { if (!cancelled) setTemplate(res.data.template); })
      .catch(() => { if (!cancelled) setTemplate(null); });
    return () => { cancelled = true; };
  }, [docType.id, language]);

  const required = (docType.fields || []).filter(f => f.required);
  const filledRequired = required.filter(f => (formData[f.id] || '').toString().trim()).length;
  const pages = documentLength === 'custom' ? `${customPages}` : PAGE_LABEL[documentLength] || '3–4';

  return (
    <>
      <div className="am-preview-bar">
        <span className="am-live">Live Engrossment Preview</span>
        <span className="am-mono" style={{ fontSize: 13, color: 'var(--am-ink-3)' }}>
          {filledRequired}/{required.length} required · ≈{pages} pages on generation
        </span>
      </div>
      <div className="am-paper">
        <div className="am-paper-kicker">{categoryName} · Draft for review</div>
        <div className="am-paper-title">{docType.name}</div>

        {template === undefined && <p style={{ textAlign: 'center', color: 'var(--am-ink-3)' }}>Preparing the base template…</p>}

        {template && template.clauses.map((c, i) => (
          <p className="am-paper-clause" key={c.order ?? i}>
            <span className="am-paper-clause-title">{i + 1}. {c.title}:</span>{' '}
            {renderClause(c.content, fieldsById, formData)}
          </p>
        ))}

        {template === null && (docType.fields || []).map(f => (
          <p className="am-paper-clause" key={f.id}>
            <span className="am-paper-clause-title">{f.label}:</span>{' '}
            {formatValue(f, formData[f.id]) ? <span className="am-fill">{formatValue(f, formData[f.id])}</span> : <span className="am-blank">to be filled</span>}
          </p>
        ))}

        <div className="am-paper-note">
          {language !== 'English' && template && language !== 'Hindi'
            ? `Preview shown in English; the instrument will be drafted in ${language}. `
            : ''}
          This preview is assembled from the base template. Generating drafts the complete instrument with full clauses, schedules and the execution block.
        </div>
      </div>
    </>
  );
}
