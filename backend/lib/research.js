// LawGPT answer pipeline: understand → retrieve statute text → answer from sources → verify citations.
// Shared by the API route and the evaluation suite so both exercise the same code.

const llm = require('./llm');
const ctx = require('./legalContext');

const regimeInstructions = (regime, offenceDate, oldCodesLoaded) => {
  const oldCite = oldCodesLoaded
    ? 'Cite old-code provisions from SOURCES like any other source.'
    : 'Lexora does not yet hold verified text of the IPC, CrPC or Evidence Act. When you mention an old-code equivalent, write it as "(formerly Section 420 IPC — verify)" and never rely on it as the only authority.';
  const base = `- The BNS, BNSS and BSA came into force on 1 July 2024, replacing the IPC, CrPC and Indian Evidence Act respectively.
- Offences committed before 1 July 2024 are governed by the IPC. Proceedings already pending on that date continue under the repealed codes as provided in the repeal and savings sections ([BNS 358], [BNSS 531], [BSA 170]) when these are in SOURCES.
- ${oldCite}`;
  if (regime === 'old') return `${base}\n- The offence date given is ${offenceDate}, BEFORE 1 July 2024: the substantive offence is governed by the IPC. Explain this clearly, identify the corresponding new-code provisions from SOURCES for reference, and say which law applies to procedure depending on when proceedings began.`;
  if (regime === 'new') return `${base}\n- The offence date given is ${offenceDate}, on or after 1 July 2024: the BNS, BNSS and BSA apply.`;
  return `${base}\n- The offence date is not stated. If the answer depends on it, answer under the new codes, say so in one line, and ask for the date at the end.`;
};

const normalise = t => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ');

const caseAppearsIn = (caseName, docNorm) => {
  const words = normalise(caseName).split(' ').filter(w => w.length > 3 && !['versus', 'state', 'union', 'india', 'others', 'another'].includes(w));
  return words.length > 0 && words.filter(w => docNorm.includes(` ${w} `)).length >= Math.ceil(words.length / 2);
};

const questionNotes = (nonexistent, sizes) => nonexistent.length ? `\nNOTE ON THE QUESTION
${nonexistent.map(c => /sub-section/.test(c.reason)
    ? `- The question refers to "${c.raw}", but ${c.reason} in the official text.`
    : `- The question refers to "${c.raw}", which does not exist: the ${c.act} has ${sizes[c.act] || 'fewer'} sections.`).join('\n')}
Tell the advocate this plainly. Never describe the contents of a provision that does not exist; point to the correct provision from SOURCES if the intended one is clear.\n` : '';

const buildSystemPrompt = ({ sources, regime, offenceDate, isCriminal, documentName, documentContext, oldCodesLoaded, notes = '' }) => `You are LawGPT, a legal research assistant for practising advocates in India. Accuracy matters more than length: a wrong section number or an invented authority can harm a client.

You are given SOURCES: the verbatim official text of statutory provisions relevant to the question.${documentName ? ` You are also given extracts of a document the advocate uploaded ("${documentName}"), marked DOCUMENT.` : ''}

CITATION RULES
1. Cite provisions from SOURCES in the form [BNS 318] or [BNSS 482(1)]. Cite a sub-section only if it appears in that source's text.
2. Do not give any section number of the BNS, BNSS or BSA that is not in SOURCES.
3. If the issue needs a provision from another statute that is not in SOURCES (for example the Negotiable Instruments Act, the Constitution, the CPC), you may name it with its section number only if you are certain, followed by "(not verified by Lexora)". Otherwise describe it without a number.
4. Never cite court judgments: no case names, no reporter citations (AIR, SCC, SCR, etc.), no "the Supreme Court held in…". You may state a settled legal principle without attributing it to a case. If the DOCUMENT itself cites a case, you may refer to it only as cited in the document.
5. State punishments, time limits and conditions exactly as they are written in SOURCES. Do not round, infer or add to them.
6. If SOURCES do not cover the question, say so plainly ("The provisions available to me do not address …") instead of guessing.
${isCriminal ? `\nOLD AND NEW CRIMINAL LAWS\n${regimeInstructions(regime, offenceDate, oldCodesLoaded)}\n` : ''}${notes}
ANSWER FORMAT
- Reply in the language the question is written in; keep citations in the [ACT N] form.
- Start with a direct answer in two or three sentences.
- Then, only as needed: Applicable provisions (explain each in your own words, quoting only the few key words that matter, never whole sub-sections), Analysis (apply the law to the facts given and note any missing facts), Procedure and next steps, Points to verify.
- Be as long as the question needs and no longer.
- Formatting: "## " for headings, "- " for bullets and **bold** only. Put quoted statutory words inline in double quotes; do not use ">" block quotes or horizontal rules.
- When a section has several sub-sections with different punishments, identify which sub-section fits the facts and say why.

SOURCES
${sources || '(none found)'}
${documentContext ? `\nDOCUMENT ("${documentName}") — relevant extracts\n${documentContext}` : ''}`;

