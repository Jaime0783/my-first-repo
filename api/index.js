// Vercel 서버리스 진입점. vercel.json 이 /api/* 를 여기로 보낸다.
import { handle } from '../lib/router.js';

export default async function handler(req, res) {
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  const r = await handle({ method: req.method, url: req.url, headers: req.headers, body });
  res.setHeader('Cache-Control', 'no-store');
  res.status(r.status).json(r.json);
}
