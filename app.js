// 周末去哪* v0.2 — 帖子即局：Place（地点）→ Session（局）→ Entry（局内动态）
// 纯前端：hash 路由 + localStorage（wk2_*），首次加载从 v0.1 的 wk_* 迁移。
const $ = (s) => document.querySelector(s);
const PL = Object.fromEntries(PLACES.map((p) => [p.id, p]));

// ---------- 存储 ----------
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
};
const KEYS = { prefs: "wk2_prefs", sessions: "wk2_sessions", likes: "wk2_likes", saves: "wk2_saves" };

// ---------- 工具 ----------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => (n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n));
const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const money = (p) => (p === 0 ? "免费" : "¥" + p);
const go = (h) => { location.hash = h; };
const pad = (n) => String(n).padStart(2, "0");
const dstr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => dstr(new Date());
const WD = "日一二三四五六";
const dateLabel = (s) => { const d = new Date(s + "T00:00:00"); return `${d.getMonth() + 1}月${d.getDate()}日 周${WD[d.getDay()]}`; };
const daysFromToday = (s) => Math.round((new Date(s + "T00:00:00") - new Date(today() + "T00:00:00")) / 864e5);
const shortName = (p) => p.name.split(" · ")[0];
const addHours = (t, h) => { const [a, b] = (t || "10:00").split(":").map(Number); return `${pad(Math.min(23, a + h))}:${pad(b)}`; };
const b64e = (o) => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(o)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64d = (s) => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))));
function km(a, b) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// ---------- v0.1 → v0.2 迁移 ----------
function migrateV1() {
  try { if (localStorage.getItem("wk2_migrated")) return; } catch { return; }
  const old = { prefs: LS.get("wk_prefs", null), squads: LS.get("wk_squads", []), checkins: LS.get("wk_checkins", []), guides: LS.get("wk_guides", []), likes: LS.get("wk_likes", {}), saves: LS.get("wk_saves", {}) };
  if (old.prefs) {
    const prefs = { ...old.prefs, uid: uid("u"), city: "上海" };
    LS.set(KEYS.prefs, prefs);
    const me = { uid: prefs.uid, name: prefs.nick, avatar: prefs.avatar || "🐱" };
    const sessions = [];
    const nextDay = (day) => weekendDate(0, day);
    // Squad → 单站 Session
    old.squads.filter((q) => q.role === "host" || q.role === "joined").forEach((q) => {
      const p = PL[q.activityId]; if (!p) return;
      const [day, part] = (q.time || "周六 下午").split(" ");
      const time = { 上午: "10:00", 下午: "14:00", 晚上: "19:00" }[part] || "14:00";
      const members = q.members.map((n, i) => n === prefs.nick
        ? { ...me, role: q.host === n ? "organizer" : "member", joinedAt: q.createdAt || Date.now() }
        : { uid: "v1-" + n, name: n, avatar: "🙂", role: q.host === n ? "organizer" : "member", joinedAt: q.createdAt || Date.now() });
      sessions.push({ id: q.id, title: `${shortName(p)}局`, cover: null, organizer: q.host, visibility: "link", date: nextDay(day === "周日" ? "sun" : "sat"), startTime: time,
        stops: [{ placeId: p.id, time, estCost: p.avgCost, note: "" }], budget: { total: p.avgCost * q.cap, perPerson: p.avgCost, mode: q.costMode === "AA" ? "AA" : "treat" },
        members, cap: q.cap, closed: false, likes: 0, tags: [], createdAt: q.createdAt || Date.now(),
        entries: [sysEntry(q.id, "由 v0.1 的组队迁移而来"), ...(q.note ? [{ id: uid("e"), sessionId: q.id, type: "note", author: q.host, avatar: "🙂", text: q.note, createdAt: q.createdAt || Date.now() }] : [])] });
    });
    // CheckIn → 单人私密局
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
    // 用户写的攻略 → 已完成的公开局
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
  wx: null,
  ui: { chip: "为你推荐", q: "", searching: false, sessSeg: "planning" },
};
function persist(k) { if (!LS.set(KEYS[k], S[k])) toast("本地存储已满，试试少传几张图"); }

// ---------- M8：后端（RFC-001）在线 / 离线双模 ----------
// 在线：局、加入、打卡、照片、足迹都走 API；离线（如大陆访问 workers.dev 失败）：退回纯 localStorage。
const REMOTE = new Map();   // id → 适配后的完整局
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
    stops: x.placeIds.map((placeId) => ({ placeId })), members: Array.from({ length: x.memberCount }, (_, i) => ({ avatar: x.memberAvatars[i] || "🙂" })),
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
// 远端写操作：成功后用返回的整个局替换本地状态
async function remoteWrite(id, fn) {
  try { await ensureMe(); const r = await fn(); if (r?.session) REMOTE.set(id, adapt(r.session)); return r || {}; }
  catch (e) { apiErr(e); return null; }
}
function modeLine() { return online() ? `<span class="mode on">● 在线 · 多人实时同步</span>` : API_OFFLINE_LINE; }
const API_OFFLINE_LINE = `<span class="mode">● 离线演示模式 · 数据只存在本机</span>`;
function setModeBadge() { document.querySelectorAll(".mode-slot").forEach((el) => (el.innerHTML = modeLine())); }

// ---------- 局：读写与推导 ----------
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
const meRef = () => ({ uid: S.prefs.uid, name: S.prefs.nick, avatar: S.prefs.avatar || "🐱" });
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
const VIS = { private: ["🔒", "私密", "只有你自己能看到"], link: ["🔗", "好友", "拿到链接的人才能看、才能加入"], public: ["🌐", "公开", "出现在「发现」里，完成后就是一篇攻略"] };
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

// ---------- 天气：逐站 × 逐小时（Open-Meteo），16 天外用气候常态 ----------
const WX = new Map();
const wxIcon = (c) => c === 0 ? ["☀️", "晴"] : c <= 3 ? ["⛅", "多云"] : c <= 48 ? ["🌫️", "雾"] : c <= 67 ? ["🌧️", "雨"] : c <= 77 ? ["🌨️", "雪"] : c <= 82 ? ["🌦️", "阵雨"] : ["⛈️", "雷雨"];
const wxKey = (p, date) => `${p.lat.toFixed(1)},${p.lon.toFixed(1)},${date}`;
function wxFor(p, date, time) {
  if (!p || !date) return null;
  const ahead = daysFromToday(date);
  if (ahead > 15) {
    const [t, r] = CLIMATE[new Date(date + "T00:00:00").getMonth()];
    return { kind: "climate", ico: "📅", temp: t, rain: r, ahead };
  }
  if (ahead < -90) return null;
  const k = wxKey(p, date), c = WX.get(k);
  if (!c) { fetchWx(p, date); return { kind: "loading" }; }
  if (c.loading) return { kind: "loading" };
  const h = Math.min(23, parseInt((time || "12:00").split(":")[0], 10) || 12);
  return { kind: c.mock ? "mock" : "ok", ico: wxIcon(c.code[h])[0], temp: Math.round(c.temp[h]), rain: c.rain[h] ?? 0 };
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
    // 降级：按日期生成稳定的 mock，保证同一天每次看到的一样
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
  if (w.kind === "loading") return `<span class="wxchip">… 天气</span>`;
  if (w.kind === "climate") return `<span class="wxchip" title="超出 16 天预报范围">📅 ${w.ahead - 15} 天后更新 · 常年 ${w.temp}°</span>`;
  const bad = !p.indoor && w.rain >= 50;
  return `<span class="wxchip ${bad ? "bad" : ""}">${w.ico} ${w.temp}° · ${w.rain}%${w.kind === "mock" ? " · 示例" : ""}</span>`;
}
const rainyStop = (p, date, time) => { const w = wxFor(p, date, time); return !!w && (w.kind === "ok" || w.kind === "mock") && !p.indoor && w.rain >= 50; };
function backupFor(p, exclude = []) {
  return PLACES.filter((x) => x.indoor && x.id !== p.id && !exclude.includes(x.id)).sort((a, b) => km(p, a) - km(p, b))[0];
}

// 发现页的周末天气条（按城市中心，逐日）
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

// ---------- 推荐打分（沿用 v0.1，理由要显示在卡片上） ----------
function rainFor(p) {
  if (!S.wx) return 0;
  const sat = S.wx.sat?.rain ?? 0, sun = S.wx.sun?.rain ?? 0;
  return p.days.length === 1 ? (p.days[0] === "sat" ? sat : sun) : Math.min(sat, sun);
}
function score(p, prefs = S.prefs, rainOverride) {
  const reasons = [];
  let sc = 0;
  if (prefs.likes.includes(p.category)) { sc += 40; reasons.push(`❤️ 你喜欢${p.category}`); }
  if (p.avgCost <= prefs.budget) { sc += 25; reasons.push(p.avgCost === 0 ? "💰 免费" : "💰 预算内"); }
  else sc += 25 * Math.max(0, 1 - (p.avgCost - prefs.budget) / Math.max(prefs.budget, 50));
  const rain = rainOverride ?? rainFor(p);
  if (rain > 50) { if (p.indoor) { sc += 20; reasons.push("☔ 雨天室内"); } else sc += 4; }
  else if (!p.indoor) { sc += 20; reasons.push("☀️ 适合户外"); } else sc += 14;
  const g = prefs.groupSize;
  if (p.suitFor.includes(g)) { sc += 10; reasons.push(g === 1 ? "🙋 一个人也好玩" : `👥 适合${GROUPS.find((x) => x.value === g)?.label || g + " 人"}`); }
  sc += (5 * p.heat) / 3200;
  return { sc, reasons };
}

// ---------- 通用 UI ----------
function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast"; el.textContent = msg;
  $("#layer").appendChild(el);
  setTimeout(() => el.remove(), 2300);
}
function copy(text, inputSel) {
  const fallback = () => { const i = inputSel && $(inputSel); if (i) i.select(); toast("请长按链接手动复制"); };
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast("已复制，丢进群里吧 ✌️"), fallback);
  else fallback();
}
function compress(file, max = 720, quality = 0.72) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL("image/jpeg", quality));
      };
      img.onerror = rej; img.src = r.result;
    };
    r.onerror = rej; r.readAsDataURL(file);
  });
}
// 图片加载失败 → 移除 <img>，露出下面的 emoji 渐变底
const img = (src, extra = "") => `<img src="${esc(src)}" loading="lazy" onerror="this.remove()" ${extra}>`;
function photoBox(p, i = 0, cls = "cover", style = "") {
  const ph = p.photos[i];
  return `<div class="${cls}" style="background:${p.bg};${style}"><span class="emo">${p.emoji}</span>
    ${ph ? img(ph.src, 'class="ph"') + `<span class="credit">${ph.note ? "氛围图 · " : ""}${esc(ph.credit)}</span>` : ""}`;
}
const avatars = (ms, n = 4) => `<span class="stack">${ms.slice(0, n).map((m) => `<span class="avatar">${m.avatar || "🙂"}</span>`).join("")}${ms.length > n ? `<span class="avatar more">+${ms.length - n}</span>` : ""}</span>`;

