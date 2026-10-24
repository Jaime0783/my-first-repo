// 월력 UI. 상태: 현재 보이는 달, 달별 이벤트 캐시, 공휴일, Notion 스키마.
const $ = (s) => document.querySelector(s);
const grid = $('#grid');
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const COLORS = ['default', 'gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'];

const state = {
  y: new Date().getFullYear(),
  m: new Date().getMonth(),
  meta: null,
  cache: new Map(), // 'YYYY-MM' → events
  holidays: {}, // 'YYYY-MM-DD' → 이름
  holidayYears: new Set(),
  selected: null,
};

// ---------- 날짜 유틸 ----------
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const diffDays = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 86400000);
const dayKey = (v) => (!v ? null : v.length === 10 ? v : ymd(new Date(v)));
const hhmm = (v) => { const d = new Date(v); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const tzOffset = () => { const o = -new Date().getTimezoneOffset(); const s = o >= 0 ? '+' : '-'; return `${s}${pad(Math.floor(Math.abs(o) / 60))}:${pad(Math.abs(o) % 60)}`; };
const monthKey = (y, m) => `${y}-${pad(m + 1)}`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const colorOf = (ev) => (ev.category && COLORS.includes(ev.category.color) ? ev.category.color : 'blue');

function gridRange(y, m) {
  const first = new Date(y, m, 1);
  const start = addDays(first, -first.getDay());
  return { start, end: addDays(start, 41) }; // 6주 고정 (첨부 화면과 동일)
}

// ---------- API ----------
async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  try { const p = localStorage.getItem('passcode'); if (p) headers['x-app-passcode'] = p; } catch {}
  const res = await fetch(path, { ...opts, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401 && json.needPasscode) {
    const p = prompt('캘린더 암호를 입력하세요');
    if (p) { try { localStorage.setItem('passcode', p); } catch {} return api(path, opts); }
  }
  if (!res.ok) throw new Error(json.error || `요청 실패 (${res.status})`);
  return json;
}

let pending = 0;
const busy = (on) => { pending += on ? 1 : -1; $('#loading').hidden = pending <= 0; };

async function loadMonth(y, m, force = false) {
  const key = monthKey(y, m);
  if (!force && state.cache.has(key)) return state.cache.get(key);
  const { start, end } = gridRange(y, m);
  busy(true);
  try {
    const evs = await api(`/api/events?from=${ymd(start)}&to=${ymd(end)}`);
    state.cache.set(key, evs);
    return evs;
  } finally { busy(false); }
}

async function loadHolidays(year) {
  if (state.holidayYears.has(year)) return;
  state.holidayYears.add(year);
  try { Object.assign(state.holidays, await api(`/api/holidays?year=${year}`)); }
  catch { state.holidayYears.delete(year); }
}

// ---------- 렌더 ----------
function chipMetrics() {
  const cs = getComputedStyle(document.documentElement);
  return { h: parseFloat(cs.getPropertyValue('--chip-h')) || 22, gap: parseFloat(cs.getPropertyValue('--chip-gap')) || 3 };
}

function eventSpan(ev) {
  const s = dayKey(ev.start);
  let e = dayKey(ev.end) || s;
  if (e < s) e = s;
  return { s, e };
}

function sortEvents(list) {
  return list.slice().sort((a, b) => {
    const A = eventSpan(a), B = eventSpan(b);
    if (A.s !== B.s) return A.s < B.s ? -1 : 1;
    const la = diffDays(A.s, A.e), lb = diffDays(B.s, B.e);
    if (la !== lb) return lb - la; // 긴 일정 먼저
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
    return a.start.localeCompare(b.start);
  });
}

function render(anim) {
  const { y, m } = state;
  $('#monthLabel').textContent = `${y}년 ${m + 1}월`;
  const events = state.cache.get(monthKey(y, m)) || [];
  const { start } = gridRange(y, m);
  const today = ymd(new Date());
  const { h: CH, gap: G } = chipMetrics();

  grid.innerHTML = '';
  grid.classList.remove('slide-l', 'slide-r');
  if (anim) { void grid.offsetWidth; grid.classList.add(anim); }

  const sorted = sortEvents(events);
  const weeks = [];
  for (let w = 0; w < 6; w++) {
    const row = document.createElement('div');
    row.className = 'week';
    const ws = addDays(start, w * 7);
    const wsK = ymd(ws), weK = ymd(addDays(ws, 6));
    let hasHol = false;

    for (let i = 0; i < 7; i++) {
      const d = addDays(ws, i);
      const k = ymd(d);
      const hol = state.holidays[k];
      if (hol) hasHol = true;
      const cell = document.createElement('div');
      cell.className = 'day';
      if (d.getMonth() !== m) cell.classList.add('out');
      if (d.getDay() === 0) cell.classList.add('sun');
      if (hol) cell.classList.add('hol');
      if (k === today) cell.classList.add('today');
      if (k === state.selected) cell.classList.add('selected');
      cell.dataset.date = k;
      cell.innerHTML = `<span class="num">${d.getDate()}</span>${hol ? `<div class="hname">${esc(hol)}</div>` : ''}`;
      row.appendChild(cell);
    }

    // 이번 주에 걸친 일정을 레인에 배치
    const lanes = []; // lanes[i] = 마지막으로 점유한 열
    const placed = [];
    for (const ev of sorted) {
      const { s, e } = eventSpan(ev);
      if (e < wsK || s > weK) continue;
      const c0 = Math.max(0, diffDays(wsK, s));
      const c1 = Math.min(6, diffDays(wsK, e));
      let lane = lanes.findIndex((last) => last < c0);
      if (lane === -1) { lane = lanes.length; lanes.push(-1); }
      lanes[lane] = c1;
      placed.push({ ev, c0, c1, lane, contL: s < wsK, contR: e > weK });
    }
    weeks.push({ row, placed, hasHol, ws });
    grid.appendChild(row);
  }

  // 행 높이가 확정된 뒤 칩을 그린다
  for (const { row, placed, hasHol, ws } of weeks) {
    const rowH = row.clientHeight;
    const top = hasHol ? 52 : 36;
    const maxLanes = Math.max(1, Math.floor((rowH - top - 2 + G) / (CH + G)));
    const colW = 100 / 7;

    const used = Array(7).fill(0);
    for (const p of placed) for (let c = p.c0; c <= p.c1; c++) used[c] = Math.max(used[c], p.lane + 1);
    const limit = used.map((u) => (u > maxLanes ? maxLanes - 1 : maxLanes));
    const hidden = Array(7).fill(0);

    const layer = document.createElement('div');
    layer.className = 'bars';
    for (const p of placed) {
      let lim = Infinity;
      for (let c = p.c0; c <= p.c1; c++) lim = Math.min(lim, limit[c]);
      if (p.lane >= lim) { for (let c = p.c0; c <= p.c1; c++) hidden[c]++; continue; }
      const el = document.createElement('div');
      const startDate = addDays(ws, p.c0);
      const allOut = [...Array(p.c1 - p.c0 + 1)].every((_, i) => addDays(startDate, i).getMonth() !== state.m);
      el.className = `chip c-${colorOf(p.ev)}${p.contL ? ' cont-l' : ''}${p.contR ? ' cont-r' : ''}${allOut ? ' out' : ''}${p.ev.allDay ? '' : ' timed'}`;
      el.style.left = `calc(${p.c0 * colW}% + ${p.contL ? 0 : 2}px)`;
      el.style.width = `calc(${(p.c1 - p.c0 + 1) * colW}% - ${(p.contL ? 0 : 2) + (p.contR ? 0 : 2)}px)`;
      el.style.top = `${top + p.lane * (CH + G)}px`;
      el.textContent = p.ev.title;
      el.title = p.ev.title;
      el.dataset.id = p.ev.id;
      layer.appendChild(el);
    }
    hidden.forEach((n, c) => {
      if (!n) return;
      const el = document.createElement('div');
      el.className = 'more';
      el.style.left = `${c * colW}%`;
      el.style.width = `${colW}%`;
      el.style.top = `${top + limit[c] * (CH + G)}px`;
      el.textContent = `+${n}`;
      el.dataset.date = ymd(addDays(ws, c));
      layer.appendChild(el);
    });
    row.appendChild(layer);
  }
}

async function show(y, m, anim) {
  const d = new Date(y, m, 1);
  state.y = d.getFullYear();
  state.m = d.getMonth();
  render(anim); // 캐시된 내용으로 즉시 그림
  try {
    await Promise.all([loadHolidays(state.y), loadHolidays(state.m === 11 ? state.y + 1 : state.y), loadHolidays(state.m === 0 ? state.y - 1 : state.y), loadMonth(state.y, state.m)]);
    if (state.y === d.getFullYear() && state.m === d.getMonth()) render();
    // 앞뒤 달 미리 불러오기
    for (const k of [1, -1]) { const n = new Date(state.y, state.m + k, 1); loadMonth(n.getFullYear(), n.getMonth()).catch(() => {}); }
  } catch (e) { toast(e.message); }
}

// ---------- 시트 ----------
function openSheet(html, onMount) {
  $('#sheetBody').innerHTML = html;
  $('#sheet').hidden = false;
  $('#scrim').hidden = false;
  onMount && onMount($('#sheetBody'));
}
function closeSheet() {
  $('#sheet').hidden = true;
  $('#scrim').hidden = true;
  if (state.selected) { state.selected = null; render(); }
}
$('#scrim').addEventListener('click', closeSheet);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') return closeSheet();
  if (!$('#sheet').hidden || /INPUT|TEXTAREA/.test(document.activeElement?.tagName)) return;
  if (e.key === 'ArrowLeft') show(state.y, state.m - 1, 'slide-r');
  if (e.key === 'ArrowRight') show(state.y, state.m + 1, 'slide-l');
});

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2600);
}

