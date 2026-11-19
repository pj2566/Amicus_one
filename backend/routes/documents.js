const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { verifyToken } = require('./auth');
const llm = require('../lib/llm');

const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/plain',
    ];
    allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error('Unsupported file type'));
  }
});

// Helper — single AI call
const FORMATTING_RULES = `
CRITICAL FORMATTING RULES — STRICTLY FOLLOW THESE OR OUTPUT IS INVALID:
1. NEVER use markdown — no asterisks (*), no hashtags (#), no underscores (_), no backticks
2. NEVER use HTML tags — no <center>, <b>, <br>, <p>, <div> or any HTML whatsoever
3. NEVER use any special formatting characters — plain text only
4. Use ALL CAPS for all headings and clause titles — example: PARTIES, DEFINITIONS, CLAUSE 1
5. Use numbers for clauses: CLAUSE 1, CLAUSE 2, sub-clauses: 1.1, 1.2, 1.3
6. Use CAPITAL LETTERS for party names: LANDLORD, TENANT, EMPLOYER, EMPLOYEE
7. Indent sub-clauses with 4 spaces
8. Separate sections with one blank line
9. Write dates as: [DATE], amounts as: Rs. [AMOUNT]/-
10. Use proper Indian legal language — formal, precise, complete
11. Never truncate or summarize — write every clause in full
12. Document title goes on its own line in ALL CAPS — write ONLY the specific document name such as RENT AGREEMENT or EMPLOYMENT CONTRACT — NEVER write "LEGAL DOCUMENT" as a title
13. NEVER start any document with the words "LEGAL DOCUMENT" — this is strictly forbidden
14. NEVER invent or assume any names, addresses, dates, amounts, or personal details not explicitly provided
15. If a detail is not provided, write [PARTY NAME], [ADDRESS], [DATE], [AMOUNT] as placeholders — never make up information
16. Only use the exact details provided in the case details — nothing else
`;

const callAI = (content, maxTokens = 3000) => llm.chat({
  system: `You are a senior Indian legal document drafter with 25+ years experience. You draft professional legal documents for Indian courts and transactions. ${FORMATTING_RULES}`,
  messages: [{ role: 'user', content }],
  maxTokens,
  temperature: 0.3
});

// Small delay between chunks to avoid rate limiting
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

