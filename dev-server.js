// 로컬 실행용 서버: 정적 파일(public/) + /api 라우팅. 의존성 없음.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handle } from './lib/router.js';

const root = fileURLToPath(new URL('.', import.meta.url));

// .env 간이 로더
if (existsSync(join(root, '.env'))) {
  for (const line of readFileSync(join(root, '.env'), 'utf8').split('\n')) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };

const server = http.createServer(async (req, res) => {
  if (req.url.startsWith('/api/')) {
    let raw = '';
    for await (const c of req) { raw += c; if (raw.length > 1e6) break; }
    let body;
    try { body = raw ? JSON.parse(raw) : undefined; } catch { body = null; }
    const r = await handle({ method: req.method, url: req.url, headers: req.headers, body });
    res.writeHead(r.status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify(r.json));
  }
  const pub = join(root, 'public');
  let file = normalize(join(pub, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  if (!file.startsWith(pub)) { res.writeHead(403); return res.end(); }
  if (file.endsWith('/') || !extname(file)) file = join(pub, 'index.html');
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end('Not found'); }
});

const port = Number(process.env.PORT) || 3000;
server.listen(port, () => {
  const demo = !process.env.NOTION_TOKEN || !process.env.NOTION_DATABASE_ID;
  console.log(`캘린더: http://localhost:${port}${demo ? '  (데모 모드: .env 에 NOTION_TOKEN/NOTION_DATABASE_ID 설정 시 Notion 연동)' : ''}`);
});
