// Notion 데이터베이스 ↔ 캘린더 이벤트 변환 계층.
// 토큰이 없으면 메모리 기반 데모 데이터로 동작한다.
import { demoStore } from './demo.js';

const API = 'https://api.notion.com/v1';
const VERSION = '2025-09-03';

const env = (k) => (process.env[k] || '').trim();
export const isDemo = () => !env('NOTION_TOKEN') || !env('NOTION_DATABASE_ID');

async function notion(path, { method = 'GET', body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: {
      Authorization: `Bearer ${env('NOTION_TOKEN')}`,
      'Notion-Version': VERSION,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json.message || `Notion ${res.status}`);
    err.status = res.status;
    err.code = json.code;
    throw err;
  }
  return json;
}

// ---- 스키마 해석 (5분 캐시) ----
let schemaCache = null;
let schemaAt = 0;

export async function getSchema() {
  if (isDemo()) return demoStore.schema();
  if (schemaCache && Date.now() - schemaAt < 5 * 60 * 1000) return schemaCache;

  const dbId = env('NOTION_DATABASE_ID').replace(/-/g, '');
  let dataSourceId = dbId;
  let dbTitle = '';
  try {
    const db = await notion(`/databases/${dbId}`);
    dbTitle = plain(db.title);
    if (Array.isArray(db.data_sources) && db.data_sources[0]) dataSourceId = db.data_sources[0].id;
  } catch (e) {
    // ID가 이미 data source ID인 경우를 허용
    if (e.status !== 404 && e.status !== 400) throw e;
  }
  const ds = await notion(`/data_sources/${dataSourceId}`);
  const props = ds.properties || {};
  const pick = (override, types) => {
    if (override && props[override]) return override;
    return Object.keys(props).find((k) => types.includes(props[k].type)) || null;
  };
  const titleProp = pick(env('NOTION_TITLE_PROP'), ['title']);
  const dateProp = pick(env('NOTION_DATE_PROP'), ['date']);
  const categoryProp = pick(env('NOTION_CATEGORY_PROP'), ['select', 'status']);
  if (!dateProp) throw Object.assign(new Error('데이터베이스에 날짜(date) 속성이 없습니다.'), { status: 400 });

  const catType = categoryProp ? props[categoryProp].type : null;
  const options = categoryProp ? (props[categoryProp][catType]?.options || []).map((o) => ({ name: o.name, color: o.color })) : [];

  schemaCache = {
    demo: false,
    databaseId: dbId,
    dataSourceId,
    title: dbTitle || plain(ds.title) || 'Notion 캘린더',
    titleProp,
    dateProp,
    categoryProp,
    categoryType: catType,
    categories: options,
  };
  schemaAt = Date.now();
  return schemaCache;
}

const plain = (rich) => (Array.isArray(rich) ? rich.map((t) => t.plain_text || '').join('') : '');

function toEvent(page, s) {
  const p = page.properties || {};
  const d = p[s.dateProp]?.date;
  if (!d || !d.start) return null;
  const cat = s.categoryProp ? p[s.categoryProp]?.[s.categoryType] : null;
  return {
    id: page.id,
    title: plain(p[s.titleProp]?.title) || '제목 없음',
    start: d.start,
    end: d.end || null,
    allDay: !d.start.includes('T'),
    category: cat ? { name: cat.name, color: cat.color } : null,
    url: page.url,
  };
}

function shiftDate(ymd, days) {
  const t = new Date(ymd + 'T00:00:00Z');
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

// ---- 조회 ----
export async function listEvents({ from, to, q }) {
  if (isDemo()) return demoStore.list({ from, to, q });
  const s = await getSchema();
  const and = [];
  if (from) and.push({ property: s.dateProp, date: { on_or_after: shiftDate(from, -62) } }); // 여러 날 이벤트 포함
  if (to) and.push({ property: s.dateProp, date: { on_or_before: to } });
  if (q) and.push({ property: s.titleProp, title: { contains: q } });
  if (!and.length) and.push({ property: s.dateProp, date: { is_not_empty: true } });

  const out = [];
  let cursor;
  do {
    const r = await notion(`/data_sources/${s.dataSourceId}/query`, {
      method: 'POST',
      body: {
        filter: { and },
        sorts: [{ property: s.dateProp, direction: 'ascending' }],
        page_size: 100,
        start_cursor: cursor,
      },
    });
    for (const page of r.results || []) {
      const ev = toEvent(page, s);
      if (!ev) continue;
      const evEnd = (ev.end || ev.start).slice(0, 10);
      if (from && evEnd < from) continue;
      out.push(ev);
    }
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor && out.length < 2000);
  return out;
}

// ---- 쓰기 ----
function buildProps(input, s) {
  const props = {};
  if (input.title !== undefined) props[s.titleProp] = { title: [{ text: { content: String(input.title).slice(0, 2000) } }] };
  if (input.start !== undefined) {
    props[s.dateProp] = { date: { start: input.start, end: input.end || null, time_zone: input.allDay ? null : input.timeZone || 'Asia/Seoul' } };
    if (input.allDay || !input.start.includes('T')) delete props[s.dateProp].date.time_zone;
  }
  if (input.category !== undefined && s.categoryProp) {
    props[s.categoryProp] = { [s.categoryType]: input.category ? { name: input.category } : null };
  }
  return props;
}

export async function createEvent(input) {
  if (isDemo()) return demoStore.create(input);
  const s = await getSchema();
  const properties = buildProps(input, s);
  let page;
  try {
    page = await notion('/pages', { method: 'POST', body: { parent: { type: 'data_source_id', data_source_id: s.dataSourceId }, properties } });
  } catch (e) {
    if (e.status !== 400) throw e;
    page = await notion('/pages', { method: 'POST', body: { parent: { database_id: s.databaseId }, properties } });
  }
  return toEvent(page, s);
}

export async function updateEvent(id, input) {
  if (isDemo()) return demoStore.update(id, input);
  const s = await getSchema();
  const page = await notion(`/pages/${id}`, { method: 'PATCH', body: { properties: buildProps(input, s) } });
  return toEvent(page, s);
}

export async function deleteEvent(id) {
  if (isDemo()) return demoStore.remove(id);
  await notion(`/pages/${id}`, { method: 'PATCH', body: { in_trash: true } });
  return { ok: true };
}