// 瀑布流：放入当前最短列
function masonry(items, heightOf, cardHtml) {
  const cols = [[], []], h = [0, 0];
  items.forEach((it) => { const i = h[0] <= h[1] ? 0 : 1; cols[i].push(cardHtml(it)); h[i] += heightOf(it); });
  return `<div class="masonry">${cols.map((c) => `<div class="col">${c.join("")}</div>`).join("")}</div>`;
}
const coverAR = (r) => `aspect-ratio:100/${Math.round(r * 75)}`;

function placeCard(p) {
  const reasons = S.prefs ? score(p).reasons.slice(0, 3) : [];
  const pool = [...(online() ? S.feed || [] : []), ...allSessions().filter((s) => !(online() && s.seed))];
  const open = pool.filter((s) => s.visibility === "public" && status(s) === "planning" && s.stops.some((st) => st.placeId === p.id)).length;
  return `<div class="card" onclick="go('#/place/${p.id}')">
    ${photoBox(p, 0, "cover", coverAR(p.ratio))}
      <span class="pill">📍 ${esc(p.district)}</span><span class="corner">${p.category}</span>
      <span class="price-tag ${p.avgCost === 0 ? "free" : ""}">${money(p.avgCost)}</span>
    </div>
    <div class="card-body">
      <div class="card-title">${esc(p.name)}</div>
      ${reasons.length ? `<div class="reasons">${reasons.map((r) => `<span class="reason">${r}</span>`).join("")}</div>` : ""}
      <div class="card-foot"><span>${p.indoor ? "室内" : "户外"} · ${fmt(p.checkinCount)} 人来过</span>
      ${open ? `<span class="squad-hint">👥 ${open} 局</span>` : ""}</div>
    </div></div>`;
}
const placeHeight = (p) => p.ratio * 0.75 + 0.62;

function collage(s, h) {
  const ph = sessionPhotos(s).slice(0, 3), p0 = PL[s.stops[0]?.placeId];
  const base = `background:${p0?.bg || "#eee"}`;
  if (ph.length >= 3) return `<div class="collage three" style="height:${h}px;${base}"><div>${img(ph[0])}</div><div>${img(ph[1])}</div><div>${img(ph[2])}</div></div>`;
  return `<div class="collage" style="height:${h}px;${base}"><span class="emo">${p0?.emoji || "📍"}</span>${ph[0] ? img(ph[0], 'class="ph"') : ""}</div>`;
}
function sessionCard(s) {
  const st = status(s), joinable = st === "planning" && s.members.length < s.cap;
  const liked = !!S.likes[s.id];
  return `<div class="card" onclick="go('#/session/${s.id}')">
    <div style="position:relative">${collage(s, 170 + (s.stops.length > 1 ? 30 : 0))}
      <span class="corner ${st === "done" ? "done" : ""}">${st === "done" ? "攻略" : joinable ? "可加入" : STATUS_LABEL[st]}</span>
      <span class="pill">${s.stops.length} 站 · ${dateLabel(s.date).replace(/ 周./, "")}</span></div>
    <div class="card-body">
      <div class="card-title">${esc(s.title)}</div>
      <div class="route-mini">${s.stops.map((x) => esc(shortName(PL[x.placeId] || { name: "?" }))).join(" → ")}</div>
      <div class="card-foot">${avatars(s.members, 3)}
        ${st === "done" ? `<button class="like ${liked ? "on" : ""}" onclick="event.stopPropagation();toggleLike('${s.id}',this)"><span class="h">${liked ? "❤️" : "♡"}</span><span class="n">${fmt((s.likes || 0) + (liked ? 1 : 0))}</span></button>`
          : `<span>人均 ¥${s.budget.perPerson} · ${s.members.length}/${s.cap}</span>`}</div>
    </div></div>`;
}
const sessionHeight = (s) => (170 + (s.stops.length > 1 ? 30 : 0)) / 220 + 0.55;

function toggleLike(id, el) {
  if (S.likes[id]) delete S.likes[id]; else S.likes[id] = true;
  persist("likes");
  const s = getSession(id), on = !!S.likes[id];
  if (el) {
    el.classList.toggle("on", on);
    el.querySelector(".h").textContent = on ? "❤️" : "♡";
    el.querySelector(".n").textContent = fmt((s?.likes || 0) + (on ? 1 : 0));
    el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop");
  }
}
function toggleSave(id, el, label = "收藏") {
  if (S.saves[id]) delete S.saves[id]; else S.saves[id] = true;
  persist("saves");
  toast(S.saves[id] ? `已${label}` : `已取消${label}`);
  if (el) { el.classList.toggle("on", !!S.saves[id]); el.querySelector("span").textContent = S.saves[id] ? "★" : "☆"; }
}

// ---------- 路由 ----------
function route() {
  const [path, query] = (location.hash.slice(2) || "discover").split("?");
  const [name, ...rest] = path.split("/");
  return { name, arg: rest.join("/"), query: new URLSearchParams(query || "") };
}
function render() {
  const r = route();
  // 只读浏览不需要身份：分享出去的局（快照或服务端 id）可以直接打开
  if (!S.prefs?.done && !["onboarding", "s", "session"].includes(r.name)) { location.replace("#/onboarding"); return; }
  const view = {
    onboarding: renderOnboarding, discover: renderDiscover, place: renderPlace, session: renderSession, s: renderShared,
    new: renderEditor, edit: renderEditor, sessions: renderSessions, trail: renderTrail, me: renderMe,
  }[r.name] || renderDiscover;
  view(r.arg, r.query);
}
window.addEventListener("hashchange", () => { closeAdd(); closeSheet(); clearTimeout(POLL); S.visit = null; if (!["new", "edit"].includes(route().name)) D = null; render(); window.scrollTo(0, 0); });

function tabbar(active) {
  const t = (k, ico, label) => `<button class="tab ${active === k ? "on" : ""}" onclick="go('#/${k}')">${ico}<small>${label}</small></button>`;
  return `<div class="scrim"></div><nav class="tabbar">
    ${t("discover", "🏠", "发现")}${t("sessions", "🗂", "我的局")}
    <button class="tab plus" id="plusBtn" onclick="toggleAdd()">＋</button>
    ${t("trail", "👣", "足迹")}${t("me", "👤", "我")}</nav>`;
}
function header(sub) {
  return `<div class="header"><div class="header-row">
    <button class="icon-btn" onclick="toggleSearch()" aria-label="搜索"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="7"/><path d="M16 16l5 5"/></svg></button>
    <div><div class="wordmark">周末去哪<sup>*</sup></div>${sub ? `<div class="city-tag">${sub}</div>` : ""}</div>
    <button class="icon-btn" onclick="toggleAdd()" aria-label="开局">＋</button></div>
    ${S.ui.searching ? `<div class="search-bar"><input class="input" id="q" placeholder="搜地点、区域、标签" value="${esc(S.ui.q)}" oninput="S.ui.q=this.value;renderDiscoverList()"><button class="icon-btn" onclick="toggleSearch()">✕</button></div>` : ""}
  </div>`;
}
function toggleSearch() {
  S.ui.searching = !S.ui.searching;
  if (!S.ui.searching) S.ui.q = "";
  if (route().name !== "discover") { go("#/discover"); return; }
  renderDiscover();
  if (S.ui.searching) $("#q")?.focus();
}

// ---------- ＋ 浮层 ----------
function toggleAdd() { $("#float").innerHTML ? closeAdd() : openAdd(); }
function openAdd() {
  $("#float").innerHTML = `<div class="catcher" onclick="closeAdd()"></div><div class="add-menu">
    <button class="glass-btn" onclick="closeAdd();go('#/new')">🎉 开一个局</button>
    <button class="glass-btn" onclick="closeAdd();openCheckin({})">📍 快速打卡</button>
    <button class="glass-btn" onclick="closeAdd();openAgent()">🤖 AI 局长</button></div>`;
  $("#plusBtn")?.classList.add("open");
}
function closeAdd() { const f = $("#float"); if (f) f.innerHTML = ""; $("#plusBtn")?.classList.remove("open"); }

