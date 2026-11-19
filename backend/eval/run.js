// Runs the LawGPT and section-suggestion evaluation against the real pipeline.
//
// Usage: node eval/run.js [--model gemini-3.5-flash] [--location asia-south1] [--only id-or-cat] [--concurrency 4]
// Local auth: GOOGLE_ACCESS_TOKEN=$(gcloud auth print-access-token) or ADC.

require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const { answerQuestion, suggestSections } = require('../lib/research');
const { extractCitations } = require('../lib/legalContext');

const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : def; };
const model = arg('model', process.env.GEMINI_MODEL || 'gemini-3.5-flash');
const location = arg('location', process.env.GOOGLE_CLOUD_LOCATION || 'asia-south1');
const only = arg('only', null);
const concurrency = Number(arg('concurrency', 4));

const cases = JSON.parse(fs.readFileSync(path.join(__dirname, 'cases.json'), 'utf8'));
const key = c => `${c.act} ${String(c.section).replace(/\(.*$/, '')}`;
const pick = list => list.filter(c => !only || c.id === only || c.cat === only || (c.id || '').startsWith(only));

const runPool = async (items, fn) => {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]); }
  }));
  return out;
};

const scoreLawgpt = async c => {
  const t = Date.now();
  let r;
  try {
    r = await answerQuestion({ question: c.q, model, location });
  } catch (err) {
    return { id: c.id, cat: c.cat, pass: false, hallucination: false, error: err.message, failures: ['error: ' + err.message] };
  }
  const reply = r.reply;
  const verified = new Set(r.cited_sections.map(s => `${s.act_short} ${s.section_number.replace(/^Section\s+/, '').replace(/\(.*$/, '')}`));
  const allCited = new Set(extractCitations(reply).map(key));
  const failures = [];

  for (const group of c.must_cite || []) {
    if (!group.some(s => verified.has(s))) failures.push(`missing citation: ${group.join(' or ')}`);
  }
  // Echoing a non-existent section from the question to correct it is fine; presenting it as verified is not
  for (const s of c.must_not_cite || []) if (verified.has(s)) failures.push(`cited non-existent/forbidden ${s}`);
  for (const re of c.must_match || []) if (!new RegExp(re, 'is').test(reply)) failures.push(`missing pattern /${re}/`);
  for (const re of c.must_not_match || []) if (new RegExp(re, 'is').test(reply)) failures.push(`forbidden pattern /${re}/`);
  if (c.regime && r.understanding.regime !== c.regime) failures.push(`regime ${r.understanding.regime}, expected ${c.regime}`);

  const unverified = r.verification.unverified || [];
  const caseLaw = c.allow_case_mention ? [] : (r.verification.case_law || []);
  const forbiddenHit = (c.must_not_cite || []).some(s => verified.has(s));
  const hallucination = unverified.length > 0 || caseLaw.length > 0 || forbiddenHit;
  if (unverified.length) failures.push(`unverified: ${unverified.map(u => u.raw).join('; ')}`);
  if (caseLaw.length) failures.push(`case law: ${caseLaw.join('; ')}`);

  return {
    id: c.id, cat: c.cat, q: c.q, pass: failures.length === 0, hallucination, failures,
    repaired: r.verification.repaired, ms: Date.now() - t, regime: r.understanding.regime,
    sources: r.sources, cited: [...verified], reply
  };
};

const scoreSuggestion = async c => {
  const t = Date.now();
  try {
    const r = await suggestSections({ caseDescription: c.facts, categoryName: c.category, documentTypeName: c.doc, model, location });
    const got = new Set(r.suggestions.map(s => `${s.act_short} ${s.section_number.replace(/^Section\s+/, '').replace(/\(.*$/, '')}`));
    const failures = c.must_include.filter(s => !got.has(s)).map(s => `missing ${s}`);
    return { id: c.id, cat: 'suggestion', pass: !failures.length, hallucination: false, failures, ms: Date.now() - t,
      suggestions: r.suggestions.map(s => `${s.act_short} ${s.section_number.replace(/^Section\s+/, '')}`) };
  } catch (err) {
    return { id: c.id, cat: 'suggestion', pass: false, hallucination: false, failures: ['error: ' + err.message] };
  }
};

(async () => {
  console.log(`Model ${model} @ ${location}\n`);
  const lawgpt = await runPool(pick(cases.lawgpt), scoreLawgpt);
  const suggestions = await runPool(pick(cases.suggestions), scoreSuggestion);
  const all = [...lawgpt, ...suggestions];

  for (const r of all) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'}${r.hallucination ? ' ⚠HALLUCINATION' : ''}  ${r.cat.padEnd(14)} ${r.id.padEnd(20)} ${r.ms ? `${(r.ms / 1000).toFixed(1)}s` : ''}${r.repaired ? ' (repaired)' : ''}`);
    for (const f of r.failures) console.log(`        - ${f}`);
  }

  const byCat = {};
  for (const r of all) { byCat[r.cat] = byCat[r.cat] || { pass: 0, total: 0 }; byCat[r.cat].total++; if (r.pass) byCat[r.cat].pass++; }
  const passed = all.filter(r => r.pass).length;
  const halluc = all.filter(r => r.hallucination).length;
  const times = lawgpt.filter(r => r.ms).map(r => r.ms).sort((a, b) => a - b);
  console.log('\nBy category:');
  for (const [cat, s] of Object.entries(byCat)) console.log(`  ${cat.padEnd(14)} ${s.pass}/${s.total}`);
  console.log(`\nTOTAL ${passed}/${all.length} passed | hallucinations: ${halluc} | repaired: ${lawgpt.filter(r => r.repaired).length} | median ${(times[times.length >> 1] / 1000 || 0).toFixed(1)}s, p90 ${(times[Math.floor(times.length * 0.9)] / 1000 || 0).toFixed(1)}s`);

  const outDir = path.join(__dirname, 'results');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${model}.json`);
  fs.writeFileSync(outFile, JSON.stringify({ model, location, passed, total: all.length, hallucinations: halluc, results: all }, null, 1));
  console.log(`Saved ${outFile}`);
})();
