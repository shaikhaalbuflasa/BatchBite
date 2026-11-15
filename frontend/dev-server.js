/*
 * BatchBite - frontend development server
 * ---------------------------------------
 * Serves the frontend pages and forwards every request that starts with /api
 * to the backend, so the browser talks to one address and no CORS setup is
 * needed in server.js.
 *
 *   Terminal 1 (backend folder):   node server.js           -> http://localhost:3000
 *   Terminal 2 (frontend folder):  node dev-server.js       -> http://localhost:5173
 *
 * Optional settings:
 *   PORT=5173  BACKEND_URL=http://localhost:3000  node dev-server.js
 *
 * No npm packages are needed (Node.js built-in modules only).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 5173;
const BACKEND = new URL(process.env.BACKEND_URL || 'http://localhost:3000');
const ROOT = __dirname;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

function forwardToBackend(req, res) {
  const target = req.url.replace(/^\/api/, '') || '/';
  const proxy = http.request({
    hostname: BACKEND.hostname,
    port: BACKEND.port || 80,
    path: target,
    method: req.method,
    headers: Object.assign({}, req.headers, { host: BACKEND.host })
  }, backendRes => {
    res.writeHead(backendRes.statusCode, backendRes.headers);
    backendRes.pipe(res);
  });
  proxy.on('error', () => {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'The BatchBite backend is not running at ' + BACKEND.origin }));
  });
  req.pipe(proxy);
}

function serveFile(req, res) {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const filePath = path.normalize(path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath));
  const blocked = !filePath.startsWith(ROOT) || /[\\/](tools|node_modules)[\\/]/.test(filePath) || filePath.endsWith('dev-server.js');

  if (blocked) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
    res.end(content);
  });
}

http.createServer((req, res) => {
  if (req.url === '/api' || req.url.startsWith('/api/')) return forwardToBackend(req, res);
  return serveFile(req, res);
}).listen(PORT, () => {
  console.log('BatchBite frontend running at http://localhost:' + PORT);
  console.log('Forwarding /api requests to ' + BACKEND.origin);
});
