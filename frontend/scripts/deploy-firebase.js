// Deploys frontend/build to Firebase Hosting through the Hosting REST API
// (the same steps firebase-tools performs), using a gcloud access token.
//
// Usage (from frontend/): npm run build && \
//   TOKEN=$(gcloud auth print-access-token --account=communication@jityai.com) node scripts/deploy-firebase.js

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const BUILD = path.join(ROOT, 'build');
const SITE = process.env.SITE || JSON.parse(fs.readFileSync(path.join(ROOT, '..', '.firebaserc'), 'utf8')).projects.default;
const TOKEN = process.env.TOKEN;
const API = 'https://firebasehosting.googleapis.com/v1beta1';
const headers = { Authorization: `Bearer ${TOKEN}`, 'x-goog-user-project': SITE, 'Content-Type': 'application/json' };

const request = async (method, url, body) => {
  const r = await fetch(url, { method, headers, body: body && JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${url} → ${r.status} ${JSON.stringify(j).slice(0, 300)}`);
  return j;
};

const walk = dir => fs.readdirSync(dir, { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);

(async () => {
  if (!TOKEN) throw new Error('Set TOKEN to a gcloud access token');
  if (!fs.existsSync(BUILD)) throw new Error('Run npm run build first');

  const hosting = JSON.parse(fs.readFileSync(path.join(ROOT, '..', 'firebase.json'), 'utf8')).hosting;
  const version = await request('POST', `${API}/sites/${SITE}/versions`, {
    config: {
      rewrites: hosting.rewrites.map(r => ({ glob: r.source, path: r.destination })),
      headers: hosting.headers.map(h => ({ glob: h.source, headers: Object.fromEntries(h.headers.map(x => [x.key, x.value])) }))
    }
  });

  // Files are uploaded gzipped and addressed by the SHA-256 of the gzipped bytes
  const files = {}, blobs = {};
  for (const file of walk(BUILD).filter(f => !f.endsWith('.map'))) {
    const gz = zlib.gzipSync(fs.readFileSync(file), { level: 9 });
    const hash = crypto.createHash('sha256').update(gz).digest('hex');
    files['/' + path.relative(BUILD, file).split(path.sep).join('/')] = hash;
    blobs[hash] = gz;
  }

  const populated = await request('POST', `${API}/${version.name}:populateFiles`, { files });
  for (const hash of populated.uploadRequiredHashes || []) {
    const r = await fetch(`${populated.uploadUrl}/${hash}`, {
      method: 'POST',
      headers: { Authorization: headers.Authorization, 'x-goog-user-project': SITE, 'Content-Type': 'application/octet-stream' },
      body: blobs[hash]
    });
    if (!r.ok) throw new Error(`upload ${hash} → ${r.status}`);
  }

  await request('PATCH', `${API}/${version.name}?update_mask=status`, { status: 'FINALIZED' });
  const release = await request('POST', `${API}/sites/${SITE}/releases?versionName=${version.name}`, { message: 'Deploy' });
  console.log(`${Object.keys(files).length} files, ${(populated.uploadRequiredHashes || []).length} uploaded → https://${SITE}.web.app (${release.name})`);
})().catch(e => { console.error('Deploy failed:', e.message); process.exit(1); });