const toCitedSections = verified => verified.map(c => ({
  section_number: `Section ${c.section}`,
  act_short: c.act,
  title: c.title
}));

const warningNote = v => {
  const lines = [];
  if (v.unverified.length) lines.push(`These citations could not be verified against the official text and may be wrong: ${v.unverified.map(c => c.raw).join('; ')}.`);
  if (v.caseLaw.length) lines.push(`This answer mentions case law, which Lexora cannot verify: ${v.caseLaw.join('; ')}. Check any judgment in an authoritative reporter before relying on it.`);
  return lines.length ? `\n\n⚠ Verification note: ${lines.join(' ')}` : '';
};

const answerQuestion = async ({ question, history = [], documentName = null, documentContext = '', model, location }) => {
  const understanding = await ctx.understand(question, history);
  const regime = ctx.lawRegime(understanding.offenceDate);
  const loaded = await ctx.getLoadedActs();
  const oldCodesLoaded = ['IPC', 'CrPC', 'IEA'].every(a => loaded.includes(a));

  // For criminal matters where old law may apply, always include the repeal and savings provisions
  const extra = understanding.isCriminal && regime !== 'new'
    ? [{ act: 'BNS', section: '358' }, { act: 'BNSS', section: '531' }, { act: 'BSA', section: '170' }]
    : [];
  const sources = await ctx.retrieve({
    question, queries: understanding.queries, mentioned: understanding.mentioned, extra, limit: 10
  });

  // Sections the question itself cites that don't exist (e.g. "Section 512 BNS") are flagged up front;
  // the answer may then mention them to say so, which is not a hallucination
  const questionCheck = await ctx.verifyCitations(question, []);
  const nonexistent = questionCheck.unverified;
  const echoKeys = new Set(nonexistent.map(c => `${c.act}|${c.section}`));
  const questionNorm = normalise(question);
  const isEcho = v => ({
    ...v,
    unverified: v.unverified.filter(c => !echoKeys.has(`${c.act}|${c.section}`)),
    caseLaw: v.caseLaw.filter(c => !caseAppearsIn(c, ` ${questionNorm} `))
  });
  const check = async text => { const v = isEcho(await ctx.verifyCitations(text, sources)); return { ...v, ok: !v.unverified.length && !v.caseLaw.length }; };

  const system = buildSystemPrompt({
    sources: ctx.formatSources(sources), regime, offenceDate: understanding.offenceDate,
    isCriminal: understanding.isCriminal, documentName, documentContext, oldCodesLoaded,
    notes: questionNotes(nonexistent, await ctx.getActSizes())
  });
  const messages = [...history.slice(-10).map(m => ({ role: m.role, content: m.content })), { role: 'user', content: question }];

  let reply = await llm.chat({ system, messages, maxTokens: 4000, temperature: 0.2, model, location });
  let verification = await check(reply);
  let repaired = false;

  // One repair pass: give the model the exact problems and ask for a corrected answer
  if (!verification.ok) {
    const problems = [
      ...verification.unverified.map(c => `- "${c.raw}": ${c.reason}`),
      ...verification.caseLaw.map(c => `- case law mentioned: "${c}"`)
    ].join('\n');
    reply = await llm.chat({
      system,
      messages: [...messages, { role: 'assistant', content: reply }, {
        role: 'user',
        content: `Your answer breaks the citation rules:\n${problems}\n\nRewrite the complete answer. Remove or correct each problem using only SOURCES, and do not mention any court cases. Do not mention this correction.`
      }],
      maxTokens: 4000, temperature: 0.1, model, location
    });
    verification = await check(reply);
    repaired = true;
  }

  return {
    reply: reply + warningNote(verification),
    cited_sections: toCitedSections(verification.verified),
    verification: {
      ok: verification.ok,
      repaired,
      unverified: verification.unverified,
      not_in_database: verification.notInDatabase,
      case_law: verification.caseLaw
    },
    sources: sources.map(s => `${s.act} ${s.section}`),
    understanding: { ...understanding, regime }
  };
};

