const express = require('express');
const router = express.Router();
const llm = require('../lib/llm');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const supabase = require('../config/supabase');

// ── Multer setup ───────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB — supports 100+ pages
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
      cb(new Error('Unsupported file type. Please upload PDF, DOCX, or TXT'));
    }
  },
});

// ── Auth middleware ────────────────────────────────────────
const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'No token' });
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Invalid token' });
    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Auth failed' });
  }
};

// ── Helper: extract text from file ────────────────────────
const extractText = async (file) => {
  const mime = file.mimetype;
  if (mime === 'application/pdf') {
    const data = await pdfParse(file.buffer);
    return data.text;
  } else if (
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mime === 'application/msword'
  ) {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return result.value;
  } else if (mime === 'text/plain') {
    return file.buffer.toString('utf-8');
  }
  throw new Error('Unsupported file type');
};

// ── Helper: split text into chunks ────────────────────────
const splitIntoChunks = (text, chunkSize = 1500) => {
  const paragraphs = text.split('\n');
  const chunks = [];
  let current = '';
  for (const para of paragraphs) {
    if ((current + para).length > chunkSize && current.length > 0) {
      chunks.push(current.trim());
      current = para + '\n';
    } else {
      current += para + '\n';
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
};

// ── Helper: translate a single chunk ──────────────────────
const translateChunk = async (chunk, sourceLanguage, previousContext = '') => {
  const contextNote = previousContext
    ? `PREVIOUS CONTEXT (for continuity):\n${previousContext}\n\n`
    : '';

  const prompt = `${contextNote}You are a professional legal document translator specializing in Indian law.
Translate the following ${sourceLanguage} legal text to English.

CRITICAL RULES:
1. Preserve ALL legal terminology accurately
2. Maintain the exact same document structure and formatting
3. Keep paragraph breaks and numbering intact
4. Maintain continuity with the previous context if provided
5. Do NOT add explanations or comments
6. Do NOT summarize — translate everything completely
7. Preserve party names, dates, amounts as-is

TEXT TO TRANSLATE:
${chunk}

ENGLISH TRANSLATION:`;

  const response = await llm.chat({
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 2000,
    temperature: 0.1,
  });

  return response.trim();
};

// ── POST /api/translate/document ──────────────────────────
router.post('/document', authenticate, upload.single('file'), async (req, res) => {
  try {
    const { sourceLanguage } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ error: 'No file uploaded' });
    if (!sourceLanguage) return res.status(400).json({ error: 'Source language required' });

    const validLanguages = ['Hindi', 'Marathi', 'Bengali', 'Tamil', 'Kannada', 'Telugu'];
    if (!validLanguages.includes(sourceLanguage)) {
      return res.status(400).json({ error: 'Invalid source language' });
    }

    // Check credits
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('credits, email')
      .eq('id', req.user.id)
      .single();

    if (profileError || !profile) {
      return res.status(400).json({ error: 'Profile not found' });
    }
    if (profile.credits <= 0) {
      return res.status(402).json({ error: 'No credits remaining' });
    }

    // Extract text
    let originalText;
    try {
      originalText = await extractText(file);
    } catch (err) {
      return res.status(400).json({ error: 'Could not read file: ' + err.message });
    }

    if (!originalText || originalText.trim().length < 10) {
      return res.status(400).json({ error: 'File appears to be empty or unreadable' });
    }

    // Split into chunks
    const chunks = splitIntoChunks(originalText, 2000);
    const translatedChunks = [];
    let previousContext = '';

    // Translate each chunk with context
    for (let i = 0; i < chunks.length; i++) {
      const translated = await translateChunk(chunks[i], sourceLanguage, previousContext);
      translatedChunks.push(translated);
      // Pass last 300 chars as context for next chunk
      previousContext = translated.slice(-300);
    }

    const translatedText = translatedChunks.join('\n\n');

    // Deduct credit
    await supabase
      .from('profiles')
      .update({ credits: profile.credits - 1 })
      .eq('id', req.user.id);

    // Save to translated_documents
    const { data: savedDoc, error: saveError } = await supabase
      .from('translated_documents')
      .insert({
        user_id: req.user.id,
        user_email: profile.email,
        original_file_name: file.originalname,
        source_language: sourceLanguage,
        original_text: originalText.slice(0, 50000),
        translated_text: translatedText.slice(0, 100000),
        status: 'completed',
      })
      .select()
      .single();

    if (saveError) {
      console.error('Save error:', saveError);
    }

    res.json({
      success: true,
      documentId: savedDoc?.id,
      translatedText,
      chunksProcessed: chunks.length,
      creditsRemaining: profile.credits - 1,
    });

  } catch (err) {
    console.error('Translation error:', err);
    res.status(500).json({ error: 'Translation failed: ' + err.message });
  }
});

// ── GET /api/translate/history ─────────────────────────────
router.get('/history', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('translated_documents')
      .select('id, original_file_name, source_language, created_at, status')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;
    res.json({ success: true, documents: data || [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// ── GET /api/translate/history/:id ────────────────────────
router.get('/history/:id', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('translated_documents')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Document not found' });
    res.json({ success: true, document: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch document' });
  }
});

module.exports = router;