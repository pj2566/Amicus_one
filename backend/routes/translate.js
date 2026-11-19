const express = require('express');
const router = express.Router();
const llm = require('../lib/llm');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const supabase = require('../config/supabase');

const INDIAN_LANGUAGES = ['Hindi', 'Marathi', 'Bengali', 'Tamil', 'Kannada', 'Telugu', 'Gujarati', 'Malayalam', 'Punjabi', 'Odia', 'Urdu'];
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

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
      ...IMAGE_TYPES,
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type. Please upload PDF, DOCX, TXT or an image'));
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
// Scanned PDFs (no text layer) and photos are transcribed by Gemini, which reads Indian scripts.
const extractText = async (file) => {
  const mime = file.mimetype;
  if (mime === 'application/pdf') {
    const data = await pdfParse(file.buffer);
    const textPerPage = (data.text || '').replace(/\s+/g, '').length / Math.max(data.numpages || 1, 1);
    if (textPerPage >= 100) return { text: data.text, scanned: false };
    return { text: await llm.transcribe(file.buffer, mime), scanned: true };
  } else if (IMAGE_TYPES.includes(mime)) {
    return { text: await llm.transcribe(file.buffer, mime), scanned: true };
  } else if (
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mime === 'application/msword'
  ) {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return { text: result.value, scanned: false };
  } else if (mime === 'text/plain') {
    return { text: file.buffer.toString('utf-8'), scanned: false };
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
const translateChunk = async (chunk, sourceLanguage, targetLanguage, previousContext = '') => {
  const intoIndian = targetLanguage !== 'English';
  const system = `You are a professional legal translator for Indian courts and law firms, translating ${sourceLanguage} to ${targetLanguage}.

RULES
1. Translate everything completely and faithfully. Do not summarise, explain, add or omit anything.
2. Keep the structure exactly: headings, paragraph breaks, numbering of clauses and sub-clauses.
3. Do not translate personal names, place names, company names or addresses; transliterate them into the target script only if the source is in a different script.
4. Keep numbers, dates, amounts, section and case references as they are (e.g. "Section 318(4) BNS", "Rs. 5,00,000").
5. ${intoIndian
    ? `Use the formal legal vocabulary of ${targetLanguage} used in Indian courts and government gazettes. Where a legal term has no settled ${targetLanguage} equivalent, write the ${targetLanguage} rendering followed by the English term in brackets the first time it appears.`
    : 'Use standard Indian legal English (e.g. "plaintiff", "respondent", "cognizable", "anticipatory bail").'}
6. Output only the translation.`;

  const user = `${previousContext ? `END OF THE PREVIOUS TRANSLATED PART (for continuity only, do not repeat it):\n${previousContext}\n\n` : ''}TEXT TO TRANSLATE:\n${chunk}`;

  const response = await llm.chat({
    system,
    messages: [{ role: 'user', content: user }],
    // Indian scripts use several tokens per word, so leave generous room
    maxTokens: 8000,
    temperature: 0.1,
  });

  return response.trim();
};

// ── Credits: firm members draw from the firm pool, everyone else from their own balance ──
const getCreditSource = async (userId) => {
  const { data: profile } = await supabase
    .from('profiles')
    .select('credits, email, is_firm_member, firm_id')
    .eq('id', userId)
    .single();
  if (!profile) return null;
  if (profile.is_firm_member && profile.firm_id) {
    const { data: firm } = await supabase.from('firm_profiles').select('id, total_credits').eq('id', profile.firm_id).single();
    return { profile, firm, available: firm?.total_credits || 0 };
  }
  return { profile, firm: null, available: profile.credits || 0 };
};

// ── POST /api/translate/document ──────────────────────────
router.post('/document', authenticate, upload.single('file'), async (req, res) => {
  try {
    const sourceLanguage = req.body.sourceLanguage;
    const targetLanguage = req.body.targetLanguage || 'English';
    const file = req.file;

    if (!file) return res.status(400).json({ error: 'No file uploaded' });
    if (!sourceLanguage) return res.status(400).json({ error: 'Source language required' });

    const valid = ['English', ...INDIAN_LANGUAGES];
    if (!valid.includes(sourceLanguage) || !valid.includes(targetLanguage)) {
      return res.status(400).json({ error: 'Invalid language' });
    }
    if (sourceLanguage === targetLanguage || (sourceLanguage !== 'English' && targetLanguage !== 'English')) {
      return res.status(400).json({ error: 'Translation must be from or into English' });
    }

    const credits = await getCreditSource(req.user.id);
    if (!credits) return res.status(400).json({ error: 'Profile not found' });
    if (credits.available <= 0) {
      return res.status(402).json({ error: credits.firm ? 'No firm credits remaining. Contact your firm admin.' : 'No credits remaining' });
    }

    // Extract text
    let originalText, scanned;
    try {
      ({ text: originalText, scanned } = await extractText(file));
    } catch (err) {
      return res.status(400).json({ error: 'Could not read file: ' + err.message });
    }

    if (!originalText || originalText.trim().length < 10) {
      return res.status(400).json({ error: 'File appears to be empty or unreadable' });
    }

    // Split into chunks
    const chunks = splitIntoChunks(originalText, 6000);
    const translatedChunks = [];
    let previousContext = '';

    // Translate each chunk with context
    for (let i = 0; i < chunks.length; i++) {
      const translated = await translateChunk(chunks[i], sourceLanguage, targetLanguage, previousContext);
      translatedChunks.push(translated);
      // Pass last 300 chars as context for next chunk
      previousContext = translated.slice(-300);
    }

    const translatedText = translatedChunks.join('\n\n');

    // Deduct credit
    if (credits.firm) {
      await supabase.from('firm_profiles').update({ total_credits: credits.available - 1 }).eq('id', credits.firm.id);
    } else {
      await supabase.from('profiles').update({ credits: credits.available - 1 }).eq('id', req.user.id);
    }

    // Save to translated_documents
    const { data: savedDoc, error: saveError } = await supabase
      .from('translated_documents')
      .insert({
        user_id: req.user.id,
        user_email: credits.profile.email,
        original_file_name: file.originalname,
        source_language: sourceLanguage,
        target_language: targetLanguage,
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
      sourceLanguage,
      targetLanguage,
      scanned,
      chunksProcessed: chunks.length,
      creditsRemaining: credits.available - 1,
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
      .select('id, original_file_name, source_language, target_language, created_at, status')
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