// ---------- Onboarding（沿用 v0.1） ----------
let onb = null;
function renderOnboarding() {
  if (!onb) {
    const p = S.prefs || {};
    onb = { step: 0, likes: p.likes || ["展览", "市集"], budget: p.budget ?? 100, groupSize: p.groupSize || 2, nick: p.nick || "周末玩家" + Math.floor(Math.random() * 900 + 100), avatar: p.avatar || "🐱" };
  }
  const steps = [
    { big: "🎡", h: "这周末，<em>去哪玩？</em>", p: "选几个你感兴趣的，我们结合天气和预算帮你挑",
      body: TYPES.map((t) => `<button class="chip ${onb.likes.includes(t) ? "on" : ""}" onclick="onbLike('${t}')">${TYPE_EMOJI[t]} ${t}</button>`).join("") },
    { big: "💰", h: "每次出门，<em>人均预算</em>", p: "超预算的地点会往后排，不会直接藏起来",
      body: BUDGETS.map((b) => `<button class="chip ${onb.budget === b.value ? "on" : ""}" onclick="onb.budget=${b.value};renderOnboarding()">${b.label}</button>`).join("") },
    { big: "👯", h: "一般和<em>几个人</em>去？", p: "人多的话，会优先推适合开局的地点",
      body: GROUPS.map((g) => `<button class="chip ${onb.groupSize === g.value ? "on" : ""}" onclick="onb.groupSize=${g.value};renderOnboarding()">${g.label}</button>`).join("") +
        `<div class="onb-label">所在城市</div>` + Object.entries(CITIES).map(([c, v]) => v.open ? `<button class="chip on">${c}</button>` : `<button class="chip" disabled style="opacity:.35">${c} · 即将开放</button>`).join("") +
        `<div class="onb-label">你的昵称 & 头像（开局时显示）</div><input class="input" maxlength="12" value="${esc(onb.nick)}" oninput="onb.nick=this.value">` +
        AVATARS.map((a) => `<button class="chip ${onb.avatar === a ? "on" : ""}" style="font-size:20px;padding:4px 10px" onclick="onb.avatar='${a}';renderOnboarding()">${a}</button>`).join("") },
  ];
  const s = steps[onb.step], last = onb.step === 2;
  $("#view").innerHTML = `<div class="onb">
    <div class="onb-top"><div class="dots">${steps.map((_, i) => `<span class="dot ${i === onb.step ? "on" : ""}"></span>`).join("")}</div>
      <button class="skip" onclick="finishOnb()">跳过</button></div>
    <div class="onb-hero"><div class="big">${s.big}</div><h1>${s.h}</h1><p>${s.p}</p></div>
    <div class="onb-body" ${onb._anim === onb.step ? 'style="animation:none"' : ""}>${s.body}</div>
    <div style="display:flex;gap:10px;margin-top:24px">
      ${onb.step ? `<button class="cta" style="flex:0 0 30%;background:var(--plate);color:var(--ink)" onclick="onb.step--;renderOnboarding()">上一步</button>` : ""}
      <button class="cta ${last ? "neon" : ""}" ${onb.likes.length ? "" : "disabled"} onclick="${last ? "finishOnb()" : "onb.step++;renderOnboarding()"}">${last ? "开始探索 →" : "下一步"}</button>
    </div></div>`;
  onb._anim = onb.step;
}
function onbLike(t) { onb.likes = onb.likes.includes(t) ? onb.likes.filter((x) => x !== t) : [...onb.likes, t]; renderOnboarding(); }
function finishOnb() {
  if (!onb.likes.length) onb.likes = ["展览", "市集"];
  const { likes, budget, groupSize, avatar } = onb;
  const nick = (onb.nick || "").trim() || "周末玩家";
  const prevUid = S.prefs?.uid;
  S.prefs = { likes, budget, groupSize, city: "上海", avatar, nick, uid: prevUid || uid("u"), done: true };
  persist("prefs");
  // 改昵称/头像时同步到自己参与的局
  S.sessions.forEach((s) => s.members.forEach((m) => { if (m.uid === S.prefs.uid) { m.name = nick; m.avatar = avatar; } }));
  persist("sessions");
  if (online() && API.auth) API.updateMe({ name: nick, avatar }).catch(() => {});
  onb = null; S.ui.chip = "为你推荐";
  if (!S.wx) loadWeather();
  const back = sessionStorage_get("wk2_after_onb");
  go(back || "#/discover");
}
function sessionStorage_get(k) { try { const v = sessionStorage.getItem(k); sessionStorage.removeItem(k); return v; } catch { return null; } }