router.post('/generate', verifyToken, async (req, res) => {
  const {
    categoryName,
    documentTypeName,
    formData,
    documentTypeId,
    language,
    documentLength,
    customPages,
    selectedSections
  } = req.body;

  if (!categoryName || !documentTypeName || !formData) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const selectedLanguage = language || 'English';
  const selectedLength = documentLength || 'medium';
  const customPageCount = parseInt(customPages) || 4;

  // Calculate total chunks needed
  // Each chunk generates approximately 2-3 pages
  const chunkCountMap = {
    short: 1,          // ~2 pages
    medium: 2,         // ~4 pages
    detailed: 4,       // ~8 pages
    comprehensive: 7,  // ~15 pages
    custom: Math.min(Math.ceil(customPageCount / 2.5), 40) // up to 40 chunks = ~100 pages
  };

  const totalChunks = chunkCountMap[selectedLength] || 2;

  try {
    // STEP 1: Check credits
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('credits, documents_generated, is_firm_member, firm_id')
      .eq('id', req.user.id)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ error: 'User not found' });
    }

    // For firm members, check firm pool credits
    let firmProfile = null;
    if (profile.is_firm_member && profile.firm_id) {
      const { data: fp } = await supabase
        .from('firm_profiles')
        .select('id, total_credits')
        .eq('id', profile.firm_id)
        .single();
      firmProfile = fp;
      if (!firmProfile || firmProfile.total_credits <= 0) {
        return res.status(402).json({ error: 'INSUFFICIENT_CREDITS' });
      }
    } else {
      if (profile.credits <= 0) {
        return res.status(402).json({ error: 'INSUFFICIENT_CREDITS' });
      }
    }

    // STEP 2: Build formatted fields
    const formattedFields = Object.entries(formData)
      .map(([key, value]) => `• ${key.replace(/_/g, ' ').toUpperCase()}: ${value}`)
      .join('\n');

    const sectionsText = selectedSections && selectedSections.length > 0
      ? `\nLAWYER-APPROVED LEGAL SECTIONS TO INCLUDE:\n${selectedSections.join('\n')}`
      : '';

    const languageNote = selectedLanguage === 'English'
      ? 'Write in formal English legal language.'
      : `Write entirely in ${selectedLanguage} language using formal legal terminology.`;

    // STEP 2B: Fetch matching template from database
    let templateContext = '';
    try {
      const templateLang = ['English', 'Hindi'].includes(selectedLanguage)
        ? selectedLanguage
        : 'English';

      const { data: template } = await supabase
        .from('document_templates')
        .select('clauses, description')
        .eq('document_type_id', documentTypeId)
        .eq('language', templateLang)
        .eq('is_active', true)
        .single();

      if (template && template.clauses && template.clauses.length > 0) {
        const clauseStructure = template.clauses
          .sort((a, b) => a.order - b.order)
          .map(c => `${c.title.toUpperCase()}:\n${c.content}`)
          .join('\n\n');

        templateContext = `
BASE TEMPLATE STRUCTURE TO FOLLOW:
Use the following as the structural foundation for this document.
Fill in the actual details from the CASE DETAILS provided.
Expand each section significantly with full legal language.

${clauseStructure}

IMPORTANT: The above is a base structure only. Expand every clause with complete legal language, add relevant sub-clauses, and make it comprehensive based on the case details provided.`;

        console.log(`✅ Template found for ${documentTypeId} in ${templateLang}`);
      } else {
        console.log(`ℹ️ No template found for ${documentTypeId} — generating without template`);
      }
    } catch (templateErr) {
      console.log(`ℹ️ Template fetch skipped: ${templateErr.message}`);
    }

    // STEP 3: Generate document in chunks
    console.log(`\n📄 Starting generation: ${totalChunks} chunks for ${selectedLength} (${customPageCount} pages)`);

    const chunks = [];

    // ── CHUNK 1: Opening — Title, Parties, Definitions, Recitals ──
    const chunk1 = await callAI(`You are a senior Indian legal document drafter with 25+ years experience.

Draft the OPENING SECTION of a ${documentTypeName} under ${categoryName}.

CASE DETAILS:
${formattedFields}
${sectionsText}
${templateContext}

${languageNote}

Generate ONLY these sections — write each in FULL detail:

1. DOCUMENT TITLE — write only the specific document name in ALL CAPS (example: RENT AGREEMENT, EMPLOYMENT CONTRACT). Do NOT write "LEGAL DOCUMENT" as the title.
2. DATE AND PLACE OF EXECUTION
3. PARTIES SECTION
   - Full legal names
   - Complete addresses
   - Legal status (individual/company/firm)
   - Hereinafter referred to as (Party names)
4. DEFINITIONS AND INTERPRETATIONS
   - Define at least 12-15 key terms
   - Each definition must be complete and precise
5. RECITALS / WHEREAS CLAUSES
   - At least 6-8 recitals
   - Each recital must be detailed

Write complete formal legal text. Do NOT summarize or skip details.
Use proper Indian legal drafting style.`, 3000);

    chunks.push(chunk1);
    console.log(`✅ Chunk 1/Opening done`);
    await delay(600);

    // ── CHUNK 2: Core Terms (always generated for medium+) ──
    if (totalChunks >= 2) {
      const chunk2 = await callAI(`You are a senior Indian legal document drafter.

You are drafting a ${documentTypeName} under ${categoryName}.
The opening sections are already written. Continue from CLAUSE 1 onwards.

CASE DETAILS:
${formattedFields}
${languageNote}

CRITICAL INSTRUCTION: You are writing a ${documentTypeName}. 
Write ONLY clauses that are legally appropriate and relevant for a ${documentTypeName}.
Do NOT write generic contract clauses that do not apply to this document type.

Examples of what to write based on document type:
- FIR: facts of incident, charges, IPC/BNS sections, evidence, witnesses, relief sought
- Complaint Petition: grounds of complaint, specific allegations, legal basis, prayer
- Rent Agreement: rent amount, possession, maintenance, tenant rules, renewal
- Employment Contract: salary, designation, duties, working hours, leave policy
- Sale Deed: property description, consideration, title, possession, warranties
- Legal Notice: cause of action, demand, consequences of non-compliance

Write CLAUSE 1 through CLAUSE 4 with detailed sub-clauses.
Every clause and sub-clause must be directly relevant to a ${documentTypeName}.
Reference the actual parties, facts, and details from CASE DETAILS above.
Write complete formal Indian legal text. No markdown. No HTML.`, 3000);

      chunks.push(chunk2);
      console.log(`✅ Chunk 2/Core Terms done`);
      await delay(600);
    }

    // ── CHUNK 3: Document-specific clauses ──
    if (totalChunks >= 3) {
      const chunk3 = await callAI(`You are a senior Indian legal document drafter.

You are continuing a ${documentTypeName} under ${categoryName}.
Previous clauses covered: Scope, Terms, Rights, Obligations.

CASE DETAILS:
${formattedFields}
${languageNote}

CRITICAL: You are writing a ${documentTypeName}. Every clause must be specific to this document type.
Do NOT write generic "SERVICE PROVIDER/CLIENT" language unless this is a service agreement.
Do NOT write "PAYMENT TERMS" unless this document involves payment.
Write clauses that are DIRECTLY RELEVANT to a ${documentTypeName}.

Continue clause numbering from CLAUSE 5.
Write 3 more detailed clauses that are specifically appropriate for a ${documentTypeName} under ${categoryName}.
Each clause must reference the actual parties, facts, and subject matter from the CASE DETAILS above.
Use the correct legal terminology for this specific document type.
Write complete formal Indian legal text. No markdown. No HTML.`, 3000);

      chunks.push(chunk3);
      console.log(`✅ Chunk 3/Financial done`);
      await delay(600);
    }

    // ── CHUNK 4: Protective Clauses (for detailed+) ──
    // ── CHUNK 5: Document-specific clauses ──
    if (totalChunks >= 5) {
      const chunk5 = await callAI(`You are a senior Indian legal document drafter.

You are continuing a ${documentTypeName} under ${categoryName}.

CASE DETAILS:
${formattedFields}
${languageNote}

CRITICAL INSTRUCTION: You are writing a ${documentTypeName}.
Write ONLY clauses appropriate for this document type.
Do NOT write Term/Termination/Breach unless they apply to this document.
For criminal documents like FIR or Complaint — write about investigation, evidence, witnesses, relief.
For civil documents — write about specific performance, damages, injunctions.
For agreements — write about duration, termination, breach.

Continue clause numbering from CLAUSE 12.
Write 3 more detailed clauses directly relevant to a ${documentTypeName}.
Reference actual parties and facts from CASE DETAILS above.
Write complete formal Indian legal text. No markdown. No HTML.`, 3000);

      chunks.push(chunk4);
      console.log(`✅ Chunk 4/Protective done`);
      await delay(600);
    }

    // ── CHUNK 5: Term, Termination, Breach (for comprehensive+) ──
    if (totalChunks >= 5) {
      const chunk5 = await callAI(`You are a senior Indian legal document drafter.

You are continuing a ${documentTypeName} under ${categoryName}.

CASE DETAILS:
${formattedFields}
${languageNote}

Continue clause numbering from CLAUSE 12:

CLAUSE 12: TERM AND DURATION
   12.1 Commencement date
   12.2 Initial term
   12.3 Renewal provisions
   12.4 Notice for non-renewal

CLAUSE 13: TERMINATION
   13.1 Termination for convenience (with notice period)
   13.2 Termination for cause
   13.3 Termination for insolvency
   13.4 Consequences of termination
   13.5 Survival of obligations post-termination
   13.6 Return of property/documents

CLAUSE 14: BREACH AND REMEDIES
   14.1 Definition of material breach
   14.2 Notice of breach
   14.3 Cure period
   14.4 Remedies available
   14.5 Cumulative remedies
   14.6 Specific performance
   14.7 Liquidated damages

Write complete formal legal text.`, 3000);

      chunks.push(chunk5);
      console.log(`✅ Chunk 5/Termination done`);
      await delay(600);
    }

    // ── CHUNK 6: Document-specific clauses ──
    if (totalChunks >= 6) {
      const chunk6 = await callAI(`You are a senior Indian legal document drafter.

You are continuing a ${documentTypeName} under ${categoryName}.

CASE DETAILS:
${formattedFields}
${languageNote}

CRITICAL INSTRUCTION: You are writing a ${documentTypeName}.
Write clauses appropriate for this document only.
For criminal documents — write about jurisdiction, court, applicable penal sections, prayer for relief.
For civil documents — write about jurisdiction, limitation, court fee.
For agreements — write about dispute resolution, arbitration, governing law.

Continue clause numbering from CLAUSE 15.
Write 3 more detailed clauses directly relevant to a ${documentTypeName}.
Reference actual parties and facts from CASE DETAILS above.
Write complete formal Indian legal text. No markdown. No HTML.`, 3000);

      chunks.push(chunk6);
      console.log(`✅ Chunk 6/Dispute done`);
      await delay(600);
    }

    // ── CHUNK 7: Document-specific final clauses ──
    if (totalChunks >= 7) {
      const chunk7 = await callAI(`You are a senior Indian legal document drafter.

You are continuing a ${documentTypeName} under ${categoryName}.

CASE DETAILS:
${formattedFields}
${languageNote}

CRITICAL INSTRUCTION: You are writing a ${documentTypeName}.
Write only what is legally appropriate for this document.
For criminal documents — write PRAYER FOR RELIEF, LIST OF WITNESSES, LIST OF DOCUMENTS, VERIFICATION.
For civil suits — write RELIEF CLAIMED, VALUATION, COURT FEE, VERIFICATION.
For agreements — write COMPLIANCE, SCHEDULES, ANNEXURES with specific details.

Continue clause numbering from CLAUSE 18.
Write final clauses and schedules directly relevant to a ${documentTypeName}.
Include a SCHEDULE A with detailed description of the subject matter.
Reference actual parties and facts from CASE DETAILS above.
Write complete formal Indian legal text. No markdown. No HTML.`, 3000);

      chunks.push(chunk7);
      console.log(`✅ Chunk 7/Compliance done`);
      await delay(600);
    }

    // ── EXTRA CHUNKS for custom pages > 15 ──
    const extraTopics = Array.from({ length: 13 }, (_, i) => 
        `You are a senior Indian legal document drafter.

STRICT INSTRUCTION: You are writing ONLY a ${documentTypeName}. 
Do NOT write any other document type under any circumstances.
Do NOT write a Rent Agreement unless this IS a Rent Agreement.
Do NOT write an NDA unless this IS an NDA.
You must stay strictly within this document: ${documentTypeName} under ${categoryName}.

CASE DETAILS — USE ONLY THESE DETAILS:
${formattedFields}
${languageNote}

DOCUMENT CONTINUITY — THIS IS CHUNK ${i + 8}:
The previous chunks have already covered the opening, parties, definitions, 
core terms, rights, obligations, payment, warranties, confidentiality, 
IP rights, indemnification, liability, force majeure, termination, 
dispute resolution, governing law, and compliance clauses.

YOUR TASK FOR THIS CHUNK:
Continue the SAME ${documentTypeName} document. Add MORE specific clauses, 
schedules, and annexures that are DIRECTLY RELEVANT to this specific 
${documentTypeName} between the exact parties named in the case details above.

Number clauses continuing from where the previous chunk left off.
Every clause must directly reference the specific subject matter, 
parties, and details from the CASE DETAILS above.
Write complete formal Indian legal text. No markdown. No HTML.
NEVER start a new document. NEVER switch document type.`
      );

    // Generate extra chunks if needed
    if (totalChunks > 7) {
      const extraNeeded = Math.min(totalChunks - 7, extraTopics.length);
      for (let i = 0; i < extraNeeded; i++) {
        const extraChunk = await callAI(extraTopics[i], 3000);

        chunks.push(extraChunk);
        console.log(`✅ Extra chunk ${i + 8} done`);
        await delay(600);
      }
    }

    // ── FINAL CHUNK: Execution Block — Always Last ──
    const finalChunk = await callAI(`You are completing a ${documentTypeName} legal document.

Write ONLY the final execution section. Do not add any disclaimer, branding, or AI-generated notice. Do not add any separator lines.

IN WITNESS WHEREOF, the parties hereto have executed this ${documentTypeName} as of the date first written above.

FOR PARTY 1:
_______________________
Authorized Signatory
Name: ___________________
Designation: _____________
Date: ___________________
Place: __________________

FOR PARTY 2:
_______________________
Authorized Signatory
Name: ___________________
Designation: _____________
Date: ___________________
Place: __________________

WITNESSES:

WITNESS 1:
_______________________
Name: ___________________
Address: ________________
Date: ___________________

WITNESS 2:
_______________________
Name: ___________________
Address: ________________
Date: ___________________

NOTARY PUBLIC:
Before me, Notary Public
District: ________________
State: __________________
Registration No.: ________
Date: ___________________
Seal: ___________________`, 1500);

    chunks.push(finalChunk);
    console.log(`✅ Final execution chunk done`);
    console.log(`\n🎉 Total chunks generated: ${chunks.length}`);

    // Combine all chunks
    const generatedText = chunks.join('\n\n');

    // STEP 4: Deduct credit AFTER successful generation
    // Deduct from firm pool or individual credits
    if (profile.is_firm_member && firmProfile) {
      await supabase
        .from('firm_profiles')
        .update({ total_credits: firmProfile.total_credits - 1 })
        .eq('id', firmProfile.id);
    } else {
      await supabase
        .from('profiles')
        .update({
          credits: profile.credits - 1,
          documents_generated: profile.documents_generated + 1
        })
        .eq('id', req.user.id);
    }

    // Always increment documents_generated
    await supabase
      .from('profiles')
      .update({ documents_generated: (profile.documents_generated || 0) + 1 })
      .eq('id', req.user.id);

    // STEP 5: Save to history
    // Get user's firm_id if they're a firm member
    const { data: userProf } = await supabase
      .from('profiles')
      .select('firm_id')
      .eq('id', req.user.id)
      .single();

    const { data: savedDoc } = await supabase
      .from('documents')
      .insert({
        user_id: req.user.id,
        user_email: req.user.email,
        category_name: categoryName,
        document_type_name: documentTypeName,
        document_type_id: documentTypeId,
        form_data: formData,
        generated_content: generatedText,
        status: 'generated',
        firm_id: userProf?.firm_id || null,
        is_shared_with_firm: false
      })
      .select()
      .single();

    // Log usage
    await supabase
      .from('usage_logs')
      .insert({
        user_id: req.user.id,
        action_type: 'document_generated',
        action_label: `Generated ${documentTypeName}`,
        credits_used: 1,
        metadata: { category: categoryName, document_type: documentTypeName }
      });

    res.json({
      success: true,
      documentId: savedDoc?.id,
      content: generatedText,
      creditsRemaining: profile.credits - 1,
      chunksGenerated: chunks.length
    });

  } catch (err) {
    console.error('Generation error:', err);
    res.status(500).json({
      error: 'Document generation failed. No credits were deducted.'
    });
  }
});

