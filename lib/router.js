// 로컬 서버와 Vercel 함수가 공유하는 API 라우터.
import { getSchema, listEvents, createEvent, updateEvent, deleteEvent, isDemo } from './notion.js';
import { getHolidays } from './holidays.js';

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const DATEISH = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?([+-]\d{2}:\d{2}|Z)?)?$/;

function validate(input, partial) {
  if (!input || typeof input !== 'object') throw Object.assign(new Error('잘못된 요청 본문'), { status: 400 });
  if (!partial && !input.start) throw Object.assign(new Error('시작일이 필요합니다.'), { status: 400 });
  for (const k of ['start', 'end']) {
    if (input[k] && !DATEISH.test(input[k])) throw Object.assign(new Error(`${k} 형식 오류`), { status: 400 });
  }
  if (input.start && input.end && input.end.slice(0, 10) < input.start.slice(0, 10)) {
    throw Object.assign(new Error('종료일이 시작일보다 빠릅니다.'), { status: 400 });
  }
  return input;
}

export async function handle({ method, url, headers, body }) {
  const u = new URL(url, 'http://local');
  const path = u.pathname.replace(/\/+$/, '');

  const pass = (process.env.APP_PASSCODE || '').trim();
  if (pass && headers['x-app-passcode'] !== pass) return { status: 401, json: { error: '암호가 필요합니다.', needPasscode: true } };

  try {
    if (path === '/api/meta' && method === 'GET') {
      return { status: 200, json: { ...(await getSchema()), demo: isDemo() } };
    }
    if (path === '/api/holidays' && method === 'GET') {
      return { status: 200, json: await getHolidays(u.searchParams.get('year')) };
    }
    if (path === '/api/events' && method === 'GET') {
      const from = u.searchParams.get('from');
      const to = u.searchParams.get('to');
      const q = (u.searchParams.get('q') || '').trim();
      if ((from && !YMD.test(from)) || (to && !YMD.test(to))) return { status: 400, json: { error: '날짜 형식 오류' } };
      return { status: 200, json: await listEvents({ from, to, q }) };
    }
    if (path === '/api/events' && method === 'POST') {
      return { status: 201, json: await createEvent(validate(body)) };
    }
    const m = /^\/api\/events\/([\w-]+)$/.exec(path);
    if (m && method === 'PATCH') return { status: 200, json: await updateEvent(m[1], validate(body, true)) };
    if (m && method === 'DELETE') return { status: 200, json: await deleteEvent(m[1]) };
    return { status: 404, json: { error: 'Not found' } };
  } catch (e) {
    const status = e.status && e.status >= 400 && e.status < 600 ? e.status : 500;
    return { status, json: { error: e.message || '서버 오류', code: e.code } };
  }
}
