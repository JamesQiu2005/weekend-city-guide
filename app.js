// 周末去哪* v0.3 — 帖子即局 · SOUR 设计系统（见 DESIGN.md）
// Place（地点）→ Session（局）→ Entry（局内动态）。hash 路由 + localStorage（wk2_*）+ 在线时走 Cloudflare 后端。
const $ = (s) => document.querySelector(s);
const PL = Object.fromEntries(PLACES.map((p) => [p.id, p]));

// ---------- 存储 ----------
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
};
const KEYS = { prefs: "wk2_prefs", sessions: "wk2_sessions", likes: "wk2_likes", saves: "wk2_saves", loc: "wk2_loc" };

// ---------- 工具 ----------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => (n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n));
const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const money = (p) => (p === 0 ? "免费" : "¥" + p);
const go = (h) => { location.hash = h; };
const pad = (n) => String(n).padStart(2, "0");
const dstr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => dstr(new Date());
const WD = "日一二三四五六", WD_EN = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const dateLabel = (s) => { const d = new Date(s + "T00:00:00"); return `${d.getMonth() + 1}月${d.getDate()}日 周${WD[d.getDay()]}`; };
const dateMono = (s) => { const d = new Date(s + "T00:00:00"); return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${WD_EN[d.getDay()]}`; };
const daysFromToday = (s) => Math.round((new Date(s + "T00:00:00") - new Date(today() + "T00:00:00")) / 864e5);
const shortName = (p) => p.name.split(" · ")[0];
const subName = (p) => p.name.split(" · ").slice(1).join(" · ");
const addHours = (t, h) => { const [a, b] = (t || "10:00").split(":").map(Number); return `${pad(Math.min(23, a + h))}:${pad(b)}`; };
const b64e = (o) => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(o)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64d = (s) => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))));
function km(a, b) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
const kmLabel = (d) => (d < 1 ? `${Math.round(d * 1000)}m` : `${d < 10 ? d.toFixed(1) : Math.round(d)}km`);

// ---------- 图标（线性 SVG，替代 emoji）----------
const sv = (d, extra = "") => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
const ICON = {
  feed: sv('<rect x="4" y="3.5" width="16" height="10" rx="2"/><path d="M4 17.5h16M4 20.5h10"/>'),
  map: sv('<path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4Z"/><path d="M9 4v14M15 6v14"/>'),
  plus: sv('<path d="M12 5v14M5 12h14"/>', 'stroke-width="2.2"'),
  ticket: sv('<path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2.5 2.5 0 0 0 0 5v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3a2.5 2.5 0 0 0 0-5V7Z"/><path d="M14 5v14" stroke-dasharray="2 2.5"/>'),
  user: sv('<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c1.2-3.6 3.8-5.5 7-5.5s5.8 1.9 7 5.5"/>'),
  search: sv('<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>'),
  pin: sv('<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.3"/>'),
  share: sv('<path d="M12 15V4M8 8l4-4 4 4"/><path d="M6 12v6a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-6"/>'),
  edit: sv('<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"/>'),
  camera: sv('<path d="M4 8h3l1.6-2.5h6.8L17 8h3v11H4V8Z"/><circle cx="12" cy="13.2" r="3.3"/>'),
  yen: sv('<path d="m7 4 5 7 5-7M12 11v9M8 13h8M8 16.5h8"/>'),
  flag: sv('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'),
  lock: sv('<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>'),
  link: sv('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  globe: sv('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.8 2.5 14.2 0 17M12 3.5c-2.5 2.8-2.5 14.2 0 17"/>'),
  star: sv('<path d="m12 4 2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6L12 4Z"/>'),
  starOn: sv('<path d="m12 4 2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6L12 4Z" fill="currentColor"/>'),
  heart: sv('<path d="M12 20s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 7.4 4.2 4.2 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z"/>'),
  heartOn: sv('<path d="M12 20s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 7.4 4.2 4.2 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z" fill="currentColor"/>'),
  close: sv('<path d="M6 6l12 12M18 6 6 18"/>'),
  back: sv('<path d="M15 5l-7 7 7 7"/>', 'stroke-width="2.2"'),
  arrow: sv('<path d="M5 12h14M13 6l6 6-6 6"/>', 'stroke-width="2"'),
  locate: sv('<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>'),
  check: sv('<path d="m5 12.5 4.5 4.5L19 7"/>', 'stroke-width="2.2"'),
  drag: sv('<path d="M5 9h14M5 15h14"/>'),
  spark: sv('<path d="M12 3v5M12 16v5M3 12h5M16 12h5M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3"/>'),
};
const VIS = { private: ["lock", "私密", "只有你自己能看到"], link: ["link", "链接可见", "拿到链接的人才能看、才能加入（还没有好友关系）"], public: ["globe", "公开", "出现在「发现」和地图上，完成后就是一篇攻略"] };

// ---------- v0.1 → v0.2 迁移（逻辑不变） ----------
function migrateV1() {
  try { if (localStorage.getItem("wk2_migrated")) return; } catch { return; }
  const old = { prefs: LS.get("wk_prefs", null), squads: LS.get("wk_squads", []), checkins: LS.get("wk_checkins", []), guides: LS.get("wk_guides", []), likes: LS.get("wk_likes", {}), saves: LS.get("wk_saves", {}) };
  if (old.prefs) {
    const prefs = { ...old.prefs, uid: uid("u"), city: "上海" };
    LS.set(KEYS.prefs, prefs);
    const me = { uid: prefs.uid, name: prefs.nick, avatar: prefs.avatar || "🐱" };
    const sessions = [];
    const nextDay = (day) => weekendDate(0, day);
    old.squads.filter((q) => q.role === "host" || q.role === "joined").forEach((q) => {
      const p = PL[q.activityId]; if (!p) return;
      const [day, part] = (q.time || "周六 下午").split(" ");
      const time = { 上午: "10:00", 下午: "14:00", 晚上: "19:00" }[part] || "14:00";
      const members = q.members.map((n) => n === prefs.nick
        ? { ...me, role: q.host === n ? "organizer" : "member", joinedAt: q.createdAt || Date.now() }
        : { uid: "v1-" + n, name: n, avatar: "🙂", role: q.host === n ? "organizer" : "member", joinedAt: q.createdAt || Date.now() });
      sessions.push({ id: q.id, title: `${shortName(p)}局`, cover: null, organizer: q.host, visibility: "link", date: nextDay(day === "周日" ? "sun" : "sat"), startTime: time,
        stops: [{ placeId: p.id, time, estCost: p.avgCost, note: "" }], budget: { total: p.avgCost * q.cap, perPerson: p.avgCost, mode: q.costMode === "AA" ? "AA" : "treat" },
        members, cap: q.cap, closed: false, likes: 0, tags: [], createdAt: q.createdAt || Date.now(),
        entries: [sysEntry(q.id, "由 v0.1 的组队迁移而来"), ...(q.note ? [{ id: uid("e"), sessionId: q.id, type: "note", author: q.host, avatar: "🙂", text: q.note, createdAt: q.createdAt || Date.now() }] : [])] });
    });
    old.checkins.forEach((c) => {
      const p = PL[c.activityId]; if (!p) return;
      const t = c.createdAt || Date.now();
      sessions.push({ id: c.id, title: `打卡 · ${shortName(p)}`, cover: null, organizer: me.name, visibility: "private", date: dstr(new Date(t)), startTime: "",
        stops: [{ placeId: p.id, time: "", estCost: c.cost || 0, note: "" }], budget: { total: c.cost || 0, perPerson: c.cost || 0, mode: "AA" },
        members: [{ ...me, role: "organizer", joinedAt: t }], cap: 1, closed: true, likes: 0, tags: [], createdAt: t,
        entries: [
          { id: uid("e"), sessionId: c.id, type: "checkin", stopIndex: 0, author: me.name, avatar: me.avatar, uid: me.uid, photo: c.photo, text: c.mood, rating: c.rating, verified: false, verifyNote: "v0.1 打卡，未做到场认证", createdAt: t },
          ...(c.cost ? [{ id: uid("e"), sessionId: c.id, type: "spend", stopIndex: 0, author: me.name, avatar: me.avatar, uid: me.uid, amount: c.cost, text: "", createdAt: t + 1 }] : []),
        ] });
    });
    old.guides.forEach((g) => {
      const p = PL[g.activityId]; if (!p) return;
      const t = g.createdAt || Date.now();
      sessions.push({ id: g.id, title: g.title, cover: g.images?.[0] || null, organizer: me.name, visibility: "public", date: dstr(new Date(t)), startTime: "",
        stops: [{ placeId: p.id, time: "", estCost: p.avgCost, note: "" }], budget: { total: p.avgCost, perPerson: p.avgCost, mode: "AA" },
        members: [{ ...me, role: "organizer", joinedAt: t }], cap: 1, closed: true, likes: g.likes || 0, tags: g.tags || [], createdAt: t,
        entries: [{ id: uid("e"), sessionId: g.id, type: "note", author: me.name, avatar: me.avatar, uid: me.uid, text: g.body, createdAt: t },
          ...(g.images || []).map((src, i) => ({ id: uid("e"), sessionId: g.id, type: "photo", author: me.name, avatar: me.avatar, uid: me.uid, photo: src, createdAt: t + i + 1 }))] });
    });
    LS.set(KEYS.sessions, sessions);
  }
  LS.set(KEYS.likes, old.likes);
  LS.set(KEYS.saves, old.saves);
  try { localStorage.setItem("wk2_migrated", String(Date.now())); } catch {}
}
function sysEntry(sessionId, text) { return { id: uid("e"), sessionId, type: "system", text, createdAt: Date.now() }; }
migrateV1();

const S = {
  prefs: LS.get(KEYS.prefs, null),
  sessions: LS.get(KEYS.sessions, []),
  likes: LS.get(KEYS.likes, {}),
  saves: LS.get(KEYS.saves, {}),
  loc: (() => { const l = LS.get(KEYS.loc, null); return l && Date.now() - l.at < 864e5 ? l : null; })(),
  wx: null,
  ui: { layer: "rec", cond: null, mapChip: "全部", q: "", searching: false, sessSeg: "planning", meSeg: "trail" },
};
function persist(k) { if (!LS.set(KEYS[k], S[k])) toast("本地存储已满，试试少传几张图"); }

// ---------- 后端（RFC-001）在线 / 离线双模（逻辑不变） ----------
const REMOTE = new Map();
const hasAPI = typeof API !== "undefined";
let probeP = hasAPI ? API.probe() : Promise.resolve(false);
const online = () => hasAPI && API.online === true;
const fmtDist = (m) => (m < 1000 ? `${m}m` : `${(m / 1000).toFixed(1)}km`);
function adapt(ss) {
  return {
    remote: true, id: ss.id, title: ss.title, cover: ss.cover, organizer: ss.organizer?.name || "", visibility: ss.visibility, date: ss.date, startTime: ss.startTime || "",
    cap: ss.cap, status: ss.status, closed: !!ss.closedAt, viewer: ss.viewer || {}, createdAt: ss.createdAt, likes: 0, tags: [],
    stops: ss.stops.map((st) => ({ placeId: st.placeId, time: st.time || "", estCost: st.estCost, note: st.note || "", backupPlaceId: st.backupPlaceId, allArrived: st.allArrived })),
    budget: { total: ss.budget.total, perPerson: ss.budget.perPerson, mode: ss.budget.mode },
    members: ss.members.map((m) => ({ uid: m.id, name: m.name, avatar: m.avatar, role: m.role, joinedAt: m.joinedAt })),
    entries: ss.entries.map((e) => ({
      id: e.id, sessionId: e.sessionId, type: e.type, stopIndex: e.stopIdx, author: e.author?.name, avatar: e.author?.avatar, uid: e.author?.id,
      photo: e.photoUrl, text: e.text, amount: e.amount, rating: e.rating, verified: e.verified, createdAt: e.createdAt,
      verifyNote: e.type !== "checkin" ? null : e.distanceM == null ? "未开启定位" : e.verified ? `距离 ${fmtDist(e.distanceM)}` : e.distanceM <= 500 ? "定位精度不够" : `距离该站 ${fmtDist(e.distanceM)}，超出 500m`,
    })),
  };
}
function adaptSummary(x) {
  return {
    remote: true, summary: true, id: x.id, title: x.title, cover: x.cover, date: x.date, startTime: x.startTime || "", status: x.status, visibility: x.visibility,
    organizer: x.organizer?.name || "", cap: x.cap, budget: x.budget, checkinCount: x.checkinCount, likes: 0, tags: [],
    stops: x.placeIds.map((placeId) => ({ placeId })), members: Array.from({ length: x.memberCount }, (_, i) => ({ name: i ? "" : x.organizer?.name || "", avatar: x.memberAvatars[i] })),
    entries: (x.photoUrls || []).map((photo) => ({ type: "photo", photo })), role: x.role, viewer: { isMember: !!x.role, isOrganizer: x.role === "organizer" },
  };
}
const ERR = { SESSION_FULL: "这个局已经满员了", SESSION_CLOSED: "这个局已经结束了", ALREADY_CHECKED_IN: "你已经在这一站打过卡了", NOT_A_MEMBER: "先加入这个局", SESSION_NOT_FOUND: "局不存在，或者是私密局", NETWORK: "网络断了，稍后再试", TOO_LARGE: "照片太大了", UNAUTHORIZED: "身份失效了，请刷新页面" };
function apiErr(e) { toast(ERR[e?.code] || e?.message || "出错了"); if (e?.code === "NETWORK") setModeBadge(); return null; }
async function ensureMe() { const a = await API.ensureUser(S.prefs.nick, S.prefs.avatar); return a.user; }
async function uploadDataURL(d) { const blob = await (await fetch(d)).blob(); return (await API.upload(blob)).key; }
async function loadRemote(id) {
  await probeP;
  if (!online()) { REMOTE.delete(id); return null; }
  try { const r = await API.session(id); const a = adapt(r.session); REMOTE.set(id, a); return a; }
  catch (e) { if (e.code === "SESSION_NOT_FOUND" || e.status === 404) REMOTE.set(id, { missing: true }); else apiErr(e); return null; }
}
async function remoteWrite(id, fn) {
  try { await ensureMe(); const r = await fn(); if (r?.session) REMOTE.set(id, adapt(r.session)); return r || {}; }
  catch (e) { apiErr(e); return null; }
}
function modeLine() { return online() ? `<span class="mode on">在线 · 多人实时同步</span>` : `<span class="mode">离线演示模式 · 数据只存在本机</span>`; }
function setModeBadge() { document.querySelectorAll(".mode-slot").forEach((el) => (el.innerHTML = modeLine())); }

// ---------- 局：读写与推导（逻辑不变） ----------
function allSessions() {
  const mine = new Map(S.sessions.map((s) => [s.id, s]));
  return [...S.sessions, ...SEED_SESSIONS.filter((s) => !mine.has(s.id))];
}
const localSession = (id) => allSessions().find((s) => s.id === id);
const getSession = (id) => localSession(id) || (REMOTE.get(id)?.missing ? null : REMOTE.get(id));
function saveSession(s) {
  const i = S.sessions.findIndex((x) => x.id === s.id);
  if (i >= 0) S.sessions[i] = s; else S.sessions.unshift(s);
  persist("sessions");
}
// 成员对象里带上年龄和学校，分享快照时一起带走（性别只存不展示）
const meRef = () => ({ uid: S.prefs.uid, name: S.prefs.nick, avatar: S.prefs.avatar || "🐱", ...(S.prefs.age ? { age: S.prefs.age } : {}), ...(S.prefs.school ? { school: S.prefs.school } : {}), ...(S.prefs.prompt ? { prompt: S.prefs.prompt } : {}) });
const isMember = (s) => s.remote ? !!s.viewer?.isMember : !!S.prefs && s.members.some((m) => m.uid === S.prefs.uid);
const isOrganizer = (s) => s.remote ? !!s.viewer?.isOrganizer : !!S.prefs && s.members.some((m) => m.uid === S.prefs.uid && m.role === "organizer");
const checkins = (s) => s.entries.filter((e) => e.type === "checkin");
function status(s) {
  if (s.remote) return s.status;
  if (s.closed) return "done";
  const d = daysFromToday(s.date);
  return d > 0 ? "planning" : d === 0 ? "live" : "done";
}
const STATUS_LABEL = { planning: "筹备中", live: "进行中", done: "已完成" };
const estTotal = (s) => s.summary ? (s.budget.perPerson || 0) * s.cap : s.stops.reduce((a, st) => a + (+st.estCost || 0), 0) * s.cap;
const actualTotal = (s) => s.entries.filter((e) => e.type === "spend" || e.type === "checkin").reduce((a, e) => a + (+e.amount || 0), 0);
function sessionPhotos(s) {
  const fromEntries = s.entries.filter((e) => e.photo).map((e) => e.photo);
  const fromStops = s.stops.map((st) => PL[st.placeId]?.photos[0]?.src).filter(Boolean);
  return [...new Set([s.cover, ...fromEntries, ...fromStops].filter(Boolean))];
}
function currentStop(s) {
  const now = new Date(), hm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  let idx = 0;
  s.stops.forEach((st, i) => { if (st.time && st.time <= hm) idx = i; });
  return idx;
}
const noShow = (s) => status(s) === "done" && !(s.summary ? s.checkinCount : checkins(s).length);
const profileOf = (m) => ({ ...(SEED_PROFILES[m.name] || {}), ...(m.uid && S.prefs && m.uid === S.prefs.uid ? { age: S.prefs.age, school: S.prefs.school, prompt: S.prefs.prompt } : {}), ...Object.fromEntries(["age", "school", "prompt"].filter((k) => m[k]).map((k) => [k, m[k]])) });
const profileLine = (m) => { const p = profileOf(m); return [p.age, p.school].filter(Boolean).join(" · "); };

// ---------- 天气：逐站 × 逐小时（逻辑不变，显示改为文字） ----------
const WX = new Map();
const wxText = (c) => c === 0 ? "晴" : c <= 3 ? "多云" : c <= 48 ? "雾" : c <= 67 ? "雨" : c <= 77 ? "雪" : c <= 82 ? "阵雨" : "雷雨";
const wxKey = (p, date) => `${p.lat.toFixed(1)},${p.lon.toFixed(1)},${date}`;
function wxFor(p, date, time) {
  if (!p || !date) return null;
  const ahead = daysFromToday(date);
  if (ahead > 15) { const [t, r] = CLIMATE[new Date(date + "T00:00:00").getMonth()]; return { kind: "climate", temp: t, rain: r, ahead }; }
  if (ahead < -90) return null;
  const k = wxKey(p, date), c = WX.get(k);
  if (!c) { fetchWx(p, date); return { kind: "loading" }; }
  if (c.loading) return { kind: "loading" };
  const h = Math.min(23, parseInt((time || "12:00").split(":")[0], 10) || 12);
  return { kind: c.mock ? "mock" : "ok", text: wxText(c.code[h]), temp: Math.round(c.temp[h]), rain: c.rain[h] ?? 0 };
}
async function fetchWx(p, date) {
  const k = wxKey(p, date);
  WX.set(k, { loading: true });
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${p.lat.toFixed(2)}&longitude=${p.lon.toFixed(2)}&hourly=temperature_2m,precipitation_probability,weathercode&timezone=Asia%2FShanghai&start_date=${date}&end_date=${date}`;
  try {
    await probeP;
    if (online()) {
      const w = await API.weather(p.lat.toFixed(2), p.lon.toFixed(2), date);
      if (w.available && w.hourly?.length) {
        const by = (f) => Array.from({ length: 24 }, (_, h) => { const x = w.hourly.find((r) => +r.time.slice(0, 2) === h); return x ? x[f] : 0; });
        WX.set(k, { temp: by("temp"), rain: by("precipProb").map((x) => x ?? 0), code: by("code") }); onWxLoaded(); return;
      }
    }
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 3000);
    const j = await (await fetch(url, { signal: ctrl.signal })).json(); clearTimeout(t);
    if (!j.hourly) throw new Error("no data");
    WX.set(k, { temp: j.hourly.temperature_2m, rain: j.hourly.precipitation_probability.map((x) => x ?? 0), code: j.hourly.weathercode });
  } catch {
    const seed = [...date].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 100;
    const rainy = seed % 3 === 0;
    WX.set(k, { mock: true, temp: Array.from({ length: 24 }, (_, h) => 18 + 6 * Math.sin(((h - 8) / 24) * Math.PI)), rain: Array(24).fill(rainy ? 70 : 10), code: Array(24).fill(rainy ? 61 : 1) });
  }
  onWxLoaded();
}
let wxTimer = null;
function onWxLoaded() {
  clearTimeout(wxTimer);
  wxTimer = setTimeout(() => {
    const r = route().name;
    if (r === "new" || r === "edit") renderStops();
    else if (r === "session" || r === "s") render();
  }, 60);
}
function wxChip(p, date, time) {
  const w = wxFor(p, date, time);
  if (!w) return "";
  if (w.kind === "loading") return `<span class="wxchip">天气…</span>`;
  if (w.kind === "climate") return `<span class="wxchip" title="超出 16 天预报范围">${w.ahead - 15} 天后预报 · 常年 ${w.temp}°</span>`;
  const bad = !p.indoor && w.rain >= 50;
  return `<span class="wxchip ${bad ? "bad" : ""}">${w.text} ${w.temp}° · 降水 ${w.rain}%${w.kind === "mock" ? " · 示例" : ""}</span>`;
}
const rainyStop = (p, date, time) => { const w = wxFor(p, date, time); return !!w && (w.kind === "ok" || w.kind === "mock") && !p.indoor && w.rain >= 50; };
function backupFor(p, exclude = []) {
  return PLACES.filter((x) => x.indoor && x.id !== p.id && !exclude.includes(x.id)).sort((a, b) => km(p, a) - km(p, b))[0];
}
function pickWeekend(days) {
  const out = {};
  for (const d of days) { const wd = new Date(d.date + "T00:00:00").getDay(); if (wd === 6 && !out.sat) out.sat = d; if (wd === 0 && !out.sun) out.sun = d; }
  return out;
}
async function loadWeather() {
  const { lat, lon } = CITIES["上海"];
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FShanghai&forecast_days=7`;
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 3000);
    const j = await (await fetch(url, { signal: ctrl.signal })).json(); clearTimeout(t);
    const d = j.daily;
    S.wx = pickWeekend(d.time.map((date, i) => ({ date, code: d.weathercode[i], max: Math.round(d.temperature_2m_max[i]), min: Math.round(d.temperature_2m_min[i]), rain: d.precipitation_probability_max[i] ?? 0 })));
  } catch {
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(Date.now() + i * 864e5), wd = d.getDay(); return { date: dstr(d), code: wd === 6 ? 61 : 1, max: 24, min: 17, rain: wd === 6 ? 75 : 10 }; });
    S.wx = { ...pickWeekend(days), mock: true };
  }
  if (route().name === "discover") { renderWeather(); renderDiscoverList(); }
}

// ---------- 推荐打分（逻辑不变；理由改成一句人话） ----------
// 返回 { rain, label }；天气还没拿到时返回 null（不下结论）
function rainFor(p) {
  if (!S.wx) return null;
  const sat = S.wx.sat?.rain, sun = S.wx.sun?.rain;
  if (p.days.length === 1) { const d = p.days[0], r = d === "sat" ? sat : sun; return r == null ? null : { rain: r, label: d === "sat" ? "周六" : "周日" }; }
  if (sat == null && sun == null) return null;
  if (sat == null || sun == null) return { rain: sat ?? sun, label: sat != null ? "周六" : "周日" };
  if (Math.min(sat, sun) > 50) return { rain: Math.min(sat, sun), label: "周末两天" };
  return sat <= sun ? { rain: sat, label: "周六" } : { rain: sun, label: "周日" };
}
// wxOverride：{ rain, label } 或 null（未知）；不传则用发现页的周末天气
function score(p, prefs = S.prefs, wxOverride) {
  const reasons = [];
  let sc = 0;
  if (prefs.likes.includes(p.category)) { sc += 40; reasons.push(prefs.demo ? `示例偏好里有${p.category}` : `你喜欢${p.category}`); }
  if (p.avgCost <= prefs.budget) { sc += 25; reasons.push(p.avgCost === 0 ? "不花钱" : "在你的预算内"); }
  else sc += 25 * Math.max(0, 1 - (p.avgCost - prefs.budget) / Math.max(prefs.budget, 50));
  const w = wxOverride !== undefined ? wxOverride : rainFor(p);
  if (!w) sc += 12;                                   // 天气未知：不加不减，也不写理由
  else if (w.rain > 50) { if (p.indoor) { sc += 20; reasons.push(`${w.label}降水 ${w.rain}%，这里在室内`); } else sc += 4; }
  else if (!p.indoor) { if (w.rain < 30) { sc += 20; reasons.push(`${w.label}降水只有 ${w.rain}%，适合在外面待着`); } else sc += 10; }
  else sc += 14;
  const g = prefs.groupSize;
  if (p.suitFor.includes(g)) { sc += 10; reasons.push(g === 1 ? "一个人去也自在" : `适合${GROUPS.find((x) => x.value === g)?.label || g + " 人"}一起`); }
  sc += (5 * p.heat) / 3200;
  return { sc, reasons };
}
const reasonSentence = (rs) => (rs.length ? rs.join("，") + "。" : "");

// ---------- 通用 UI ----------
function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast"; el.textContent = msg;
  $("#layer").appendChild(el);
  setTimeout(() => el.remove(), 2300);
}
function copy(text, inputSel) {
  const fallback = () => { const i = inputSel && $(inputSel); if (i) i.select(); toast("请长按链接手动复制"); };
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast("链接已复制，丢进群里吧"), fallback);
  else fallback();
}
function compress(file, max = 720, quality = 0.72) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => {
      const im = new Image();
      im.onload = () => {
        const k = Math.min(1, max / Math.max(im.width, im.height));
        const c = document.createElement("canvas");
        c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
        c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
        res(c.toDataURL("image/jpeg", quality));
      };
      im.onerror = rej; im.src = r.result;
    };
    r.onerror = rej; r.readAsDataURL(file);
  });
}
// 图片加载失败 → 移除 <img>，露出纸色底 + 类别字样
const img = (src, extra = "") => `<img src="${esc(src)}" loading="lazy" onerror="this.remove()" ${extra}>`;
function photo(p, i = 0, cls = "ph-box", inner = "", credit = true) {
  const ph = p.photos[i];
  return `<div class="${cls}"><span class="ph-fallback">${esc(p.category)}</span>${ph ? img(ph.src, 'class="ph"') : ""}${ph && credit ? `<span class="credit">${ph.note ? "氛围图 · " : ""}${esc(ph.credit)}</span>` : ""}${inner}</div>`;
}
// 字母头像（替代 emoji 头像）：颜色由名字决定
const MONO_BG = ["#D8FF3C", "#FFE45C", "#FFB9C6", "#CFC7FF", "#BFE4FF", "#F1DDBF"];
function av(m, cls = "") {
  const n = String(m?.name || "").trim();
  const bg = MONO_BG[[...(n || "·")].reduce((a, ch) => a + ch.codePointAt(0), 0) % MONO_BG.length];
  return `<span class="av ${cls}" style="background:${bg}" title="${esc(n)}">${esc([...n][0] || "")}</span>`;
}
const avatars = (ms, n = 4) => `<span class="stack">${ms.slice(0, n).map((m) => av(m)).join("")}${ms.length > n ? `<span class="av more">+${ms.length - n}</span>` : ""}</span>`;
const sticker = (t, tone = "acid") => `<span class="stk ${tone}">${t}</span>`;
function distTo(p) { return S.loc ? km(S.loc, p) : null; }

// ---------- 卡片 ----------
function openCount(p) {
  const pool = [...(online() ? S.feed || [] : []), ...allSessions().filter((s) => !(online() && s.seed))];
  return pool.filter((s) => s.visibility === "public" && status(s) === "planning" && s.stops.some((st) => st.placeId === p.id)).length;
}
// 地点卡：像 Hinge 的一张资料卡 —— 大照片 + 衬线名字 + 一张「为什么」的问答卡
function placeCard(p) {
  const reasons = S.prefs ? score(p).reasons.slice(0, 3) : [];
  const open = openCount(p), d = distTo(p);
  return `<article class="pc" onclick="go('#/place/${p.id}')">
    ${photo(p, 0, "pc-ph", `${sticker(esc(p.category), "paper")}<span class="price">${money(p.avgCost)}</span>`)}
    <div class="pc-body">
      <div class="kicker">${esc(p.district)} · ${p.indoor ? "室内" : "户外"}${d != null ? ` · 距你 ${kmLabel(d)}` : ""}</div>
      <h3 class="pc-title">${esc(shortName(p))}</h3>
      ${subName(p) ? `<div class="pc-sub">${esc(subName(p))}</div>` : ""}
      ${reasons.length ? `<div class="prompt"><div class="prompt-q">为什么是这周末</div><div class="prompt-a">${esc(reasonSentence(reasons))}</div></div>` : ""}
      <div class="pc-foot"><span>${fmt(p.checkinCount)} 人来过</span>${open ? `<span class="hot">${open} 个局在招人 ${ICON.arrow}</span>` : ""}</div>
    </div></article>`;
}
function strip(s, n = 3) {
  const ph = sessionPhotos(s).slice(0, n), p0 = PL[s.stops[0]?.placeId];
  if (!ph.length) return `<div class="strip"><div><span class="ph-fallback">${esc(p0?.category || "局")}</span></div></div>`;
  return `<div class="strip n${ph.length}">${ph.map((x) => `<div><span class="ph-fallback">${esc(p0?.category || "")}</span>${img(x)}</div>`).join("")}</div>`;
}
// 局卡：一张票根
function sessionCard(s) {
  const st = status(s), joinable = st === "planning" && s.members.length < s.cap, liked = !!S.likes[s.id];
  const tag = st === "done" ? sticker("攻略", "paper") : joinable ? sticker("可加入") : sticker(STATUS_LABEL[st], "lemon");
  return `<article class="tk" onclick="go('#/session/${s.id}')">
    <div class="tk-head"><span class="kicker">局 · ${s.stops.length} 站 · ${dateMono(s.date)}</span>${tag}</div>
    <h3 class="tk-title">${esc(s.title)}</h3>
    <div class="tk-route">${s.stops.map((x) => esc(shortName(PL[x.placeId] || { name: "?" }))).join(" <i>→</i> ")}</div>
    ${strip(s)}
    <div class="tk-perf"></div>
    <div class="tk-foot">
      <div class="tk-cell"><small>人均预算</small><b>¥${s.budget.perPerson ?? 0}</b></div>
      <div class="tk-cell"><small>人数</small><b>${s.members.length}/${s.cap}</b></div>
      <div class="tk-who">${avatars(s.members, 4)}</div>
      ${st === "done" ? `<button class="like ${liked ? "on" : ""}" onclick="event.stopPropagation();toggleLike('${s.id}',this)">${liked ? ICON.heartOn : ICON.heart}<span class="n">${fmt((s.likes || 0) + (liked ? 1 : 0))}</span></button>` : ""}
    </div></article>`;
}
// 横滑用的小票根
function miniTicket(s) {
  const p0 = PL[s.stops[0]?.placeId], ph = sessionPhotos(s)[0];
  return `<article class="mtk" onclick="go('#/session/${s.id}')">
    <div class="mtk-ph">${ph ? img(ph) : ""}${sticker(`${s.members.length}/${s.cap}`)}</div>
    <div class="kicker">${dateMono(s.date)} · ${s.stops.length} 站</div>
    <b>${esc(s.title)}</b>
    <div class="mtk-foot">${avatars(s.members, 3)}<span class="kicker">人均预算 ¥${s.budget.perPerson ?? 0}</span></div></article>`;
}
// 紧凑版票根（列表里用）
function sessionRow(s) {
  const st = status(s);
  return `<article class="trow" onclick="go('#/session/${s.id}')">
    <div class="trow-ph">${sessionPhotos(s)[0] ? img(sessionPhotos(s)[0]) : ""}</div>
    <div class="trow-main">
      <div class="kicker">${dateMono(s.date)} · ${s.stops.length} 站 · ${VIS[s.visibility][1]}${!s.remote && online() ? " · 本机" : ""}</div>
      <div class="trow-title">${esc(s.title)}</div>
      <div class="trow-foot">${avatars(s.members, 4)}${sticker(STATUS_LABEL[st] + (noShow(s) ? " · 未成局" : ""), st === "live" ? "acid" : st === "planning" ? "lemon" : "paper")}</div>
    </div></article>`;
}
function toggleLike(id, el) {
  if (S.likes[id]) delete S.likes[id]; else S.likes[id] = true;
  persist("likes");
  const s = getSession(id), on = !!S.likes[id];
  if (el) {
    el.classList.toggle("on", on);
    el.querySelector("svg").outerHTML = on ? ICON.heartOn : ICON.heart;
    el.querySelector(".n").textContent = fmt((s?.likes || 0) + (on ? 1 : 0));
    el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop");
  }
}
function toggleSave(id, el, label = "收藏") {
  if (S.saves[id]) delete S.saves[id]; else S.saves[id] = true;
  persist("saves");
  toast(S.saves[id] ? `已${label}` : `已取消${label}`);
  if (el) { el.classList.toggle("on", !!S.saves[id]); el.querySelector("svg").outerHTML = S.saves[id] ? ICON.starOn : ICON.star; }
}

// ---------- 路由 ----------
function route() {
  const [path, query] = (location.hash.slice(2) || (S.loc && S.prefs?.done ? "map" : "discover")).split("?");
  const [name, ...rest] = path.split("/");
  return { name, arg: rest.join("/"), query: new URLSearchParams(query || "") };
}
let MAP = null;
function render() {
  const r = route();
  if (!S.prefs?.done && !["onboarding", "s", "session"].includes(r.name)) { location.replace("#/onboarding"); return; }
  if (r.name !== "map" && MAP) { MAP.remove(); MAP = null; }
  const view = {
    onboarding: renderOnboarding, discover: renderDiscover, map: renderMap, place: renderPlace, session: renderSession, s: renderShared,
    new: renderEditor, edit: renderEditor, sessions: renderSessions, trail: () => { S.ui.meSeg = "trail"; renderMe(); }, me: renderMe,
  }[r.name] || renderDiscover;
  document.body.dataset.route = r.name;
  view(r.arg, r.query);
}
window.addEventListener("hashchange", () => { closeAdd(); closeSheet(); clearTimeout(POLL); S.visit = null; if (!["new", "edit"].includes(route().name)) D = null; render(); window.scrollTo(0, 0); });

function tabbar(active) {
  const t = (k, ico, label) => `<button class="tab ${active === k ? "on" : ""}" onclick="go('#/${k}')" aria-label="${label}">${ICON[ico]}<small>${label}</small></button>`;
  return `<nav class="tabbar">
    ${t("discover", "feed", "发现")}${t("map", "map", "地图")}
    <button class="tab plus" id="plusBtn" onclick="toggleAdd()" aria-label="开局">${ICON.plus}</button>
    ${t("sessions", "ticket", "局")}${t("me", "user", "我")}</nav>`;
}
const backBtn = (fallback) => `<button class="back" onclick="history.length>1?history.back():go('${fallback}')" aria-label="返回">${ICON.back}</button>`;

// ---------- ＋ 浮层 ----------
function toggleAdd() { $("#float").innerHTML ? closeAdd() : openAdd(); }
function openAdd() {
  $("#float").innerHTML = `<div class="catcher" onclick="closeAdd()"></div><div class="add-menu">
    <button class="add-item" onclick="closeAdd();go('#/new')"><b>开一个局</b><small>定日期、串几站、拉人</small>${ICON.arrow}</button>
    <button class="add-item" onclick="closeAdd();openCheckin({})"><b>我来过</b><small>快速打卡，自动记成一个私密局</small>${ICON.arrow}</button>
    <button class="add-item" onclick="closeAdd();openAgent()"><b>AI 局长</b><small>说人数和预算，帮你排一个</small>${ICON.arrow}</button></div>`;
  $("#plusBtn")?.classList.add("open");
}
function closeAdd() { const f = $("#float"); if (f) f.innerHTML = ""; $("#plusBtn")?.classList.remove("open"); }

// ---------- 定位 ----------
function requestLocation() {
  return new Promise((res) => {
    if (!navigator.geolocation) { res({ error: "浏览器不支持定位" }); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => { S.loc = { lat: pos.coords.latitude, lon: pos.coords.longitude, acc: Math.round(pos.coords.accuracy), at: Date.now() }; persist("loc"); res({ ok: true }); },
      (err) => res({ error: { 1: "你没有允许定位", 2: "暂时拿不到位置", 3: "定位超时" }[err.code] || "定位失败" }),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 300000 });
  });
}

// ---------- Onboarding：一屏一问（Hinge 式） ----------
let onb = null;
const ONB_STEPS = [
  { key: "nick", q: "先认识一下，<br>你叫<em>什么</em>？", hint: "局里的朋友会看到这个名字" },
  { key: "gender", q: "你的<em>性别</em>是？", hint: "只用来让推荐更合适，不会展示在资料上" },
  { key: "age", q: "你<em>多大</em>了？", hint: "会显示在资料上，方便找到同龄人" },
  { key: "school", q: "在哪所<em>学校</em>？", hint: "会显示在资料上。上海的学校可以直接点" },
  { key: "prompt", q: "一个理想的周末是……", hint: "写一句就好，会放在你的资料上。也可以跳过", optional: true },
  { key: "likes", q: "周末想<em>玩什么</em>？", hint: "多选。我们会结合天气和预算帮你挑" },
  { key: "budget", q: "每次出门，<br>人均<em>预算</em>多少？", hint: "超预算的地方会往后排，不会直接藏起来" },
  { key: "groupSize", q: "一般和<em>几个人</em>去？", hint: "人多的话，会优先推适合开局的地方" },
  { key: "loc", q: "最后，<br>要不要打开<em>定位</em>？", hint: "只用来把离你近的地方排前面，并在地图上标出你的位置。不会上传", optional: true },
];
function renderOnboarding() {
  if (!onb) {
    const p = S.prefs || {};
    onb = { step: 0, nick: p.nick || "", gender: p.gender || "", age: p.age || "", school: p.school || "", prompt: p.prompt || "", likes: p.likes || [], budget: p.budget ?? null, groupSize: p.groupSize || null, avatar: p.avatar || AVATARS[Math.floor(Math.random() * AVATARS.length)] };
  }
  const st = ONB_STEPS[onb.step], n = ONB_STEPS.length;
  const opt = (val, cur, label, set) => `<button class="opt ${String(cur) === String(val) ? "on" : ""}" onclick="${set}">${label}<span class="opt-dot"></span></button>`;
  const body = {
    nick: `<input class="big-in" maxlength="12" placeholder="昵称" value="${esc(onb.nick)}" oninput="onb.nick=this.value;onbValid()" autofocus>`,
    gender: [["female", "女生"], ["male", "男生"], ["na", "不想说"]].map(([v, l]) => opt(v, onb.gender, l, `onb.gender='${v}';renderOnboarding()`)).join(""),
    age: `<div class="age-row"><button class="step-btn" onclick="onb.age=Math.max(16,(+onb.age||20)-1);renderOnboarding()">−</button><input class="big-in age-in" type="number" min="16" max="40" inputmode="numeric" placeholder="20" value="${esc(onb.age)}" oninput="onb.age=+this.value||'';onbValid()"><button class="step-btn" onclick="onb.age=Math.min(40,(+onb.age||20)+1);renderOnboarding()">＋</button></div>`,
    school: `<input class="big-in" maxlength="20" placeholder="学校名称" value="${esc(onb.school)}" oninput="onb.school=this.value;onbValid()">
      <div class="chip-cloud">${[...UNIVERSITIES, "已经毕业了"].map((u) => `<button class="chip ${onb.school === u ? "on" : ""}" onclick="onb.school='${u}';renderOnboarding()">${u}</button>`).join("")}</div>`,
    prompt: `<textarea class="big-in area" maxlength="40" placeholder="比如：睡到自然醒，下午去看个展，晚上吃一顿好的" oninput="onb.prompt=this.value">${esc(onb.prompt)}</textarea>`,
    likes: `<div class="chip-cloud">${TYPES.map((t) => `<button class="chip ${onb.likes.includes(t) ? "on" : ""}" onclick="onbLike('${t}')">${t}</button>`).join("")}</div>`,
    budget: BUDGETS.map((b) => opt(b.value, onb.budget, b.label, `onb.budget=${b.value};renderOnboarding()`)).join(""),
    groupSize: GROUPS.map((g) => opt(g.value, onb.groupSize, g.label, `onb.groupSize=${g.value};renderOnboarding()`)).join(""),
    loc: `<button class="cta acid wide" onclick="onbLocate(this)">${ICON.locate} 允许定位</button><button class="cta ghost wide" onclick="finishOnb()">以后再说</button>`,
  }[st.key];
  $("#view").innerHTML = `<div class="onb">
    <div class="onb-top">
      ${onb.step ? `<button class="icon-btn" onclick="onb.step--;renderOnboarding()" aria-label="上一步">${ICON.back}</button>` : `<span class="brand sm">周末去哪<i>*</i></span>`}
      <div class="onb-prog"><i style="width:${((onb.step + 1) / n) * 100}%"></i></div>
      <button class="skip" onclick="finishOnb()">${S.prefs?.done ? "跳过" : "先逛逛"}</button></div>
    <div class="onb-count kicker">${pad(onb.step + 1)} / ${pad(n)}</div>
    <h1 class="onb-q">${st.q}</h1>
    <p class="onb-hint">${st.hint}</p>
    <div class="onb-body" ${onb._anim === onb.step ? 'style="animation:none"' : ""}>${body}</div>
    ${onb.step === 0 && !S.prefs?.done ? `<button class="cta ghost wide browse" onclick="finishOnb()">先逛逛，资料之后再填 ${ICON.arrow}</button>` : ""}
    ${st.key !== "loc" ? `<button class="next" id="onbNext" onclick="onbNext()" aria-label="下一步">${ICON.arrow}</button>` : ""}
  </div>`;
  onb._anim = onb.step;
  onbValid();
  const f = $(".onb-body .big-in"); if (f && ["nick", "school", "age"].includes(st.key)) f.focus();
}
function onbOk() {
  const k = ONB_STEPS[onb.step].key;
  return { nick: onb.nick.trim(), gender: onb.gender, age: +onb.age >= 16 && +onb.age <= 40, school: onb.school.trim(), prompt: true, likes: onb.likes.length, budget: onb.budget != null, groupSize: onb.groupSize, loc: true }[k];
}
function onbValid() { const b = $("#onbNext"); if (b) b.disabled = !onbOk(); }
function onbNext() { if (!onbOk()) return; onb.step = Math.min(ONB_STEPS.length - 1, onb.step + 1); renderOnboarding(); }
function onbLike(t) { onb.likes = onb.likes.includes(t) ? onb.likes.filter((x) => x !== t) : [...onb.likes, t]; renderOnboarding(); }
async function onbLocate(btn) {
  btn.disabled = true; btn.innerHTML = `${ICON.locate} 定位中…`;
  const r = await requestLocation();
  if (r.error) toast(r.error);
  finishOnb(r.ok ? "#/map" : null);
}
function finishOnb(dest) {
  const o = onb || {};
  const nick = (o.nick || "").trim() || "周末玩家" + Math.floor(Math.random() * 900 + 100);
  const prevUid = S.prefs?.uid;
  // 没有自己选过兴趣的人，用的是示例偏好：界面上要说清楚，不能说「你喜欢…」
  const demo = !o.likes?.length && (S.prefs ? !!S.prefs.demo : true);
  S.prefs = {
    likes: o.likes?.length ? o.likes : ["展览", "市集"], budget: o.budget ?? 100, groupSize: o.groupSize || 2, city: "上海", avatar: o.avatar || "🐱", nick,
    gender: o.gender || "", age: +o.age || "", school: (o.school || "").trim(), prompt: (o.prompt || "").trim(), uid: prevUid || uid("u"), done: true, demo,
  };
  persist("prefs");
  S.sessions.forEach((s) => s.members.forEach((m) => { if (m.uid === S.prefs.uid) Object.assign(m, meRef()); }));
  persist("sessions");
  if (online() && API.auth) API.updateMe({ name: nick, avatar: S.prefs.avatar }).catch(() => {});
  onb = null; S.ui.layer = "rec"; S.ui.cond = null;
  if (!S.wx) loadWeather();
  const back = sessionStorage_get("wk2_after_onb");
  go(back || dest || "#/discover");
}
function sessionStorage_get(k) { try { const v = sessionStorage.getItem(k); sessionStorage.removeItem(k); return v; } catch { return null; } }

// ---------- 发现 ----------
const LAYERS = [["rec", "推荐"], ["join", "可加入的局"], ["guide", "攻略"]];
const CONDS = ["雨天也能去", "免费", ...TYPES];
function prefBar() {
  const p = S.prefs;
  const txt = `${p.likes.join("、")} · 人均${BUDGETS.find((b) => b.value === p.budget)?.label || ""} · ${GROUPS.find((g) => g.value === p.groupSize)?.label || ""}`;
  return `<div class="pref-bar ${p.demo ? "demo" : ""}"><span><b>${p.demo ? "按示例偏好推荐" : "按你的偏好推荐"}</b>${esc(txt)}</span><button class="cta sm ${p.demo ? "acid" : "ghost"}" onclick="go('#/onboarding')">${p.demo ? "改成我的" : "改"}</button></div>`;
}
function renderDiscover() {
  $("#view").innerHTML = `<div class="page">
    <header class="top"><span class="brand">周末去哪<i>*</i></span>
      <div class="top-actions"><button class="icon-btn" onclick="toggleSearch()" aria-label="搜索">${ICON.search}</button><button class="icon-btn" onclick="go('#/map')" aria-label="地图">${ICON.map}</button></div></header>
    ${S.ui.searching ? `<div class="search-bar"><input class="input" id="q" placeholder="搜地点、区域、标签" value="${esc(S.ui.q)}" oninput="S.ui.q=this.value;renderDiscoverList()"><button class="icon-btn" onclick="toggleSearch()" aria-label="关闭">${ICON.close}</button></div>` : ""}
    ${S.prefs?.demo ? "" : `<div class="hello kicker">嗨，${esc(S.prefs?.nick || "")}</div>`}
    <h1 class="hero">这周末<br><em>去哪</em>？</h1>
    <p class="value">找去处、约搭子，把周末安排成一个局。</p>
    <div id="wx"></div>
    ${prefBar()}
    <div class="seg wide">${LAYERS.map(([k, l]) => `<button class="${S.ui.layer === k ? "on" : ""}" onclick="S.ui.layer='${k}';renderDiscover()">${l}</button>`).join("")}</div>
    <div class="chips conds" aria-label="条件，可叠加">${CONDS.map((c) => `<button class="chip ${S.ui.cond === c ? "on" : ""}" onclick="S.ui.cond=S.ui.cond==='${c}'?null:'${c}';renderDiscover()">${c}${S.ui.cond === c ? " ×" : ""}</button>`).join("")}</div>
    <div id="list"></div>
    <footer class="foot"><div class="mode-slot">${modeLine()}</div>地点照片来自 Wikimedia Commons，逐张署名见 <a href="https://github.com/JamesQiu2005/weekend-city-guide/blob/main/CREDITS.md" target="_blank" rel="noopener">CREDITS.md</a> · 天气 Open-Meteo · 地图 © OpenStreetMap</footer>
    </div>${tabbar("discover")}`;
  renderWeather(); renderDiscoverList();
  if (online() && (!S.feedAt || Date.now() - S.feedAt > 30000)) loadFeed();
}
async function loadFeed() {
  try { const r = await API.feed({ status: "all" }); S.feed = r.items.map(adaptSummary); S.feedAt = Date.now(); if (route().name === "discover") renderDiscoverList(); }
  catch { S.feedAt = Date.now(); }
}
function toggleSearch() {
  S.ui.searching = !S.ui.searching;
  if (!S.ui.searching) S.ui.q = "";
  if (route().name !== "discover") { go("#/discover"); return; }
  renderDiscover();
  if (S.ui.searching) $("#q")?.focus();
}
// 天气：一条黑色滚动条
function renderWeather() {
  const el = $("#wx"); if (!el) return;
  if (!S.wx) { el.innerHTML = `<div class="ticker"><span>正在看这周末的天气…</span></div>`; return; }
  const days = [["sat", "SAT"], ["sun", "SUN"]].filter(([k]) => S.wx[k]).sort((a, b) => S.wx[a[0]].date.localeCompare(S.wx[b[0]].date));
  const items = days.map(([k, label]) => { const d = S.wx[k]; return `<span class="${d.rain > 50 ? "wet" : ""}">${label} ${d.date.slice(5).replace("-", "/")} · ${wxText(d.code)} ${d.min}–${d.max}° · 降水 ${d.rain}%</span>`; }).join("<b>✳</b>");
  el.innerHTML = `<div class="ticker"><div class="ticker-in">${items}<b>✳</b>${items}${S.wx.mock ? "<b>✳</b><span>示例天气</span>" : ""}</div></div>`;
}
function matchQ(text) { const q = S.ui.q.trim(); return !q || text.includes(q); }
function renderDiscoverList() {
  const el = $("#list"); if (!el) return;
  const layer = S.ui.layer, c = S.ui.cond;
  let places = PLACES.map((p) => ({ p, s: score(p).sc + (S.loc ? Math.max(0, 8 - km(S.loc, p)) : 0) }));
  let sessions = [...(online() ? S.feed || [] : []), ...allSessions().filter((s) => s.visibility === "public" && !(online() && s.seed && status(s) !== "done"))].filter((s) => !noShow(s));
  const placeText = (p) => [p.name, p.district, p.category, ...p.tags].join(" ");
  const sessText = (s) => [s.title, ...(s.tags || []), ...s.stops.map((x) => PL[x.placeId]?.name || "")].join(" ");
  if (layer === "join") { places = []; sessions = sessions.filter((s) => status(s) === "planning" && s.members.length < s.cap); }
  else if (layer === "guide") { places = []; sessions = sessions.filter((s) => status(s) === "done"); }
  if (c === "雨天也能去") { places = places.filter((x) => x.p.indoor); sessions = sessions.filter((s) => s.stops.every((st) => PL[st.placeId]?.indoor)); }
  else if (c === "免费") { places = places.filter((x) => x.p.avgCost === 0); sessions = sessions.filter((s) => estTotal(s) === 0); }
  else if (TYPES.includes(c)) { places = places.filter((x) => x.p.category === c); sessions = sessions.filter((s) => s.stops.some((st) => PL[st.placeId]?.category === c)); }
  places = places.filter((x) => matchQ(placeText(x.p))).sort((a, b) => b.s - a.s).map((x) => x.p);
  sessions = sessions.filter((s) => matchQ(sessText(s))).sort((a, b) => {
    const sa = status(a), sb = status(b);
    if (sa !== sb) return sa === "planning" ? -1 : sb === "planning" ? 1 : 0;
    return sa === "planning" ? a.date.localeCompare(b.date) : (b.likes || 0) - (a.likes || 0);
  });
  // 首屏露出组局能力：推荐层、没有条件时，先放一排「在招人的局」
  const openNow = layer === "rec" && !c && !S.ui.q.trim() ? sessions.filter((s) => status(s) === "planning" && s.members.length < s.cap).slice(0, 6) : [];
  if (openNow.length) sessions = sessions.filter((s) => !openNow.includes(s));
  const items = [];
  let i = 0, j = 0;
  while (i < places.length || j < sessions.length) {
    for (let k = 0; k < 2 && i < places.length; k++) items.push(placeCard(places[i++]));
    if (j < sessions.length) items.push(sessionCard(sessions[j++]));
  }
  const rainy = S.wx && Math.max(S.wx.sat?.rain ?? 0, S.wx.sun?.rain ?? 0) > 50;
  el.innerHTML = (openNow.length ? `<div class="rail-h"><b>这周末在招人的局</b><button class="linkish" onclick="S.ui.layer='join';renderDiscover()">全部</button></div>
      <div class="rail">${openNow.map(miniTicket).join("")}</div>` : "") +
    `<div class="count kicker">${LAYERS.find((x) => x[0] === layer)[1]}${c ? " + " + c : ""} · ${places.length} 个地方 · ${sessions.length + openNow.length} 个局${rainy && layer === "rec" ? " · 周末有雨，室内优先" : ""}${S.loc && layer === "rec" ? " · 近的排前面" : ""}</div>` +
    (items.length ? `<div class="feed-col">${items.join("")}</div>` : `<div class="empty"><b>没有找到</b>换个标签试试</div>`);
}

// ---------- 地点详情 ----------
function renderPlace(id) {
  const p = PL[id];
  if (!p) { go("#/discover"); return; }
  const { reasons } = score(p);
  S.placeSess ||= {};
  if (online() && !S.placeSess[id]) {
    S.placeSess[id] = [];
    API.place(id).then((r) => { S.placeSess[id] = [...r.sessions.open, ...r.sessions.done].map(adaptSummary); if (route().name === "place" && route().arg === id) renderPlace(id); }).catch(() => {});
  }
  const here = [...(online() ? S.placeSess[id] : []), ...allSessions().filter((s) => s.stops.some((st) => st.placeId === id) && (s.visibility === "public" || isMember(s)) && !noShow(s) && !(online() && s.seed && status(s) !== "done"))];
  const planning = here.filter((s) => status(s) !== "done"), done = here.filter((s) => status(s) === "done");
  const saved = !!S.saves[id], d = distTo(p);
  const fact = (k, v) => `<div class="fact"><dt>${k}</dt><dd>${v}</dd></div>`;
  $("#view").innerHTML = `<div class="page detail-page">
    ${backBtn("#/discover")}
    <div class="gallery">${(p.photos.length ? p.photos : [null]).map((_, i) => photo(p, i, "gal-ph")).join("")}</div>
    ${p.photos.length > 1 ? `<div class="gal-hint kicker">${p.photos.length} 张 · 左右滑动</div>` : ""}
    <div class="pp">
      <div class="kicker">${esc(p.category)} · ${esc(p.district)}</div>
      <h1 class="pp-title">${esc(shortName(p))}</h1>
      ${subName(p) ? `<div class="pp-sub">${esc(subName(p))}</div>` : ""}
      ${reasons.length ? `<div class="prompt big"><div class="prompt-q">为什么是这周末</div><div class="prompt-a">${esc(reasonSentence(reasons))}</div></div>` : ""}
      <p class="blurb">${esc(p.blurb)}</p>
      <dl class="facts">
        ${fact("营业", esc(p.openHours))}${fact("人均", money(p.avgCost))}${fact("场地", p.indoor ? "室内，不怕下雨" : "户外，看天气")}
        ${fact("适合", p.suitFor.map((n) => GROUPS.find((g) => g.value === n)?.label).join(" / "))}${fact("来过", `${fmt(p.checkinCount)} 人打卡`)}
        ${d != null ? fact("距你", kmLabel(d)) : ""}
      </dl>
      <div class="tags">${p.tags.map((t) => `<span>#${esc(t)}</span>`).join("")}</div>
      <button class="cta ghost wide" onclick="go('#/map?focus=${id}')">${ICON.map} 在地图上看</button>
    </div>
    <h2 class="sec">在这里的局 <small>${planning.length} 个筹备中 · ${done.length} 篇攻略</small></h2>
    <div class="feed-col">${planning.map(sessionCard).join("")}${done.map(sessionCard).join("")}</div>
    ${!here.length ? `<div class="empty"><b>还没人在这开局</b>做第一个吧</div>` : ""}
    </div>
    <div class="action-bar">
      <button class="ab ${saved ? "on" : ""}" onclick="toggleSave('${id}',this,'加入想去')">${saved ? ICON.starOn : ICON.star}<small>想去</small></button>
      <button class="ab" onclick="openCheckin({placeId:'${id}'})">${ICON.pin}<small>来过</small></button>
      <button class="ab" onclick="addToExisting('${id}')">${ICON.plus}<small>加进局</small></button>
      <button class="cta acid" onclick="go('#/new?place=${id}')">在这开局</button>
    </div>`;
}
async function addToExisting(pid) {
  let mine = S.sessions.filter((s) => isOrganizer(s) && status(s) === "planning");
  if (online() && API.auth) { try { const r = await API.mySessions("planning"); mine = [...r.items.filter((x) => x.role === "organizer").map(adaptSummary), ...mine]; } catch {} }
  if (!mine.length) { toast("你还没有筹备中的局，先开一个吧"); return; }
  openSheet(`<h2 class="sheet-t">加进哪个局？</h2><div class="sub">把「${esc(shortName(PL[pid]))}」追加为最后一站</div>
    ${mine.map((s) => `<div class="pick-row" onclick="appendStop('${s.id}','${pid}')"><div class="trow-ph sm">${sessionPhotos(s)[0] ? img(sessionPhotos(s)[0]) : ""}</div><div style="flex:1;min-width:0"><b>${esc(s.title)}</b><div class="kicker">${dateMono(s.date)} · ${s.stops.length} 站</div></div>${ICON.plus}</div>`).join("")}`);
}
const apiStops = (stops) => stops.map((st) => ({ placeId: st.placeId, estCost: +st.estCost || 0, ...(st.time ? { time: st.time } : {}), ...(st.note ? { note: st.note } : {}), ...(st.backupPlaceId ? { backupPlaceId: st.backupPlaceId } : {}) }));
async function appendStop(sid, pid) {
  const p = PL[pid];
  if (!localSession(sid)) {
    const full = await loadRemote(sid); if (!full) return;
    if (full.stops.some((st) => st.placeId === pid)) { toast("这个局里已经有这一站了"); return; }
    const stops = [...full.stops, { placeId: pid, time: addHours(full.stops.at(-1)?.time || full.startTime, 2), estCost: p.avgCost }];
    if (await remoteWrite(sid, () => API.updateSession(sid, { stops: apiStops(stops), changeNote: `添加了第 ${stops.length} 站：${shortName(p)}` }))) { closeSheet(); toast("已加入"); go(`#/session/${sid}`); }
    return;
  }
  const s = getSession(sid);
  if (s.stops.some((st) => st.placeId === pid)) { toast("这个局里已经有这一站了"); return; }
  s.stops.push({ placeId: pid, time: addHours(s.stops.at(-1)?.time || s.startTime, 2), estCost: p.avgCost, note: "" });
  s.entries.push(sysEntry(s.id, `添加了第 ${s.stops.length} 站：${shortName(p)}`));
  saveSession(s); closeSheet(); toast("已加入"); go(`#/session/${sid}`);
}

