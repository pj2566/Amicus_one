// Loads parsed sections and their embedded chunks into statute_sections / statute_chunks.
// Re-runnable: replaces each Act's rows in one transaction.
//
// Usage: node scripts/statutes/load.js <chunks.json from embed.js> data/statutes/bns.json [more.json ...]

require('dotenv').config({ quiet: true });
const fs = require('fs');
const { Client } = require('pg');

const ACTS = {
  BNS:  { name: 'Bharatiya Nyaya Sanhita, 2023',            from: '2024-07-01', until: null, source: 'Gazette of India, CG-DL-E-25122023-250883 (Act 45 of 2023)' },
  BNSS: { name: 'Bharatiya Nagarik Suraksha Sanhita, 2023', from: '2024-07-01', until: null, source: 'Gazette of India, CG-DL-E-25122023-250884 (Act 46 of 2023)' },
  BSA:  { name: 'Bharatiya Sakshya Adhiniyam, 2023',        from: '2024-07-01', until: null, source: 'Gazette of India, CG-DL-E-25122023-250882 (Act 47 of 2023)' },
  IPC:  { name: 'Indian Penal Code, 1860',                  from: null, until: '2024-06-30', source: 'India Code (Act 45 of 1860, as amended)' },
  CrPC: { name: 'Code of Criminal Procedure, 1973',         from: null, until: '2024-06-30', source: 'India Code (Act 2 of 1974, as amended)' },
  IEA:  { name: 'Indian Evidence Act, 1872',                from: null, until: '2024-06-30', source: 'India Code (Act 1 of 1872, as amended)' }
};

const [chunksPath, ...sectionFiles] = process.argv.slice(2);

(async () => {
  const chunks = JSON.parse(fs.readFileSync(chunksPath, 'utf8'));
  const sections = sectionFiles.flatMap(f => JSON.parse(fs.readFileSync(f, 'utf8')));
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  for (const act of [...new Set(sections.map(s => s.act))]) {
    const meta = ACTS[act];
    if (!meta) throw new Error(`Unknown act ${act}`);
    const actSections = sections.filter(s => s.act === act);
    const actChunks = chunks.filter(c => c.act === act);

    await client.query('begin');
    await client.query('delete from public.statute_sections where act = $1', [act]);

    const ids = {};
    for (const s of actSections) {
      const r = await client.query(
        `insert into public.statute_sections (act, act_name, section, title, chapter, chapter_title, text, in_force_from, in_force_until, source)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
        [act, meta.name, s.section, s.title || s.section, s.chapter, s.chapter_title, s.text, meta.from, meta.until, meta.source]
      );
      ids[s.section] = r.rows[0].id;
    }

    // Batch chunk inserts (embeddings are large; 50 rows per statement)
    for (let i = 0; i < actChunks.length; i += 50) {
      const batch = actChunks.slice(i, i + 50);
      const values = [], params = [];
      batch.forEach((c, j) => {
        if (!ids[c.section]) throw new Error(`Chunk for unknown section ${act} ${c.section}`);
        params.push(ids[c.section], c.chunk_index, c.content, `[${c.embedding.join(',')}]`);
        values.push(`($${j * 4 + 1}, $${j * 4 + 2}, $${j * 4 + 3}, $${j * 4 + 4}::extensions.vector)`);
      });
      await client.query(`insert into public.statute_chunks (section_id, chunk_index, content, embedding) values ${values.join(',')}`, params);
    }
    await client.query('commit');
    console.log(`${act}: ${actSections.length} sections, ${actChunks.length} chunks`);
  }
  await client.end();
})().catch(e => { console.error(e.message); process.exit(1); });