// ── Document analysis ─────────────────────────────────────
// Cases and sections are legitimate here when the document itself contains them, so the
// check is: everything the analysis names must appear in the document or the verified statutes.


const analyseDocument = async ({ name, text, model, location }) => {
  const docCitations = ctx.extractCitations(text);
  const docKeys = new Set(docCitations.map(c => `${c.act}|${c.section.replace(/\(.*$/, '')}`));
  const understanding = await ctx.understand(`Legal issues in this document:\n${text.slice(0, 4000)}`);
  const sources = await ctx.retrieve({
    question: text.slice(0, 2000),
    queries: understanding.queries,
    mentioned: docCitations.filter(c => ['BNS', 'BNSS', 'BSA'].includes(c.act)).slice(0, 12),
    limit: 6
  });

  const system = `You are a legal analyst preparing a document brief for a practising advocate in India. Report what the document says, accurately; never add facts, parties, provisions or cases that are not in it.

RULES
1. Every party, date, provision and case you list must appear in the DOCUMENT. Copy case names and citations exactly as the document writes them.
2. If something is not in the document, write "Not stated in the document". Do not guess.
3. You may add your own observations only under "Research notes", and there cite statutory provisions only from SOURCES in the form [BNS 318]. Do not name any case in Research notes.
4. Where the document relies on the repealed IPC, CrPC or Evidence Act, you may note the corresponding new-code provision in Research notes if it is in SOURCES.
5. Formatting: "## " headings, "- " bullets, **bold** only.

Write these sections:
## Document overview (type, court or authority, parties and their roles, dates, a short summary)
## Issues raised (each issue and which party raised it)
## Provisions cited in the document (grouped by the party relying on them, with how each is used)
## Cases cited in the document (name and citation as written, which party cited it, the point it was cited for)
## Key arguments (each side)
## Findings and outcome
## Research notes (gaps, risks, points to verify)

SOURCES (official statute text, for Research notes only)
${ctx.formatSources(sources, 3000)}`;

  const analysis = await llm.chat({
    system,
    messages: [{ role: 'user', content: `DOCUMENT ("${name}"):\n${text}` }],
    maxTokens: 6000, temperature: 0.1, model, location
  });

  // Verify: statute citations must be in the document or the database; cases must be in the document
  const docNorm = ` ${normalise(text)} `;
  const v = await ctx.verifyCitations(analysis, sources);
  const notFromDocument = v.unverified.filter(c => !docKeys.has(`${c.act}|${c.section.replace(/\(.*$/, '')}`));
  const casesNotInDocument = v.caseLaw.filter(c => !caseAppearsIn(c, docNorm));

  const problems = [];
  if (notFromDocument.length) problems.push(`These provisions are not in the document and could not be verified: ${notFromDocument.map(c => c.raw).join('; ')}.`);
  if (casesNotInDocument.length) problems.push(`These cases do not appear in the uploaded document and may be inaccurate: ${casesNotInDocument.join('; ')}.`);

  return {
    analysis: analysis + (problems.length ? `\n\n⚠ Verification note: ${problems.join(' ')}` : ''),
    cited_sections: toCitedSections(v.verified),
    verification: { ok: !problems.length, unverified: notFromDocument, cases_not_in_document: casesNotInDocument }
  };
};

