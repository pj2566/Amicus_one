// Grounding for legal answers: understand the question, retrieve official statute text,
// and verify every section the model cites against the database.

const supabase = require('../config/supabase');
const llm = require('./llm');

const NEW_CODES_FROM = '2024-07-01';

// How each Act may be written in questions and answers
const ACT_ALIASES = {
  BNSS: ['BNSS', 'Bharatiya Nagarik Suraksha Sanhita'],
  BNS: ['BNS', 'Bharatiya Nyaya Sanhita'],
  BSA: ['BSA', 'Bharatiya Sakshya Adhiniyam'],
  CrPC: ['CrPC', 'Cr\\.P\\.C\\.?', 'Code of Criminal Procedure'],
  IPC: ['IPC', 'I\\.P\\.C\\.?', 'Indian Penal Code'],
  IEA: ['IEA', 'Indian Evidence Act', 'Evidence Act']
};
const ACT_PATTERN = Object.values(ACT_ALIASES).flat().join('|');
const actFromAlias = raw => {
  const s = raw.replace(/\s+/g, ' ').trim();
  return Object.keys(ACT_ALIASES).find(act => ACT_ALIASES[act].some(a => new RegExp(`^${a}$`, 'i').test(s)));
};

// Acts that actually have verified text loaded, with their highest section number (refreshed every 10 minutes)
let loadedActs = { at: 0, acts: [], sizes: {} };
const refreshLoadedActs = async () => {
  if (Date.now() - loadedActs.at < 10 * 60 * 1000) return loadedActs;
  const { data } = await supabase.from('statute_sections').select('act, section').limit(5000);
  const sizes = {};
  for (const r of data || []) {
    const n = parseInt(r.section, 10);
    if (!Number.isNaN(n)) sizes[r.act] = Math.max(sizes[r.act] || 0, n);
  }
  loadedActs = { at: Date.now(), acts: Object.keys(sizes), sizes };
  return loadedActs;
};
const getLoadedActs = async () => (await refreshLoadedActs()).acts;
const getActSizes = async () => (await refreshLoadedActs()).sizes;

// ── 1. Understand ─────────────────────────────────────────
const understand = async (question, history = []) => {
  const recent = history.filter(m => m.role === 'user').slice(-2).map(m => m.content).join('\n');
  try {
    const r = await llm.chatJSON({
      messages: [{
        role: 'user',
        content: `You prepare searches over Indian statutes (BNS, BNSS, BSA and the repealed IPC, CrPC, Evidence Act).
${recent ? `Earlier messages in this conversation (for context only):\n${recent}\n\n` : ''}Current question:
${question}

Return JSON with exactly these keys:
- "search_queries": 3 short queries phrased the way statute text is written (legal terms, e.g. "dishonestly induces delivery of property"), in English even if the question is in another language
- "mentioned_sections": sections the question explicitly names, as [{"act": "BNS|BNSS|BSA|IPC|CrPC|IEA", "section": "318"}]; [] if none
- "offence_date": date of the offence/incident if stated, as "YYYY-MM-DD" (use the 1st of the month/year if only partly given), else null
- "is_criminal": true if the question involves a criminal offence, criminal procedure or criminal evidence`
      }],
      maxTokens: 400,
      temperature: 0
    });
    return {
      queries: Array.isArray(r.search_queries) ? r.search_queries.slice(0, 4) : [],
      mentioned: Array.isArray(r.mentioned_sections) ? r.mentioned_sections : [],
      offenceDate: /^\d{4}-\d{2}-\d{2}$/.test(r.offence_date || '') ? r.offence_date : null,
      isCriminal: !!r.is_criminal
    };
  } catch (err) {
    console.error('understand() failed, falling back to raw question:', err.message);
    return { queries: [], mentioned: [], offenceDate: null, isCriminal: true };
  }
};

const lawRegime = offenceDate => !offenceDate ? 'unknown' : offenceDate < NEW_CODES_FROM ? 'old' : 'new';

