// backend/routes/lawgpt.js

const express = require('express');
const router = express.Router();
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const officeParser = require('officeparser');
const Tesseract = require('tesseract.js');
const { answerQuestion, analyseDocument } = require('../lib/research');
const  supabase  = require('../config/supabase');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/tiff'
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type'));
    }
  }
});

// ─── Smart Chunking Utilities ─────────────────────────────────────────────────

// Split text into chunks of ~800 words each with 100 word overlap
function splitIntoChunks(text, chunkSize = 800, overlap = 100) {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const chunks = [];
  let i = 0;

  while (i < words.length) {
    const chunkWords = words.slice(i, i + chunkSize);
    chunks.push({
      index: chunks.length,
      text: chunkWords.join(' '),
      wordCount: chunkWords.length
    });
    i += chunkSize - overlap; // overlap so context isn't lost at boundaries
  }

  return chunks;
}

// Score a chunk against a query using keyword matching
function scoreChunk(chunkText, query) {
  const chunkLower = chunkText.toLowerCase();
  const queryWords = query.toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 3) // ignore short words like 'the', 'is', 'of'
    .filter(w => !['what', 'when', 'where', 'which', 'this', 'that', 'with', 'from', 'have', 'does'].includes(w));

  if (queryWords.length === 0) return 0;

  let score = 0;
  queryWords.forEach(word => {
    // exact word match
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    const matches = (chunkLower.match(regex) || []).length;
    score += matches;

    // partial match (for legal terms like 'cognizable' matching 'cogniz')
    if (chunkLower.includes(word)) score += 0.5;
  });

  // Boost score for legal keywords present in chunk
  const legalBoostWords = [
    'section', 'act', 'court', 'judgment', 'order', 'petition',
    'appellant', 'respondent', 'plaintiff', 'defendant', 'clause',
    'provision', 'article', 'ipc', 'bns', 'crpc', 'cpc', 'held',
    'whereas', 'hereby', 'aforesaid', 'therein', 'thereof'
  ];
  legalBoostWords.forEach(word => {
    if (chunkLower.includes(word)) score += 0.3;
  });

  return score;
}

// Get top N most relevant chunks for a query
function getRelevantChunks(chunks, query, topN = 12) {
  if (chunks.length === 0) return [];
  if (chunks.length <= topN) return chunks.map(c => c.chunk_text);

  const scored = chunks.map(chunk => ({
    text: chunk.chunk_text,
    index: chunk.chunk_index,
    score: scoreChunk(chunk.chunk_text, query)
  }));

  // Sort by score descending, then take topN
  scored.sort((a, b) => b.score - a.score);
  const topChunks = scored.slice(0, topN);

  // Re-sort by original index to maintain document flow
  topChunks.sort((a, b) => a.index - b.index);

  return topChunks.map(c => c.text);
}

// ─── File Text Extraction ──────────────────────────────────────────────────────
async function extractTextFromFile(file) {
  const mime = file.mimetype;
  const buffer = file.buffer;

  // PDF
  if (mime === 'application/pdf') {
    const data = await pdfParse(buffer);
    return { text: data.text, pages: data.numpages };
  }

  // Word (.docx)
  if (
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mime === 'application/msword'
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return { text: result.value, pages: 1 };
  }

  // PowerPoint (.pptx) or Excel (.xlsx)
  if (
    mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
    mime === 'application/vnd.ms-powerpoint' ||
    mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mime === 'application/vnd.ms-excel'
  ) {
    const text = await new Promise((resolve, reject) => {
      officeParser.parseOfficeAsync(buffer, { outputErrorToConsole: false })
        .then(resolve)
        .catch(reject);
    });
    return { text, pages: 1 };
  }

  // Images — OCR
  if (['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/tiff'].includes(mime)) {
    const { data: { text } } = await Tesseract.recognize(buffer, 'eng', {
      logger: () => {} // suppress logs
    });
    return { text, pages: 1 };
  }

  throw new Error('Unsupported file type');
}

// ─── Auth Middleware ───────────────────────────────────────────────────────────
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = authHeader.split(' ')[1];
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Invalid token' });
  req.user = user;
  next();
}

// ─── GET /api/lawgpt/chats ─────────────────────────────────────────────────────
// Returns all chat sessions for the logged-in user
router.get('/chats', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('lawgpt_chats')
      .select('id, title, pdf_name, created_at, updated_at')
      .eq('user_id', req.user.id)
      .order('updated_at', { ascending: false });

    if (error) throw error;
    res.json({ success: true, chats: data });
  } catch (err) {
    console.error('GET /chats error:', err);
    res.status(500).json({ error: 'Failed to fetch chats' });
  }
});

// ─── POST /api/lawgpt/chats ────────────────────────────────────────────────────
// Creates a new empty chat session
router.post('/chats', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('lawgpt_chats')
      .insert({
        user_id: req.user.id,
        title: 'New Research Session',
        messages: [],
        pdf_context: null,
        pdf_name: null
      })
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, chat: data });
  } catch (err) {
    console.error('POST /chats error:', err);
    res.status(500).json({ error: 'Failed to create chat' });
  }
});

