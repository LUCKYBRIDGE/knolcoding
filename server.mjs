import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Serves the built dist/ folder the same way Cloudflare Pages does (folder → index.html).
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');
const port = Number(process.argv.find(arg => arg.startsWith('--port='))?.split('=')[1] || 4175);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };

async function resolveFile(pathname) {
  const file = path.resolve(root, '.' + pathname);
  if (file !== root && !file.startsWith(root + path.sep)) return null;
  const info = await stat(file).catch(() => null);
  if (info?.isDirectory()) return pathname.endsWith('/') ? path.join(file, 'index.html') : { redirect: pathname + '/' };
  if (info?.isFile()) return file;
  if (!path.extname(file)) return `${file}.html`;
  return file;
}

http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = await resolveFile(pathname);
    if (!file) { res.writeHead(403).end(); return; }
    if (file.redirect) { res.writeHead(301, { Location: file.redirect }).end(); return; }
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch {
    const page = await readFile(path.join(root, '404.html')).catch(() => 'Not found');
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }).end(page);
  }
}).listen(port, '127.0.0.1', () => console.log(`KNOL CODING: http://127.0.0.1:${port}`));