// ── 2. Retrieve ───────────────────────────────────────────
const baseSection = s => String(s).trim().replace(/\(.*$/, '').toUpperCase();

const STOPWORDS = new Set('a an the and or of to in on for by with from at as is are was were be been his her their its this that which who whom what when where why how can may shall will under section act any such other than not'.split(' '));
// OR-query of the meaningful words, safe for to_tsquery (letters and digits only)
const toTsQuery = text => {
  const words = [...new Set(text.toLowerCase().match(/[a-z]{3,}/g) || [])].filter(w => !STOPWORDS.has(w)).slice(0, 12);
  return words.length ? words.join(' | ') : null;
};

const RRF_K = 60;

const retrieve = async ({ question, queries = [], mentioned = [], acts = null, limit = 10, extra = [] }) => {
  const searches = [question, ...queries].filter(Boolean).slice(0, 5);

  // Semantic search per query, plus keyword search per query (titles weigh most)
  const semantic = searches.map(async q => {
    const embedding = await llm.embed(q.slice(0, 2000));
    const { data, error } = await supabase.rpc('match_statute_chunks', {
      query_embedding: `[${embedding.join(',')}]`, match_count: 20, filter_acts: acts
    });
    if (error) throw new Error('statute search failed: ' + error.message);
    // One entry per section, best chunk first
    const seen = new Set();
    return (data || []).filter(r => !seen.has(r.section_id) && seen.add(r.section_id)).map(r => r.section_id);
  });
  const keyword = searches.map(async q => {
    const tsq = toTsQuery(q);
    if (!tsq) return [];
    const { data, error } = await supabase.rpc('search_statute_text', { query: tsq, match_count: 15, filter_acts: acts });
    if (error) throw new Error('statute keyword search failed: ' + error.message);
    // Long schedules match almost any words; they are reachable through semantic search instead
    return (data || []).filter(r => !r.section.startsWith('Schedule')).map(r => r.section_id);
  });

  // Reciprocal rank fusion: robust to the different score scales of the two methods
  const scores = {};
  const lists = await Promise.all([...semantic, ...keyword]);
  lists.forEach((ids, li) => {
    const weight = li < semantic.length ? 1 : 0.8;
    ids.forEach((id, rank) => { scores[id] = (scores[id] || 0) + weight / (RRF_K + rank + 1); });
  });

  // Sections named explicitly (by the user, or required context) always go in, ranked first
  const pinned = [...mentioned, ...extra];
  for (const m of pinned) {
    const act = actFromAlias(m.act || '') || m.act;
    const { data } = await supabase.from('statute_sections').select('id').eq('act', act).eq('section', baseSection(m.section)).maybeSingle();
    if (data) scores[data.id] = 1;
  }

  const ids = Object.entries(scores).sort((a, b) => b[1] - a[1]).slice(0, limit + pinned.length).map(([id]) => id);
  if (!ids.length) return [];
  const { data: rows } = await supabase
    .from('statute_sections')
    .select('id, act, act_name, section, title, chapter_title, text, in_force_from, in_force_until')
    .in('id', ids);
  return ids.map(id => rows.find(r => r.id === id)).filter(Boolean).map(r => ({ ...r, score: scores[r.id] }));
};

// Illustrations can be long and push operative sub-sections (e.g. BNS 318(4)) past the limit,
// so they are dropped first; only then is the text truncated, with a visible marker.
const stripIllustrations = t => t.replace(/\n(Illustrations?\.)[\s\S]*?(?=\n\(\d+\)|\nExplanation|$)/g, '\n[Illustrations omitted]');

const formatSources = (sections, maxChars = 7000) => sections.map(s => {
  let text = s.text.length > maxChars ? stripIllustrations(s.text) : s.text;
  if (text.length > maxChars) text = text.slice(0, maxChars) + ' …[text truncated]';
  const status = s.in_force_until ? `repealed; applied until ${s.in_force_until}` : `in force from ${s.in_force_from}`;
  return `SOURCE [${s.act} ${s.section}] ${s.act_name} — Section ${s.section}: ${s.title} (${status})\n${text}`;
}).join('\n\n');

// ── 3. Verify ─────────────────────────────────────────────
const NUM = String.raw`\d{1,3}[A-Z]{0,2}(?:\s?\([0-9a-zA-Z]{1,4}\))*`;
const NUM_LIST = String.raw`${NUM}(?:\s*(?:,|and|&|or|to|\/)\s*${NUM})*`;
const CITATION_PATTERNS = [
  // Section 318(4) of the BNS / Sections 318 and 319, BNS / u/s 35 BNSS
  new RegExp(String.raw`\b(?:sections?|secs?\.?|ss?\.|u\/s\.?)\s*(${NUM_LIST})\s*,?\s*(?:of\s+(?:the\s+)?)?(${ACT_PATTERN})\b`, 'gi'),
  // BNS Section 318 / [BNS 318(4)] / BNSS s. 482
  new RegExp(String.raw`\b(${ACT_PATTERN})\s*,?\s*(?:sections?|secs?\.?|ss?\.)?\s*(${NUM_LIST})(?![\d])`, 'gi'),
  // 318(4) BNS
  new RegExp(String.raw`\b(${NUM})\s+(${ACT_PATTERN})\b`, 'gi')
];
const CASE_LAW_PATTERNS = [
  /\b[A-Z][A-Za-z.&']+(?:\s+[A-Z][A-Za-z.&']+){0,6}\s+(?:v\.|vs\.?|versus)\s+(?:the\s+)?[A-Z][A-Za-z.&']+(?:\s+(?:of\s+)?[A-Z][A-Za-z.&']+){0,6}/g,
  /\(\d{4}\)\s*\d+\s*SCC\s*\d+/g,
  /\b\d{4}\s*SCC\s*OnLine\s*[A-Z]+\s*\d+/g,
  /\bAIR\s*\d{4}\s*[A-Z][A-Za-z]*\s*\d+/g,
  /\b\d{4}\s*\(\d+\)\s*SCC\s*\d+/g
];