// ─── GET /api/lawgpt/chats/:id ─────────────────────────────────────────────────
// Returns a single chat with all messages
router.get('/chats/:id', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('lawgpt_chats')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Chat not found' });
    res.json({ success: true, chat: data });
  } catch (err) {
    console.error('GET /chats/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch chat' });
  }
});

// ─── DELETE /api/lawgpt/chats/:id ──────────────────────────────────────────────
// Deletes a chat session
router.delete('/chats/:id', requireAuth, async (req, res) => {
  try {
    const { error } = await supabase
      .from('lawgpt_chats')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /chats/:id error:', err);
    res.status(500).json({ error: 'Failed to delete chat' });
  }
});

// ─── PATCH /api/lawgpt/chats/:id/title ─────────────────────────────────────────
// Renames a chat session
router.patch('/chats/:id/title', requireAuth, async (req, res) => {
  try {
    const { title } = req.body;
    const { error } = await supabase
      .from('lawgpt_chats')
      .update({ title, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('PATCH /title error:', err);
    res.status(500).json({ error: 'Failed to rename chat' });
  }
});

// ─── POST /api/lawgpt/chats/:id/message ────────────────────────────────────────
// Sends a user message → gets AI response → saves both → returns AI reply
router.post('/chats/:id/message', requireAuth, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // 1. Fetch current chat
    const { data: chat, error: fetchError } = await supabase
      .from('lawgpt_chats')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (fetchError || !chat) return res.status(404).json({ error: 'Chat not found' });

    const existingMessages = chat.messages || [];

    // 1b. If chat has a document, fetch relevant chunks using smart chunking
    let documentContext = '';
    if (chat.pdf_name) {
      const { data: chunks } = await supabase
        .from('document_chunks')
        .select('chunk_index, chunk_text')
        .eq('chat_id', req.params.id)
        .eq('user_id', req.user.id)
        .order('chunk_index', { ascending: true });

      if (chunks && chunks.length > 0) {
        const relevantChunks = getRelevantChunks(chunks, message.trim());
        documentContext = relevantChunks.join('\n\n---\n\n');
      } else {
        // fallback to stored context for old uploads
        documentContext = chat.pdf_context || '';
      }
    }

    // 2–5. Retrieve official statute text, answer from it, verify every citation
    const result = await answerQuestion({
      question: message.trim(),
      history: existingMessages,
      documentName: chat.pdf_name || null,
      documentContext
    });
    const aiReply = result.reply || 'Sorry, I could not generate a response.';
    const sections = result.cited_sections;

    // 6. Build updated messages array
    const userMessage = { role: 'user', content: message.trim(), timestamp: new Date().toISOString() };
    const assistantMessage = {
      role: 'assistant', content: aiReply, timestamp: new Date().toISOString(),
      cited_sections: sections, verification: result.verification
    };
    const updatedMessages = [...existingMessages, userMessage, assistantMessage];

    // 7. Auto-title: use first user message as chat title
    let newTitle = chat.title;
    if (chat.title === 'New Research Session' && existingMessages.length === 0) {
      newTitle = message.trim().slice(0, 60);
    }

    // 8. Save updated chat back to Supabase
    await supabase
      .from('lawgpt_chats')
      .update({
        messages: updatedMessages,
        title: newTitle,
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.id);

    // Update lawgpt_usage count in profiles
    const { data: currentProfile } = await supabase
      .from('profiles')
      .select('lawgpt_usage')
      .eq('id', req.user.id)
      .single();

    await supabase
      .from('profiles')
      .update({ lawgpt_usage: (currentProfile?.lawgpt_usage || 0) + 1 })
      .eq('id', req.user.id);

    // Log usage
    await supabase
      .from('usage_logs')
      .insert({
        user_id: req.user.id,
        action_type: 'lawgpt_message',
        action_label: `LawGPT: ${message.trim().slice(0, 60)}`,
        credits_used: 0,
        metadata: { chat_id: req.params.id }
      });

    res.json({
      success: true,
      reply: aiReply,
      cited_sections: sections,
      verification: result.verification,
      title: newTitle
    });

  } catch (err) {
    console.error('POST /message error:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// ─── POST /api/lawgpt/chats/:id/upload-pdf ─────────────────────────────────────
// Uploads a PDF, extracts text, attaches it to the chat session
router.post('/chats/:id/upload-pdf', requireAuth, upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No PDF file uploaded' });

    // 1. Extract text from file
    let extractedText = '';
    let pages = 1;

    try {
      const result = await extractTextFromFile(req.file);
      extractedText = result.text || '';
      pages = result.pages || 1;
    } catch (extractErr) {
      return res.status(400).json({ error: 'Could not extract text from this file: ' + extractErr.message });
    }

    if (!extractedText.trim()) {
      return res.status(400).json({ error: 'Could not extract any text from this file. Try a different format.' });
    }

    // 2. Save to pdf_documents table
    const { data: pdfDoc, error: pdfError } = await supabase
      .from('pdf_documents')
      .insert({
        user_id: req.user.id,
        chat_id: req.params.id,
        file_name: req.file.originalname,
        file_size: req.file.size,
        extracted_text: extractedText,
        status: 'ready'
      })
      .select()
      .single();

    if (pdfError) throw pdfError;

    // 3. Split into chunks and save to document_chunks table
    const chunks = splitIntoChunks(extractedText);
    if (chunks.length > 0) {
      const chunkRows = chunks.map(chunk => ({
        pdf_id: pdfDoc.id,
        chat_id: req.params.id,
        user_id: req.user.id,
        chunk_index: chunk.index,
        chunk_text: chunk.text,
        word_count: chunk.wordCount
      }));

      await supabase.from('document_chunks').insert(chunkRows);
    }

    // 4. Attach PDF name to chat (store only first 3000 chars as fallback context)
    await supabase
      .from('lawgpt_chats')
      .update({
        pdf_context: extractedText.slice(0, 3000), // short fallback only
        pdf_name: req.file.originalname,
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);
    res.json({
      success: true,
      pdf_id: pdfDoc.id,
      file_name: req.file.originalname,
      file_size: req.file.size,
      pages: pages,
      characters: extractedText.length
    });

  } catch (err) {
    console.error('POST /upload-pdf error:', err);
    res.status(500).json({ error: 'Failed to process PDF' });
  }
});

// ─── DELETE /api/lawgpt/chats/:id/remove-pdf ───────────────────────────────────
// Removes the active PDF context from a chat
router.delete('/chats/:id/remove-pdf', requireAuth, async (req, res) => {
  try {
    // Remove chunks for this chat
    await supabase
      .from('document_chunks')
      .delete()
      .eq('chat_id', req.params.id)
      .eq('user_id', req.user.id);

    await supabase
      .from('lawgpt_chats')
      .update({ pdf_context: null, pdf_name: null, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);
      
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /remove-pdf error:', err);
    res.status(500).json({ error: 'Failed to remove PDF' });
  }
});

// ─── POST /api/lawgpt/chats/:id/analyse ────────────────────────────────────────
// Analyses uploaded document — extracts heads, acts, cases
router.post('/chats/:id/analyse', requireAuth, async (req, res) => {
  try {
    // 1. Fetch chat
    const { data: chat, error: fetchError } = await supabase
      .from('lawgpt_chats')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();

    if (fetchError || !chat) return res.status(404).json({ error: 'Chat not found' });
    if (!chat.pdf_name) return res.status(400).json({ error: 'No document uploaded in this session' });

    // 2. Fetch ALL chunks for full document analysis
    const { data: chunks } = await supabase
      .from('document_chunks')
      .select('chunk_index, chunk_text')
      .eq('chat_id', req.params.id)
      .eq('user_id', req.user.id)
      .order('chunk_index', { ascending: true });

    let fullText = '';
    if (chunks && chunks.length > 0) {
      // Gemini's context fits long documents — up to 80 chunks (~56,000 words, overlap removed)
      fullText = chunks.slice(0, 80).map((c, i) => i === 0 ? c.chunk_text : c.chunk_text.split(/\s+/).slice(100).join(' ')).join('\n\n');
    } else {
      fullText = chat.pdf_context || '';
    }

    if (!fullText.trim()) {
      return res.status(400).json({ error: 'Could not extract document text for analysis' });
    }

    console.log(`📊 Analysing document: ${chat.pdf_name} — ${chunks?.length || 0} chunks`);

    // 3. Analyse: report only what the document contains, verify cases and provisions against it
    const result = await analyseDocument({ name: chat.pdf_name, text: fullText });
    const analysisResult = result.analysis || 'Analysis could not be generated.';

    // 4. Save analysis as a message in the chat
    const existingMessages = chat.messages || [];
    const systemMessage = {
      role: 'assistant',
      content: `📊 **DOCUMENT ANALYSIS: ${chat.pdf_name}**\n\n${analysisResult}`,
      timestamp: new Date().toISOString(),
      is_analysis: true,
      cited_sections: result.cited_sections,
      verification: result.verification
    };

    const updatedMessages = [
      ...existingMessages,
      { role: 'user', content: `Analyse this document: ${chat.pdf_name}`, timestamp: new Date().toISOString() },
      systemMessage
    ];

    await supabase
      .from('lawgpt_chats')
      .update({
        messages: updatedMessages,
        title: `Analysis: ${chat.pdf_name.slice(0, 40)}`,
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.id);

    // Log usage
    await supabase
      .from('usage_logs')
      .insert({
        user_id: req.user.id,
        action_type: 'lawgpt_analysis',
        action_label: `Document Analysis: ${chat.pdf_name}`,
        credits_used: 0,
        metadata: { chat_id: req.params.id, file: chat.pdf_name }
      });

    res.json({
      success: true,
      analysis: analysisResult,
      fileName: chat.pdf_name
    });

  } catch (err) {
    console.error('POST /analyse error:', err);
    res.status(500).json({ error: 'Document analysis failed: ' + err.message });
  }
});

module.exports = router;