// ---------- 开局 / 编辑局 ----------
let D = null;
function nextSaturday() { return weekendDate(daysFromToday(weekendDate(0, "sat")) < 0 ? 1 : 0, "sat"); }
function newDraft(placeIds = []) {
  const cap = Math.max(2, Math.min(6, S.prefs.groupSize === 3 ? 4 : S.prefs.groupSize === 5 ? 6 : S.prefs.groupSize));
  let t = "14:00";
  const stops = placeIds.map((id) => { const st = { placeId: id, time: t, estCost: PL[id].avgCost, note: "" }; t = addHours(t, 2); return st; });
  return { id: null, title: "", titleTouched: false, cover: null, date: nextSaturday(), stops, cap, budget: { total: Math.max(100, stops.reduce((a, s) => a + s.estCost, 0) * cap), mode: "AA" }, visibility: "link" };
}
function autoTitle() {
  if (D.titleTouched) return D.title;
  const names = D.stops.map((s) => shortName(PL[s.placeId]));
  return names.length ? (names.length === 1 ? `${names[0]}局` : `${names[0]} → ${names.at(-1)}`) : "";
}
function renderEditor(arg, query) {
  const editing = route().name === "edit";
  if (!D || D._for !== location.hash) {
    if (editing) {
      const s = getSession(arg);
      if (!s || !isOrganizer(s)) { toast("只有组织者可以编辑"); go(`#/session/${arg}`); return; }
      D = { ...JSON.parse(JSON.stringify(s)), titleTouched: true, _remote: !!s.remote };
    } else D = window.__agentDraft || newDraft(query?.get("place") ? [query.get("place")] : []);
    window.__agentDraft = null;
    D._for = location.hash;
  }
  const covers = [...new Set(D.stops.flatMap((st) => PL[st.placeId].photos.map((p) => p.src)))];
  const sec = (n, t, inner, extra = "") => `<section class="ed-sec"><div class="ed-h"><span class="kicker">${n}</span><b>${t}</b>${extra}</div>${inner}</section>`;
  $("#view").innerHTML = `<div class="page editor">
    <div class="ed-head"><button class="icon-btn" onclick="D=null;history.length>1?history.back():go('#/discover')" aria-label="关闭">${ICON.close}</button>
      <b>${editing ? "编辑局" : "开一个局"}</b><span style="width:40px"></span></div>
    <div class="ed-cover">
      ${D.cover || covers[0] ? img(D.cover || covers[0], 'class="ph"') : `<span class="ph-fallback">局</span>`}
      <input class="ed-title" placeholder="给这个局起个名字" value="${esc(D.titleTouched ? D.title : autoTitle())}" oninput="D.title=this.value;D.titleTouched=true">
    </div>
    ${covers.length > 1 ? `<div class="cover-pick">${covers.map((c) => `<button class="${(D.cover || covers[0]) === c ? "on" : ""}" onclick="D.cover='${c}';renderEditor()">${img(c)}</button>`).join("")}</div>` : ""}
    ${sec("01", "哪天", `<input class="input" type="date" value="${D.date}" min="${today()}" onchange="D.date=this.value;renderStops();$('#dateHint').textContent=dateHint()"><div class="hint" id="dateHint">${dateHint()}</div>`)}
    ${sec("02", "路线", `<div id="stops"></div><button class="add-stop" onclick="openPlacePicker()">${ICON.plus} 添加地点</button>`, `<small>拖动左侧把手调整顺序</small>`)}
    ${sec("03", "预算", `<div class="row2">
        <label class="fld"><span>总预算 ¥</span><input class="input" type="number" min="0" value="${D.budget.total}" oninput="D.budget.total=+this.value||0;D._budgetTouched=true;renderBudget()"></label>
        <label class="fld"><span>人数上限</span><div class="stepper"><button onclick="D.cap=Math.max(1,D.cap-1);renderEditorParts()">−</button><b id="capN">${D.cap}</b><button onclick="D.cap=Math.min(12,D.cap+1);renderEditorParts()">＋</button></div></label></div>
      <div class="seg">${[["AA", "AA 制"], ["treat", "我请客"]].map(([k, l]) => `<button class="${D.budget.mode === k ? "on" : ""}" onclick="D.budget.mode='${k}';renderEditor()">${l}</button>`).join("")}</div>
      <div id="budget"></div>`)}
    ${sec("04", "同行的人", `<div id="seats"></div>`)}
    ${sec("05", "谁能看到", `<div class="seg">${Object.entries(VIS).map(([k, [i, l]]) => `<button class="${D.visibility === k ? "on" : ""}" onclick="D.visibility='${k}';renderEditor()">${ICON[i]} ${l}</button>`).join("")}</div><div class="hint">${VIS[D.visibility][2]}</div>`)}
    </div>
    <div class="action-bar"><button class="cta acid" onclick="submitDraft()">${editing ? "保存修改" : "开局"} ${ICON.arrow}</button></div>`;
  renderEditorParts();
}
function dateHint() {
  const n = daysFromToday(D.date);
  return `${dateLabel(D.date)} · ${n === 0 ? "就是今天" : n > 0 ? `${n} 天后` : "已经过去了"}${n > 15 ? " · 超出 16 天预报范围，先显示常年气候" : " · 每站自动带上当天该时段的天气"}`;
}
function renderEditorParts() { renderStops(); renderBudget(); renderSeats(); const c = $("#capN"); if (c) c.textContent = D.cap; }
function renderStops() {
  const el = $("#stops"); if (!el || !D) return;
  el.innerHTML = D.stops.length ? D.stops.map((st, i) => {
    const p = PL[st.placeId], rainy = rainyStop(p, D.date, st.time), bk = rainy && backupFor(p, D.stops.map((x) => x.placeId));
    return `<div class="stop-row ${rainy ? "rainy" : ""}" data-i="${i}">
      <span class="drag" onpointerdown="dragStart(event,${i})" aria-label="拖动排序">${ICON.drag}</span>
      ${photo(p, 0, "stop-thumb", "", false)}
      <div class="stop-main">
        <div class="stop-name"><span class="num">${i + 1}</span>${esc(shortName(p))}<span class="io">${p.indoor ? "室内" : "户外"}</span></div>
        <div class="stop-fields">
          <input class="input sm" type="time" value="${st.time}" onchange="D.stops[${i}].time=this.value;renderStops()">
          <span class="yen">¥<input class="input sm" type="number" min="0" value="${st.estCost}" oninput="D.stops[${i}].estCost=+this.value||0;renderBudget()"></span>
          ${wxChip(p, D.date, st.time)}
        </div>
        <input class="input sm note" placeholder="备注（可选）" value="${esc(st.note)}" oninput="D.stops[${i}].note=this.value">
        ${rainy && bk ? `<button class="swap" onclick="swapStop(${i},'${bk.id}')">降水概率高 · 换成室内的「${esc(shortName(bk))}」？</button>` : ""}
      </div>
      <button class="rm" onclick="D.stops.splice(${i},1);renderEditorParts()" aria-label="删除">${ICON.close}</button>
    </div>`;
  }).join("") + routeMap(D.stops, -1, D.date) : `<div class="empty sm">还没有地点，点下面添加</div>`;
  const t = $(".ed-title"); if (t && !D.titleTouched) t.value = autoTitle();
}
function swapStop(i, bid) {
  const from = PL[D.stops[i].placeId], to = PL[bid];
  D.stops[i] = { ...D.stops[i], placeId: bid, estCost: to.avgCost, swappedFrom: from.id };
  (D._events ||= []).push(`第 ${i + 1} 站因降雨从「${shortName(from)}」换成了室内备选「${shortName(to)}」`);
  toast(`已换成 ${shortName(to)}`);
  renderEditorParts();
}
function renderBudget() {
  const el = $("#budget"); if (!el) return;
  const est = D.stops.reduce((a, s) => a + (+s.estCost || 0), 0) * D.cap;
  el.innerHTML = budgetBar(D.budget.total, est, null, D.cap, D.budget.mode);
}
function budgetBar(total, est, actual, cap, mode) {
  const pct = total ? Math.min(100, (est / total) * 100) : est ? 100 : 0, over = est > total;
  return `<div class="budget-nums">
      <div><small>人均预算</small><b>¥${cap ? Math.round(total / cap) : total}</b></div>
      <div><small>人均预估</small><b class="${over ? "red" : ""}">¥${cap ? Math.round(est / cap) : est}</b></div>
      <div><small>总预算</small><b>¥${total}</b></div>
      ${actual != null ? `<div><small>实际</small><b>¥${actual}</b></div>` : ""}</div>
    <div class="bar"><i style="width:${over ? (total / est) * 100 : pct}%"></i>${over ? `<i class="over" style="width:${100 - (total / est) * 100}%"></i>` : ""}</div>
    <div class="hint ${over ? "red" : ""}">${over ? `超出预算 ¥${est - total}，可以删掉一站或者调高预算` : `人均预估 = 各站人均花费相加；总预估 ¥${est}（× ${cap} 人）${mode === "treat" ? " · 组织者请客" : ""}`}</div>`;
}
function renderSeats() {
  const el = $("#seats"); if (!el) return;
  const ms = D.members || [{ ...meRef(), role: "organizer" }];
  el.innerHTML = `<div class="seats">${ms.map((m) => av(m, "lg")).join("")}${Array.from({ length: Math.max(0, D.cap - ms.length) }, () => `<span class="av lg empty"></span>`).join("")}</div><div class="hint">${ms.length}/${D.cap} · 开局后发链接邀请</div>`;
}
function dragStart(ev, i) {
  ev.preventDefault();
  const row = ev.target.closest(".stop-row"), rows = [...document.querySelectorAll(".stop-row")];
  const y0 = ev.clientY, mids = rows.map((r) => { const b = r.getBoundingClientRect(); return b.top + b.height / 2; });
  let to = i;
  row.classList.add("dragging");
  const move = (e) => { const dy = e.clientY - y0; row.style.transform = `translateY(${dy}px)`; to = mids.filter((m, k) => k !== i && m < mids[i] + dy).length; };
  const up = () => {
    window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
    const [s] = D.stops.splice(i, 1); D.stops.splice(to, 0, s);
    renderStops();
  };
  window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
}
function openPlacePicker() {
  const saved = PLACES.filter((p) => S.saves[p.id]), rest = PLACES.filter((p) => !S.saves[p.id]).sort((a, b) => score(b).sc - score(a).sc);
  const row = (p) => `<div class="pick-row" data-t="${esc(p.name + p.district + p.category)}" onclick="pickPlace('${p.id}')">${photo(p, 0, "stop-thumb", "", false)}
    <div style="flex:1;min-width:0"><b>${esc(shortName(p))}</b><div class="kicker">${esc(p.district)} · ${money(p.avgCost)} · ${p.indoor ? "室内" : "户外"}</div></div>${D.stops.some((s) => s.placeId === p.id) ? ICON.check : ICON.plus}</div>`;
  openSheet(`<h2 class="sheet-t">添加地点</h2><input class="input" placeholder="搜索地点" oninput="document.querySelectorAll('.sheet .pick-row').forEach(r=>r.style.display=r.dataset.t.includes(this.value)?'':'none')">
    ${saved.length ? `<div class="kicker sheet-sub">想去</div>${saved.map(row).join("")}` : ""}
    <div class="kicker sheet-sub">为你推荐</div>${rest.map(row).join("")}`);
}
function pickPlace(id) {
  if (D.stops.some((s) => s.placeId === id)) { toast("已经在路线里了"); return; }
  const last = D.stops.at(-1);
  D.stops.push({ placeId: id, time: last ? addHours(last.time, 2) : "14:00", estCost: PL[id].avgCost, note: "" });
  closeSheet();
  if (D.budget.total < D.stops.reduce((a, s) => a + s.estCost, 0) * D.cap && !D._budgetTouched) D.budget.total = D.stops.reduce((a, s) => a + s.estCost, 0) * D.cap;
  renderEditor();
}
async function submitDraft() {
  if (!D.stops.length) { toast("至少添加一个地点"); return; }
  const editing = !!D.id;
  if (online() && (!editing || D._remote)) {
    const title = ((D.titleTouched ? D.title : autoTitle()).trim() || "周末局").slice(0, 40);
    const body = { title, date: D.date, startTime: D.stops[0].time || undefined, cover: D.cover || undefined, visibility: D.visibility, cap: D.cap, budget: { total: D.budget.total, mode: D.budget.mode }, stops: apiStops(D.stops) };
    const btn = document.querySelector(".action-bar .cta"); if (btn) { btn.disabled = true; btn.textContent = "保存中…"; }
    let r;
    try { await ensureMe(); r = editing ? await API.updateSession(D.id, { ...body, ...(D._events?.length ? { changeNote: D._events.join("；") } : {}) }) : await API.createSession(body); }
    catch (e) { apiErr(e); if (btn) { btn.disabled = false; btn.innerHTML = `${editing ? "保存修改" : "开局"} ${ICON.arrow}`; } return; }
    REMOTE.set(r.session.id, adapt(r.session)); S.mineAt = 0;
    D = null; go(`#/session/${r.session.id}`);
    if (!editing) setTimeout(() => shareSession(r.session.id, true), 300);
    return;
  }
  const title = (D.titleTouched ? D.title : autoTitle()).trim() || "周末局";
  const events = D._events || [];
  const base = editing ? getSession(D.id) : null;
  const s = {
    ...(base || {}), id: D.id || uid("s"), title, cover: D.cover, date: D.date, startTime: D.stops[0].time,
    stops: D.stops.map(({ placeId, time, estCost, note, swappedFrom }) => ({ placeId, time, estCost, note, ...(swappedFrom ? { swappedFrom } : {}) })),
    cap: D.cap, budget: { total: D.budget.total, perPerson: Math.round(D.budget.total / D.cap), mode: D.budget.mode }, visibility: D.visibility,
    organizer: base?.organizer || S.prefs.nick, members: base?.members || [{ ...meRef(), role: "organizer", joinedAt: Date.now() }],
    entries: base?.entries || [], likes: base?.likes || 0, tags: base?.tags || [], closed: base?.closed || false, createdAt: base?.createdAt || Date.now(),
  };
  if (!editing) s.entries.push(sysEntry(s.id, `${S.prefs.nick} 开了这个局`));
  else s.entries.push(sysEntry(s.id, "组织者更新了局的安排"));
  events.forEach((t) => s.entries.push(sysEntry(s.id, t)));
  delete s.seed;
  saveSession(s);
  D = null;
  go(`#/session/${s.id}`);
  if (!editing) setTimeout(() => shareSession(s.id, true), 300);
}