const findEvent = (id) => { for (const list of state.cache.values()) { const e = list.find((x) => x.id === id); if (e) return e; } return null; };

function eventsOn(k) {
  const list = state.cache.get(monthKey(state.y, state.m)) || [];
  return sortEvents(list.filter((ev) => { const { s, e } = eventSpan(ev); return s <= k && k <= e; }));
}

function timeLabel(ev) {
  const { s, e } = eventSpan(ev);
  const range = s !== e ? `${+s.slice(5, 7)}/${+s.slice(8)} – ${+e.slice(5, 7)}/${+e.slice(8)}` : '';
  if (ev.allDay) return range ? `${range} · 하루 종일` : '하루 종일';
  const t = ev.end ? `${hhmm(ev.start)} – ${hhmm(ev.end)}` : hhmm(ev.start);
  return range ? `${range} · ${t}` : t;
}

function listHtml(events, withDate) {
  if (!events.length) return '<div class="empty">일정이 없습니다</div>';
  return `<ul class="list">${events.map((ev) => `
    <li data-id="${esc(ev.id)}">
      <span class="bar c-${colorOf(ev)}"></span>
      <div class="t"><b>${esc(ev.title)}</b><span>${withDate ? esc(dayKey(ev.start)) + ' · ' : ''}${esc(timeLabel(ev))}${ev.category ? ' · ' + esc(ev.category.name) : ''}</span></div>
    </li>`).join('')}</ul>`;
}

