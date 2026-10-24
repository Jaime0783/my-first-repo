// NOTION_TOKEN 이 없을 때 쓰는 메모리 데이터. 첨부 화면의 일정 배치를 '현재 달'에 옮겨 놓는다.
const CATS = [
  { name: '일정', color: 'blue' },
  { name: '생일', color: 'yellow' },
  { name: '소대협', color: 'orange' },
  { name: '시험', color: 'red' },
  { name: '개인', color: 'green' },
];
const SEED = [
  // [시작일, 종료일(없으면 0), 제목, 분류, 시간]
  [2, 0, '엄마생일', '생일'], [4, 0, '기억회식', '일정'], [5, 0, '장우성생일', '생일'],
  [12, 0, '판례스터디', '일정', '19:00'], [13, 0, '최현수생일', '생일'], [13, 0, '소대협', '소대협', '18:30'],
  [14, 0, '조현서생일', '생일'], [15, 0, '임경재생일', '생일'], [18, 0, '김기운생일', '생일'],
  [19, 0, '4조뒤풀이', '일정'], [19, 0, '판례스터디', '일정', '19:00'], [20, 0, '휴강', '일정'],
  [20, 0, '정오 지도교', '일정', '12:00'], [21, 0, '강지민생일', '생일', '09:00'], [22, 0, '민사법분과', '일정'],
  [23, 0, '한능검', '시험'], [24, 0, '헌법분과 과', '일정'], [25, 0, '문관논문마', '일정'],
  [26, 28, '반올림클래스', '일정'], [26, 0, '현수집', '일정'], [26, 0, '판례스터디', '일정', '19:00'],
  [27, 0, '김지호생일', '생일'], [27, 0, '경정시발표', '일정'], [27, 0, '소대협', '소대협', '18:30'],
  [28, 0, '문관 휴강', '일정'], [28, 0, '민강이형', '일정'], [28, 0, '소윤 우산', '일정'],
  [29, 0, '12시민법스', '일정'], [30, 0, '판례스터디', '일정'], [31, 0, '토익', '시험'],
];

const pad = (n) => String(n).padStart(2, '0');
let events = null;
let seq = 0;

function seed() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const last = new Date(y, m + 1, 0).getDate();
  const ymd = (d) => `${y}-${pad(m + 1)}-${pad(Math.min(d, last))}`;
  events = SEED.map(([s, e, title, cat, time]) => {
    const color = CATS.find((c) => c.name === cat).color;
    const start = time ? `${ymd(s)}T${time}:00.000+09:00` : ymd(s);
    return { id: `demo-${++seq}`, title, start, end: e ? ymd(e) : null, allDay: !time, category: { name: cat, color }, url: null };
  });
}

const day = (v) => (v || '').slice(0, 10);

export const demoStore = {
  schema() {
    return { demo: true, title: '데모 캘린더', titleProp: '이름', dateProp: '날짜', categoryProp: '분류', categoryType: 'select', categories: CATS };
  },
  list({ from, to, q }) {
    if (!events) seed();
    return events
      .filter((e) => (!from || day(e.end || e.start) >= from) && (!to || day(e.start) <= to))
      .filter((e) => !q || e.title.includes(q))
      .sort((a, b) => a.start.localeCompare(b.start));
  },
  create(input) {
    if (!events) seed();
    const cat = CATS.find((c) => c.name === input.category);
    const ev = { id: `demo-${++seq}`, title: input.title || '제목 없음', start: input.start, end: input.end || null, allDay: !!input.allDay, category: cat || null, url: null };
    events.push(ev);
    return ev;
  },
  update(id, input) {
    if (!events) seed();
    const ev = events.find((e) => e.id === id);
    if (!ev) throw Object.assign(new Error('일정을 찾을 수 없습니다.'), { status: 404 });
    if (input.title !== undefined) ev.title = input.title;
    if (input.start !== undefined) { ev.start = input.start; ev.end = input.end || null; ev.allDay = !!input.allDay; }
    if (input.category !== undefined) ev.category = CATS.find((c) => c.name === input.category) || null;
    return ev;
  },
  remove(id) {
    if (!events) seed();
    events = events.filter((e) => e.id !== id);
    return { ok: true };
  },
};
