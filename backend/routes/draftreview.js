// backend/routes/draftreview.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const llm = require('../lib/llm');
const supabase = require('../config/supabase');
const { verifyToken } = require('./auth');

// ── Multer setup ──────────────────────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB per file
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/plain',
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Use PDF, DOCX, or TXT.`));
    }
  }
});

// ── Text extraction ───────────────────────────────────────────────────────────
async function extractText(file) {
  const mime = file.mimetype;
  console.log(`📖 Extracting text from: ${file.originalname} (${mime}, ${file.size} bytes)`);

  if (mime === 'application/pdf') {
    try {
      const data = await pdfParse(file.buffer);
      return data.text || '';
    } catch (err) {
      throw new Error(`PDF parsing failed for "${file.originalname}": ${err.message}`);
    }
  }

  if (
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mime === 'application/msword'
  ) {
    try {
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      return result.value || '';
    } catch (err) {
      throw new Error(`DOCX parsing failed for "${file.originalname}": ${err.message}`);
    }
  }

  if (mime === 'text/plain') {
    return file.buffer.toString('utf-8');
  }

  return '';
}

// ── AI call ───────────────────────────────────────────────────────────────────
function callAI(prompt, maxTokens = 4000) {
  return llm.chat({
    system: `You are a senior Indian legal analyst and expert document reviewer with 25+ years of experience.
You specialise in comparative legal document analysis for Indian lawyers and law firms.
You provide highly detailed, professional, reasoning-backed comparative reviews.
Your analysis is structured, precise, and directly useful for practicing advocates.`,
    messages: [{ role: 'user', content: prompt }],
    maxTokens,
    temperature: 0.2
  });
}

// ── POST /api/draft-review/analyse ────────────────────────────────────────────
// Accepts 2-5 draft files, extracts text, runs comparative AI analysis
router.post('/analyse', verifyToken, upload.array('drafts', 5), async (req, res) => {
  try {
    const files = req.files;

    // ── Validate files ──
    if (!files || files.length === 0) {
      console.log('❌ Draft Review: No files received in request');
      return res.status(400).json({ error: 'No files uploaded. Please attach at least 2 draft files.' });
    }
    if (files.length < 2) {
      return res.status(400).json({ error: 'Please upload at least 2 drafts to compare.' });
    }
    if (files.length > 5) {
      return res.status(400).json({ error: 'Maximum 5 drafts can be compared at once.' });
    }

    console.log(`\n📋 Draft Review: ${files.length} files received from ${req.user?.email || req.user?.id}`);
    files.forEach((f, i) => console.log(`  [${i + 1}] ${f.originalname} (${(f.size / 1024).toFixed(1)} KB, ${f.mimetype})`));

    // ── Extract text from all files ──
    const drafts = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      let text = '';

      try {
        text = await extractText(file);
      } catch (extractErr) {
        console.error(`❌ Extraction failed for file ${i + 1}:`, extractErr.message);
        return res.status(400).json({
          error: `Could not read "${file.originalname}": ${extractErr.message}. Try saving as PDF or plain text.`
        });
      }

      const trimmedText = text.trim();
      if (!trimmedText) {
        return res.status(400).json({
          error: `"${file.originalname}" appears to be empty or contains no readable text. Please check the file.`
        });
      }

      const charCount = trimmedText.length;
      // Cap each draft at 4000 chars to stay well within Groq token limits
      const capped = trimmedText.slice(0, 4000);
      console.log(`  ✅ Draft ${i + 1}: ${charCount} chars extracted, using first ${capped.length}`);

      drafts.push({
        name: file.originalname,
        text: capped,
        fullLength: charCount
      });
    }

    // ── Build analysis prompt ──
    const draftSections = drafts.map((d, i) =>
      `DRAFT ${i + 1}: "${d.name}"\n${'-'.repeat(60)}\n${d.text}\n${'-'.repeat(60)}`
    ).join('\n\n');

    const analysisPrompt = `A lawyer has uploaded ${drafts.length} drafts for comparative legal review. Analyse them carefully.