function openDay(k) {
  state.selected = k;
  render();
  const d = parseYmd(k);
  const hol = state.holidays[k];
  openSheet(`
    <h2>${d.getMonth() + 1}월 ${d.getDate()}일 (${WD[d.getDay()]})</h2>
    <div class="sub ${hol ? '' : 'muted'}">${hol ? esc(hol) : `${eventsOn(k).length}개의 일정`}</div>
    ${listHtml(eventsOn(k))}
    <button class="btn" id="addHere">+ 새 일정</button>`, (root) => {
    root.querySelector('#addHere').onclick = () => openEditor(null, k);
    root.querySelectorAll('li[data-id]').forEach((li) => (li.onclick = () => openEditor(findEvent(li.dataset.id))));
  });
}

function openEditor(ev, dateK) {
  const meta = state.meta || { categories: [] };
  const isNew = !ev;
  const base = dateK || state.selected || ymd(new Date());
  const f = {
    title: ev?.title || '',
    allDay: ev ? ev.allDay : true,
    sDate: ev ? dayKey(ev.start) : base,
    eDate: ev ? dayKey(ev.end) || dayKey(ev.start) : base,
    sTime: ev && !ev.allDay ? hhmm(ev.start) : '09:00',
    eTime: ev && !ev.allDay && ev.end ? hhmm(ev.end) : '',
    category: ev?.category?.name ?? (meta.categories[0]?.name || null),
  };
  const cats = meta.categoryProp
    ? `<div class="field"><label>${esc(meta.categoryProp)}</label><div class="cats">
        <button type="button" class="cat none" data-c="">없음</button>
        ${meta.categories.map((c) => `<button type="button" class="cat c-${COLORS.includes(c.color) ? c.color : 'blue'}" data-c="${esc(c.name)}">${esc(c.name)}</button>`).join('')}
      </div></div>` : '';

  openSheet(`
    <form id="form" autocomplete="off">
      <input class="title-input field" type="text" name="title" placeholder="제목" value="${esc(f.title)}" />
      <div class="toggle"><span>하루 종일</span><button type="button" class="switch" id="allDay" role="switch" aria-checked="${f.allDay}"></button></div>
      <div class="row">
        <div class="field"><label>시작</label><input type="date" name="sDate" value="${f.sDate}" required /></div>
        <div class="field timeonly"><label>&nbsp;</label><input type="time" name="sTime" value="${f.sTime}" /></div>
      </div>
      <div class="row">
        <div class="field"><label>종료</label><input type="date" name="eDate" value="${f.eDate}" /></div>
        <div class="field timeonly"><label>&nbsp;</label><input type="time" name="eTime" value="${f.eTime}" /></div>
      </div>
      ${cats}
      <button class="btn" type="submit">${isNew ? '추가' : '저장'}</button>
      ${ev?.url ? `<a class="btn ghost" href="${esc(ev.url)}" target="_blank" rel="noopener" style="text-decoration:none">Notion에서 열기</a>` : ''}
      ${isNew ? '' : '<button class="btn danger" type="button" id="del">삭제</button>'}
    </form>`, (root) => {
    const form = root.querySelector('#form');
    const sw = root.querySelector('#allDay');
    const syncTime = () => root.querySelectorAll('.timeonly').forEach((el) => (el.style.display = f.allDay ? 'none' : ''));
    syncTime();
    sw.onclick = () => { f.allDay = !f.allDay; sw.setAttribute('aria-checked', f.allDay); syncTime(); };
    const markCat = () => root.querySelectorAll('.cat').forEach((b) => b.classList.toggle('on', (b.dataset.c || null) === (f.category || null)));
    markCat();
    root.querySelectorAll('.cat').forEach((b) => (b.onclick = () => { f.category = b.dataset.c || null; markCat(); }));
    form.sDate.onchange = () => { if (!form.eDate.value || form.eDate.value < form.sDate.value) form.eDate.value = form.sDate.value; };
    if (isNew) setTimeout(() => form.title.focus(), 250);

    form.onsubmit = async (e) => {
      e.preventDefault();
      const sD = form.sDate.value, eD = form.eDate.value || sD;
      if (eD < sD) return toast('종료일이 시작일보다 빠릅니다');
      const off = tzOffset();
      let start, end;
      if (f.allDay) { start = sD; end = eD !== sD ? eD : null; }
      else {
        start = `${sD}T${form.sTime.value || '09:00'}:00${off}`;
        end = form.eTime.value || eD !== sD ? `${eD}T${form.eTime.value || form.sTime.value || '09:00'}:00${off}` : null;
        if (end && end < start) return toast('종료 시각이 시작보다 빠릅니다');
      }
      const body = { title: form.title.value.trim() || '제목 없음', start, end, allDay: f.allDay, category: meta.categoryProp ? f.category : undefined };
      const btn = form.querySelector('[type=submit]');
      btn.disabled = true;
      busy(true);
      try {
        if (isNew) await api('/api/events', { method: 'POST', body });
        else await api(`/api/events/${ev.id}`, { method: 'PATCH', body });
        toast(isNew ? '추가했습니다' : '저장했습니다');
        await refreshAround(sD);
        closeSheet();
      } catch (err) { toast(err.message); btn.disabled = false; }
      finally { busy(false); }
    };
    const del = root.querySelector('#del');
    if (del) del.onclick = async () => {
      if (!confirm(`'${ev.title}' 일정을 삭제할까요? (Notion 휴지통으로 이동)`)) return;
      busy(true);
      try { await api(`/api/events/${ev.id}`, { method: 'DELETE' }); toast('삭제했습니다'); await refreshAround(dayKey(ev.start)); closeSheet(); }
      catch (err) { toast(err.message); }
      finally { busy(false); }
    };
  });
}