// ---------- 发现：地点 + 公开的局 ----------
const DISCOVER_CHIPS = ["为你推荐", "可加入的局", "攻略", "雨天也能去", "免费", ...TYPES];
function renderDiscover() {
  $("#view").innerHTML = `<div class="page">${header(`📍 上海 · 本周末`)}
    <div class="chips">${DISCOVER_CHIPS.map((c) => `<button class="chip ${S.ui.chip === c ? "on" : ""}" onclick="S.ui.chip='${c}';renderDiscover()">#${c}</button>`).join("")}</div>
    <div id="wx"></div><div id="list"></div>
    <div class="footnote"><div class="mode-slot">${modeLine()}</div>地点照片来自 Wikimedia Commons，署名见 <a href="https://github.com/JamesQiu2005/weekend-city-guide/blob/main/CREDITS.md" target="_blank" rel="noopener">CREDITS.md</a><br>天气来自 Open-Meteo · 局数据保存在本机浏览器</div>
    </div>${tabbar("discover")}`;
  renderWeather(); renderDiscoverList();
  if (online() && (!S.feedAt || Date.now() - S.feedAt > 30000)) loadFeed();
}
async function loadFeed() {
  try { const r = await API.feed({ status: "all" }); S.feed = r.items.map(adaptSummary); S.feedAt = Date.now(); if (route().name === "discover") renderDiscoverList(); }
  catch { S.feedAt = Date.now(); }
}
function renderWeather() {
  const el = $("#wx"); if (!el) return;
  if (!S.wx) { el.innerHTML = `<div class="weather"><div class="wx"><span class="wx-p">正在获取周末天气…</span></div></div>`; return; }
  const days = [["sat", "周六"], ["sun", "周日"]].filter(([k]) => S.wx[k]).sort((a, b) => S.wx[a[0]].date.localeCompare(S.wx[b[0]].date));
  el.innerHTML = `<div class="weather">${days.map(([k, label]) => {
    const d = S.wx[k], [ico, txt] = wxIcon(d.code);
    return `<div class="wx ${d.rain > 50 ? "rain" : ""}"><span class="wx-ico">${ico}</span><div>
      <div class="wx-day">${label} ${d.date.slice(5).replace("-", "/")}</div>
      <div class="wx-t">${d.min}°–${d.max}° ${txt}</div><div class="wx-p">降水 ${d.rain}%${S.wx.mock ? " · 示例" : ""}</div></div></div>`;
  }).join("")}</div>`;
}
function matchQ(text) { const q = S.ui.q.trim(); return !q || text.includes(q); }
function renderDiscoverList() {
  const el = $("#list"); if (!el) return;
  const c = S.ui.chip;
  let places = PLACES.map((p) => ({ p, s: score(p).sc }));
  // 在线：服务端公开局 + 本地种子攻略（本地种子里的「可加入」局只在离线时出现，避免加入一个别人看不到的局）
  let sessions = [...(online() ? S.feed || [] : []), ...allSessions().filter((s) => s.visibility === "public" && !(online() && s.seed && status(s) !== "done"))].filter((s) => !noShow(s));
  const placeText = (p) => [p.name, p.district, p.category, ...p.tags].join(" ");
  const sessText = (s) => [s.title, ...(s.tags || []), ...s.stops.map((x) => PL[x.placeId]?.name || "")].join(" ");
  if (c === "可加入的局") { places = []; sessions = sessions.filter((s) => status(s) === "planning" && s.members.length < s.cap); }
  else if (c === "攻略") { places = []; sessions = sessions.filter((s) => status(s) === "done"); }
  else if (c === "雨天也能去") { places = places.filter((x) => x.p.indoor); sessions = sessions.filter((s) => s.stops.every((st) => PL[st.placeId]?.indoor)); }
  else if (c === "免费") { places = places.filter((x) => x.p.avgCost === 0); sessions = sessions.filter((s) => estTotal(s) === 0); }
  else if (TYPES.includes(c)) { places = places.filter((x) => x.p.category === c); sessions = sessions.filter((s) => s.stops.some((st) => PL[st.placeId]?.category === c)); }
  places = places.filter((x) => matchQ(placeText(x.p))).sort((a, b) => b.s - a.s).map((x) => x.p);
  sessions = sessions.filter((s) => matchQ(sessText(s))).sort((a, b) => {
    const sa = status(a), sb = status(b);
    if (sa !== sb) return sa === "planning" ? -1 : sb === "planning" ? 1 : 0;
    return sa === "planning" ? a.date.localeCompare(b.date) : (b.likes || 0) - (a.likes || 0);
  });
  // 混排：每 2 张地点卡插 1 张局卡
  const items = [];
  let i = 0, j = 0;
  while (i < places.length || j < sessions.length) {
    for (let k = 0; k < 2 && i < places.length; k++) items.push({ kind: "p", v: places[i++] });
    if (j < sessions.length) items.push({ kind: "s", v: sessions[j++] });
  }
  const rainy = S.wx && Math.max(S.wx.sat?.rain ?? 0, S.wx.sun?.rain ?? 0) > 50;
  const title = { 为你推荐: "为你挑的周末", 可加入的局: "正在筹备，可以加入", 攻略: "已完成的局 = 有到场证据的攻略" }[c] || "#" + c;
  el.innerHTML = `<div class="section-title">${title}<small>${places.length} 个地点 · ${sessions.length} 个局${rainy && c === "为你推荐" ? " · 周末有雨" : ""}</small></div>` +
    (items.length ? masonry(items, (x) => (x.kind === "p" ? placeHeight(x.v) : sessionHeight(x.v)), (x) => (x.kind === "p" ? placeCard(x.v) : sessionCard(x.v)))
      : `<div class="empty-state"><div class="e">🫥</div>没有找到，换个标签试试</div>`);
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
  const saved = !!S.saves[id];
  $("#view").innerHTML = `<div class="page" style="position:relative">
    <button class="back" onclick="history.length>1?history.back():go('#/discover')">‹</button>
    <div class="carousel">${p.photos.length ? p.photos.map((_, i) => photoBox(p, i, "slide") + "</div>").join("") : photoBox(p, 0, "slide") + "</div>"}</div>
    ${p.photos.length > 1 ? `<div class="swipe-hint">← 左右滑动 · ${p.photos.length} 张 →</div>` : ""}
    <div class="detail">
      <div class="reasons" style="margin-bottom:10px">${reasons.map((r) => `<span class="reason" style="font-size:12px">${r}</span>`).join("")}</div>
      <h1>${esc(p.name)}</h1>
      <div class="meta">
        <div><b>营业</b>${esc(p.openHours)}</div><div><b>区域</b>${esc(p.district)}</div>
        <div><b>人均</b>${money(p.avgCost)}</div><div><b>场地</b>${p.indoor ? "🏠 室内，不怕下雨" : "🌳 户外，看天气"}</div>
        <div><b>适合</b>${p.suitFor.map((n) => GROUPS.find((g) => g.value === n)?.label).join(" / ")}</div><div><b>来过</b>👣 ${fmt(p.checkinCount)} 人打卡</div>
      </div>
      <div class="desc">${esc(p.blurb)}</div>
      <div class="tagline">${p.tags.map((t) => `<span>#${esc(t)}</span>`).join("")}</div>
    </div>
    <div class="section-title">在这里的局<small>${planning.length} 个筹备中 · ${done.length} 篇攻略</small></div>
    ${planning.length ? planning.map(sessionRow).join("") : `<div class="empty-state" style="padding:16px">还没人在这开局，做第一个 🙋</div>`}
    ${done.length ? masonry(done, sessionHeight, sessionCard) : ""}
    </div>
    <div class="action-bar">
      <button class="ab-icon ${saved ? "on" : ""}" onclick="toggleSave('${id}',this,'加入想去')"><span>${saved ? "★" : "☆"}</span><small>想去</small></button>
      <button class="ab-icon" onclick="openCheckin({placeId:'${id}'})"><span>📍</span><small>打卡</small></button>
      <button class="ab-icon" onclick="addToExisting('${id}')"><span>＋</span><small>加入已有局</small></button>
      <button class="cta neon" onclick="go('#/new?place=${id}')">在这开局</button>
    </div>`;
}
async function addToExisting(pid) {
  let mine = S.sessions.filter((s) => isOrganizer(s) && status(s) === "planning");
  if (online() && API.auth) { try { const r = await API.mySessions("planning"); mine = [...r.items.filter((x) => x.role === "organizer").map(adaptSummary), ...mine]; } catch {} }
  if (!mine.length) { toast("你还没有筹备中的局，先开一个吧"); return; }
  openSheet(`<h2>加入已有局</h2><div class="sub">把「${esc(shortName(PL[pid]))}」追加为最后一站</div>
    ${mine.map((s) => `<div class="pick-row" onclick="appendStop('${s.id}','${pid}')">${collage(s, 56)}<div style="flex:1;min-width:0"><b>${esc(s.title)}</b><div class="squad-sub">${dateLabel(s.date)} · ${s.stops.length} 站</div></div><span>＋</span></div>`).join("")}`);
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
let D = null; // 编辑中的草稿
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
  $("#view").innerHTML = `<div class="page editor">
    <div class="ed-head"><button class="icon-btn" style="color:var(--ink)" onclick="D=null;history.length>1?history.back():go('#/discover')">✕</button>
      <b>${editing ? "编辑局" : "开一个局"}</b><span style="width:40px"></span></div>
    <div class="ed-cover" style="background:${PL[D.stops[0]?.placeId]?.bg || "var(--plate)"}">
      ${D.cover || covers[0] ? img(D.cover || covers[0], 'class="ph"') : `<span class="emo">🎉</span>`}
      <input class="ed-title" placeholder="给这个局起个名字" value="${esc(D.titleTouched ? D.title : autoTitle())}" oninput="D.title=this.value;D.titleTouched=true">
    </div>
    ${covers.length > 1 ? `<div class="cover-pick">${covers.map((c) => `<button class="${(D.cover || covers[0]) === c ? "on" : ""}" onclick="D.cover='${c}';renderEditor()">${img(c)}</button>`).join("")}</div>` : ""}

    <div class="ed-sec"><label>📅 哪天</label>
      <div class="row"><input class="input" type="date" value="${D.date}" min="${today()}" onchange="D.date=this.value;renderStops();$('#dateHint').textContent=dateHint()"></div>
      <div class="hint" id="dateHint">${dateHint()}</div></div>

    <div class="ed-sec"><label>📍 路线 <small>拖动 ≡ 调整顺序</small></label>
      <div id="stops"></div>
      <button class="add-stop" onclick="openPlacePicker()">＋ 添加地点</button></div>

    <div class="ed-sec"><label>💰 预算</label>
      <div class="row" style="gap:10px">
        <div style="flex:1"><div class="mini">总预算 ¥</div><input class="input" type="number" min="0" value="${D.budget.total}" oninput="D.budget.total=+this.value||0;D._budgetTouched=true;renderBudget()"></div>
        <div style="flex:1"><div class="mini">人数上限</div><div class="stepper"><button onclick="D.cap=Math.max(1,D.cap-1);renderEditorParts()">−</button><b id="capN">${D.cap}</b><button onclick="D.cap=Math.min(12,D.cap+1);renderEditorParts()">＋</button></div></div>
      </div>
      <div class="seg" style="margin:10px 0 0">${[["AA", "AA 制"], ["treat", "我请客 🎉"]].map(([k, l]) => `<button class="${D.budget.mode === k ? "on" : ""}" onclick="D.budget.mode='${k}';renderEditor()">${l}</button>`).join("")}</div>
      <div id="budget"></div></div>

    <div class="ed-sec"><label>👥 成员</label><div id="seats"></div></div>

    <div class="ed-sec"><label>👀 谁能看到</label>
      <div class="seg" style="margin:0">${Object.entries(VIS).map(([k, [i, l]]) => `<button class="${D.visibility === k ? "on" : ""}" onclick="D.visibility='${k}';renderEditor()">${i} ${l}</button>`).join("")}</div>
      <div class="hint">${VIS[D.visibility][2]}</div></div>
    </div>
    <div class="action-bar"><button class="cta neon" onclick="submitDraft()">${editing ? "保存修改" : "开局 🎉"}</button></div>`;
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
      <span class="drag" onpointerdown="dragStart(event,${i})">≡</span>
      <div class="stop-thumb">${photoBox(p, 0, "thumb")}</div></div>
      <div class="stop-main">
        <div class="stop-name"><span class="num">${i + 1}</span>${esc(shortName(p))}<span class="io">${p.indoor ? "室内" : "户外"}</span></div>
        <div class="stop-fields">
          <input class="input sm" type="time" value="${st.time}" onchange="D.stops[${i}].time=this.value;renderStops()">
          <span class="yen">¥<input class="input sm" type="number" min="0" value="${st.estCost}" oninput="D.stops[${i}].estCost=+this.value||0;renderBudget()"></span>
          ${wxChip(p, D.date, st.time)}
        </div>
        <input class="input sm note" placeholder="备注（可选）" value="${esc(st.note)}" oninput="D.stops[${i}].note=this.value">
        ${rainy && bk ? `<button class="swap" onclick="swapStop(${i},'${bk.id}')">☔ 降水概率高，换成室内备选「${esc(shortName(bk))}」？</button>` : ""}
      </div>
      <button class="rm" onclick="D.stops.splice(${i},1);renderEditorParts()">×</button>
    </div>`;
  }).join("") + routeMap(D.stops, -1, D.date) : `<div class="empty-state" style="padding:14px">还没有地点，点下面添加</div>`;
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
  return `<div class="budget-nums"><span>人均 <b>¥${cap ? Math.round(total / cap) : total}</b>${mode === "treat" ? " · 组织者请客" : ""}</span><span>预估 <b class="${over ? "red" : ""}">¥${est}</b> / ¥${total}</span>${actual != null ? `<span>实际 <b>¥${actual}</b></span>` : ""}</div>
    <div class="bar"><i style="width:${over ? (total / est) * 100 : pct}%"></i>${over ? `<i class="over" style="width:${100 - (total / est) * 100}%"></i>` : ""}</div>
    ${over ? `<div class="hint red">超出预算 ¥${est - total}，可以删掉一站或者调高预算</div>` : `<div class="hint">预估 = 各站花费 × ${cap} 人</div>`}`;
}
function renderSeats() {
  const el = $("#seats"); if (!el) return;
  const ms = D.members || [{ ...meRef(), role: "organizer" }];
  el.innerHTML = `<div class="seats">${ms.map((m) => `<span class="seat" title="${esc(m.name)}">${m.avatar || esc([...m.name][0])}</span>`).join("")}${Array.from({ length: Math.max(0, D.cap - ms.length) }, () => `<span class="seat empty">+</span>`).join("")}<span class="mini">${ms.length}/${D.cap} · 开局后发链接邀请</span></div>`;
}
// 指针拖拽排序（触屏 / 鼠标通用）
function dragStart(ev, i) {
  ev.preventDefault();
  const row = ev.target.closest(".stop-row"), rows = [...document.querySelectorAll(".stop-row")];
  const y0 = ev.clientY, mids = rows.map((r) => { const b = r.getBoundingClientRect(); return b.top + b.height / 2; });
  let to = i;
  row.classList.add("dragging");
  const move = (e) => {
    const dy = e.clientY - y0;
    row.style.transform = `translateY(${dy}px)`;
    const y = mids[i] + dy;
    to = mids.filter((m, k) => k !== i && m < y).length;
  };
  const up = () => {
    window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
    const [s] = D.stops.splice(i, 1); D.stops.splice(to, 0, s);
    renderStops();
  };
  window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
}
function openPlacePicker() {
  const saved = PLACES.filter((p) => S.saves[p.id]), rest = PLACES.filter((p) => !S.saves[p.id]).sort((a, b) => score(b).sc - score(a).sc);
  const row = (p) => `<div class="pick-row" data-t="${esc(p.name + p.district + p.category)}" onclick="pickPlace('${p.id}')"><div class="stop-thumb">${photoBox(p, 0, "thumb")}</div></div>
    <div style="flex:1;min-width:0"><b>${esc(p.name)}</b><div class="squad-sub">${esc(p.district)} · ${money(p.avgCost)} · ${p.indoor ? "室内" : "户外"}</div></div><span>${D.stops.some((s) => s.placeId === p.id) ? "✓" : "＋"}</span></div>`;
  openSheet(`<h2>添加地点</h2><input class="input" placeholder="搜索地点" oninput="document.querySelectorAll('.sheet .pick-row').forEach(r=>r.style.display=r.dataset.t.includes(this.value)?'':'none')">
    ${saved.length ? `<div class="mini" style="margin:12px 0 4px">★ 想去</div>${saved.map(row).join("")}` : ""}
    <div class="mini" style="margin:12px 0 4px">为你推荐</div>${rest.map(row).join("")}`);
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
    catch (e) { apiErr(e); if (btn) { btn.disabled = false; btn.textContent = editing ? "保存修改" : "开局 🎉"; } return; }
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

// ---------- 线路图（SVG，零依赖） ----------
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
  const segs = pt.slice(1).map((b, i) => { const a = pt[i], d = km(ps[i], ps[i + 1]); return `<text x="${(a[0] + b[0]) / 2}" y="${(a[1] + b[1]) / 2 - 7}" class="rm-km">${d < 1 ? Math.round(d * 1000) + "m" : d.toFixed(1) + "km"}</text>`; }).join("");
  return `<svg class="routemap" viewBox="0 0 ${W} ${H}" role="img" aria-label="路线示意图">
    <polyline points="${pt.map((p) => p.join(",")).join(" ")}" fill="none" stroke="#000" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>
    ${segs}
    ${pt.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="11" fill="${i === cur ? "#92FF00" : "#fff"}" stroke="#000" stroke-width="3"/>
      <text x="${x}" y="${y + 4}" class="rm-n">${i + 1}</text>
      <text x="${x}" y="${y + (y > H / 2 ? -17 : 26)}" class="rm-l">${esc(shortName(ps[i]).slice(0, 8))}${!ps[i].indoor && rainyStop(ps[i], date, stops[i].time) ? " ☔" : ""}</text>`).join("")}
  </svg>`;
}

// ---------- 局详情 = 帖子 ----------
let POLL = null;
function renderSession(id, _q, snap) {
  if (!snap && !localSession(id)) {
    const key = location.hash;
    if (S.visit !== key) {
      S.visit = key;
      if (!REMOTE.get(id)) $("#view").innerHTML = `<div class="empty-state"><div class="e">⏳</div>正在打开这个局…</div>`;
      loadRemote(id).then(() => { if (location.hash === key) renderSession(id); });
      if (!REMOTE.get(id)) return;
    }
    if (!REMOTE.get(id) && !online()) { $("#view").innerHTML = `<div class="empty-state"><div class="e">📡</div>这个局保存在服务器上<br>当前连不上服务器（离线演示模式）<br><br><button class="btn-sm" onclick="go('#/discover')">去发现</button></div>`; return; }
    const rs = REMOTE.get(id);
    if (rs && !rs.missing && rs.status === "live") { clearTimeout(POLL); POLL = setTimeout(() => { if (location.hash === key) loadRemote(id).then(() => location.hash === key && renderSession(id)); }, 15000); }
  }
  const local = getSession(id);
  const s = snap ? mergeSnapshot(local, snap) : local;
  if (!s || (s.visibility === "private" && !isMember(s))) {
    $("#view").innerHTML = `<div class="empty-state"><div class="e">🔒</div>这个局只有创建者能看到<br>（多人同步要等接入后端）<br><br><button class="btn-sm" onclick="go('#/discover')">去发现</button></div>`; return;
  }
  const st = status(s), member = isMember(s), org = isOrganizer(s), cur = st === "live" ? currentStop(s) : -1;
  const ci = checkins(s), [vi, vl] = VIS[s.visibility];
  const cover = sessionPhotos(s)[0], p0 = PL[s.stops[0]?.placeId];
  const full = s.members.length >= s.cap;
  const feed = [...s.entries].sort((a, b) => b.createdAt - a.createdAt);
  $("#view").innerHTML = `<div class="page" style="position:relative">
    <button class="back" onclick="history.length>1?history.back():go('#/sessions')">‹</button>
    <div class="invite" style="background:${p0?.bg || "#222"}">
      ${cover ? img(cover, 'class="ph"') : ""}<div class="invite-shade"></div>
      <div class="invite-body">
        <div class="badges"><span class="vis" ${org ? `onclick="openVisibility('${s.id}')"` : ""}>${vi} ${vl}${org ? " ✎" : ""}</span><span class="status ${st}">${STATUS_LABEL[st]}${noShow(s) ? " · 未成局" : ""}</span></div>
        <h1>${esc(s.title)}</h1>
        <div class="invite-meta">${dateLabel(s.date)}${s.startTime ? " · " + s.startTime + " 开始" : ""} · ${s.stops.length} 站</div>
        <div class="invite-who">${avatars(s.members, 5)}<span>由 <b>${esc(s.organizer)}</b> 发起 · ${s.members.length}/${s.cap} 人</span></div>
      </div>
    </div>
    ${snap && !member ? `<div class="snap-note">这是 ${esc(s.organizer)} 分享的局快照 · 加入后保存到你的「我的局」</div>` : ""}

    <div class="section-title">路线<small>${ci.length ? `${new Set(ci.map((e) => e.author)).size} 人打过卡` : st === "planning" ? "当天开放打卡" : ""}</small></div>
    <div class="route">
      ${s.stops.map((x, i) => {
        const p = PL[x.placeId], here = ci.filter((e) => e.stopIndex === i), all = s.members.length > 0 && s.members.every((m) => here.some((e) => e.uid ? e.uid === m.uid : e.author === m.name));
        return `<div class="route-stop ${i === cur ? "cur" : ""}" onclick="go('#/place/${p.id}')">
          <div class="rs-dot">${i + 1}</div>
          <div class="stop-thumb">${photoBox(p, 0, "thumb")}</div></div>
          <div class="stop-main"><div class="stop-name">${esc(shortName(p))}${all && here.length ? `<span class="allin">到齐</span>` : ""}</div>
            <div class="stop-fields"><span class="mini">${x.time || "—"} · 预估 ${money(+x.estCost || 0)}</span>${wxChip(p, s.date, x.time)}</div>
            ${x.note ? `<div class="mini">📝 ${esc(x.note)}</div>` : ""}
            ${x.swappedFrom ? `<div class="mini">☔ 由「${esc(shortName(PL[x.swappedFrom]))}」换来的室内备选</div>` : ""}
            ${here.length ? `<div class="here">${avatars(here.map((e) => ({ avatar: e.avatar })), 6)}<span class="mini">${here.filter((e) => e.verified).length}/${here.length} 到场认证</span></div>` : ""}
          </div></div>`;
      }).join("")}
      ${routeMap(s.stops, cur, s.date)}
    </div>

    <div class="section-title">预算</div>
    <div class="budget-card">${budgetBar(s.budget.total, estTotal(s), actualTotal(s), s.cap, s.budget.mode)}</div>

    <div class="section-title">动态<small>${s.entries.length} 条</small></div>
    ${member ? `<div class="composer"><input class="input" id="noteIn" maxlength="120" placeholder="说点什么…" onkeydown="if(event.key==='Enter')postNote('${s.id}')"><button class="btn-sm" onclick="postNote('${s.id}')">发送</button></div>` : ""}
    <div class="feed">${feed.map((e) => entryHtml(e, s)).join("") || `<div class="empty-state" style="padding:16px">还没有动态</div>`}</div>
    ${status(s) === "planning" && org ? `<div class="footnote"><button class="linkish" onclick="demoToday('${s.id}')">演示用：把日期改成今天，立刻进入「进行中」</button></div>` : ""}
    <div class="footnote">${s.remote ? `<div class="mode-slot">${modeLine()}</div>${st === "live" ? "进行中的局每 15 秒自动刷新" : "刷新页面可以看到最新动态"}` : "这个局保存在本机浏览器，通过链接快照分享"}</div>
    </div>
    <div class="action-bar">${sessionActions(s, st, member, org, full, snap)}</div>`;
}
function sessionActions(s, st, member, org, full, snap) {
  const liked = !!S.likes[s.id], saved = !!S.saves[s.id];
  const share = s.visibility !== "private" ? `<button class="ab-icon" onclick="shareSession('${s.id}')"><span>↗</span><small>分享</small></button>` : `<button class="ab-icon" onclick="openVisibility('${s.id}')"><span>🔒</span><small>私密</small></button>`;
  if (!member) {
    if (st === "done") return `<button class="like ab-icon ${liked ? "on" : ""}" onclick="toggleLike('${s.id}',this)"><span class="h">${liked ? "❤️" : "♡"}</span><small class="n">${fmt((s.likes || 0) + (liked ? 1 : 0))}</small></button>
      <button class="ab-icon ${saved ? "on" : ""}" onclick="toggleSave('${s.id}',this)"><span>${saved ? "★" : "☆"}</span><small>收藏</small></button>
      <button class="ab-icon" onclick="copy(location.href)"><span>↗</span><small>分享</small></button>
      <button class="cta neon" onclick="copyAsNew('${s.id}')">照着这条路线开局</button>`;
    return `${s.visibility !== "private" ? `<button class="ab-icon" onclick="copy(location.href)"><span>↗</span><small>分享</small></button>` : ""}
      <button class="cta neon" ${full ? "disabled" : ""} onclick="joinSession('${s.id}')">${full ? "已满员" : `加入这个局（${s.members.length}/${s.cap}）`}</button>`;
  }
  if (st === "planning") return `${share}${org ? `<button class="ab-icon" onclick="go('#/edit/${s.id}')"><span>✎</span><small>编辑</small></button>` : ""}
      <button class="cta" onclick="shareSession('${s.id}')">邀请朋友</button>`;
  if (st === "live") return `<button class="ab-icon" onclick="openPhotos('${s.id}')"><span>📷</span><small>传照片</small></button>
      <button class="ab-icon" onclick="openSpend('${s.id}')"><span>¥</span><small>记一笔</small></button>
      ${org ? `<button class="ab-icon" onclick="closeSession('${s.id}')"><span>🏁</span><small>收局</small></button>` : ""}
      <button class="cta neon" onclick="openCheckin({sessionId:'${s.id}'})">📍 打卡这一站</button>`;
  return `<button class="like ab-icon ${liked ? "on" : ""}" onclick="toggleLike('${s.id}',this)"><span class="h">${liked ? "❤️" : "♡"}</span><small class="n">${fmt((s.likes || 0) + (liked ? 1 : 0))}</small></button>
      ${share}<button class="ab-icon" onclick="openPhotos('${s.id}')"><span>📷</span><small>补照片</small></button>
      ${org ? (s.visibility === "public" ? `<button class="cta" onclick="openVisibility('${s.id}')">🌐 已公开 · 改可见性</button>` : `<button class="cta neon" onclick="setVisibility('${s.id}','public')">设为公开，变成攻略</button>`)
        : `<button class="cta neon" onclick="openCheckin({sessionId:'${s.id}'})">📍 补打卡</button>`}`;
}
function entryHtml(e, s) {
  const p = e.stopIndex != null ? PL[s.stops[e.stopIndex]?.placeId] : null;
  const when = new Date(e.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  if (e.type === "system") return `<div class="entry sys">${esc(e.text)} · ${when}</div>`;
  const head = `<div class="e-head"><span class="avatar">${e.avatar || "🙂"}</span><b>${esc(e.author)}</b>
    <span class="mini">${{ checkin: `打卡了第 ${(e.stopIndex ?? 0) + 1} 站${p ? " · " + esc(shortName(p)) : ""}`, photo: "传了照片", spend: `记了一笔${p ? " · " + esc(shortName(p)) : ""}`, note: "说" }[e.type]}</span><span class="mini" style="margin-left:auto">${when}</span></div>`;
  let body = "";
  if (e.type === "checkin") body = `${e.amount ? `<span class="mini">花了 ¥${e.amount}</span>` : ""}<div class="e-badges">${e.verified ? `<span class="verified">📍 到场认证</span>` : `<span class="unverified" title="${esc(e.verifyNote || "")}">未认证${e.verifyNote ? "：" + esc(e.verifyNote) : ""}</span>`}${e.rating ? `<span>${"⭐".repeat(e.rating)}</span>` : ""}</div>${e.text ? `<div class="e-text">${esc(e.text)}</div>` : ""}`;
  if (e.type === "spend") body = `<div class="e-amt">¥${e.amount}</div>${e.text ? `<div class="e-text">${esc(e.text)}</div>` : ""}`;
  if (e.type === "note" || (e.type === "photo" && e.text)) body = `<div class="e-text">${esc(e.text)}</div>`;
  return `<div class="entry">${head}${body}${e.photo ? `<div class="e-photo">${img(e.photo)}</div>` : ""}</div>`;
}
async function postNote(sid) {
  const v = ($("#noteIn")?.value || "").trim(); if (!v) return;
  if (getSession(sid).remote) { if (await remoteWrite(sid, () => API.addEntry(sid, { type: "note", text: v }))) render(); return; }
  const s = getSession(sid), me = meRef();
  s.entries.push({ id: uid("e"), sessionId: sid, type: "note", author: me.name, avatar: me.avatar, uid: me.uid, text: v, createdAt: Date.now() });
  saveSession(s); render();
}
async function demoToday(sid) {
  if (getSession(sid).remote) { if (await remoteWrite(sid, () => API.updateSession(sid, { date: today(), changeNote: "（演示）日期改成了今天" }))) render(); return; }
  const s = getSession(sid); s.date = today(); s.entries.push(sysEntry(sid, "（演示）日期改成了今天")); saveSession(s); render(); }
async function closeSession(sid) {
  if (getSession(sid).remote) { if (await remoteWrite(sid, () => API.updateSession(sid, { closed: true }))) { toast("收局！可以设为公开，变成一篇攻略"); render(); } return; }
  const s = getSession(sid);
  s.closed = true; s.entries.push(sysEntry(sid, `${S.prefs.nick} 收局了 🏁`)); saveSession(s);
  toast(checkins(s).length ? "收局！可以设为公开，变成一篇攻略" : "收局了，这次没有人打卡");
  render();
}
function openVisibility(sid) {
  const s = getSession(sid);
  openSheet(`<h2>谁能看到这个局</h2>${Object.entries(VIS).map(([k, [i, l, d]]) => `<div class="pick-row ${s.visibility === k ? "on" : ""}" onclick="setVisibility('${sid}','${k}')"><span style="font-size:24px">${i}</span><div style="flex:1"><b>${l}</b><div class="squad-sub">${d}</div></div>${s.visibility === k ? "✓" : ""}</div>`).join("")}`);
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

// ---------- 分享与加入（链接快照） ----------
function snapshot(s) {
  const { seed, ...rest } = s;
  return { ...rest, entries: s.entries.slice(-25).map((e) => (e.photo && e.photo.startsWith("data:") ? { ...e, photo: null } : e)) };
}
const shareLink = (s) => (s.remote ? API.shareLink(s.id) : location.origin + location.pathname + "#/s/" + b64e(snapshot(s)));
function shareSession(sid, justCreated) {
  const s = getSession(sid);
  if (s.visibility === "private") { toast("私密局不能分享，先改成「好友」或「公开」"); openVisibility(sid); return; }
  const link = shareLink(s);
  openSheet(`${justCreated ? `<div style="text-align:center;font-size:52px">🎉</div><h2 style="text-align:center">局开好了</h2>` : `<h2>邀请朋友</h2>`}
    <div class="sub" ${justCreated ? 'style="text-align:center"' : ""}>${esc(s.title)} · ${dateLabel(s.date)} · ${s.stops.length} 站</div>
    <div class="share-box"><input class="input" id="shareLink" readonly value="${esc(link)}"><button class="btn-sm neon" onclick="copy($('#shareLink').value,'#shareLink')">复制</button></div>
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
  if (!SNAP || !SNAP.stops) { $("#view").innerHTML = `<div class="empty-state"><div class="e">🔗</div>链接好像坏了<br><br><button class="btn-sm" onclick="go('#/discover')">去首页</button></div>`; return; }
  const local = getSession(SNAP.id);
  if (local && isMember(local)) { saveSession(mergeSnapshot(local, SNAP)); location.replace(`#/session/${SNAP.id}`); return; }
  renderSession(SNAP.id, null, SNAP);
}
async function joinSession(sid) {
  const base = mergeSnapshot(getSession(sid), SNAP && SNAP.id === sid ? SNAP : null) || getSession(sid);
  if (!S.prefs?.done) {
    const n = prompt("先起个昵称，队友怎么称呼你？", "周末玩家" + Math.floor(Math.random() * 900 + 100));
    if (!n) return;
    S.prefs = { likes: ["展览", "市集"], budget: 100, groupSize: 2, city: "上海", avatar: "🐱", uid: uid("u"), ...(S.prefs || {}), nick: n.trim().slice(0, 12), done: false };
    persist("prefs");
  }
  if (base?.remote) {
    if (!(await remoteWrite(sid, () => API.join(sid)))) return;
    toast("🎉 加入成功！"); S.mineAt = 0;
    if (!S.prefs.done) { try { sessionStorage.setItem("wk2_after_onb", `#/session/${sid}`); } catch {} go("#/onboarding"); return; }
    render(); return;
  }
  const s = JSON.parse(JSON.stringify(base));
  if (s.members.length >= s.cap) { toast("已满员"); return; }
  s.members.push({ ...meRef(), role: "member", joinedAt: Date.now() });
  s.entries.push(sysEntry(s.id, `${S.prefs.nick} 加入了`));
  delete s.seed;
  saveSession(s);
  toast("🎉 加入成功！");
  if (!S.prefs.done) { try { sessionStorage.setItem("wk2_after_onb", `#/session/${s.id}`); } catch {} go("#/onboarding"); return; }
  if (route().name === "session") render(); else go(`#/session/${s.id}`);
}

