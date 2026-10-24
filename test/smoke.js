// 네트워크 없이 실행 가능한 점검: 데모 모드 CRUD + Notion 요청 형태(모의 fetch) + ICS 파서.
import assert from 'node:assert/strict';

const { handle } = await import('../lib/router.js');
const { parseIcs } = await import('../lib/holidays.js');
const call = (method, url, body, headers = {}) => handle({ method, url, headers, body });

// 1) 데모 모드
delete process.env.NOTION_TOKEN;
let r = await call('GET', '/api/meta');
assert.equal(r.json.demo, true);
const now = new Date();
const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
r = await call('GET', `/api/events?from=${ym}-01&to=${ym}-28`);
assert.ok(r.json.length > 20, 'demo events');
r = await call('POST', '/api/events', { title: '테스트', start: `${ym}-03`, end: `${ym}-05`, allDay: true, category: '일정' });
assert.equal(r.status, 201);
const id = r.json.id;
r = await call('PATCH', `/api/events/${id}`, { title: '수정됨' });
assert.equal(r.json.title, '수정됨');
r = await call('DELETE', `/api/events/${id}`);
assert.equal(r.json.ok, true);
r = await call('POST', '/api/events', { title: 'x', start: '2026-05-05', end: '2026-05-01' });
assert.equal(r.status, 400, 'end before start rejected');
r = await call('GET', '/api/events?from=bad');
assert.equal(r.status, 400);

// 2) 암호
process.env.APP_PASSCODE = 'pw';
assert.equal((await call('GET', '/api/meta')).status, 401);
assert.equal((await call('GET', '/api/meta', null, { 'x-app-passcode': 'pw' })).status, 200);
delete process.env.APP_PASSCODE;

// 3) Notion 모의 응답
process.env.NOTION_TOKEN = 'secret_test';
process.env.NOTION_DATABASE_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const calls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const body = opts.body ? JSON.parse(opts.body) : null;
  calls.push({ url, method: opts.method || 'GET', body, headers: opts.headers });
  const ok = (j) => ({ ok: true, status: 200, json: async () => j });
  if (url.endsWith('/databases/aaaaaaaabbbbccccddddeeeeeeeeeeee')) return ok({ title: [{ plain_text: '내 일정' }], data_sources: [{ id: 'ds1', name: 'x' }] });
  if (url.endsWith('/data_sources/ds1')) return ok({ properties: {
    이름: { type: 'title', title: {} }, 날짜: { type: 'date', date: {} },
    분류: { type: 'select', select: { options: [{ name: '생일', color: 'yellow' }] } } } });
  if (url.endsWith('/data_sources/ds1/query')) return ok({ has_more: false, results: [
    { id: 'p1', url: 'https://notion.so/p1', properties: { 이름: { title: [{ plain_text: '엄마생일' }] }, 날짜: { date: { start: '2026-05-02', end: null } }, 분류: { select: { name: '생일', color: 'yellow' } } } },
    { id: 'p2', url: 'u', properties: { 이름: { title: [] }, 날짜: { date: null } } },
  ] });
  if (url.endsWith('/pages') && opts.method === 'POST') return ok({ id: 'p9', url: 'u', properties: { 이름: { title: [{ plain_text: body.properties.이름.title[0].text.content }] }, 날짜: { date: body.properties.날짜.date }, 분류: { select: { name: '생일', color: 'yellow' } } } });
  if (url.includes('/pages/p1') && opts.method === 'PATCH') return ok({ id: 'p1', url: 'u', properties: { 이름: { title: [{ plain_text: 'z' }] }, 날짜: { date: { start: '2026-05-02' } } } });
  return { ok: false, status: 404, json: async () => ({ message: 'nf' }) };
};

r = await call('GET', '/api/meta');
assert.equal(r.json.dataSourceId, 'ds1');
assert.equal(r.json.titleProp, '이름');
assert.equal(r.json.categoryProp, '분류');
assert.equal(calls[0].headers['Notion-Version'], '2025-09-03');

r = await call('GET', '/api/events?from=2026-04-26&to=2026-06-06');
assert.deepEqual(r.json.map((e) => e.title), ['엄마생일']);
assert.equal(r.json[0].category.color, 'yellow');
const q = calls.find((c) => c.url.endsWith('/query'));
assert.equal(q.body.filter.and[1].date.on_or_before, '2026-06-06');

r = await call('POST', '/api/events', { title: '새 일정', start: '2026-05-12T19:00:00+09:00', allDay: false, category: '생일' });
assert.equal(r.status, 201, JSON.stringify(r.json));
const post = calls.find((c) => c.url.endsWith('/pages'));
assert.deepEqual(post.body.parent, { type: 'data_source_id', data_source_id: 'ds1' });
assert.equal(post.body.properties.날짜.date.time_zone, 'Asia/Seoul');
assert.deepEqual(post.body.properties.분류, { select: { name: '생일' } });

r = await call('DELETE', '/api/events/p1');
assert.equal(calls.at(-1).body.in_trash, true);
globalThis.fetch = realFetch;

// 4) ICS 파서: 다일 일정(DTEND 배타) + 기념일 제외
const ics = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20260924\r\nDTEND;VALUE=DATE:20260927\r\nSUMMARY:추석\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20260508\r\nDTEND;VALUE=DATE:20260509\r\nSUMMARY:어버이날\r\nEND:VEVENT\r\nEND:VCALENDAR';
assert.deepEqual(parseIcs(ics), { '2026-09-24': '추석', '2026-09-25': '추석', '2026-09-26': '추석' });

console.log('smoke: all passed');