// ---------- 线路示意图（SVG） ----------
function routeMap(stops, cur, date) {
  const ps = stops.map((st) => PL[st.placeId]).filter(Boolean);
  if (!ps.length) return "";
  const W = 320, H = 150, pd = 30;
  const cos = Math.cos((31.2 * Math.PI) / 180);
  const xs = ps.map((p) => p.lon * cos), ys = ps.map((p) => -p.lat);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const k = Math.min((W - 2 * pd) / (x1 - x0 || 1), (H - 2 * pd) / (y1 - y0 || 1));
  const ox = (W - (x1 - x0) * k) / 2, oy = (H - (y1 - y0) * k) / 2;
  const pt = ps.map((p, i) => [ox + (xs[i] - x0) * k, oy + (ys[i] - y0) * k]);
  const segs = pt.slice(1).map((b, i) => { const a = pt[i]; return `<text x="${(a[0] + b[0]) / 2}" y="${(a[1] + b[1]) / 2 - 8}" class="rm-km">${kmLabel(km(ps[i], ps[i + 1]))}</text>`; }).join("");
  return `<svg class="routemap" viewBox="0 0 ${W} ${H}" role="img" aria-label="路线示意图">
    <polyline points="${pt.map((p) => p.join(",")).join(" ")}" fill="none" stroke="var(--ink)" stroke-width="3" stroke-dasharray="1 7" stroke-linecap="round"/>
    ${segs}
    ${pt.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="11" fill="${i === cur ? "var(--acid)" : "var(--card)"}" stroke="var(--ink)" stroke-width="1.8"/>
      <text x="${x}" y="${y + 4}" class="rm-n">${i + 1}</text>
      <text x="${x}" y="${y + (y > H / 2 ? -18 : 27)}" class="rm-l">${esc(shortName(ps[i]).slice(0, 8))}${!ps[i].indoor && rainyStop(ps[i], date, stops[i].time) ? " · 雨" : ""}</text>`).join("")}
  </svg>`;
}

// ---------- 局详情 = 帖子 ----------
let POLL = null;
function renderSession(id, _q, snap) {
  if (!snap && !localSession(id)) {
    const key = location.hash;
    if (S.visit !== key) {
      S.visit = key;
      if (!REMOTE.get(id)) $("#view").innerHTML = `<div class="empty full"><b>正在打开这个局…</b></div>`;
      loadRemote(id).then(() => { if (location.hash === key) renderSession(id); });
      if (!REMOTE.get(id)) return;
    }
    if (!REMOTE.get(id) && !online()) { $("#view").innerHTML = `<div class="empty full"><b>这个局保存在服务器上</b>当前连不上服务器（离线演示模式）<button class="cta ghost" onclick="go('#/discover')">去发现</button></div>`; return; }
    const rs = REMOTE.get(id);
    if (rs && !rs.missing && rs.status === "live") { clearTimeout(POLL); POLL = setTimeout(() => { if (location.hash === key) loadRemote(id).then(() => location.hash === key && renderSession(id)); }, 15000); }
  }
  const local = getSession(id);
  const s = snap ? mergeSnapshot(local, snap) : local;
  if (!s || (s.visibility === "private" && !isMember(s))) {
    $("#view").innerHTML = `<div class="empty full"><b>这个局只有创建者能看到</b><button class="cta ghost" onclick="go('#/discover')">去发现</button></div>`; return;
  }
  const st = status(s), member = isMember(s), org = isOrganizer(s), cur = st === "live" ? currentStop(s) : -1;
  const ci = checkins(s), [vi, vl] = VIS[s.visibility];
  const cover = sessionPhotos(s)[0];
  const full = s.members.length >= s.cap;
  const feed = [...s.entries].sort((a, b) => b.createdAt - a.createdAt);
  $("#view").innerHTML = `<div class="page detail-page">
    ${backBtn("#/sessions")}
    <div class="invite">
      ${cover ? img(cover, 'class="ph"') : `<span class="ph-fallback">局</span>`}<div class="invite-shade"></div>
      <div class="invite-body">
        <div class="badges"><button class="vis" ${org ? `onclick="openVisibility('${s.id}')"` : "disabled"}>${ICON[vi]} ${vl}</button>${sticker(STATUS_LABEL[st] + (noShow(s) ? " · 未成局" : ""), st === "live" ? "acid" : st === "planning" ? "lemon" : "paper")}</div>
        <h1>${esc(s.title)}</h1>
        <div class="invite-meta">${dateLabel(s.date)}${s.startTime ? " · " + s.startTime + " 开始" : ""} · ${s.stops.length} 站</div>
      </div>
    </div>
    ${snap && !member ? `<div class="note-bar">这是 ${esc(s.organizer)} 分享的局 · 加入后会出现在你的「局」里</div>` : ""}

    <h2 class="sec">同行的人 <small>${s.members.length}/${s.cap}</small></h2>
    <div class="people">${s.members.map((m) => { const pf = profileOf(m), line = profileLine(m); return `<div class="person">${av(m, "lg")}<div class="person-main"><b>${esc(m.name || "成员")}</b>${line ? `<span class="kicker">${esc(line)}</span>` : ""}${pf.prompt ? `<p>“${esc(pf.prompt)}”</p>` : ""}</div>${m.role === "organizer" ? sticker("发起人", "paper") : ""}</div>`; }).join("")}
      ${Array.from({ length: Math.max(0, s.cap - s.members.length) }, () => `<div class="person empty">${`<span class="av lg empty"></span>`}<div class="person-main"><b>空位</b><span class="kicker">等一个人</span></div></div>`).join("")}</div>

    <h2 class="sec">路线 <small>${ci.length ? `${new Set(ci.map((e) => e.author)).size} 人打过卡` : st === "planning" ? "当天开放打卡" : ""}</small></h2>
    <div class="route">
      ${s.stops.map((x, i) => {
        const p = PL[x.placeId], here = ci.filter((e) => e.stopIndex === i), all = s.members.length > 0 && s.members.every((m) => here.some((e) => e.uid ? e.uid === m.uid : e.author === m.name));
        return `<div class="route-stop ${i === cur ? "cur" : ""}" onclick="go('#/place/${p.id}')">
          <div class="rs-time">${x.time || "—"}</div><div class="rs-dot">${i + 1}</div>
          ${photo(p, 0, "stop-thumb", "", false)}
          <div class="stop-main"><div class="stop-name">${esc(shortName(p))}${all && here.length ? sticker("到齐") : ""}</div>
            <div class="stop-fields"><span class="kicker">预估 ${money(+x.estCost || 0)}</span>${wxChip(p, s.date, x.time)}</div>
            ${x.note ? `<div class="stop-note">${esc(x.note)}</div>` : ""}
            ${x.swappedFrom ? `<div class="stop-note">因降雨由「${esc(shortName(PL[x.swappedFrom]))}」换成室内备选</div>` : ""}
            ${here.length ? `<div class="here">${avatars(here.map((e) => ({ name: e.author })), 6)}<span class="kicker">${here.filter((e) => e.verified).length}/${here.length} 到场认证</span></div>` : ""}
          </div></div>`;
      }).join("")}
      ${routeMap(s.stops, cur, s.date)}
    </div>

    <h2 class="sec">预算</h2>
    <div class="budget-card">${budgetBar(s.budget.total, estTotal(s), actualTotal(s), s.cap, s.budget.mode)}</div>

    <h2 class="sec">动态 <small>${s.entries.length} 条</small></h2>
    ${member ? `<div class="composer"><input class="input" id="noteIn" maxlength="120" placeholder="说点什么…" onkeydown="if(event.key==='Enter')postNote('${s.id}')"><button class="cta sm" onclick="postNote('${s.id}')">发送</button></div>` : ""}
    <div class="feed">${feed.map((e) => entryHtml(e, s)).join("") || `<div class="empty sm">还没有动态</div>`}</div>
    ${status(s) === "planning" && org ? `<div class="foot"><button class="linkish" onclick="demoToday('${s.id}')">演示用：把日期改成今天，立刻进入「进行中」</button></div>` : ""}
    <footer class="foot">${s.remote ? `<div class="mode-slot">${modeLine()}</div>${st === "live" ? "进行中的局每 15 秒自动刷新" : "刷新页面可以看到最新动态"}` : "这个局保存在本机浏览器，通过链接快照分享"}</footer>
    </div>
    <div class="action-bar">${sessionActions(s, st, member, org, full, snap)}</div>`;
}
function sessionActions(s, st, member, org, full, snap) {
  const liked = !!S.likes[s.id], saved = !!S.saves[s.id];
  const ab = (fn, ico, label, cls = "") => `<button class="ab ${cls}" onclick="${fn}">${ICON[ico]}<small>${label}</small></button>`;
  const likeBtn = `<button class="ab like ${liked ? "on" : ""}" onclick="toggleLike('${s.id}',this)">${liked ? ICON.heartOn : ICON.heart}<small class="n">${fmt((s.likes || 0) + (liked ? 1 : 0))}</small></button>`;
  const share = s.visibility !== "private" ? ab(`shareSession('${s.id}')`, "share", "分享") : ab(`openVisibility('${s.id}')`, "lock", "私密");
  if (!member) {
    if (st === "done") return `${likeBtn}${ab(`toggleSave('${s.id}',this)`, saved ? "starOn" : "star", "收藏", saved ? "on" : "")}${ab("copy(location.href)", "share", "分享")}
      <button class="cta acid" onclick="copyAsNew('${s.id}')">照着这条路线开局</button>`;
    return `${s.visibility !== "private" ? ab("copy(location.href)", "share", "分享") : ""}
      <button class="cta acid" ${full ? "disabled" : ""} onclick="joinSession('${s.id}')">${full ? "已满员" : `加入这个局 · ${s.members.length}/${s.cap}`}</button>`;
  }
  if (st === "planning") return `${share}${org ? ab(`go('#/edit/${s.id}')`, "edit", "编辑") : ""}
      <button class="cta" onclick="shareSession('${s.id}')">邀请朋友</button>`;
  if (st === "live") return `${ab(`openPhotos('${s.id}')`, "camera", "传照片")}${ab(`openSpend('${s.id}')`, "yen", "记一笔")}${org ? ab(`closeSession('${s.id}')`, "flag", "收局") : ""}
      <button class="cta acid" onclick="openCheckin({sessionId:'${s.id}'})">打卡这一站</button>`;
  return `${likeBtn}${share}${ab(`openPhotos('${s.id}')`, "camera", "补照片")}
      ${org ? (s.visibility === "public" ? `<button class="cta" onclick="openVisibility('${s.id}')">已公开 · 改可见性</button>` : `<button class="cta acid" onclick="setVisibility('${s.id}','public')">设为公开，变成攻略</button>`)
        : `<button class="cta acid" onclick="openCheckin({sessionId:'${s.id}'})">补打卡</button>`}`;
}
function entryHtml(e, s) {
  const p = e.stopIndex != null ? PL[s.stops[e.stopIndex]?.placeId] : null;
  const when = new Date(e.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  if (e.type === "system") return `<div class="entry sys"><span>${esc(e.text)}</span><span class="kicker">${when}</span></div>`;
  const act = { checkin: `打卡 · 第 ${(e.stopIndex ?? 0) + 1} 站${p ? " " + esc(shortName(p)) : ""}`, photo: "传了照片", spend: `记了一笔${p ? " · " + esc(shortName(p)) : ""}`, note: "说" }[e.type];
  const head = `<div class="e-head">${av({ name: e.author })}<b>${esc(e.author)}</b><span class="kicker">${act}</span><span class="kicker e-when">${when}</span></div>`;
  let body = "";
  if (e.type === "checkin") body = `<div class="e-badges">${e.verified ? sticker("到场认证") : `<span class="unverified" title="${esc(e.verifyNote || "")}">未认证${e.verifyNote ? " · " + esc(e.verifyNote) : ""}</span>`}${e.rating ? `<span class="kicker">评分 ${e.rating}/5</span>` : ""}${e.amount ? `<span class="kicker">花了 ¥${e.amount}</span>` : ""}</div>${e.text ? `<div class="e-text">${esc(e.text)}</div>` : ""}`;
  if (e.type === "spend") body = `<div class="e-amt">¥${e.amount}</div>${e.text ? `<div class="e-text">${esc(e.text)}</div>` : ""}`;
  if (e.type === "note" || (e.type === "photo" && e.text)) body = `<div class="e-text">${esc(e.text)}</div>`;
  return `<div class="entry">${head}${body}${e.photo ? `<div class="e-photo">${img(e.photo)}</div>` : ""}</div>`;
}
async function postNote(sid) {
  closeSheet();
  const v = ($("#noteIn")?.value || "").trim(); if (!v) return;
  if (getSession(sid).remote) { if (await remoteWrite(sid, () => API.addEntry(sid, { type: "note", text: v }))) render(); return; }
  const s = getSession(sid), me = meRef();
  s.entries.push({ id: uid("e"), sessionId: sid, type: "note", author: me.name, avatar: me.avatar, uid: me.uid, text: v, createdAt: Date.now() });
  saveSession(s); render();
}
async function demoToday(sid) {
  closeSheet();
  if (getSession(sid).remote) { if (await remoteWrite(sid, () => API.updateSession(sid, { date: today(), changeNote: "（演示）日期改成了今天" }))) render(); return; }
  const s = getSession(sid); s.date = today(); s.entries.push(sysEntry(sid, "（演示）日期改成了今天")); saveSession(s); render();
}
async function closeSession(sid) {
  closeSheet();
  if (getSession(sid).remote) { if (await remoteWrite(sid, () => API.updateSession(sid, { closed: true }))) { toast("收局！可以设为公开，变成一篇攻略"); render(); } return; }
  const s = getSession(sid);
  s.closed = true; s.entries.push(sysEntry(sid, `${S.prefs.nick} 收局了`)); saveSession(s);
  toast(checkins(s).length ? "收局！可以设为公开，变成一篇攻略" : "收局了，这次没有人打卡");
  render();
}
function openVisibility(sid) {
  const s = getSession(sid);
  openSheet(`<h2 class="sheet-t">谁能看到这个局</h2>${Object.entries(VIS).map(([k, [i, l, d]]) => `<div class="pick-row ${s.visibility === k ? "on" : ""}" onclick="setVisibility('${sid}','${k}')"><span class="pick-ic">${ICON[i]}</span><div style="flex:1"><b>${l}</b><div class="sub">${d}</div></div>${s.visibility === k ? ICON.check : ""}</div>`).join("")}`);
}
async function setVisibility(sid, v) {
  const s = getSession(sid);
  if (s.visibility === v) { closeSheet(); return; }
  if (s.remote) { if (await remoteWrite(sid, () => API.updateSession(sid, { visibility: v }))) { closeSheet(); toast(`已改为${VIS[v][1]}`); S.feedAt = 0; render(); } return; }
  s.visibility = v; s.entries.push(sysEntry(sid, `可见性改为「${VIS[v][1]}」`)); saveSession(s);
  closeSheet(); toast(v === "public" ? (status(s) === "done" ? "已公开，发现页可以看到这篇攻略了" : "已公开，发现页可以看到这个局了") : `已改为${VIS[v][1]}`);
  render();
}
function copyAsNew(sid) {
  const s = getSession(sid);
  window.__agentDraft = { ...newDraft(s.stops.map((x) => x.placeId)), title: `照着「${s.title}」`.slice(0, 24), titleTouched: true };
  window.__agentDraft.stops.forEach((st, i) => { st.time = s.stops[i].time || st.time; });
  go("#/new");
}

// ---------- 分享与加入（逻辑不变） ----------
function snapshot(s) {
  const { seed, ...rest } = s;
  return { ...rest, entries: s.entries.slice(-25).map((e) => (e.photo && e.photo.startsWith("data:") ? { ...e, photo: null } : e)) };
}
const shareLink = (s) => (s.remote ? API.shareLink(s.id) : location.origin + location.pathname + "#/s/" + b64e(snapshot(s)));
function shareSession(sid, justCreated) {
  const s = getSession(sid);
  if (s.visibility === "private") { toast("私密局不能分享，先改成「链接可见」或「公开」"); openVisibility(sid); return; }
  const link = shareLink(s);
  openSheet(`${justCreated ? `<div class="made">${sticker("局开好了")}</div>` : ""}<h2 class="sheet-t">${justCreated ? esc(s.title) : "邀请朋友"}</h2>
    <div class="sub">${dateLabel(s.date)} · ${s.stops.length} 站 · ${s.members.length}/${s.cap} 人</div>
    <div class="share-box"><input class="input" id="shareLink" readonly value="${esc(link)}"><button class="cta sm acid" onclick="copy($('#shareLink').value,'#shareLink')">复制</button></div>
    <div class="hint">对方打开链接就能看到路线、天气和预算，填个昵称即可加入。${s.remote ? "所有成员看到的是同一个局。" : "（离线模式：链接里是一份快照）"}</div>`);
  if (justCreated) copy(link, "#shareLink");
}
function mergeSnapshot(local, snap) {
  if (!snap) return local;
  if (!local) return snap;
  const members = [...local.members]; snap.members.forEach((m) => { if (!members.some((x) => x.uid === m.uid)) members.push(m); });
  const ids = new Set(local.entries.map((e) => e.id));
  return { ...local, members, entries: [...local.entries, ...snap.entries.filter((e) => !ids.has(e.id))] };
}
let SNAP = null;
function renderShared(payload) {
  try { SNAP = b64d(payload); } catch { SNAP = null; }
  if (!SNAP || !SNAP.stops) { $("#view").innerHTML = `<div class="empty full"><b>链接好像坏了</b><button class="cta ghost" onclick="go('#/discover')">去首页</button></div>`; return; }
  const local = getSession(SNAP.id);
  if (local && isMember(local)) { saveSession(mergeSnapshot(local, SNAP)); location.replace(`#/session/${SNAP.id}`); return; }
  renderSession(SNAP.id, null, SNAP);
}
async function joinSession(sid) {
  const base = mergeSnapshot(getSession(sid), SNAP && SNAP.id === sid ? SNAP : null) || getSession(sid);
  if (!S.prefs?.done) {
    const n = prompt("先起个昵称，队友怎么称呼你？", "周末玩家" + Math.floor(Math.random() * 900 + 100));
    if (!n) return;
    S.prefs = { likes: ["展览", "市集"], budget: 100, groupSize: 2, city: "上海", avatar: AVATARS[0], uid: uid("u"), ...(S.prefs || {}), nick: n.trim().slice(0, 12), done: false };
    persist("prefs");
  }
  if (base?.remote) {
    if (!(await remoteWrite(sid, () => API.join(sid)))) return;
    toast("加入成功"); S.mineAt = 0;
    if (!S.prefs.done) { try { sessionStorage.setItem("wk2_after_onb", `#/session/${sid}`); } catch {} go("#/onboarding"); return; }
    render(); return;
  }
  const s = JSON.parse(JSON.stringify(base));
  if (s.members.length >= s.cap) { toast("已满员"); return; }
  s.members.push({ ...meRef(), role: "member", joinedAt: Date.now() });
  s.entries.push(sysEntry(s.id, `${S.prefs.nick} 加入了`));
  delete s.seed;
  saveSession(s);
  toast("加入成功");
  if (!S.prefs.done) { try { sessionStorage.setItem("wk2_after_onb", `#/session/${s.id}`); } catch {} go("#/onboarding"); return; }
  if (route().name === "session") render(); else go(`#/session/${s.id}`);
}