// ---------- 底部弹层 ----------
let F = {};
function openSheet(html) {
  closeSheet();
  $("#layer").insertAdjacentHTML("beforeend", `<div class="sheet-mask" onclick="closeSheet()"></div><div class="sheet"><div class="grabber"></div>${html}</div>`);
}
function closeSheet() { $("#layer")?.querySelectorAll(".sheet-mask,.sheet").forEach((e) => e.remove()); }
async function addPhotos(input, max, sel) {
  const files = [...input.files].slice(0, max - F.images.length);
  // 在线：长边 1280 上传服务器；离线：长边 720 存 localStorage
  for (const f of files) { try { F.images.push(await compress(f, online() ? 1280 : 720, online() ? 0.8 : 0.72)); } catch { toast("图片读取失败"); } }
  input.value = ""; renderUpload(max, sel);
}
function renderUpload(max, sel) {
  $(sel).innerHTML = F.images.map((src, i) => `<img class="thumb" src="${src}" onclick="F.images.splice(${i},1);renderUpload(${max},'${sel}')" title="点击删除">`).join("") +
    (F.images.length < max ? `<label>＋<input type="file" accept="image/*" ${max > 1 ? "multiple" : ""} hidden onchange="addPhotos(this,${max},'${sel}')"></label>` : "");
}