const extractCitations = text => {
  const found = [];
  for (const [i, re] of CITATION_PATTERNS.entries()) {
    for (const m of text.matchAll(re)) {
      const [numbers, actRaw] = i === 0 || i === 2 ? [m[1], m[2]] : [m[2], m[1]];
      const act = actFromAlias(actRaw);
      if (!act) continue;
      for (const n of numbers.match(new RegExp(NUM, 'g')) || []) {
        found.push({ act, section: n.replace(/\s+/g, ''), raw: m[0].trim() });
      }
    }
  }
  const seen = new Set();
  return found.filter(c => { const k = `${c.act}|${c.section}`; if (seen.has(k)) return false; seen.add(k); return true; });
};

const verifyCitations = async (text, sources = []) => {
  const citations = extractCitations(text);
  const loaded = await getLoadedActs();
  const sourceKeys = new Set(sources.map(s => `${s.act}|${s.section}`));
  const verified = [], unverified = [], notInDatabase = [];

  const byAct = {};
  citations.forEach(c => (byAct[c.act] = byAct[c.act] || []).push(c));
  for (const [act, list] of Object.entries(byAct)) {
    if (!loaded.includes(act)) { notInDatabase.push(...list); continue; }
    const { data } = await supabase.from('statute_sections').select('section, title, text').eq('act', act).in('section', [...new Set(list.map(c => baseSection(c.section)))]);
    for (const c of list) {
      const row = (data || []).find(r => r.section === baseSection(c.section));
      // A cited sub-section like 318(4) must appear as "(4)" at the start of a line in the official text
      const sub = (c.section.match(/^\d+[A-Z]*\((\w+)\)/) || [])[1];
      const subOk = !sub || new RegExp(`(^|\\n)\\s*\\(${sub}\\)`).test(row?.text || '');
      if (row && subOk) verified.push({ ...c, title: row.title, inSources: sourceKeys.has(`${act}|${baseSection(c.section)}`) });
      else unverified.push({ ...c, reason: row ? `sub-section (${sub}) not found in ${act} ${row.section}` : `no ${act} section ${baseSection(c.section)}` });
    }
  }

  const caseLaw = [...new Set(CASE_LAW_PATTERNS.flatMap(re => text.match(re) || []))];
  return { verified, unverified, notInDatabase, caseLaw, ok: !unverified.length && !caseLaw.length };
};

module.exports = { NEW_CODES_FROM, understand, lawRegime, retrieve, formatSources, stripIllustrations, extractCitations, verifyCitations, getLoadedActs, getActSizes };