// ---------- 底部弹层 ----------
let F = {};
function openSheet(html) {
  closeSheet();
  $("#layer").insertAdjacentHTML("beforeend", `<div class="sheet-mask" onclick="closeSheet()"></div><div class="sheet" role="dialog" aria-modal="true"><div class="grabber"></div><button class="sheet-x" onclick="closeSheet()" aria-label="关闭">${ICON.close}</button>${html}</div>`);
}
function closeSheet() { $("#layer")?.querySelectorAll(".sheet-mask,.sheet").forEach((e) => e.remove()); }
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeSheet(); closeAdd(); } });
async function addPhotos(input, max, sel) {
  const files = [...input.files].slice(0, max - F.images.length);
  for (const f of files) { try { F.images.push(await compress(f, online() ? 1280 : 720, online() ? 0.8 : 0.72)); } catch { toast("图片读取失败"); } }
  input.value = ""; renderUpload(max, sel);
}
function renderUpload(max, sel) {
  $(sel).innerHTML = F.images.map((src, i) => `<img class="thumb" src="${src}" onclick="F.images.splice(${i},1);renderUpload(${max},'${sel}')" title="点击删除">`).join("") +
    (F.images.length < max ? `<label class="up-add">${ICON.camera}<input type="file" accept="image/*" ${max > 1 ? "multiple" : ""} hidden onchange="addPhotos(this,${max},'${sel}')"></label>` : "");
}