${draftSections}

---

Provide a COMPREHENSIVE comparative legal analysis structured EXACTLY as follows:

## 1. DOCUMENT OVERVIEW
For each draft: document type, parties, governing law, jurisdiction, overall structure.

## 2. CLAUSE-BY-CLAUSE COMPARISON
Compare key clauses across all drafts:
- Which draft has stronger/more protective language?
- Identify missing clauses in each draft
- Compare scope, obligations, rights, liabilities, indemnities, termination, dispute resolution
- Note any vague, ambiguous, or risky wording

## 3. LEGAL PROTECTIONS ANALYSIS
For each draft:
- Strong protective clauses
- Weak or missing protections
- Enforceability of key provisions
- Litigation risk exposure

## 4. DRAFTING QUALITY ASSESSMENT
For each draft — rate and explain:
- Clarity of language
- Precision of definitions
- Consistency throughout
- Compliance with Indian legal standards
- Structural organisation

## 5. RISKS AND RED FLAGS
For each draft:
- Risky or one-sided clauses
- Vague language that could cause disputes
- Missing standard Indian legal protections
- Unenforceable or problematic provisions

## 6. STRENGTHS AND WEAKNESSES SUMMARY
For each draft:
- Top 3 strengths
- Top 3 weaknesses
- Overall score out of 10

## 7. FINAL RECOMMENDATION
- State clearly which draft is the STRONGEST overall
- Explain WHY using specific legal reasoning referencing actual clause language
- List specific improvements needed for each draft
- Suggest which clauses from weaker drafts should be incorporated into the strongest draft

Be specific, detailed, and professional. Reference actual language from the drafts above.
This analysis will be used by practicing Indian advocates for legal decision-making.`;

    console.log(`🤖 Sending to Groq: ~${Math.round(analysisPrompt.length / 4)} estimated tokens`);

    let analysis;
    try {
      analysis = await callAI(analysisPrompt, 4000);
    } catch (groqErr) {
      console.error('❌ Groq analysis failed:', groqErr.status, groqErr.message);

      if (groqErr.status === 429) {
        return res.status(503).json({
          error: 'AI service is temporarily busy. Please wait 30 seconds and try again.'
        });
      }
      if (groqErr.status === 413 || groqErr.code === 'context_length_exceeded') {
        return res.status(400).json({
          error: 'The uploaded documents are too large to analyse together. Try with shorter documents or fewer drafts.'
        });
      }
      return res.status(500).json({
        error: 'AI analysis failed. Please try again in a moment.'
      });
    }

    if (!analysis || !analysis.trim()) {
      console.error('❌ Groq returned empty response');
      return res.status(500).json({ error: 'AI returned an empty response. Please try again.' });
    }

    console.log(`✅ Draft Review complete: ${analysis.length} chars generated`);

    // ── Log usage (non-blocking) ──
    supabase
  .from('usage_logs')
  .insert({
    user_id: req.user.id,
    action_type: 'draft_review',
    action_label: `Draft Review: ${files.map(f => f.originalname).join(', ').slice(0, 200)}`,
    credits_used: 0,
    metadata: {
      file_count: files.length,
      file_names: files.map(f => f.originalname)
    }
  })
  .then(() => console.log('✅ Usage logged'))
  .catch(logErr => console.log('⚠️ Usage log failed (non-critical):', logErr.message));

    return res.json({
      success: true,
      analysis,
      draftsAnalysed: drafts.map(d => ({
        name: d.name,
        extractedLength: d.fullLength
      }))
    });

  } catch (err) {
    console.error('❌ Draft Review unhandled error:', err.message, err.stack);
    return res.status(500).json({
      error: 'An unexpected error occurred during analysis. Please try again.'
    });
  }
});

module.exports = router;