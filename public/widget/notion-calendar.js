// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: calendar-alt;

// Notion 캘린더 위젯 (Scriptable)
// 크기: 큰 위젯 = 월력, 중간 = 오늘 + 다가오는 일정, 작은 = 오늘 일정, 잠금 화면 = 다음 일정
// 위젯 편집 > Parameter 에 dark 또는 light 를 넣으면 큰 위젯 색상을 고정한다.

const BASE_URL = '__BASE_URL__';
const PASSCODE = '__PASSCODE__';

const WD = ['일', '월', '화', '수', '목', '금', '토'];
const CHIP = {
  blue: ['#3fa2f6', '#ffffff'], default: ['#3fa2f6', '#ffffff'], yellow: ['#d4d04a', '#2b2b1a'],
  orange: ['#ff5a1f', '#ffffff'], red: ['#f04438', '#ffffff'], green: ['#34c759', '#ffffff'],
  purple: ['#8e6cef', '#ffffff'], pink: ['#f06292', '#ffffff'], brown: ['#a1745a', '#ffffff'], gray: ['#9aa0a6', '#ffffff'],
};
const RED = '#f04438';

// ---------- 날짜 ----------
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const diffDays = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 86400000);
const dayKey = (v) => (!v ? null : v.length === 10 ? v : ymd(new Date(v)));
const hhmm = (v) => { const d = new Date(v); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const span = (ev) => { const s = dayKey(ev.start); let e = dayKey(ev.end) || s; if (e < s) e = s; return { s, e }; };
const chip = (ev) => CHIP[ev.category && ev.category.color] || CHIP.blue;

function sortEvents(list) {
  return list.slice().sort((a, b) => {
    const A = span(a), B = span(b);
    if (A.s !== B.s) return A.s < B.s ? -1 : 1;
    const la = diffDays(A.s, A.e), lb = diffDays(B.s, B.e);
    if (la !== lb) return lb - la;
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
    return a.start.localeCompare(b.start);
  });
}

// ---------- 데이터 (실패하면 마지막 캐시 사용) ----------
const fm = FileManager.local();
const cachePath = fm.joinPath(fm.cacheDirectory(), 'notion-calendar-widget.json');

async function getJSON(path) {
  const req = new Request(BASE_URL + path);
  req.headers = { 'x-app-passcode': PASSCODE };
  req.timeoutInterval = 12;
  const json = await req.loadJSON();
  const code = req.response && req.response.statusCode;
  if (code && code >= 400) throw new Error((json && json.error) || `HTTP ${code}`);
  return json;
}

async function loadData(now) {
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const gridStart = addDays(first, -first.getDay());
  const gridEnd = addDays(gridStart, 41);
  const to = new Date(Math.max(gridEnd, addDays(now, 21)));
  try {
    const years = [...new Set([gridStart.getFullYear(), now.getFullYear(), to.getFullYear()])];
    const [events, ...hol] = await Promise.all([
      getJSON(`/api/events?from=${ymd(gridStart)}&to=${ymd(to)}`),
      ...years.map((y) => getJSON(`/api/holidays?year=${y}`)),
    ]);
    const data = { events, holidays: Object.assign({}, ...hol), at: Date.now() };
    fm.writeString(cachePath, JSON.stringify(data));
    return data;
  } catch (e) {
    if (fm.fileExists(cachePath)) return { ...JSON.parse(fm.readString(cachePath)), stale: true, error: e.message };
    return { events: [], holidays: {}, error: e.message };
  }
}

function upcoming(events, now, limit) {
  const today = ymd(now);
  return sortEvents(events)
    .filter((ev) => {
      const { e } = span(ev);
      if (e < today) return false;
      if (!ev.allDay && e === today) {
        const end = ev.end ? new Date(ev.end) : new Date(new Date(ev.start).getTime() + 3600e3);
        if (end < now) return false;
      }
      return true;
    })
    .slice(0, limit);
}

function whenLabel(ev, now) {
  const { s, e } = span(ev);
  const today = ymd(now);
  const tomorrow = ymd(addDays(now, 1));
  const name = (k) => (k === today ? '오늘' : k === tomorrow ? '내일' : `${+k.slice(5, 7)}/${+k.slice(8)} (${WD[parseYmd(k).getDay()]})`);
  const day = s < today && e >= today ? `~${+e.slice(5, 7)}/${+e.slice(8)}` : name(s);
  return ev.allDay ? day : `${day} ${hhmm(ev.start)}`;
}

// ---------- 큰 위젯: 월력 이미지 ----------
// iOS 는 칸보다 긴 글자를 다음 줄로 넘기므로, 폭을 추정해 한 줄 분량만 남긴다 (한글 1em, 그 외 약 0.6em)
function fitText(text, maxW, fontSize) {
  let w = 0, out = '';
  for (const ch of text) {
    w += (ch.codePointAt(0) >= 0x1100 ? 1 : 0.6) * fontSize;
    if (w > maxW) break;
    out += ch;
  }
  return out;
}

function palette(dark) {
  return dark
    ? { bg: new Color('#1c1c1f'), text: new Color('#f2f2f3'), muted: new Color('#8b8f97'), line: new Color('#2b2c30'), todayBg: new Color('#f2f2f3'), todayFg: new Color('#111111') }
    : { bg: new Color('#ffffff'), text: new Color('#111111'), muted: new Color('#8a8f98'), line: new Color('#e6e7ea'), todayBg: new Color('#111111'), todayFg: new Color('#ffffff') };
}

function drawMonth(data, now, dark) {
  const W = 338, H = 354;
  const P = palette(dark);
  const y = now.getFullYear(), m = now.getMonth();
  const first = new Date(y, m, 1);
  const start = addDays(first, -first.getDay());
  const today = ymd(now);

  const dc = new DrawContext();
  dc.size = new Size(W, H);
  dc.opaque = true;
  dc.respectScreenScale = true;
  dc.setFillColor(P.bg);
  dc.fillRect(new Rect(0, 0, W, H));

  // 머리글
  dc.setTextAlignedLeft();
  dc.setFont(Font.boldSystemFont(17));
  dc.setTextColor(P.text);
  dc.drawTextInRect(`${y}년 ${m + 1}월`, new Rect(14, 9, 200, 24));
  const todayCount = data.events.filter((ev) => { const { s, e } = span(ev); return s <= today && today <= e; }).length;
  dc.setTextAlignedRight();
  dc.setFont(Font.mediumSystemFont(11));
  dc.setTextColor(P.muted);
  dc.drawTextInRect(data.error && !data.events.length ? '연결 확인 필요' : `오늘 일정 ${todayCount}개`, new Rect(W - 134, 13, 120, 16));

  const X0 = 4, colW = (W - 8) / 7;
  // 요일
  dc.setFont(Font.mediumSystemFont(10));
  dc.setTextAlignedCenter();
  WD.forEach((w, i) => {
    dc.setTextColor(i === 0 ? new Color(RED) : P.muted);
    dc.drawTextInRect(w, new Rect(X0 + i * colW, 36, colW, 14));
  });

  const top0 = 52, rowH = (H - top0 - 4) / 6;
  const CH = 12, G = 2, labelH = 19;
  const maxLanes = Math.max(1, Math.floor((rowH - labelH - 2 + G) / (CH + G)));
  const sorted = sortEvents(data.events);

  for (let w = 0; w < 6; w++) {
    const rowTop = top0 + w * rowH;
    dc.setFillColor(P.line);
    dc.fillRect(new Rect(0, rowTop, W, 0.6));
    const ws = addDays(start, w * 7);
    const wsK = ymd(ws), weK = ymd(addDays(ws, 6));

    // 날짜 숫자
    for (let i = 0; i < 7; i++) {
      const d = addDays(ws, i);
      const k = ymd(d);
      const out = d.getMonth() !== m;
      const red = i === 0 || data.holidays[k];
      const cx = X0 + i * colW;
      if (k === today) {
        dc.setFillColor(P.todayBg);
        dc.fillEllipse(new Rect(cx + colW / 2 - 9, rowTop + 2, 18, 18));
      }
      dc.setFont(k === today ? Font.boldSystemFont(11) : Font.systemFont(11));
      const base = k === today ? P.todayFg : red ? new Color(RED) : P.text;
      dc.setTextColor(out ? new Color(base.hex, 0.35) : base);
      dc.setTextAlignedCenter();
      dc.drawTextInRect(String(d.getDate()), new Rect(cx, rowTop + 4, colW, 14));
    }

    // 이번 주 일정을 레인에 배치 (앱과 같은 규칙)
    const lanes = [];
    const placed = [];
    for (const ev of sorted) {
      const { s, e } = span(ev);
      if (e < wsK || s > weK) continue;
      const c0 = Math.max(0, diffDays(wsK, s));
      const c1 = Math.min(6, diffDays(wsK, e));
      let lane = lanes.findIndex((last) => last < c0);
      if (lane === -1) { lane = lanes.length; lanes.push(-1); }
      lanes[lane] = c1;
      placed.push({ ev, c0, c1, lane, contL: s < wsK, contR: e > weK });
    }
    const used = Array(7).fill(0);
    placed.forEach((p) => { for (let c = p.c0; c <= p.c1; c++) used[c] = Math.max(used[c], p.lane + 1); });
    const limit = used.map((u) => (u > maxLanes ? maxLanes - 1 : maxLanes));
    const hidden = Array(7).fill(0);

    for (const p of placed) {
      let lim = Infinity;
      for (let c = p.c0; c <= p.c1; c++) lim = Math.min(lim, limit[c]);
      if (p.lane >= lim) { for (let c = p.c0; c <= p.c1; c++) hidden[c]++; continue; }
      const allOut = [...Array(p.c1 - p.c0 + 1)].every((_, i) => addDays(ws, p.c0 + i).getMonth() !== m);
      const [bg, fg] = chip(p.ev);
      const x = X0 + p.c0 * colW + (p.contL ? 0 : 1.5);
      const wdt = (p.c1 - p.c0 + 1) * colW - (p.contL ? 0 : 1.5) - (p.contR ? 0 : 1.5);
      const top = rowTop + labelH + p.lane * (CH + G);
      const path = new Path();
      path.addRoundedRect(new Rect(x, top, wdt, CH), 3, 3);
      dc.addPath(path);
      dc.setFillColor(new Color(bg, allOut ? 0.35 : 1));
      dc.fillPath();
      dc.setFont(Font.mediumSystemFont(8.5));
      dc.setTextColor(new Color(fg, allOut ? 0.6 : 1));
      dc.setTextAlignedLeft();
      dc.drawTextInRect(fitText(p.ev.title, wdt - 5, 8.5), new Rect(x + 3, top + 0.5, wdt - 4, CH));
    }
    hidden.forEach((n, c) => {
      if (!n) return;
      dc.setFont(Font.mediumSystemFont(8.5));
      dc.setTextColor(P.muted);
      dc.setTextAlignedCenter();
      dc.drawTextInRect(`+${n}`, new Rect(X0 + c * colW, rowTop + labelH + limit[c] * (CH + G), colW, CH));
    });
  }
  return dc.getImage();
}

// ---------- 목록형 위젯 ----------
const dyn = (l, d) => Color.dynamic(new Color(l), new Color(d));
const C = { bg: dyn('#ffffff', '#1c1c1f'), text: dyn('#111111', '#f2f2f3'), muted: dyn('#8a8f98', '#8b8f97'), accent: new Color('#3fa2f6'), red: new Color(RED) };

function addEventRow(stack, ev, now, size) {
  const row = stack.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();
  row.url = `${BASE_URL}/?date=${dayKey(ev.start) < ymd(now) ? ymd(now) : dayKey(ev.start)}`;
  const bar = row.addStack();
  bar.size = new Size(4, size === 'small' ? 22 : 28);
  bar.cornerRadius = 2;
  bar.backgroundColor = new Color(chip(ev)[0]);
  row.addSpacer(7);
  const col = row.addStack();
  col.layoutVertically();
  const t = col.addText(ev.title);
  t.font = Font.semiboldSystemFont(size === 'small' ? 12 : 13);
  t.textColor = C.text;
  t.lineLimit = 1;
  const sub = col.addText(whenLabel(ev, now));
  sub.font = Font.systemFont(size === 'small' ? 10 : 11);
  sub.textColor = C.muted;
  sub.lineLimit = 1;
  row.addSpacer();
}

function dateHeader(stack, data, now, big) {
  const k = ymd(now);
  const hol = data.holidays[k];
  const red = now.getDay() === 0 || hol;
  const wd = stack.addText(`${WD[now.getDay()]}요일`);
  wd.font = Font.semiboldSystemFont(12);
  wd.textColor = red ? C.red : C.accent;
  const d = stack.addText(String(now.getDate()));
  d.font = Font.boldSystemFont(big ? 40 : 30);
  d.textColor = red ? C.red : C.text;
  const sub = stack.addText(hol || `${now.getMonth() + 1}월`);
  sub.font = Font.systemFont(11);
  sub.textColor = hol ? C.red : C.muted;
  sub.lineLimit = 1;
}

function buildMedium(data, now) {
  const w = new ListWidget();
  w.backgroundColor = C.bg;
  w.setPadding(14, 14, 14, 14);
  const row = w.addStack();
  row.layoutHorizontally();
  const left = row.addStack();
  left.layoutVertically();
  left.size = new Size(78, 0);
  dateHeader(left, data, now, true);
  left.addSpacer();
  row.addSpacer(8);
  const right = row.addStack();
  right.layoutVertically();
  right.spacing = 6;
  const list = upcoming(data.events, now, 4);
  if (!list.length) {
    const t = right.addText(data.error && !data.events.length ? `연결 오류: ${data.error}` : '예정된 일정이 없습니다');
    t.font = Font.systemFont(12);
    t.textColor = C.muted;
  }
  list.forEach((ev) => addEventRow(right, ev, now, 'medium'));
  right.addSpacer();
  return w;
}

function buildSmall(data, now) {
  const w = new ListWidget();
  w.backgroundColor = C.bg;
  w.setPadding(12, 12, 12, 12);
  const head = w.addStack();
  head.layoutHorizontally();
  head.bottomAlignContent();
  const k = ymd(now);
  const red = now.getDay() === 0 || data.holidays[k];
  const d = head.addText(String(now.getDate()));
  d.font = Font.boldSystemFont(24);
  d.textColor = red ? C.red : C.text;
  head.addSpacer(5);
  const wd = head.addText(`${WD[now.getDay()]}요일`);
  wd.font = Font.semiboldSystemFont(12);
  wd.textColor = red ? C.red : C.accent;
  w.addSpacer(6);
  const list = upcoming(data.events, now, 3);
  if (!list.length) {
    const t = w.addText('예정된 일정 없음');
    t.font = Font.systemFont(12);
    t.textColor = C.muted;
  }
  list.forEach((ev, i) => { if (i) w.addSpacer(4); addEventRow(w, ev, now, 'small'); });
  w.addSpacer();
  return w;
}

function buildLock(data, now, family) {
  const w = new ListWidget();
  const next = upcoming(data.events, now, 1)[0];
  if (family === 'accessoryInline') {
    w.addText(next ? `${whenLabel(next, now)} ${next.title}` : '예정된 일정 없음');
    return w;
  }
  if (family === 'accessoryCircular') {
    const a = w.addText(WD[now.getDay()]);
    a.font = Font.semiboldSystemFont(11);
    a.centerAlignText();
    const b = w.addText(String(now.getDate()));
    b.font = Font.boldSystemFont(22);
    b.centerAlignText();
    return w;
  }
  const h = w.addText('다음 일정');
  h.font = Font.semiboldSystemFont(11);
  h.textOpacity = 0.7;
  const t = w.addText(next ? next.title : '없음');
  t.font = Font.boldSystemFont(14);
  t.lineLimit = 1;
  if (next) {
    const s = w.addText(whenLabel(next, now));
    s.font = Font.systemFont(12);
  }
  return w;
}

// ---------- 실행 ----------
const now = new Date();
const data = await loadData(now);
const family = config.widgetFamily || 'large';
const param = (args.widgetParameter || '').trim().toLowerCase();
const dark = param === 'dark' ? true : param === 'light' ? false : Device.isUsingDarkAppearance();

let widget;
if (family === 'small') widget = buildSmall(data, now);
else if (family === 'medium') widget = buildMedium(data, now);
else if (family.startsWith('accessory')) widget = buildLock(data, now, family);
else {
  widget = new ListWidget();
  widget.setPadding(0, 0, 0, 0);
  widget.backgroundImage = drawMonth(data, now, dark);
}
if (!widget.url) widget.url = BASE_URL + '/';
widget.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  // 앱에서 실행하면 미리보기
  const pick = new Alert();
  pick.title = '위젯 미리보기';
  ['큰 위젯 (월력)', '중간 위젯', '작은 위젯'].forEach((x) => pick.addAction(x));
  pick.addCancelAction('닫기');
  const i = await pick.presentSheet();
  if (i === 0) await widget.presentLarge();
  if (i === 1) await buildMedium(data, now).presentMedium();
  if (i === 2) await buildSmall(data, now).presentSmall();
}
Script.complete();