// ---------- 打卡（逻辑不变） ----------
function openCheckin({ sessionId, placeId }) {
  const s = sessionId ? getSession(sessionId) : null;
  const si = s ? currentStop(s) : 0;
  const pid = s ? s.stops[si].placeId : placeId || PLACES[0].id;
  F = { sessionId, placeId: pid, stopIndex: si, images: [], text: "", rating: 5, spend: s ? +s.stops[si].estCost || 0 : PL[pid].avgCost };
  const stopSel = s && s.stops.length > 1
    ? `<div class="field"><label>第几站</label><div class="chip-cloud">${s.stops.map((x, i) => `<button class="chip ${i === si ? "on" : ""}" onclick="pickStop(this,${i})">${i + 1}. ${esc(shortName(PL[x.placeId]))}</button>`).join("")}</div></div>`
    : s ? "" : `<div class="field"><label>在哪</label><select class="input" onchange="F.placeId=this.value;$('#spendIn').value=F.spend=PL[this.value].avgCost">${PLACES.map((p) => `<option value="${p.id}" ${p.id === pid ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></div>`;
  openSheet(`<h2 class="sheet-t">${s ? "打卡这一站" : "我来过"}</h2><div class="sub">${s ? esc(s.title) : "会自动记成一个只有你能看到的私密局，之后可以改成公开"}</div>
    ${stopSel}
    <div class="field"><label>照片</label><div class="upload" id="ciUp"></div></div>
    <div class="field"><label>一句话</label><input class="input" maxlength="60" placeholder="今天的风很舒服…" oninput="F.text=this.value"></div>
    <div class="field"><label>评分</label><div class="stars" id="stars"></div></div>
    <div class="field"><label>这一站花了多少 ¥</label><input class="input" id="spendIn" type="number" min="0" value="${F.spend}" oninput="F.spend=+this.value||0"></div>
    <div class="hint">提交时会请求一次定位：离这个地方 500m 以内，就会盖上「到场认证」${online() ? "（由服务器判定）" : ""}。不给定位也能打卡，只是不带认证。</div>
    <button class="cta acid wide" id="ciBtn" onclick="submitCheckin()">盖章打卡</button>`);
  renderUpload(1, "#ciUp"); renderStars();
}
function pickStop(el, i) {
  const s = getSession(F.sessionId);
  F.stopIndex = i; F.placeId = s.stops[i].placeId; F.spend = +s.stops[i].estCost || 0;
  $("#spendIn").value = F.spend;
  el.parentElement.querySelectorAll(".chip").forEach((c) => c.classList.remove("on")); el.classList.add("on");
}
function renderStars() { $("#stars").innerHTML = [1, 2, 3, 4, 5].map((n) => `<button class="${n <= F.rating ? "on" : ""}" onclick="F.rating=${n};renderStars()" aria-label="${n} 分">${n <= F.rating ? ICON.starOn : ICON.star}</button>`).join(""); }
function locate(p) {
  return new Promise((res) => {
    if (!navigator.geolocation) return res({ verified: false, note: "浏览器不支持定位" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        S.loc = { lat: pos.coords.latitude, lon: pos.coords.longitude, acc: Math.round(pos.coords.accuracy), at: Date.now() }; persist("loc");
        const d = km(S.loc, p); res(d <= 0.5 ? { verified: true, note: `距离 ${Math.round(d * 1000)}m` } : { verified: false, note: `距离该地点 ${kmLabel(d)}，超出 500m` });
      },
      (err) => res({ verified: false, note: { 1: "你拒绝了定位授权", 2: "暂时拿不到位置", 3: "定位超时" }[err.code] || "定位失败" }),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 });
  });
}
async function submitCheckin() {
  const btn = $("#ciBtn"); btn.disabled = true; btn.textContent = "正在确认你在不在现场…";
  const p = PL[F.placeId], me = meRef();
  const target = F.sessionId ? getSession(F.sessionId) : null;
  if (online() && (!target || target.remote)) return submitCheckinRemote(target, p, btn);
  const loc = await locate(p);
  let s = F.sessionId ? getSession(F.sessionId) : null;
  if (!s) {
    s = { id: uid("s"), title: `打卡 · ${shortName(p)}`, cover: null, organizer: me.name, visibility: "private", date: today(), startTime: "",
      stops: [{ placeId: p.id, time: "", estCost: F.spend, note: "" }], budget: { total: F.spend, perPerson: F.spend, mode: "AA" },
      members: [{ ...me, role: "organizer", joinedAt: Date.now() }], cap: 1, closed: true, likes: 0, tags: [p.category], createdAt: Date.now(), entries: [] };
  } else s = JSON.parse(JSON.stringify(s));
  if (!isMember(s)) s.members.push({ ...me, role: "member", joinedAt: Date.now() });
  const t = Date.now();
  s.entries.push({ id: uid("e"), sessionId: s.id, type: "checkin", stopIndex: F.stopIndex, author: me.name, avatar: me.avatar, uid: me.uid, photo: F.images[0] || null, text: F.text.trim(), rating: F.rating, verified: loc.verified, verifyNote: loc.note, createdAt: t });
  if (F.spend > 0) s.entries.push({ id: uid("e"), sessionId: s.id, type: "spend", stopIndex: F.stopIndex, author: me.name, avatar: me.avatar, uid: me.uid, amount: F.spend, text: "", createdAt: t + 1 });
  const here = s.entries.filter((e) => e.type === "checkin" && e.stopIndex === F.stopIndex);
  const allIn = s.members.length > 1 && s.members.every((m) => here.some((e) => (e.uid ? e.uid === m.uid : e.author === m.name)));
  const firstAllIn = allIn && !s.entries.some((e) => e.type === "system" && e.allIn === F.stopIndex);
  if (firstAllIn) s.entries.push({ ...sysEntry(s.id, `第 ${F.stopIndex + 1} 站「${shortName(p)}」全员到齐`), allIn: F.stopIndex, createdAt: t + 2 });
  delete s.seed;
  saveSession(s); closeSheet();
  stamp(loc, p, firstAllIn ? s.members : null, () => go(`#/session/${s.id}`));
  if (!loc.verified) setTimeout(() => toast(`已打卡（未认证：${loc.note}）`), 200);
}
async function submitCheckinRemote(target, p, btn) {
  const coords = await API.locate();
  if (coords) { S.loc = { ...coords, at: Date.now() }; persist("loc"); }
  let ph;
  try { if (F.images[0]) { btn.textContent = "上传照片…"; ph = await uploadDataURL(F.images[0]); } } catch (e) { apiErr(e); btn.disabled = false; btn.textContent = "盖章打卡"; return; }
  const body = { ...(F.text.trim() ? { text: F.text.trim() } : {}), rating: F.rating, ...(ph ? { photo: ph } : {}), ...(F.spend > 0 ? { amount: F.spend } : {}), ...(coords ? { coords } : {}) };
  const wasAll = target?.stops[F.stopIndex]?.allArrived;
  let r;
  try {
    await ensureMe();
    r = target ? await API.addEntry(target.id, { type: "checkin", stopIdx: F.stopIndex, ...body }) : await API.quickCheckin({ placeId: p.id, ...body });
  } catch (e) { apiErr(e); btn.disabled = false; btn.textContent = "盖章打卡"; return; }
  const s = adapt(r.session); REMOTE.set(s.id, s); S.mineAt = 0; S.trailAt = 0;
  const e = s.entries.find((x) => x.id === r.entry.id) || {};
  const loc = { verified: !!r.entry.verified, note: e.verifyNote || (coords ? "" : "未开启定位") };
  const allNow = s.members.length > 1 && s.stops[F.stopIndex]?.allArrived && !wasAll;
  closeSheet();
  stamp(loc, p, allNow ? s.members : null, () => go(`#/session/${s.id}`));
  if (!loc.verified) setTimeout(() => toast(`已打卡（未认证：${loc.note}）`), 200);
}
function stamp(loc, p, allMembers, done) {
  $("#layer").insertAdjacentHTML("beforeend", `<div class="stamp-wrap" id="stamp"><div class="stamp ${loc.verified ? "" : "plain"}"><span class="kicker">${new Date().toLocaleDateString("zh-CN")}</span><b>${loc.verified ? "到场认证" : "来过"}</b><span class="kicker">${esc(shortName(p))}</span></div></div>`);
  setTimeout(() => {
    $("#stamp")?.remove();
    if (!allMembers) { done(); if (route().name === "session") render(); return; }
    $("#layer").insertAdjacentHTML("beforeend", `<div class="stamp-wrap" id="stamp"><div class="stamp allin"><span class="kicker">全员</span><b>到齐</b><span class="stack">${allMembers.map((m) => av(m)).join("")}</span></div></div>`);
    setTimeout(() => { $("#stamp")?.remove(); done(); if (route().name === "session") render(); }, 1600);
  }, 1300);
}
function openPhotos(sid) {
  F = { sessionId: sid, images: [], text: "" };
  openSheet(`<h2 class="sheet-t">传照片</h2><div class="sub">照片会出现在这个局的动态里（最多 4 张）</div>
    <div class="field"><div class="upload" id="phUp"></div></div>
    <div class="field"><input class="input" maxlength="60" placeholder="配一句话（可选）" oninput="F.text=this.value"></div>
    <button class="cta acid wide" onclick="submitPhotos()">发布</button>`);
  renderUpload(4, "#phUp");
}
async function submitPhotos() {
  if (!F.images.length) { toast("先选一张照片"); return; }
  if (getSession(F.sessionId).remote) {
    const sid = F.sessionId, imgs = [...F.images], text = F.text.trim(); closeSheet(); toast("上传中…");
    for (let i = 0; i < imgs.length; i++) {
      const ok = await remoteWrite(sid, async () => API.addEntry(sid, { type: "photo", photo: await uploadDataURL(imgs[i]), ...(i || !text ? {} : { text }) }));
      if (!ok) return;
    }
    toast("已发布"); render(); return;
  }
  const s = getSession(F.sessionId), me = meRef(), t = Date.now();
  F.images.forEach((src, i) => s.entries.push({ id: uid("e"), sessionId: s.id, type: "photo", author: me.name, avatar: me.avatar, uid: me.uid, photo: src, text: i ? "" : F.text.trim(), createdAt: t + i }));
  saveSession(s); closeSheet(); toast("已发布"); render();
}
function openSpend(sid) {
  const s = getSession(sid);
  F = { sessionId: sid, stopIndex: currentStop(s), amount: 0, text: "" };
  openSheet(`<h2 class="sheet-t">记一笔</h2><div class="sub">实际花费会累加到预算卡里</div>
    <div class="field"><label>金额 ¥</label><input class="input" type="number" min="0" placeholder="0" oninput="F.amount=+this.value||0"></div>
    <div class="field"><label>哪一站</label><div class="chip-cloud">${s.stops.map((x, i) => `<button class="chip ${i === F.stopIndex ? "on" : ""}" onclick="F.stopIndex=${i};this.parentElement.querySelectorAll('.chip').forEach(c=>c.classList.remove('on'));this.classList.add('on')">${i + 1}. ${esc(shortName(PL[x.placeId]))}</button>`).join("")}</div></div>
    <div class="field"><label>备注</label><input class="input" maxlength="30" placeholder="比如：门票、打车、奶茶" oninput="F.text=this.value"></div>
    <button class="cta acid wide" onclick="submitSpend()">记下</button>`);
}
async function submitSpend() {
  if (!F.amount) { toast("填个金额"); return; }
  if (getSession(F.sessionId).remote) {
    const sid = F.sessionId;
    if (await remoteWrite(sid, () => API.addEntry(sid, { type: "spend", amount: F.amount, stopIdx: F.stopIndex, ...(F.text.trim() ? { text: F.text.trim() } : {}) }))) { closeSheet(); toast(`记下 ¥${F.amount}`); render(); }
    return;
  }
  const s = getSession(F.sessionId), me = meRef();
  s.entries.push({ id: uid("e"), sessionId: s.id, type: "spend", stopIndex: F.stopIndex, author: me.name, avatar: me.avatar, uid: me.uid, amount: F.amount, text: F.text.trim(), createdAt: Date.now() });
  saveSession(s); closeSheet(); toast(`记下 ¥${F.amount}`); render();
}

// ---------- 局（我的） ----------
async function loadMine() {
  if (!online() || !API.auth) return;
  try { const r = await API.mySessions(); S.mine = r.items.map(adaptSummary); } catch { S.mine = S.mine || []; }
  S.mineAt = Date.now();
  if (route().name === "sessions") renderSessions();
}
function renderSessions() {
  if (online() && API.auth && (!S.mineAt || Date.now() - S.mineAt > 15000)) { S.mineAt = Date.now(); loadMine(); }
  const mine = [...(online() ? S.mine || [] : []), ...S.sessions.filter(isMember)];
  const seg = S.ui.sessSeg;
  const list = mine.filter((s) => status(s) === seg).sort((a, b) => (seg === "done" ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)));
  const n = (k) => mine.filter((s) => status(s) === k).length;
  $("#view").innerHTML = `<div class="page">
    <header class="top"><span class="brand">局<i>*</i></span>
      <div class="top-actions"><button class="cta sm ghost" onclick="openAgent()">AI 局长</button><button class="cta sm acid" onclick="go('#/new')">${ICON.plus} 开局</button></div></header>
    <div class="seg wide">${[["planning", "筹备中"], ["live", "进行中"], ["done", "已完成"]].map(([k, l]) => `<button class="${seg === k ? "on" : ""}" onclick="S.ui.sessSeg='${k}';renderSessions()">${l}${n(k) ? ` <b>${n(k)}</b>` : ""}</button>`).join("")}</div>
    ${list.length ? `<div class="list">${list.map(sessionRow).join("")}</div>` : `<div class="empty"><b>${{ planning: "还没有筹备中的局", live: "今天没有进行中的局", done: "还没有完成的局" }[seg]}</b>${seg === "planning" ? "在任意地方点「在这开局」" : ""}<button class="cta ghost" onclick="go('#/discover')">去发现</button></div>`}
    </div>${tabbar("sessions")}`;
}

