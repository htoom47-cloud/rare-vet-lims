/**
 * Parasitology PC agent — watches MIIImageView export folder and uploads to LIMS.
 *
 * Setup on the parasitology computer:
 *   1. Install Node.js 18+  https://nodejs.org
 *   2. Copy this folder to e.g. C:\RareVet\parasitology-agent
 *   3. npm install
 *   4. copy config.example.json → config.json and edit paths/credentials
 *   5. npm start
 *   6. Open http://localhost:3920 — enter sample barcode before saving images
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const chokidar = require('chokidar');

const ROOT = __dirname;
const CONFIG_PATH = path.join(ROOT, 'config.json');
const STATE_PATH = path.join(ROOT, 'state.json');

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)$/i;

const loadJson = (file, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
};

const saveJson = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');

let config = loadJson(CONFIG_PATH, null);
if (!config) {
  console.error('Missing config.json — copy config.example.json and edit it.');
  process.exit(1);
}

let state = loadJson(STATE_PATH, {
  sampleBarcode: '',
  panel: config.panel || 'blood',
  token: null,
  tokenAt: 0,
  log: [],
});

const log = (msg) => {
  const line = `[${new Date().toLocaleTimeString('ar-SA')}] ${msg}`;
  console.log(line);
  state.log = [line, ...(state.log || [])].slice(0, 50);
  saveJson(STATE_PATH, state);
};

const api = (config.apiUrl || '').replace(/\/$/, '');

const login = async () => {
  const age = Date.now() - (state.tokenAt || 0);
  if (state.token && age < 20 * 60 * 1000) return state.token;

  const res = await fetch(`${api}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: config.username, password: config.password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || 'Login failed');
  state.token = data.data.accessToken;
  state.tokenAt = Date.now();
  saveJson(STATE_PATH, state);
  return state.token;
};

const resolveSampleTestId = async (barcode, panel) => {
  const token = await login();
  const headers = { Authorization: `Bearer ${token}` };

  let sampleId;
  const scan = await fetch(`${api}/samples/scan/${encodeURIComponent(barcode)}`, { headers });
  const scanData = await scan.json();
  if (scan.ok && scanData.data?.id) {
    sampleId = scanData.data.id;
  } else {
    const search = await fetch(`${api}/samples?search=${encodeURIComponent(barcode)}&limit=5`, { headers });
    const searchData = await search.json();
    const rows = searchData.data?.samples || searchData.data || [];
    const hit = (Array.isArray(rows) ? rows : []).find((s) =>
      s.sample_code === barcode || String(s.sample_code || '').includes(barcode)
    );
    if (!hit) throw new Error(`Sample not found: ${barcode}`);
    sampleId = hit.id;
  }

  const det = await fetch(`${api}/samples/${sampleId}`, { headers });
  const detData = await det.json();
  if (!det.ok) throw new Error(detData?.error?.message || 'Sample load failed');

  const code = panel === 'stool' ? 'PARAS-STOOL' : 'PARAS-BLOOD';
  const st = (detData.data?.tests || []).find((t) => t.test_code === code);
  if (!st) throw new Error(`No ${code} test on this sample`);
  return { sampleTestId: st.id, sampleCode: detData.data.sample_code, testCode: st.test_code };
};

const uploadFile = async (filePath) => {
  if (!state.sampleBarcode?.trim()) {
    log(`تخطي (لم يُحدد رقم العينة): ${path.basename(filePath)}`);
    return;
  }

  const token = await login();
  const { sampleTestId, sampleCode } = await resolveSampleTestId(state.sampleBarcode.trim(), state.panel);

  const buffer = fs.readFileSync(filePath);
  const name = path.basename(filePath);
  const form = new FormData();
  form.append('image', new Blob([buffer]), name);

  const res = await fetch(`${api}/results/sample-test/${sampleTestId}/attachments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = {}; }
  if (!res.ok) throw new Error(data?.error?.message || `Upload failed ${res.status}`);

  log(`تم الرفع ✓ ${name} → ${sampleCode} (${state.panel})`);

  if (config.moveAfterUpload) {
    const destDir = path.join(config.watchDir, config.uploadedDir || 'uploaded');
    fs.mkdirSync(destDir, { recursive: true });
    const dest = path.join(destDir, `${Date.now()}-${name}`);
    fs.renameSync(filePath, dest);
  } else if (config.deleteAfterUpload) {
    fs.unlinkSync(filePath);
  }
};

const pending = new Map();

const queueUpload = (filePath) => {
  if (!IMAGE_EXT.test(filePath)) return;
  if (pending.has(filePath)) clearTimeout(pending.get(filePath));
  pending.set(filePath, setTimeout(async () => {
    pending.delete(filePath);
    try {
      await fs.promises.access(filePath);
      await uploadFile(filePath);
    } catch (err) {
      log(`خطأ: ${path.basename(filePath)} — ${err.message}`);
    }
  }, 2000));
};

const htmlPage = () => `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>وكيل طفيليات — Rare Vet LIMS</title>
  <style>
    body{font-family:Segoe UI,Tahoma,sans-serif;max-width:520px;margin:2rem auto;padding:0 1rem;background:#faf8f5}
    h1{font-size:1.25rem;color:#5c3d2e}
    label{display:block;margin:.75rem 0 .25rem;font-weight:600}
    input,select{width:100%;padding:.6rem;border:1px solid #ccc;border-radius:8px;font-size:1rem}
    button{margin-top:1rem;width:100%;padding:.75rem;background:#5c3d2e;color:#fff;border:none;border-radius:8px;font-size:1rem;cursor:pointer}
    .box{background:#fff;border:1px solid #e8dfd6;border-radius:10px;padding:1rem;margin-top:1rem}
    .muted{color:#666;font-size:.85rem}
    .log{font-size:.8rem;white-space:pre-wrap;max-height:200px;overflow:auto;background:#f3f3f3;padding:.5rem;border-radius:6px}
    .ok{color:#15803d}
  </style>
</head>
<body>
  <h1>ربط مجهر الطفيليات</h1>
  <p class="muted">افتح هذه الصفحة على كمبيوتر المجهر. أدخل رقم العينة قبل حفظ الصورة من MIIImageView.</p>
  <form method="POST" action="/set">
    <label>رقم العينة (الباركود)</label>
    <input name="barcode" value="${state.sampleBarcode || ''}" placeholder="SMP-260623-022279" autofocus/>
    <label>نوع الفحص</label>
    <select name="panel">
      <option value="blood" ${state.panel === 'blood' ? 'selected' : ''}>طفيليات الدم</option>
      <option value="stool" ${state.panel === 'stool' ? 'selected' : ''}>طفيليات البراز</option>
    </select>
    <button type="submit">حفظ — جاهز لاستقبال الصور</button>
  </form>
  <div class="box">
    <p><b>مجلد المراقبة:</b><br/><span class="muted">${config.watchDir}</span></p>
    <p class="ok">${state.sampleBarcode ? `العينة الحالية: ${state.sampleBarcode} (${state.panel === 'stool' ? 'براز' : 'دم'})` : 'لم تُحدد عينة بعد'}</p>
  </div>
  <div class="box">
    <b>آخر الأحداث</b>
    <div class="log">${(state.log || []).join('\n') || '—'}</div>
  </div>
</body>
</html>`;

const startUi = () => {
  const port = config.localPort || 3920;
  const server = http.createServer(async (req, res) => {
    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(htmlPage());
      return;
    }
    if (req.method === 'POST' && req.url === '/set') {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const body = Buffer.concat(chunks).toString();
        const params = new URLSearchParams(body);
        state.sampleBarcode = (params.get('barcode') || '').trim();
        state.panel = params.get('panel') === 'stool' ? 'stool' : 'blood';
        saveJson(STATE_PATH, state);
        log(`عينة محددة: ${state.sampleBarcode || '(فارغ)'} — ${state.panel}`);
        res.writeHead(302, { Location: '/' });
        res.end();
      });
      return;
    }
    res.writeHead(404);
    res.end('Not found');
  });
  server.listen(port, '127.0.0.1', () => {
    log(`واجهة التحكم: http://localhost:${port}`);
  });
};

const startWatcher = () => {
  const dir = config.watchDir;
  if (!fs.existsSync(dir)) {
    console.error(`Watch folder not found: ${dir}`);
    console.error('Edit watchDir in config.json to MIIImageView save path.');
    process.exit(1);
  }
  chokidar.watch(dir, {
    ignored: [
      /(^|[\\/])\../,
      new RegExp(`${config.uploadedDir || 'uploaded'}`),
    ],
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 1500, pollInterval: 200 },
  })
    .on('add', queueUpload)
    .on('change', queueUpload);
  log(`مراقبة المجلد: ${dir}`);
};

log('تشغيل وكيل طفيليات Rare Vet LIMS');
log(`السيرفر: ${api}`);
startUi();
startWatcher();