// ── Section suggestions (Generate page) ───────────────────
// The model may only pick from a numbered candidate list; picks are mapped back by number,
// so it cannot introduce a section that does not exist.

const supabase = require('../config/supabase');

const CATEGORY_TAGS = {
  'Criminal Law': 'criminal', 'Cyber Law': 'cyber', 'Taxation Law': 'taxation', 'Civil Litigation': 'civil',
  'Consumer Law': 'consumer', 'Divorce / Family Law': 'family', 'Property Law': 'property',
  'Corporate Law': 'corporate', 'Employment Law': 'employment', 'Startup Law': 'corporate',
  'Arbitration Law': 'civil', 'Intellectual Property Law': 'corporate'
};
const REPEALED = ['IPC', 'CrPC', 'IEA'];

const suggestSections = async ({ caseDescription, categoryName, documentTypeName, model, location }) => {
  const understanding = await ctx.understand(`${documentTypeName || ''} (${categoryName || ''}): ${caseDescription}`);
  const regime = ctx.lawRegime(understanding.offenceDate);
  let candidates = [];

  if (understanding.isCriminal) {
    const sections = await ctx.retrieve({ question: caseDescription, queries: understanding.queries, mentioned: understanding.mentioned, limit: 15 });
    candidates = sections.map(s => ({
      act: s.act, act_name: s.act_name, section: s.section, title: s.title, text: s.text,
      // Full operative text: punishments for aggravated forms often sit in later sub-sections
      summary: `${s.title}. ${ctx.stripIllustrations(s.text).replace(/\s+/g, ' ').slice(0, 2500)}`
    }));
  }
  // Acts without full text yet (civil, tax, etc.) come from the curated summaries table
  const tag = CATEGORY_TAGS[categoryName];
  if (tag) {
    const { data } = await supabase.from('legal_sections').select('section_number, act_name, act_short, description').overlaps('category_tags', [tag]).limit(150);
    for (const r of data || []) {
      if (REPEALED.includes(r.act_short) || ['BNS', 'BNSS', 'BSA'].includes(r.act_short)) continue; // covered by verified text
      candidates.push({ act: r.act_short, act_name: r.act_name, section: r.section_number.replace(/^Section\s+/i, ''), title: r.description, summary: r.description, text: null });
    }
  }
  if (!candidates.length) return { suggestions: [], regime };

  const list = candidates.map((c, i) => `${i + 1}. [${c.act} ${c.section}] ${c.summary}`).join('\n');
  let picked = [];
  try {
    const r = await llm.chatJSON({
      messages: [{
        role: 'user',
        content: `You are helping an Indian advocate choose statutory provisions for a ${documentTypeName || 'legal document'} (${categoryName || 'general'}).

FACTS
${caseDescription}

CANDIDATE PROVISIONS (choose only from these, by number)
${list}

Pick every candidate that genuinely applies to these facts, most important first, at most 8. Leave out provisions that are only loosely related.
Many sections define an offence in one sub-section and punish aggravated forms in later ones. For an offence, give the sub-section that prescribes the punishment matching these facts, not the definition (for example, cheating that induces the victim to hand over property is punished under a later sub-section than the one defining cheating). Read the candidate text to find it; give a sub-section only if it appears there.

Return JSON: {"selected": [{"n": <candidate number>, "subsection": "<e.g. 4, or empty>", "reason": "<one short sentence on why it applies>"}]}`
      }],
      maxTokens: 1200, temperature: 0, model, location
    });
    picked = Array.isArray(r.selected) ? r.selected : [];
  } catch (err) {
    console.error('suggestSections selection failed:', err.message);
  }

  const seen = new Set();
  const suggestions = [];
  for (const p of picked) {
    const c = candidates[Number(p.n) - 1];
    if (!c || seen.has(`${c.act}|${c.section}`)) continue;
    seen.add(`${c.act}|${c.section}`);
    const sub = String(p.subsection || '').replace(/[^\w]/g, '');
    const subOk = sub && c.text && new RegExp(`(^|\\n)\\s*\\(${sub}\\)`).test(c.text);
    suggestions.push({
      section_number: `Section ${c.section}${subOk ? `(${sub})` : ''}`,
      act_short: c.act,
      act_name: c.act_name,
      description: `${c.text ? c.title : c.summary}${p.reason ? ` — ${p.reason}` : ''}`,
      verified_text: !!c.text
    });
  }
  return { suggestions, regime };
};

