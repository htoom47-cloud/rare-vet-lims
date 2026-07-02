/** Serve zebra bridge install files to reception PC on LAN */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PORT = Number(process.env.ZEBRA_DEPLOY_PORT || 8766);
const ROOT = __dirname;
const ZIP = path.join(ROOT, 'reception-zebra.zip');

const FILES = [
  'zebra-local-bridge.js',
  'send-zebra-raw.ps1',
  'generate-bridge-cert.ps1',
  'trust-bridge-cert.ps1',
  'sample-label-cbc.zpl',
  'install-reception-zebra.ps1',
  'INSTALL-RECEPTION-ZEBRA.bat',
  'INSTALL-FROM-LAB-NETWORK.bat',
  'sample-label-cbc.zpl',
  'deploy-index.html',
];

function buildZip() {
  if (process.platform !== 'win32') return;
  const list = FILES.filter((f) => fs.existsSync(path.join(ROOT, f))).map((f) => `'${f}'`).join(',');
  const ps = `Compress-Archive -Force -Path ${list} -DestinationPath '${ZIP}'`;
  execSync(`powershell -NoProfile -Command "${ps}"`, { cwd: ROOT, stdio: 'inherit' });
}

buildZip();

const types = {
  '.zip': 'application/zip',
  '.bat': 'application/octet-stream',
  '.ps1': 'application/octet-stream',
  '.js': 'application/javascript',
  '.zpl': 'text/plain',
};

http.createServer((req, res) => {
  const rawPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (rawPath === '/' || rawPath === '/index.html') {
    const index = path.join(ROOT, 'deploy-index.html');
    if (fs.existsSync(index)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      fs.createReadStream(index).pipe(res);
      return;
    }
  }

  const name = rawPath.replace(/^\//, '') || 'reception-zebra.zip';
  const safe = path.basename(name);
  const file = path.join(ROOT, safe);
  if (!fs.existsSync(file)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, '0.0.0.0', () => {
  console.log(`Zebra deploy server: http://192.168.1.102:${PORT}/reception-zebra.zip`);
  console.log('On reception PC run: \\\\192.168.1.102 or INSTALL-FROM-LAB-NETWORK.bat');
});