// Share document with firm
router.patch('/share-firm', verifyToken, async (req, res) => {
  try {
    const { documentId } = req.body;
    if (!documentId) return res.status(400).json({ error: 'Document ID required' });

    // Get user firm_id
    const { data: profile } = await supabase
      .from('profiles')
      .select('firm_id')
      .eq('id', req.user.id)
      .single();

    if (!profile?.firm_id) {
      return res.status(403).json({ error: 'Not a firm member' });
    }

    const { error } = await supabase
      .from('documents')
      .update({ is_shared_with_firm: true, firm_id: profile.firm_id })
      .eq('id', documentId)
      .eq('user_id', req.user.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to share document' });
  }
});

// Link document to client
router.patch('/link-client', verifyToken, async (req, res) => {
  try {
    const { documentId, clientId } = req.body;
    if (!documentId) return res.status(400).json({ error: 'Document ID required' });

    const { error } = await supabase
      .from('documents')
      .update({ client_id: clientId || null })
      .eq('id', documentId)
      .eq('user_id', req.user.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('PATCH /link-client error:', err);
    res.status(500).json({ error: 'Failed to link document to client' });
  }
});

// Get documents by client
// Get documents by client
router.get('/by-client/:clientId', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('documents')
      .select('id, document_type_name, category_name, created_at, status, generated_content')
      .eq('user_id', req.user.id)
      .eq('client_id', req.params.clientId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ success: true, documents: data });
  } catch (err) {
    console.error('GET /by-client error:', err);
    res.status(500).json({ error: 'Failed to fetch client documents' });
  }
});

