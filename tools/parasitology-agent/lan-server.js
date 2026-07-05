const http = require('http');
const fs = require('fs');
const path = require('path');
const root = __dirname;
const port = 8765;
const host = '192.168.1.102';

const types = { '.zip': 'application/zip', '.bat': 'application/octet-stream', '.js': 'text/javascript', '.json': 'application/json' };

http.createServer((req, res) => {
  const file = path.join(root, decodeURIComponent(req.url.split('?')[0].replace(/^\//, '')) || 'parasitology-agent.zip');
  if (!file.startsWith(root)) { res.writeHead(403); return res.end('Forbidden'); }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
  const ext = path.extname(file);
  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(port, host, () => console.log(`LAN server: http://${host}:${port}/parasitology-agent.zip`));