// ---------- 我：像一张 Hinge 资料卡；足迹 / 收藏 / 关于 ----------
function myCheckins() {
  return S.sessions.flatMap((s) => s.entries.filter((e) => e.type === "checkin" && e.uid === S.prefs.uid).map((e) => ({ e, s }))).sort((a, b) => b.e.createdAt - a.e.createdAt);
}
async function loadTrail() {
  try { const r = await API.trail(); S.trail = r.items; } catch { S.trail = S.trail || []; }
  S.trailAt = Date.now();
  if (route().name === "me" || route().name === "trail") renderMe();
}
function trailList() {
  if (online() && API.auth && (!S.trailAt || Date.now() - S.trailAt > 15000)) { S.trailAt = Date.now(); loadTrail(); }
  const remote = (online() ? S.trail || [] : []).filter((e) => e.type === "checkin").map((e) => ({
    e: { createdAt: e.createdAt, photo: e.photoUrl, verified: e.verified, rating: e.rating, text: e.text, stopIndex: 0 },
    s: { id: e.session.id, title: e.session.title, stops: [{ placeId: e.placeId }] } }));
  return [...remote, ...myCheckins()].sort((a, b) => b.e.createdAt - a.e.createdAt);
}
function renderMe() {
  if (online() && API.auth && (!S.meAt || Date.now() - S.meAt > 15000)) {
    S.meAt = Date.now();
    Promise.all([API.me(), API.mySessions()]).then(([m, r]) => { S.meStats = m.stats; S.mine = r.items.map(adaptSummary); if (route().name === "me") renderMe(); }).catch(() => {});
  }
  const p = S.prefs, now = new Date();
  const mine = S.sessions.filter(isMember), cks = myCheckins(), trail = trailList();
  const monthOut = new Set(cks.filter(({ e }) => { const d = new Date(e.createdAt); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).map(({ s }) => s.id)).size;
  const places = new Set(cks.map(({ e, s }) => s.stops[e.stopIndex ?? 0]?.placeId)).size;
  const spent = S.sessions.flatMap((s) => s.entries).filter((e) => e.type === "spend" && e.uid === p.uid).reduce((a, e) => a + (+e.amount || 0), 0);
  const verified = cks.filter(({ e }) => e.verified).length;
  const org = [...(online() ? (S.mine || []).filter((s) => s.role === "organizer") : []), ...mine.filter(isOrganizer)].filter((s) => s.cap > 1 && status(s) === "done");
  const arrived = org.filter((s) => (s.summary ? s.checkinCount : checkins(s).length)).length;
  const st = online() && S.meStats;
  const seg = S.ui.meSeg;
  let body = "";
  if (seg === "trail") {
    body = trail.length ? `<div class="timeline">${trail.map(({ e, s }) => {
      const pl = PL[s.stops[e.stopIndex ?? 0]?.placeId] || PLACES[0];
      return `<div class="tl-item" onclick="go('#/session/${s.id}')">
        ${e.photo ? `<div class="stop-thumb">${img(e.photo, 'class="ph"')}</div>` : photo(pl, 0, "stop-thumb", "", false)}
        <div class="stop-main"><span class="kicker">${new Date(e.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" })}</span>
        <b>${esc(shortName(pl))}</b><span class="kicker">${esc(s.title)}</span>
        <div class="e-badges">${e.verified ? sticker("到场认证") : `<span class="unverified">未认证</span>`}${e.rating ? `<span class="kicker">评分 ${e.rating}/5</span>` : ""}</div>
        ${e.text ? `<p class="tl-text">“${esc(e.text)}”</p>` : ""}</div></div>`;
    }).join("")}</div>` : `<div class="empty"><b>还没有足迹</b>在任意地方点「来过」</div>`;
  } else if (seg === "saved") {
    const acts = PLACES.filter((x) => S.saves[x.id]), gs = allSessions().filter((x) => S.saves[x.id]);
    body = acts.length + gs.length ? `<div class="feed-col">${acts.map(placeCard).join("")}${gs.map(sessionCard).join("")}</div>` : `<div class="empty"><b>还没有收藏</b>地点页点「想去」</div>`;
  } else {
    body = `<div class="about">
      <p>产品只做两件事：展示可以去逛的地方；看中了，打卡「来过」，或者就地开一个局。</p>
      <p>小红书的打卡是笔记上的 POI 标签，不验证到场；点评的打卡是单点、个人的；Partiful 管活动，不管发现、多地点和预算。我们度量出门，不度量浏览。</p>
      <p>${online() ? "已连上服务器（Cloudflare Workers + D1）：局、打卡和照片对所有成员可见；到场认证由服务器按坐标判定。" : "当前连不上服务器，数据只存在本机浏览器（离线演示模式）。"}</p>
      <div class="mode-slot">${modeLine()}</div>
      <button class="linkish" onclick="if(confirm('清空本机所有数据，重新体验？')){try{Object.keys(localStorage).filter(k=>k.startsWith('wk')).forEach(k=>localStorage.removeItem(k))}catch(e){};location.hash='';location.reload()}">重置演示数据</button></div>`;
  }
  const line = [p.age, p.school, "上海"].filter(Boolean).join(" · ");
  $("#view").innerHTML = `<div class="page">
    <header class="top"><span class="brand">我<i>*</i></span><div class="top-actions"><button class="cta sm ghost" onclick="go('#/onboarding')">${ICON.edit} 编辑资料</button></div></header>
    <section class="profile">
      ${av({ name: p.nick }, "xl")}
      <h1 class="prof-name">${esc(p.nick)}</h1>
      <div class="kicker">${esc(line)}</div>
    </section>
    <div class="prompt big"><div class="prompt-q">一个理想的周末是……</div><div class="prompt-a">${p.prompt ? esc(p.prompt) : `<span class="muted">还没写。点右上角「编辑资料」补一句。</span>`}</div></div>
    <div class="prompt big"><div class="prompt-q">我通常</div><div class="prompt-a">和${GROUPS.find((g) => g.value === p.groupSize)?.label || "朋友"}出门，人均${BUDGETS.find((b) => b.value === p.budget)?.label || "随意"}，喜欢${p.likes.join("、")}。</div></div>
    <div class="stats">
      <div><b>${st ? st.checkinsThisMonth : monthOut}</b><small>${st ? "本月打卡" : "本月出门"}</small></div>
      <div><b>${st ? st.placesVisited : places}</b><small>去过的地方</small></div>
      <div><b>¥${st ? st.spentTotal : spent}</b><small>累计花费</small></div>
      <div><b>${st ? st.verifiedCheckins : verified}</b><small>到场认证</small></div>
    </div>
    <div class="ns"><div><b>成局到场率</b><small>你发起并已结束的多人局里，至少一人到场打卡的比例</small></div><strong>${org.length ? Math.round((arrived / org.length) * 100) + "%" : "—"}</strong></div>
    <div class="seg wide">${[["trail", `足迹 <b>${trail.length}</b>`], ["saved", "收藏"], ["about", "关于"]].map(([k, l]) => `<button class="${seg === k ? "on" : ""}" onclick="S.ui.meSeg='${k}';renderMe()">${l}</button>`).join("")}</div>
    ${body}
    </div>${tabbar("me")}`;
}

// ---------- 启动 ----------
if (S.prefs?.done) loadWeather();
render();
probeP.then(() => { setModeBadge(); if (online() && !["new", "edit", "onboarding", "map"].includes(route().name)) render(); });