// ── Draft review ──────────────────────────────────────────
// Quotations are checked against the drafts, so invented clause wording is caught.

const MAX_DRAFT_CHARS = 60000;

const quotesNotInDrafts = (review, drafts) => {
  const corpus = ` ${normalise(drafts.map(d => d.text).join(' '))} `;
  // Consume quotes in pairs first, then keep the long ones; filtering by length inside the
  // regex would let a short quote's closing mark pair with the next opening mark
  const quotes = [...review.matchAll(/“([^”]*)”|"([^"]*)"/g)]
    .map(m => m[1] ?? m[2])
    .filter(q => q.length >= 30 && q.length <= 400);
  return quotes.filter(q => {
    const words = normalise(q).trim().split(' ');
    // Allow elisions: check overlapping 6-word windows; most must appear verbatim
    const windows = [];
    for (let i = 0; i + 6 <= words.length; i += 3) windows.push(words.slice(i, i + 6).join(' '));
    if (!windows.length) return false;
    return windows.filter(w => corpus.includes(` ${w} `)).length / windows.length < 0.6;
  });
};

const reviewDrafts = async ({ drafts, model, location }) => {
  const draftBlocks = drafts.map((d, i) => `DRAFT ${i + 1}: "${d.name}"${d.truncated ? ' (long document: only the first part is included)' : ''}\n${d.text}`).join('\n\n========\n\n');

  const system = `You are a senior Indian advocate reviewing ${drafts.length} drafts of a document side by side for a colleague. Be precise and practical; every point must be traceable to the drafts.

RULES
1. When you refer to a clause, name the draft and clause number or heading, and quote its key words exactly in double quotes. Never paraphrase inside quotation marks.
2. Only describe what the drafts actually say. If a clause is missing, say "Draft 2 has no … clause".
3. Do not cite court judgments or case names.
4. Mention a statute only where it matters (for example, enforceability of a non-compete under the Indian Contract Act). Give a section number only if you are certain, followed by "(not verified by Lexora)".
5. Formatting: "## " headings, "- " bullets, **bold** only.

Write these sections:
## Overview (for each draft: document type, parties, governing law, jurisdiction, structure)
## Clause-by-clause comparison (the clauses that differ in substance: obligations, payment, liability, indemnity, termination, dispute resolution; which draft is stronger for whom, and why)
## Missing or weak protections (per draft)
## Risks and red flags (vague, one-sided or likely unenforceable wording, quoted)
## Drafting quality (clarity, definitions, consistency, structure; a score out of 10 for each draft with one line of reasons)
## Recommendation (the strongest draft and why; specific changes to make, including clauses to borrow from the other drafts)`;

  let review = await llm.chat({ system, messages: [{ role: 'user', content: draftBlocks }], maxTokens: 6000, temperature: 0.2, model, location });

  const v = await ctx.verifyCitations(review, []);
  const misquotes = quotesNotInDrafts(review, drafts);
  const notes = [];
  if (misquotes.length) notes.push(`These quotations could not be found in the drafts and may be paraphrased or inaccurate: ${misquotes.map(q => `"${q.slice(0, 80)}${q.length > 80 ? '…' : ''}"`).join('; ')}.`);
  if (v.caseLaw.length) notes.push(`This review mentions case law, which Lexora cannot verify: ${v.caseLaw.join('; ')}.`);
  if (v.unverified.length) notes.push(`These citations could not be verified: ${v.unverified.map(c => c.raw).join('; ')}.`);

  return {
    analysis: review + (notes.length ? `\n\n⚠ Verification note: ${notes.join(' ')}` : ''),
    verification: { ok: !notes.length, misquotes, case_law: v.caseLaw, unverified: v.unverified }
  };
};

module.exports = { answerQuestion, analyseDocument, suggestSections, reviewDrafts, MAX_DRAFT_CHARS, buildSystemPrompt };