// ---------- 打卡（到场认证 + 记账 + 到齐合章） ----------
function openCheckin({ sessionId, placeId }) {
  const s = sessionId ? getSession(sessionId) : null;
  const si = s ? currentStop(s) : 0;
  const pid = s ? s.stops[si].placeId : placeId || PLACES[0].id;
  F = { sessionId, placeId: pid, stopIndex: si, images: [], text: "", rating: 5, spend: s ? +s.stops[si].estCost || 0 : PL[pid].avgCost };
  const stopSel = s && s.stops.length > 1
    ? `<div class="field"><label>第几站</label><div class="chips">${s.stops.map((x, i) => `<button class="chip ${i === si ? "on" : ""}" onclick="pickStop(this,${i})">${i + 1}. ${esc(shortName(PL[x.placeId]))}</button>`).join("")}</div></div>`
    : s ? "" : `<div class="field"><label>在哪</label><select class="input" onchange="F.placeId=this.value;$('#spendIn').value=F.spend=PL[this.value].avgCost">${PLACES.map((p) => `<option value="${p.id}" ${p.id === pid ? "selected" : ""}>${p.emoji} ${esc(p.name)}</option>`).join("")}</select></div>`;
  openSheet(`<h2>📍 打卡</h2><div class="sub">${s ? esc(s.title) : "快速打卡会自动创建一个单人私密局，之后可以改成公开"}</div>
    ${stopSel}
    <div class="field"><label>照片</label><div class="upload" id="ciUp"></div></div>
    <div class="field"><label>一句话</label><input class="input" maxlength="60" placeholder="今天的风很舒服…" oninput="F.text=this.value"></div>
    <div class="field"><label>评分</label><div class="stars" id="stars"></div></div>
    <div class="field"><label>这一站花了多少 ¥</label><input class="input" id="spendIn" type="number" min="0" value="${F.spend}" oninput="F.spend=+this.value||0"></div>
    <div class="hint">📍 提交时会请求一次定位：距离该地点 500m 内即为「到场认证」${online() ? "（由服务器判定）" : ""}。拒绝授权也能打卡，只是不带徽章。</div>
    <button class="cta neon" id="ciBtn" style="margin-top:16px" onclick="submitCheckin()">盖章打卡 ✓</button>`);
  renderUpload(1, "#ciUp"); renderStars();
}
function pickStop(el, i) {
  const s = getSession(F.sessionId);
  F.stopIndex = i; F.placeId = s.stops[i].placeId; F.spend = +s.stops[i].estCost || 0;
  $("#spendIn").value = F.spend;
  el.parentElement.querySelectorAll(".chip").forEach((c) => c.classList.remove("on")); el.classList.add("on");
}
function renderStars() { $("#stars").innerHTML = [1, 2, 3, 4, 5].map((n) => `<button class="${n <= F.rating ? "on" : ""}" onclick="F.rating=${n};renderStars()">⭐</button>`).join(""); }
function locate(p) {
  return new Promise((res) => {
    if (!navigator.geolocation) return res({ verified: false, note: "浏览器不支持定位" });
    navigator.geolocation.getCurrentPosition(
      (pos) => { const d = km({ lat: pos.coords.latitude, lon: pos.coords.longitude }, p); res(d <= 0.5 ? { verified: true, note: `距离 ${Math.round(d * 1000)}m` } : { verified: false, note: `距离该地点 ${d < 10 ? d.toFixed(1) : Math.round(d)}km，超出 500m` }); },
      (err) => res({ verified: false, note: { 1: "你拒绝了定位授权", 2: "暂时拿不到位置", 3: "定位超时" }[err.code] || "定位失败" }),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 });
  });
}
async function submitCheckin() {
  const btn = $("#ciBtn"); btn.disabled = true; btn.textContent = "📡 正在确认你在不在现场…";
  const p = PL[F.placeId], me = meRef();
  const target = F.sessionId ? getSession(F.sessionId) : null;
  if (online() && (!target || target.remote)) return submitCheckinRemote(target, p, btn);
  const loc = await locate(p);
  let s = F.sessionId ? getSession(F.sessionId) : null;
  if (!s) {
    // 快速打卡 = 单人私密局
    s = { id: uid("s"), title: `打卡 · ${shortName(p)}`, cover: null, organizer: me.name, visibility: "private", date: today(), startTime: "",
      stops: [{ placeId: p.id, time: "", estCost: F.spend, note: "" }], budget: { total: F.spend, perPerson: F.spend, mode: "AA" },
      members: [{ ...me, role: "organizer", joinedAt: Date.now() }], cap: 1, closed: true, likes: 0, tags: [p.category], createdAt: Date.now(), entries: [] };
  } else s = JSON.parse(JSON.stringify(s));
  if (!isMember(s)) s.members.push({ ...me, role: "member", joinedAt: Date.now() });
  const t = Date.now();
  s.entries.push({ id: uid("e"), sessionId: s.id, type: "checkin", stopIndex: F.stopIndex, author: me.name, avatar: me.avatar, uid: me.uid, photo: F.images[0] || null, text: F.text.trim(), rating: F.rating, verified: loc.verified, verifyNote: loc.note, createdAt: t });
  if (F.spend > 0) s.entries.push({ id: uid("e"), sessionId: s.id, type: "spend", stopIndex: F.stopIndex, author: me.name, avatar: me.avatar, uid: me.uid, amount: F.spend, text: "", createdAt: t + 1 });
  // 全员到齐？
  const here = s.entries.filter((e) => e.type === "checkin" && e.stopIndex === F.stopIndex);
  const allIn = s.members.length > 1 && s.members.every((m) => here.some((e) => (e.uid ? e.uid === m.uid : e.author === m.name)));
  const firstAllIn = allIn && !s.entries.some((e) => e.type === "system" && e.allIn === F.stopIndex);
  if (firstAllIn) s.entries.push({ ...sysEntry(s.id, `第 ${F.stopIndex + 1} 站「${shortName(p)}」全员到齐 🎉`), allIn: F.stopIndex, createdAt: t + 2 });
  delete s.seed;
  saveSession(s); closeSheet();
  stamp(loc, p, firstAllIn ? s.members : null, () => go(`#/session/${s.id}`));
  if (!loc.verified) setTimeout(() => toast(`已打卡（未认证：${loc.note}）`), 200);
}
async function submitCheckinRemote(target, p, btn) {
  const coords = await API.locate();
  let photo;
  try { if (F.images[0]) { btn.textContent = "⬆️ 上传照片…"; photo = await uploadDataURL(F.images[0]); } } catch (e) { apiErr(e); btn.disabled = false; btn.textContent = "盖章打卡 ✓"; return; }
  const body = { ...(F.text.trim() ? { text: F.text.trim() } : {}), rating: F.rating, ...(photo ? { photo } : {}), ...(F.spend > 0 ? { amount: F.spend } : {}), ...(coords ? { coords } : {}) };
  const wasAll = target?.stops[F.stopIndex]?.allArrived;
  let r;
  try {
    await ensureMe();
    r = target ? await API.addEntry(target.id, { type: "checkin", stopIdx: F.stopIndex, ...body }) : await API.quickCheckin({ placeId: p.id, ...body });
  } catch (e) { apiErr(e); btn.disabled = false; btn.textContent = "盖章打卡 ✓"; return; }
  const s = adapt(r.session); REMOTE.set(s.id, s); S.mineAt = 0; S.trailAt = 0;
  const e = s.entries.find((x) => x.id === r.entry.id) || {};
  const loc = { verified: !!r.entry.verified, note: e.verifyNote || (coords ? "" : "未开启定位") };
  const allNow = s.members.length > 1 && s.stops[F.stopIndex]?.allArrived && !wasAll;
  closeSheet();
  stamp(loc, p, allNow ? s.members : null, () => go(`#/session/${s.id}`));
  if (!loc.verified) setTimeout(() => toast(`已打卡（未认证：${loc.note}）`), 200);
}
function stamp(loc, p, allMembers, done) {
  $("#layer").insertAdjacentHTML("beforeend", `<div class="stamp-wrap" id="stamp"><div class="stamp ${loc.verified ? "" : "plain"}"><div>${loc.verified ? "📍 到场认证" : "已打卡 ✓"}<small>${esc(shortName(p))} · ${new Date().toLocaleDateString("zh-CN")}</small></div></div></div>`);
  setTimeout(() => {
    $("#stamp")?.remove();
    if (!allMembers) { done(); if (route().name === "session") render(); return; }
    $("#layer").insertAdjacentHTML("beforeend", `<div class="stamp-wrap" id="stamp"><div class="stamp allin-stamp"><div>全员到齐<small>${allMembers.map((m) => m.avatar).join("")}</small></div></div></div>`);
    setTimeout(() => { $("#stamp")?.remove(); done(); if (route().name === "session") render(); }, 1600);
  }, 1300);
}
function openPhotos(sid) {
  F = { sessionId: sid, images: [], text: "" };
  openSheet(`<h2>📷 传照片</h2><div class="sub">照片会出现在这个局的动态里（最多 4 张）</div>
    <div class="field"><div class="upload" id="phUp"></div></div>
    <div class="field"><input class="input" maxlength="60" placeholder="配一句话（可选）" oninput="F.text=this.value"></div>
    <button class="cta neon" style="margin-top:16px" onclick="submitPhotos()">发布</button>`);
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
  openSheet(`<h2>¥ 记一笔</h2><div class="sub">实际花费会累加到预算卡里</div>
    <div class="field"><label>金额 ¥</label><input class="input" type="number" min="0" placeholder="0" oninput="F.amount=+this.value||0"></div>
    <div class="field"><label>哪一站</label><div class="chips">${s.stops.map((x, i) => `<button class="chip ${i === F.stopIndex ? "on" : ""}" onclick="F.stopIndex=${i};this.parentElement.querySelectorAll('.chip').forEach(c=>c.classList.remove('on'));this.classList.add('on')">${i + 1}. ${esc(shortName(PL[x.placeId]))}</button>`).join("")}</div></div>
    <div class="field"><label>备注</label><input class="input" maxlength="30" placeholder="比如：门票、打车、奶茶" oninput="F.text=this.value"></div>
    <button class="cta neon" style="margin-top:16px" onclick="submitSpend()">记下</button>`);
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

// ---------- 我的局 ----------
function sessionRow(s) {
  const st = status(s);
  return `<div class="srow" onclick="go('#/session/${s.id}')">${collage(s, 64)}
    <div style="flex:1;min-width:0"><div class="squad-title">${esc(s.title)}</div>
      <div class="squad-sub">${dateLabel(s.date)} · ${s.stops.length} 站 · ${VIS[s.visibility][0]} ${VIS[s.visibility][1]}</div>
      <div class="row" style="margin-top:6px">${avatars(s.members, 4)}<span>${!s.remote && online() ? `<span class="local-tag">本机</span>` : ""}<span class="status ${st}">${STATUS_LABEL[st]}${noShow(s) ? " · 未成局" : ""}</span></span></div></div></div>`;
}
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
    <div class="header"><div class="header-row"><div class="wordmark" style="font-size:24px">我的局<sup>*</sup></div>
      <div style="display:flex;gap:8px"><button class="btn-sm ghost" onclick="openAgent()">🤖 AI 局长</button><button class="btn-sm neon" onclick="go('#/new')">＋ 开局</button></div></div></div>
    <div class="seg">${[["planning", "筹备中"], ["live", "进行中"], ["done", "已完成"]].map(([k, l]) => `<button class="${seg === k ? "on" : ""}" onclick="S.ui.sessSeg='${k}';renderSessions()">${l} ${n(k) || ""}</button>`).join("")}</div>
    ${list.length ? list.map(sessionRow).join("") : `<div class="empty-state"><div class="e">🗂</div>${{ planning: "还没有筹备中的局<br>在任意地点点「在这开局」", live: "今天没有进行中的局", done: "还没有完成的局" }[seg]}<br><br><button class="btn-sm" onclick="go('#/discover')">去发现</button></div>`}
    </div>${tabbar("sessions")}`;
}

// ---------- 足迹 ----------
function myCheckins() {
  return S.sessions.flatMap((s) => s.entries.filter((e) => e.type === "checkin" && e.uid === S.prefs.uid).map((e) => ({ e, s }))).sort((a, b) => b.e.createdAt - a.e.createdAt);
}
async function loadTrail() {
  try { const r = await API.trail(); S.trail = r.items; } catch { S.trail = S.trail || []; }
  S.trailAt = Date.now();
  if (route().name === "trail") renderTrail();
}
function renderTrail() {
  if (online() && API.auth && (!S.trailAt || Date.now() - S.trailAt > 15000)) { S.trailAt = Date.now(); loadTrail(); }
  const remote = (online() ? S.trail || [] : []).filter((e) => e.type === "checkin").map((e) => ({
    e: { createdAt: e.createdAt, photo: e.photoUrl, verified: e.verified, rating: e.rating, text: e.text, stopIndex: 0 },
    s: { id: e.session.id, title: e.session.title, stops: [{ placeId: e.placeId }] } }));
  const list = [...remote, ...myCheckins()].sort((a, b) => b.e.createdAt - a.e.createdAt);
  $("#view").innerHTML = `<div class="page">
    <div class="header"><div class="header-row"><div class="wordmark" style="font-size:24px">足迹<sup>*</sup></div><span class="mini">${list.length} 次打卡 · ${list.filter((x) => x.e.verified).length} 次到场认证</span></div></div>
    ${list.length ? `<div class="timeline">${list.map(({ e, s }) => {
      const p = PL[s.stops[e.stopIndex ?? 0]?.placeId] || PLACES[0];
      return `<div class="tl-item" onclick="go('#/session/${s.id}')">${e.photo ? `<div class="ph">${img(e.photo)}</div>` : `<div class="ph">${photoBox(p, 0, "thumb")}</div></div>`}
        <div class="info"><span class="tl-date">${new Date(e.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" })}</span>
        <b>${esc(shortName(p))}</b><span class="mini">${esc(s.title)}</span>
        <span>${e.verified ? `<span class="verified">📍 到场认证</span>` : `<span class="unverified">未认证</span>`} ${"⭐".repeat(e.rating || 0)}</span>
        ${e.text ? `<span style="color:#555">“${esc(e.text)}”</span>` : ""}</div></div>`;
    }).join("")}</div>` : `<div class="empty-state"><div class="e">👣</div>还没有足迹<br>去任意地点点「📍 打卡」</div>`}
    </div>${tabbar("trail")}`;
}

// ---------- 我 ----------
function renderMe() {
  if (online() && API.auth && (!S.meAt || Date.now() - S.meAt > 15000)) {
    S.meAt = Date.now();
    Promise.all([API.me(), API.mySessions()]).then(([m, r]) => { S.meStats = m.stats; S.mine = r.items.map(adaptSummary); if (route().name === "me") renderMe(); }).catch(() => {});
  }
  const p = S.prefs, now = new Date();
  const mine = S.sessions.filter(isMember), cks = myCheckins();
  const monthOut = new Set(cks.filter(({ e }) => { const d = new Date(e.createdAt); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).map(({ s }) => s.id)).size;
  const places = new Set(cks.map(({ e, s }) => s.stops[e.stopIndex ?? 0]?.placeId)).size;
  const spent = S.sessions.flatMap((s) => s.entries).filter((e) => e.type === "spend" && e.uid === p.uid).reduce((a, e) => a + (+e.amount || 0), 0);
  const verified = cks.filter(({ e }) => e.verified).length;
  const org = [...(online() ? (S.mine || []).filter((s) => s.role === "organizer") : []), ...mine.filter(isOrganizer)].filter((s) => s.cap > 1 && status(s) === "done");
  const arrived = org.filter((s) => (s.summary ? s.checkinCount : checkins(s).length)).length;
  const st = online() && S.meStats;
  $("#view").innerHTML = `<div class="page">
    <div class="me-head"><span class="avatar">${p.avatar || "🐱"}</span><div><h2>${esc(p.nick)}</h2><p>📍 上海 · 周末探索家</p></div></div>
    <div class="stats four"><div class="stat"><b>${st ? st.checkinsThisMonth : monthOut}</b><span>${st ? "本月打卡" : "本月出门"}</span></div><div class="stat"><b>${st ? st.placesVisited : places}</b><span>去过的地点</span></div><div class="stat"><b>¥${st ? st.spentTotal : spent}</b><span>累计花费</span></div><div class="stat"><b>${st ? st.verifiedCheckins : verified}</b><span>到场认证</span></div></div>
    <div class="ns-card"><div><b>成局到场率</b><span class="mini">你发起并已结束的多人局里，至少一人到场打卡的比例</span></div><strong>${org.length ? Math.round((arrived / org.length) * 100) + "%" : "—"}</strong></div>
    <div class="pref-summary"><span>❤️ ${p.likes.join(" / ")}<br>💰 ${BUDGETS.find((b) => b.value === p.budget)?.label} · 👥 ${GROUPS.find((g) => g.value === p.groupSize)?.label}</span>
      <button class="btn-sm ghost" onclick="go('#/onboarding')">改偏好</button></div>
    <div class="about"><b>关于这个雏形</b>
      <p>产品只做两件事：展示可以去逛的地点；看中了，打卡「来过」，或者就地开一个局。</p>
      <p>小红书的打卡是笔记上的 POI 标签，不验证到场；点评的打卡是单点、个人的；Partiful 管活动，不管发现、多地点和预算。我们度量出门，不度量浏览。</p>
      <p>${online() ? "已连上服务器（Cloudflare Workers + D1）：局、打卡和照片对所有成员可见；到场认证由服务器按坐标判定。" : "当前连不上服务器，数据只存在本机浏览器（离线演示模式）。"}</p>
      <div class="mode-slot">${modeLine()}</div></div>
    <div class="footnote"><button class="linkish" onclick="if(confirm('清空本机所有数据，重新体验？')){try{Object.keys(localStorage).filter(k=>k.startsWith('wk')).forEach(k=>localStorage.removeItem(k))}catch(e){};location.hash='';location.reload()}">重置演示数据</button></div>
    </div>${tabbar("me")}`;
}

// ---------- AI 局长（P2：规则 mock，打分 + 距离贪心） ----------
function openAgent() {
  F = { people: S.prefs.groupSize === 3 ? 4 : S.prefs.groupSize === 5 ? 5 : Math.max(2, S.prefs.groupSize), total: 400, likes: [...S.prefs.likes], n: 3, date: nextSaturday() };
  openSheet(`<h2>🤖 AI 局长</h2><div class="sub">告诉我人数、预算和想玩什么，帮你排一个局的草稿</div>
    <div class="field" style="display:flex;gap:10px">
      <div style="flex:1"><label>几个人</label><input class="input" type="number" min="1" max="12" value="${F.people}" oninput="F.people=Math.max(1,+this.value||1)"></div>
      <div style="flex:1"><label>总预算 ¥</label><input class="input" type="number" min="0" value="${F.total}" oninput="F.total=+this.value||0"></div></div>
    <div class="field"><label>哪天</label><input class="input" type="date" min="${today()}" value="${F.date}" onchange="F.date=this.value"></div>
    <div class="field"><label>想玩什么</label><div class="chips">${TYPES.map((t) => `<button class="chip ${F.likes.includes(t) ? "on" : ""}" onclick="F.likes=F.likes.includes('${t}')?F.likes.filter(x=>x!=='${t}'):[...F.likes,'${t}'];this.classList.toggle('on')">${TYPE_EMOJI[t]} ${t}</button>`).join("")}</div></div>
    <div class="field"><label>几站</label><div class="chips">${[1, 2, 3, 4].map((n) => `<button class="chip ${F.n === n ? "on" : ""}" onclick="F.n=${n};this.parentElement.querySelectorAll('.chip').forEach(c=>c.classList.remove('on'));this.classList.add('on')">${n} 站</button>`).join("")}</div></div>
    <button class="cta neon" style="margin-top:16px" onclick="runAgent()">排一个局</button>
    <div id="agentOut"></div>
    <div class="hint" style="margin-top:12px">当前是规则引擎（偏好打分 + 距离贪心；在线时由服务器 /v1/agent/plan 计算），还没有调用大模型。v0.3 换成大模型时接口不变。</div>`);
}
async function runAgent() {
  const out = $("#agentOut");
  out.innerHTML = `<div class="agent-think">🤖 正在看天气、算预算…</div>`;
  if (online()) {
    try {
      const r = await API.plan({ date: F.date, people: F.people, budgetTotal: F.total, likes: F.likes, maxStops: F.n });
      const d = r.draft;
      const draft = { ...newDraft([]), title: d.title || "", titleTouched: !!d.title, date: d.date || F.date, cap: d.cap || F.people, budget: { total: d.budget?.total ?? F.total, mode: d.budget?.mode || "AA" }, visibility: d.visibility || "link" };
      draft.stops = d.stops.filter((x) => PL[x.placeId]).map((x) => ({ placeId: x.placeId, time: x.time || "14:00", estCost: x.estCost ?? PL[x.placeId].avgCost, note: x.note || "" }));
      window.__agentPlan = draft;
      const why = Object.fromEntries((r.rationale || []).map((x) => [x.placeId, x.reasons || []]));
      out.innerHTML = agentPlanHtml(draft.stops.map((x) => ({ p: PL[x.placeId], reasons: why[x.placeId] || [] })), draft.stops, Math.round(draft.stops.reduce((a, x) => a + x.estCost, 0)), F.total / F.people, `服务器 · ${r.engine}`);
      return;
    } catch (e) { if (e.code !== "NO_PLAN") toast("服务器排局失败，改用本地规则"); else { out.innerHTML = `<div class="agent-think">预算内排不出这么多站，试试减少站数或提高预算</div>`; return; } }
  }
  const perHead = F.total / F.people;
  const prefs = { likes: F.likes.length ? F.likes : TYPES, budget: perHead, groupSize: F.people >= 5 ? 5 : F.people >= 3 ? 3 : F.people };
  // 先拉一遍候选地点当天下午的天气（同一网格只请求一次）
  PLACES.forEach((p) => wxFor(p, F.date, "14:00"));
  await new Promise((r) => setTimeout(r, 900));
  const rainOf = (p) => { const w = wxFor(p, F.date, "14:00"); return w && w.rain != null ? w.rain : 0; };
  const cand = PLACES.map((p) => ({ p, ...score(p, prefs, rainOf(p)) })).sort((a, b) => b.sc - a.sc);
  const picked = [cand[0]];
  let spent = cand[0].p.avgCost;
  while (picked.length < F.n) {
    const last = picked.at(-1).p;
    // 贪心：分数 − 距离惩罚（每公里 −4 分），且不超人均预算
    const next = cand.filter((c) => !picked.includes(c) && spent + c.p.avgCost <= perHead * 1.05)
      .map((c) => ({ c, v: c.sc - 4 * km(last, c.p) })).sort((a, b) => b.v - a.v)[0];
    if (!next) break;
    picked.push(next.c); spent += next.c.p.avgCost;
  }
  const start = F.n >= 3 ? 10 : 14;
  const draft = { ...newDraft([]), date: F.date, cap: F.people, budget: { total: F.total, mode: "AA" }, visibility: "link" };
  draft.stops = picked.map((c, i) => ({ placeId: c.p.id, time: `${pad(start + i * 3)}:00`, estCost: c.p.avgCost, note: "" }));
  window.__agentPlan = draft;
  out.innerHTML = agentPlanHtml(picked, draft.stops, spent, perHead, "本地规则 mock", picked.length < F.n ? ` · 预算内只排得下 ${picked.length} 站` : "");
}
function agentPlanHtml(picked, stops, spent, perHead, engine, extra = "") {
  return `<div class="agent-plan"><b>草稿：${picked.map((c) => shortName(c.p)).join(" → ")}</b>
    ${picked.map((c, i) => `<div class="agent-stop"><span class="num">${i + 1}</span><div><b>${esc(shortName(c.p))}</b> <span class="mini">${stops[i].time} · ${money(c.p.avgCost)}/人${i ? ` · 距上一站 ${km(picked[i - 1].p, c.p).toFixed(1)}km` : ""}</span>
      <div class="reasons">${c.reasons.slice(0, 3).map((r) => `<span class="reason">${esc(r)}</span>`).join("")}</div></div></div>`).join("")}
    <div class="mini" style="margin-top:6px">人均预估 ¥${spent} / 人均预算 ¥${Math.round(perHead)}${extra} · 引擎：${engine}</div>
    <button class="cta" style="margin-top:12px" onclick="window.__agentDraft=window.__agentPlan;closeSheet();go('#/new?from=agent')">用这个草稿开局 →</button></div>`;
}

// ---------- 启动 ----------
if (S.prefs?.done) loadWeather();
render();
// 探测后端（3 秒）：在线则刷新当前页拿服务端数据；离线就保持本地模式，页面照常可用
probeP.then(() => { setModeBadge(); if (online() && !["new", "edit", "onboarding"].includes(route().name)) render(); });
