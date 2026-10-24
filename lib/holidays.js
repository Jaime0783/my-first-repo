// 공휴일: ICS 피드(기본 Google 대한민국 공휴일)를 받아 12시간 캐시하고,
// 실패하거나 피드에 없는 날은 내장 표로 보완한다.
const DEFAULT_ICS = 'https://calendar.google.com/calendar/ical/ko.south_korea%23holiday%40group.v.calendar.google.com/public/basic.ics';

// 2026년 내장 표. 노동절(5/1)·제헌절(7/17)은 2026년 공휴일 지정분 반영.
// 피드가 정상 응답하면 피드 값이 우선한다. 매년 인사혁신처 고시로 갱신 필요.
const BUILTIN = {
  '2026-01-01': '신정', '2026-02-16': '설날 연휴', '2026-02-17': '설날', '2026-02-18': '설날 연휴',
  '2026-03-01': '삼일절', '2026-03-02': '대체공휴일', '2026-05-01': '노동절', '2026-05-05': '어린이날',
  '2026-05-24': '부처님 오신 날', '2026-05-25': '대체공휴일', '2026-06-03': '지방선거', '2026-06-06': '현충일',
  '2026-07-17': '제헌절', '2026-08-15': '광복절', '2026-08-17': '대체공휴일', '2026-09-24': '추석 연휴',
  '2026-09-25': '추석', '2026-09-26': '추석 연휴', '2026-10-03': '개천절', '2026-10-05': '대체공휴일',
  '2026-10-09': '한글날', '2026-12-25': '성탄절',
};

// 피드에 들어 있지만 쉬는 날이 아닌 기념일(빨간 날로 칠하지 않음)
const NOT_OFF = /(식목일|어버이날|스승의|국군의|크리스마스 이브|섣달|발렌타인|화이트|빼빼로|할로윈|단오|동지|정월|칠석|한식|근로자|국가보훈|섣달그믐)/;

let cache = null;
let cachedAt = 0;

export function parseIcs(text) {
  const out = {};
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  for (const block of unfolded.split('BEGIN:VEVENT').slice(1)) {
    const start = /DTSTART(?:;[^:]*)?:(\d{8})/.exec(block)?.[1];
    const end = /DTEND(?:;[^:]*)?:(\d{8})/.exec(block)?.[1];
    const name = /SUMMARY(?:;[^:]*)?:(.*)/.exec(block)?.[1]?.trim().replace(/\\,/g, ',');
    if (!start || !name || NOT_OFF.test(name)) continue;
    const toDate = (s) => new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
    const d = toDate(start);
    const e = end ? toDate(end) : new Date(d.getTime() + 86400000); // DTEND 는 배타적
    for (let t = d; t < e; t = new Date(t.getTime() + 86400000)) out[t.toISOString().slice(0, 10)] = name;
  }
  return out;
}

export async function getHolidays(year) {
  if (!cache || Date.now() - cachedAt > 12 * 3600 * 1000) {
    let feed = {};
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(process.env.HOLIDAY_ICS_URL || DEFAULT_ICS, { signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) feed = parseIcs(await res.text());
    } catch { /* 네트워크 실패 시 내장 표 사용 */ }
    cache = { ...BUILTIN, ...feed };
    cachedAt = Object.keys(feed).length ? Date.now() : Date.now() - 11 * 3600 * 1000; // 실패 시 1시간 뒤 재시도
  }
  if (!year) return cache;
  const y = String(year);
  return Object.fromEntries(Object.entries(cache).filter(([k]) => k.startsWith(y)));
}