// 수정 후: 캐시를 비우고 현재 달을 다시 받는다
async function refreshAround() {
  state.cache.clear();
  await loadMonth(state.y, state.m, true);
  render();
}

function openMonthPicker() {
  let y = state.y;
  const draw = () => openSheet(`
    <div class="yearbar"><button id="py">‹</button><span>${y}년</span><button id="ny">›</button></div>
    <div class="months">${Array.from({ length: 12 }, (_, i) => `<button data-m="${i}" class="${y === state.y && i === state.m ? 'on' : ''}">${i + 1}월</button>`).join('')}</div>
    <button class="btn ghost" id="goToday">오늘</button>`, (root) => {
    root.querySelector('#py').onclick = () => { y--; draw(); };
    root.querySelector('#ny').onclick = () => { y++; draw(); };
    root.querySelector('#goToday').onclick = () => { closeSheet(); goToday(); };
    root.querySelectorAll('[data-m]').forEach((b) => (b.onclick = () => { closeSheet(); show(y, +b.dataset.m); }));
  });
  draw();
}

function openSearch() {
  openSheet(`
    <div class="field"><input type="search" id="q" placeholder="일정 제목 검색" enterkeyhint="search" /></div>
    <div id="results"><div class="empty">제목으로 Notion 데이터베이스 전체를 검색합니다</div></div>`, (root) => {
    const q = root.querySelector('#q');
    setTimeout(() => q.focus(), 250);
    let timer, seq = 0;
    q.oninput = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const term = q.value.trim();
        const box = root.querySelector('#results');
        if (!term) return (box.innerHTML = '');
        const my = ++seq;
        try {
          const list = await api(`/api/events?q=${encodeURIComponent(term)}`);
          if (my !== seq) return;
          box.innerHTML = listHtml(list.slice().reverse(), true);
          box.querySelectorAll('li[data-id]').forEach((li) => (li.onclick = async () => {
            const ev = list.find((x) => x.id === li.dataset.id);
            const d = parseYmd(dayKey(ev.start));
            closeSheet();
            await show(d.getFullYear(), d.getMonth());
            openEditor(findEvent(ev.id) || ev);
          }));
        } catch (e) { box.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
      }, 250);
    };
  });
}

