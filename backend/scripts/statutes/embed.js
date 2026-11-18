// Splits parsed statute sections into search chunks and embeds them with Vertex AI.
// Auth: ACCESS_TOKEN env var if set, otherwise Application Default Credentials.
//
// Usage: node embed.js <out.json> data/statutes/bns.json [more.json ...]

const fs = require('fs');
const { GoogleAuth } = require('google-auth-library');

const [outPath, ...inputs] = process.argv.slice(2);
const PROJECT = process.env.GOOGLE_CLOUD_PROJECT || 'jityai-507114';
const LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'asia-south1';
const MODEL = process.env.EMBEDDING_MODEL || 'gemini-embedding-001';
const MAX_CHARS = 1800;
const CONCURRENCY = 6;

const getToken = async () => process.env.ACCESS_TOKEN ||
  (await new GoogleAuth({ scopes: 'https://www.googleapis.com/auth/cloud-platform' }).getAccessToken());

// Split on paragraph boundaries; every chunk carries the section header so it stands alone
const chunkSection = s => {
  const header = `${s.act} Section ${s.section} — ${s.title}${s.chapter_title ? ` (Chapter ${s.chapter}: ${s.chapter_title})` : ''}`;
  const paras = s.text.split('\n');
  const chunks = [];
  let cur = '';
  for (const p of paras) {
    if (cur && cur.length + p.length + 1 > MAX_CHARS) { chunks.push(cur); cur = ''; }
    cur += (cur ? '\n' : '') + p;
    while (cur.length > MAX_CHARS * 1.5) { chunks.push(cur.slice(0, MAX_CHARS)); cur = cur.slice(MAX_CHARS); }
  }
  if (cur) chunks.push(cur);
  return chunks.map((c, i) => ({ act: s.act, section: s.section, chunk_index: i, content: `${header}\n${c}` }));
};

const embed = async (token, text) => {
  const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/${LOCATION}/publishers/google/models/${MODEL}:predict`;
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ instances: [{ content: text, task_type: 'RETRIEVAL_DOCUMENT' }], parameters: { outputDimensionality: 768 } })
    });
    if (r.status === 429 || r.status >= 500) { await new Promise(res => setTimeout(res, 2000 * (attempt + 1))); continue; }
    const j = await r.json();
    if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(j).slice(0, 200)}`);
    return j.predictions[0].embeddings.values;
  }
  throw new Error('embedding failed after retries');
};

(async () => {
  const sections = inputs.flatMap(f => JSON.parse(fs.readFileSync(f, 'utf8')));
  const chunks = sections.flatMap(chunkSection);
  console.log(`${sections.length} sections → ${chunks.length} chunks`);

  const token = await getToken();
  let next = 0, done = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < chunks.length) {
      const c = chunks[next++];
      c.embedding = await embed(token, c.content);
      if (++done % 200 === 0) console.log(`  ${done}/${chunks.length}`);
    }
  }));
  fs.writeFileSync(outPath, JSON.stringify(chunks));
  console.log(`wrote ${chunks.length} embedded chunks → ${outPath}`);
})().catch(e => { console.error(e.message); process.exit(1); });