// Get history
// Template clauses for the live preview in the drafting studio (placeholders like [LANDLORD_NAME])
router.get('/template/:documentTypeId', verifyToken, async (req, res) => {
  try {
    const language = req.query.language === 'Hindi' ? 'Hindi' : 'English';
    const { data, error } = await supabase
      .from('document_templates')
      .select('document_type, description, clauses')
      .eq('document_type_id', req.params.documentTypeId)
      .eq('language', language)
      .eq('is_active', true)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.json({ template: null });
    res.json({ template: { ...data, clauses: (data.clauses || []).sort((a, b) => a.order - b.order) } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});

router.get('/history', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('documents')
      .select('id, category_name, document_type_name, created_at, status, client_id, is_shared_with_firm')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;
    res.json({ documents: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// ─── FREEFORM GENERATION ROUTE ────────────────────────────
router.post('/freeform', verifyToken, upload.array('files', 5), async (req, res) => {
  
  const {
    prompt,
    language,
    documentLength,
    customPages,
  } = req.body;

  if (!prompt || !prompt.trim()) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  const selectedLanguage = language || 'English';
  const selectedLength = documentLength || 'medium';
  const customPageCount = parseInt(customPages) || 4;

  const chunkCountMap = {
    short: 1,
    medium: 2,
    detailed: 4,
    comprehensive: 7,
    custom: Math.min(Math.ceil(customPageCount / 2.5), 40)
  };

  const totalChunks = chunkCountMap[selectedLength] || 2;

  try {
    // Check credits
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('credits, documents_generated, is_firm_member, firm_id')
      .eq('id', req.user.id)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ error: 'User not found' });
    }

    // For firm members, check firm pool credits
    let firmProfile = null;
    if (profile.is_firm_member && profile.firm_id) {
      const { data: fp } = await supabase
        .from('firm_profiles')
        .select('id, total_credits')
        .eq('id', profile.firm_id)
        .single();
      firmProfile = fp;
      if (!firmProfile || firmProfile.total_credits <= 0) {
        return res.status(402).json({ error: 'INSUFFICIENT_CREDITS' });
      }
    } else {
      if (profile.credits <= 0) {
        return res.status(402).json({ error: 'INSUFFICIENT_CREDITS' });
      }
    }

    const languageNote = selectedLanguage === 'English'
      ? 'Write in formal English legal language.'
      : `Write entirely in ${selectedLanguage} language using formal legal terminology.`;

    // Build document context from uploaded files if any
    let documentContext = '';
    if (req.files && req.files.length > 0) {
      const extractedTexts = [];
      for (const file of req.files) {
        try {
          let text = '';
          if (file.mimetype === 'application/pdf') {
            const data = await pdfParse(file.buffer);
            text = data.text;
          } else if (
            file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
            file.mimetype === 'application/msword'
          ) {
            const result = await mammoth.extractRawText({ buffer: file.buffer });
            text = result.value;
          } else if (file.mimetype === 'text/plain') {
            text = file.buffer.toString('utf-8');
          }
          if (text.trim()) {
            extractedTexts.push(`--- FILE: ${file.originalname} ---\n${text.slice(0, 8000)}`);
          }
        } catch (extractErr) {
          console.log(`Could not extract ${file.originalname}: ${extractErr.message}`);
        }
      }
      if (extractedTexts.length > 0) {
        documentContext = `\nREFERENCE DOCUMENTS PROVIDED BY LAWYER:\n${extractedTexts.join('\n\n')}\n\nUse these documents as reference/template. Follow their structure and style where relevant but customize based on the lawyer's prompt.`;
      }
    }

    console.log(`\n📄 Freeform generation: ${totalChunks} chunks, language: ${selectedLanguage}`);

    const chunks = [];

    // Chunk 1 — Opening
    const chunk1 = await callAI(`You are a senior Indian legal document drafter with 25+ years experience.

A lawyer has given you the following instruction:
"${prompt}"
${documentContext}

${languageNote}

Draft the OPENING SECTION of this legal document. Include:
1. DOCUMENT TITLE — write only the specific document name in ALL CAPS based on what the lawyer requested. Do NOT write "LEGAL DOCUMENT" as the title.
2. DATE AND PLACE OF EXECUTION
3. PARTIES SECTION (full names, addresses, legal status)
4. DEFINITIONS AND INTERPRETATIONS (at least 10 key terms)
5. RECITALS / WHEREAS CLAUSES (at least 5 recitals)

Follow all Indian legal drafting conventions. Write complete formal legal text.
Use ALL CAPS for headings. Number all clauses. No markdown. No HTML.`, 3000);

    chunks.push(chunk1);
    console.log(`✅ Freeform chunk 1 done`);
    await delay(600);

    // Chunk 2 — Core terms
    if (totalChunks >= 2) {
      const chunk2 = await callAI(`You are a senior Indian legal document drafter.

A lawyer requested: "${prompt}"
${documentContext}

The opening sections are already written. Continue from CLAUSE 1.
${languageNote}

Generate:
CLAUSE 1: SCOPE AND PURPOSE (with 4+ sub-clauses)
CLAUSE 2: TERMS AND CONDITIONS (at least 8 sub-clauses)
CLAUSE 3: RIGHTS OF EACH PARTY (at least 5 rights per party)
CLAUSE 4: OBLIGATIONS OF EACH PARTY (at least 5 obligations per party)

Write complete formal Indian legal text. No markdown. No HTML.`, 3000);

      chunks.push(chunk2);
      console.log(`✅ Freeform chunk 2 done`);
      await delay(600);
    }

    // Chunk 3 — Financial + Warranties
    if (totalChunks >= 3) {
      const chunk3 = await callAI(`You are a senior Indian legal document drafter.

A lawyer requested: "${prompt}"

Previous clauses covered: Scope, Terms, Rights, Obligations. Continue from CLAUSE 5.
${languageNote}

Generate:
CLAUSE 5: PAYMENT TERMS AND CONDITIONS (6 sub-clauses)
CLAUSE 6: REPRESENTATIONS AND WARRANTIES (8 per party)
CLAUSE 7: CONFIDENTIALITY AND NON-DISCLOSURE (6 sub-clauses)

Write complete formal Indian legal text. No markdown. No HTML.`, 3000);

      chunks.push(chunk3);
      console.log(`✅ Freeform chunk 3 done`);
      await delay(600);
    }

    // Chunk 4 — Protective
    if (totalChunks >= 4) {
      const chunk4 = await callAI(`You are a senior Indian legal document drafter.

A lawyer requested: "${prompt}"

Continue from CLAUSE 8. ${languageNote}

Generate:
CLAUSE 8: INTELLECTUAL PROPERTY RIGHTS (5 sub-clauses)
CLAUSE 9: INDEMNIFICATION (5 sub-clauses)
CLAUSE 10: LIMITATION OF LIABILITY (4 sub-clauses)
CLAUSE 11: FORCE MAJEURE (4 sub-clauses)

Write complete formal Indian legal text. No markdown. No HTML.`, 3000);

      chunks.push(chunk4);
      console.log(`✅ Freeform chunk 4 done`);
      await delay(600);
    }

    // Chunk 5 — Termination
    if (totalChunks >= 5) {
      const chunk5 = await callAI(`You are a senior Indian legal document drafter.

A lawyer requested: "${prompt}"

Continue from CLAUSE 12. ${languageNote}

Generate:
CLAUSE 12: TERM AND DURATION (4 sub-clauses)
CLAUSE 13: TERMINATION (6 sub-clauses)
CLAUSE 14: BREACH AND REMEDIES (7 sub-clauses)

Write complete formal Indian legal text. No markdown. No HTML.`, 3000);

      chunks.push(chunk5);
      console.log(`✅ Freeform chunk 5 done`);
      await delay(600);
    }

    // Chunk 6 — Dispute Resolution
    if (totalChunks >= 6) {
      const chunk6 = await callAI(`You are a senior Indian legal document drafter.

A lawyer requested: "${prompt}"

Continue from CLAUSE 15. ${languageNote}

Generate:
CLAUSE 15: DISPUTE RESOLUTION (arbitration under Arbitration and Conciliation Act 1996)
CLAUSE 16: GOVERNING LAW AND JURISDICTION (Indian law)
CLAUSE 17: GENERAL PROVISIONS (entire agreement, amendments, severability, notices, assignment)

Write complete formal Indian legal text. No markdown. No HTML.`, 3000);

      chunks.push(chunk6);
      console.log(`✅ Freeform chunk 6 done`);
      await delay(600);
    }

    // Chunk 7 — Compliance
    if (totalChunks >= 7) {
      const chunk7 = await callAI(`You are a senior Indian legal document drafter.

A lawyer requested: "${prompt}"

Continue from CLAUSE 18. ${languageNote}

Generate:
CLAUSE 18: REGULATORY COMPLIANCE
CLAUSE 19: TAX PROVISIONS (including GST and TDS)
CLAUSE 20: ANTI-CORRUPTION AND ETHICS
CLAUSE 21: DATA PROTECTION (Indian data protection laws)
SCHEDULE A: DETAILED DESCRIPTION

Write complete formal Indian legal text. No markdown. No HTML.`, 3000);

      chunks.push(chunk7);
      console.log(`✅ Freeform chunk 7 done`);
      await delay(600);
    }

    // Extra chunks for longer documents
    if (totalChunks > 7) {
      const extraTopics = Array.from({ length: 13 }, (_, i) =>
        `You are a senior Indian legal document drafter.

A lawyer requested: "${prompt.slice(0, 300)}"

This is continuation chunk ${i + 8} of the same document.
Continue writing MORE detailed content for THIS SPECIFIC document only.
Do NOT switch to any other document type.
Do NOT generate a Rent Agreement, NDA, or any unrelated document.
Continue adding more relevant clauses, sub-clauses, schedules, and annexures
that are directly related to the document requested above.
Add more specific legal provisions, remedies, procedures, and protections
relevant to this exact case.
Number clauses continuing from where the previous chunk left off.
Write in formal Indian legal language. No markdown. No HTML.`
      );

      const extraNeeded = Math.min(totalChunks - 7, extraTopics.length);
      for (let i = 0; i < extraNeeded; i++) {
        const extraChunk = await callAI(extraTopics[i], 3000);
        chunks.push(extraChunk);
        console.log(`✅ Freeform extra chunk ${i + 8} done`);
        await delay(600);
      }
    }

    // Final execution block
    const finalChunk = await callAI(`You are completing a legal document requested by a lawyer.

Write ONLY the final execution section with signature blocks, witness sections, and notary block.
Do not add any disclaimer, branding, or AI-generated notice. Do not add any separator lines.

IN WITNESS WHEREOF, the parties hereto have executed this document as of the date first written above.

FOR PARTY 1:
_______________________
Authorized Signatory
Name: ___________________
Designation: _____________
Date: ___________________
Place: __________________

FOR PARTY 2:
_______________________
Authorized Signatory
Name: ___________________
Designation: _____________
Date: ___________________
Place: __________________

WITNESSES:

WITNESS 1:
_______________________
Name: ___________________
Address: ________________
Date: ___________________

WITNESS 2:
_______________________
Name: ___________________
Address: ________________
Date: ___________________

NOTARY PUBLIC:
Before me, Notary Public
District: ________________
State: __________________
Registration No.: ________
Date: ___________________
Seal: ___________________`, 1500);

    chunks.push(finalChunk);
    console.log(`✅ Freeform final chunk done. Total: ${chunks.length}`);

    const generatedText = chunks.join('\n\n');

    // Deduct from firm pool or individual credits
    if (profile.is_firm_member && firmProfile) {
      await supabase
        .from('firm_profiles')
        .update({ total_credits: firmProfile.total_credits - 1 })
        .eq('id', firmProfile.id);
    } else {
      await supabase
        .from('profiles')
        .update({
          credits: profile.credits - 1,
          documents_generated: profile.documents_generated + 1
        })
        .eq('id', req.user.id);
    }

    // Always increment documents_generated
    await supabase
      .from('profiles')
      .update({ documents_generated: (profile.documents_generated || 0) + 1 })
      .eq('id', req.user.id);

    // Save to documents history
    const { data: freeformUserProf } = await supabase
      .from('profiles')
      .select('firm_id')
      .eq('id', req.user.id)
      .single();

    const { data: savedDoc } = await supabase
      .from('documents')
      .insert({
        user_id: req.user.id,
        user_email: req.user.email,
        category_name: 'Freeform',
        document_type_name: prompt.slice(0, 80),
        document_type_id: 'freeform',
        form_data: { prompt, language: selectedLanguage },
        generated_content: generatedText,
        status: 'generated',
        firm_id: freeformUserProf?.firm_id || null,
        is_shared_with_firm: false
      })
      .select()
      .single();

    // Log usage
    await supabase
      .from('usage_logs')
      .insert({
        user_id: req.user.id,
        action_type: 'document_generated',
        action_label: `Freeform: ${prompt.slice(0, 60)}`,
        credits_used: 1,
        metadata: { mode: 'freeform' }
      });

    res.json({
      success: true,
      documentId: savedDoc?.id,
      content: generatedText,
      creditsRemaining: profile.credits - 1,
      chunksGenerated: chunks.length
    });

  } catch (err) {
    console.error('Freeform generation error:', err);
    res.status(500).json({
      error: 'Document generation failed. No credits were deducted.'
    });
  }
});

module.exports = router;