function goToday() {
  const n = new Date();
  const dir = n.getFullYear() * 12 + n.getMonth() > state.y * 12 + state.m ? 'slide-l' : 'slide-r';
  show(n.getFullYear(), n.getMonth(), dir);
}

// ---------- 입력 ----------
grid.addEventListener('click', (e) => {
  if (swiped) return;
  const chip = e.target.closest('.chip');
  if (chip) return openEditor(findEvent(chip.dataset.id));
  const more = e.target.closest('.more');
  if (more) return openDay(more.dataset.date);
  const cell = e.target.closest('.day');
  if (cell) openDay(cell.dataset.date);
});

let sx = 0, sy = 0, swiped = false;
grid.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; swiped = false; }, { passive: true });
grid.addEventListener('touchend', (e) => {
  const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3) {
    swiped = true;
    setTimeout(() => (swiped = false), 350);
    dx < 0 ? show(state.y, state.m + 1, 'slide-l') : show(state.y, state.m - 1, 'slide-r');
  } else if (Math.abs(dy) > 60 && Math.abs(dy) > Math.abs(dx) * 1.3) {
    swiped = true;
    setTimeout(() => (swiped = false), 350);
    dy < 0 ? show(state.y, state.m + 1, 'slide-l') : show(state.y, state.m - 1, 'slide-r');
  }
});
grid.addEventListener('wheel', (() => {
  let lock = 0;
  return (e) => {
    if (Math.abs(e.deltaY) < 30 || Date.now() < lock) return;
    lock = Date.now() + 450;
    e.deltaY > 0 ? show(state.y, state.m + 1, 'slide-l') : show(state.y, state.m - 1, 'slide-r');
  };
})(), { passive: true });

$('#btnMonth').onclick = openMonthPicker;
$('#btnToday').onclick = goToday;
$('#btnSearch').onclick = openSearch;
$('#btnAdd').onclick = () => openEditor(null, state.selected || (new Date().getMonth() === state.m && new Date().getFullYear() === state.y ? ymd(new Date()) : ymd(new Date(state.y, state.m, 1))));
$('#btnRefresh').onclick = async () => {
  const b = $('#btnRefresh');
  b.classList.add('spin');
  try { state.cache.clear(); await loadMonth(state.y, state.m, true); render(); toast('Notion과 동기화했습니다'); }
  catch (e) { toast(e.message); }
  finally { b.classList.remove('spin'); }
};

let rt;
window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => render(), 100); });
// 다른 기기·Notion 에서 바뀐 내용 반영: 앱으로 돌아오면 다시 받기
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { state.cache.clear(); loadMonth(state.y, state.m, true).then(() => render()).catch(() => {}); }
});

// ---------- 시작 ----------
(async () => {
  render();
  try {
    state.meta = await api('/api/meta');
    $('#demoBadge').hidden = !state.meta.demo;
    document.title = state.meta.title || document.title;
  } catch (e) { toast(e.message); }
  show(state.y, state.m);
})();
