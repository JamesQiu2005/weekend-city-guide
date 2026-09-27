// 周末去哪* — 纯前端雏形：hash 路由 + localStorage 状态
const $ = (s) => document.querySelector(s);
const ACT = Object.fromEntries(ACTIVITIES.map((a) => [a.id, a]));

// ---------- 存储 ----------
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
};
const KEYS = { prefs: "wk_prefs", squads: "wk_squads", checkins: "wk_checkins", guides: "wk_guides", likes: "wk_likes", saves: "wk_saves" };

const S = {
  prefs: LS.get(KEYS.prefs, null),
  squads: LS.get(KEYS.squads, null) || SEED_SQUADS.map((s) => ({ ...s, role: "public" })),
  checkins: LS.get(KEYS.checkins, []),
  guides: LS.get(KEYS.guides, []),
  likes: LS.get(KEYS.likes, {}),
  saves: LS.get(KEYS.saves, {}),
  wx: null,
  ui: { chip: "为你推荐", q: "", searching: false, squadSeg: "host", meSeg: "trail", gchip: "全部" },
};
function persist(k) { if (!LS.set(KEYS[k], S[k])) toast("本地存储已满，试试少传几张图"); }

// ---------- 工具 ----------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => (n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n));
const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const priceLabel = (p) => (p === 0 ? "免费" : "¥" + p);
const dayLabel = (a) => ({ sat: "仅周六", sun: "仅周日", both: "周六日" }[a.date]);
const go = (h) => { location.hash = h; };
const allGuides = () => [...S.guides, ...SEED_GUIDES];
const findGuide = (id) => allGuides().find((g) => g.id === id);
const b64e = (o) => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(o)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64d = (s) => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))));

function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast"; el.textContent = msg;
  $("#layer").appendChild(el);
  setTimeout(() => el.remove(), 2300);
}
function copy(text, inputSel) {
  const fallback = () => { const i = inputSel && $(inputSel); if (i) { i.select(); } toast("请长按链接手动复制"); };
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast("已复制，丢进寝室群吧 ✌️"), fallback);
  else fallback();
}
function compress(file, max = 720) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL("image/jpeg", 0.72));
      };
      img.onerror = rej; img.src = r.result;
    };
    r.onerror = rej; r.readAsDataURL(file);
  });
}

// ---------- 天气（Open-Meteo，失败回退 mock） ----------
const wxIcon = (c) => c === 0 ? ["☀️", "晴"] : c <= 3 ? ["⛅", "多云"] : c <= 48 ? ["🌫️", "雾"] : c <= 67 ? ["🌧️", "雨"] : c <= 77 ? ["🌨️", "雪"] : c <= 82 ? ["🌦️", "阵雨"] : ["⛈️", "雷雨"];
function pickWeekend(days) {
  const out = {};
  for (const d of days) {
    const wd = new Date(d.date + "T00:00:00").getDay();
    if (wd === 6 && !out.sat) out.sat = d;
    if (wd === 0 && !out.sun) out.sun = d;
  }
  return out;
}
function mockWeather() {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(Date.now() + i * 864e5);
    const wd = d.getDay();
    days.push({ date: d.toISOString().slice(0, 10), code: wd === 6 ? 61 : 1, max: wd === 6 ? 21 : 25, min: 17, rain: wd === 6 ? 75 : 10 });
  }
  return { ...pickWeekend(days), mock: true };
}
async function loadWeather() {
  const { lat, lon } = CITIES[S.prefs?.city] || CITIES["上海"];
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FShanghai&forecast_days=7`;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    const j = await (await fetch(url, { signal: ctrl.signal })).json();
    clearTimeout(t);
    const d = j.daily;
    S.wx = pickWeekend(d.time.map((date, i) => ({ date, code: d.weathercode[i], max: Math.round(d.temperature_2m_max[i]), min: Math.round(d.temperature_2m_min[i]), rain: d.precipitation_probability_max[i] ?? 0 })));
  } catch { S.wx = mockWeather(); }
  if (route().name === "discover") { renderWeather(); renderDiscoverList(); }
}

// ---------- 推荐打分（可解释） ----------
function rainFor(a) {
  if (!S.wx) return 0;
  const sat = S.wx.sat?.rain ?? 0, sun = S.wx.sun?.rain ?? 0;
  return a.date === "sat" ? sat : a.date === "sun" ? sun : Math.min(sat, sun);
}
function score(a) {
  const p = S.prefs, reasons = [];
  let sc = 0;
  if (p.likes.includes(a.type)) { sc += 40; reasons.push(`❤️ 你喜欢${a.type}`); }
  if (a.price <= p.budget) { sc += 25; reasons.push(a.price === 0 ? "💰 免费" : "💰 预算内"); }
  else sc += 25 * Math.max(0, 1 - (a.price - p.budget) / Math.max(p.budget, 50));
  if (rainFor(a) > 50) { if (a.indoor) { sc += 20; reasons.push("☔ 雨天室内"); } else sc += 4; }
  else if (!a.indoor) { sc += 20; reasons.push("☀️ 适合户外"); } else sc += 14;
  const g = p.groupSize;
  if (a.suitFor.includes(g)) { sc += 10; reasons.push(g === 1 ? "🙋 一个人也好玩" : `👥 适合${GROUPS.find((x) => x.value === g).label}`); }
  sc += (5 * a.heat) / 3200;
  return { sc, reasons };
}
const openSquads = (aid) => S.squads.filter((s) => s.activityId === aid && s.members.length < s.cap).length;

// ---------- 瀑布流：放入当前最短列 ----------
function masonry(items, heightOf, cardHtml) {
  const cols = [[], []], h = [0, 0];
  items.forEach((it) => { const i = h[0] <= h[1] ? 0 : 1; cols[i].push(cardHtml(it)); h[i] += heightOf(it); });
  return `<div class="masonry">${cols.map((c) => `<div class="col">${c.join("")}</div>`).join("")}</div>`;
}
const coverAR = (r) => `aspect-ratio:100/${Math.round(r * 75)}`;

function actCard(a) {
  const reasons = S.prefs ? score(a).reasons.slice(0, 3) : [];
  const n = openSquads(a.id);
  return `<div class="card" onclick="go('#/activity/${a.id}')">
    <div class="cover" style="background:${a.cover.bg};${coverAR(a.ratio)}">
      <span class="pill">📍 ${esc(a.district)}</span><span class="corner">${a.type}</span>
      <span class="price-tag ${a.price === 0 ? "free" : ""}">${priceLabel(a.price)}</span>${a.cover.emoji}
    </div>
    <div class="card-body">
      <div class="card-title">${esc(a.title)}</div>
      ${reasons.length ? `<div class="reasons">${reasons.map((r) => `<span class="reason">${r}</span>`).join("")}</div>` : ""}
      <div class="card-foot"><span>${dayLabel(a)} · ${a.indoor ? "室内" : "户外"}</span>
      <span class="${n ? "squad-hint" : ""}">${n ? `👥 ${n} 队招募中` : `🔥 ${fmt(a.heat)}`}</span></div>
    </div></div>`;
}
const actHeight = (a) => a.ratio * 0.75 + 0.62;

function likeBtn(g) {
  const on = !!S.likes[g.id];
  return `<button class="like ${on ? "on" : ""}" onclick="event.stopPropagation();toggleLike('${g.id}',this)"><span class="h">${on ? "❤️" : "♡"}</span><span class="n">${fmt(g.likes + (on ? 1 : 0))}</span></button>`;
}
function guideCover(g, big) {
  const img = g.images?.[0];
  return img ? `<img src="${img}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">` : g.emoji;
}
function guideCard(g) {
  return `<div class="card" onclick="go('#/guide/${g.id}')">
    <div class="cover" style="background:${g.bg};${coverAR(g.ratio)}">${guideCover(g)}</div>
    <div class="card-body">
      <div class="card-title">${esc(g.title)}</div>
      <div class="card-foot"><span class="who"><span class="avatar">${g.avatar}</span><span>${esc(g.author)}</span></span>${likeBtn(g)}</div>
    </div></div>`;
}
const guideHeight = (g) => g.ratio * 0.75 + 0.42;

function toggleLike(id, el) {
  S.likes[id] = !S.likes[id];
  if (!S.likes[id]) delete S.likes[id];
  persist("likes");
  const g = findGuide(id), on = !!S.likes[id];
  if (el) {
    el.classList.toggle("on", on);
    el.querySelector(".h").textContent = on ? "❤️" : "♡";
    el.querySelector(".n").textContent = fmt(g.likes + (on ? 1 : 0));
    el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop");
  }
}
function toggleSave(id, el) {
  S.saves[id] = !S.saves[id];
  if (!S.saves[id]) delete S.saves[id];
  persist("saves");
  toast(S.saves[id] ? "已收藏" : "已取消收藏");
  if (el) { el.classList.toggle("on", !!S.saves[id]); el.querySelector("span").textContent = S.saves[id] ? "★" : "☆"; }
}

// ---------- 路由 ----------
function route() {
  const [name, ...rest] = (location.hash.slice(2) || "discover").split("/");
  return { name, arg: rest.join("/") };
}
function render() {
  const r = route();
  if (!S.prefs?.done && !["onboarding", "join"].includes(r.name)) { location.replace("#/onboarding"); return; }
  const view = {
    onboarding: renderOnboarding, discover: renderDiscover, activity: renderActivity,
    squad: renderSquadTab, join: renderJoin, guides: renderGuides, guide: renderGuide, me: renderMe,
  }[r.name] || renderDiscover;
  view(r.arg);
}
window.addEventListener("hashchange", () => { closeAdd(); closeSheet(); render(); window.scrollTo(0, 0); });

function tabbar(active) {
  const t = (k, ico, label) => `<button class="tab ${active === k ? "on" : ""}" onclick="go('#/${k}')">${ico}<small>${label}</small></button>`;
  return `<div class="scrim"></div><nav class="tabbar">
    ${t("discover", "🏠", "发现")}${t("squad", "👥", "组队")}
    <button class="tab plus" id="plusBtn" onclick="toggleAdd()">＋</button>
    ${t("guides", "📖", "攻略")}${t("me", "👤", "我的")}</nav>`;
}
function header(sub) {
  return `<div class="header"><div class="header-row">
    <button class="icon-btn" onclick="toggleSearch()"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="7"/><path d="M16 16l5 5"/></svg></button>
    <div><div class="wordmark">周末去哪<sup>*</sup></div>${sub ? `<div class="city-tag">${sub}</div>` : ""}</div>
    <button class="icon-btn" onclick="toggleAdd()">＋</button></div>
    ${S.ui.searching ? `<div class="search-bar"><input class="input" id="q" placeholder="搜活动、地点、标签" value="${esc(S.ui.q)}" oninput="S.ui.q=this.value;renderDiscoverList()"><button class="icon-btn" onclick="toggleSearch()">✕</button></div>` : ""}
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
    <button class="glass-btn" onclick="closeAdd();openCheckin()">📍 打卡</button>
    <button class="glass-btn" onclick="closeAdd();openGuideEditor()">✍️ 写攻略</button>
    <button class="glass-btn" onclick="closeAdd();openSquadSheet()">👥 发起组队</button></div>`;
  $("#plusBtn")?.classList.add("open");
}
function closeAdd() { $("#float").innerHTML = ""; $("#plusBtn")?.classList.remove("open"); }

// ---------- Onboarding ----------
let onb = null;
function renderOnboarding() {
  if (!onb) {
    const p = S.prefs || {};
    onb = { step: 0, likes: p.likes || ["展览", "市集"], budget: p.budget ?? 100, groupSize: p.groupSize || 2, city: p.city || "上海", nick: p.nick || "周末玩家" + Math.floor(Math.random() * 900 + 100), avatar: p.avatar || "🐱" };
  }
  const steps = [
    { big: "🎡", h: "这周末，<em>去哪玩？</em>", p: "选几个你感兴趣的，我们结合天气和预算帮你挑",
      body: TYPES.map((t) => `<button class="chip ${onb.likes.includes(t) ? "on" : ""}" onclick="onbLike('${t}')">${TYPE_EMOJI[t]} ${t}</button>`).join("") },
    { big: "💰", h: "每次出门，<em>人均预算</em>", p: "超预算的活动会往后排，不会直接藏起来",
      body: BUDGETS.map((b) => `<button class="chip ${onb.budget === b.value ? "on" : ""}" onclick="onb.budget=${b.value};renderOnboarding()">${b.label}</button>`).join("") },
    { big: "👯", h: "一般和<em>几个人</em>去？", p: "人多的话，会优先推适合组队的活动",
      body: GROUPS.map((g) => `<button class="chip ${onb.groupSize === g.value ? "on" : ""}" onclick="onb.groupSize=${g.value};renderOnboarding()">${g.label}</button>`).join("") +
        `<div class="onb-label">所在城市</div>` + Object.keys(CITIES).map((c) => `<button class="chip ${onb.city === c ? "on" : ""}" onclick="onb.city='${c}';renderOnboarding()">${c}</button>`).join("") +
        `<div class="onb-label">你的昵称 & 头像（组队时显示）</div><input class="input" maxlength="12" value="${esc(onb.nick)}" oninput="onb.nick=this.value">` +
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
function onbLike(t) {
  onb.likes = onb.likes.includes(t) ? onb.likes.filter((x) => x !== t) : [...onb.likes, t];
  renderOnboarding();
}
function finishOnb() {
  if (!onb.likes.length) onb.likes = ["展览", "市集"];
  const { likes, budget, groupSize, city, avatar } = onb;
  S.prefs = { likes, budget, groupSize, city, avatar, nick: (onb.nick || "").trim() || "周末玩家", done: true };
  persist("prefs");
  onb = null; S.wx = null; S.ui.chip = "为你推荐";
  loadWeather();
  go("#/discover");
}

// ---------- 发现 ----------
const DISCOVER_CHIPS = ["为你推荐", "雨天也能去", "免费", "适合组队", ...TYPES];
function renderDiscover() {
  $("#view").innerHTML = `<div class="page">${header(`📍 ${S.prefs.city} · 本周末`)}
    <div class="chips">${DISCOVER_CHIPS.map((c) => `<button class="chip ${S.ui.chip === c ? "on" : ""}" onclick="S.ui.chip='${c}';renderDiscover()">#${c}</button>`).join("")}</div>
    <div id="wx"></div><div id="list"></div>
    <div class="footnote">雏形版本 · 活动为示例数据，天气来自 Open-Meteo<br>组队/打卡/攻略数据仅保存在本机浏览器</div>
    </div>${tabbar("discover")}`;
  renderWeather(); renderDiscoverList();
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
function renderDiscoverList() {
  const el = $("#list"); if (!el) return;
  const c = S.ui.chip, q = S.ui.q.trim();
  let list = ACTIVITIES.map((a) => ({ a, s: score(a).sc }));
  if (c === "雨天也能去") list = list.filter((x) => x.a.indoor);
  else if (c === "免费") list = list.filter((x) => x.a.price === 0);
  else if (c === "适合组队") list = list.filter((x) => x.a.suitFor.some((n) => n >= 3));
  else if (TYPES.includes(c)) list = list.filter((x) => x.a.type === c);
  if (q) list = list.filter(({ a }) => [a.title, a.district, a.type, ...a.tags].join(" ").includes(q));
  list.sort((x, y) => y.s - x.s);
  const rainy = S.wx && Math.max(S.wx.sat?.rain ?? 0, S.wx.sun?.rain ?? 0) > 50;
  el.innerHTML = `<div class="section-title">${c === "为你推荐" ? "为你挑的周末" : "#" + c}<small>${list.length} 个活动${rainy && c === "为你推荐" ? " · 周末有雨，室内优先" : ""}</small></div>` +
    (list.length ? masonry(list.map((x) => x.a), actHeight, actCard) : `<div class="empty-state"><div class="e">🫥</div>没有找到相关活动，换个标签试试</div>`);
}

// ---------- 活动详情 ----------
function renderActivity(id) {
  const a = ACT[id];
  if (!a) { go("#/discover"); return; }
  const { reasons } = score(a);
  const squads = S.squads.filter((s) => s.activityId === id);
  const guides = allGuides().filter((g) => g.activityId === id).slice(0, 4);
  const saved = !!S.saves[id];
  $("#view").innerHTML = `<div class="page">
    <div class="hero" style="background:${a.cover.bg}"><button class="back" onclick="history.length>1?history.back():go('#/discover')">‹</button>${a.cover.emoji}</div>
    <div class="detail">
      <div class="reasons" style="margin-bottom:10px">${reasons.map((r) => `<span class="reason" style="font-size:12px">${r}</span>`).join("")}</div>
      <h1>${esc(a.title)}</h1>
      <div class="meta">
        <div><b>时间</b>${dayLabel(a)} · ${a.time}</div><div><b>地点</b>${esc(a.district)}</div>
        <div><b>人均</b>${priceLabel(a.price)}</div><div><b>场地</b>${a.indoor ? "🏠 室内，不怕下雨" : "🌳 户外，看天气"}</div>
        <div><b>适合</b>${a.suitFor.map((n) => GROUPS.find((g) => g.value === n)?.label).join(" / ")}</div><div><b>热度</b>🔥 ${fmt(a.heat)} 人想去</div>
      </div>
      <div class="desc">${esc(a.desc)}</div>
      <div class="tagline">${a.tags.map((t) => `<span>#${esc(t)}</span>`).join("")}</div>
    </div>
    <div class="section-title">招募中的队伍<small>${squads.length} 支</small></div>
    ${squads.length ? squads.map((s) => squadCard(s)).join("") : `<div class="empty-state" style="padding:20px">还没人组队，做第一个发起人吧 🙋</div>`}
    <div class="section-title">相关攻略<small>${guides.length} 篇</small></div>
    ${guides.length ? masonry(guides, guideHeight, guideCard) : `<div class="empty-state" style="padding:20px">去过之后，写下第一篇攻略</div>`}
    </div>
    <div class="action-bar">
      <button class="ab-icon ${saved ? "on" : ""}" onclick="toggleSave('${id}',this)"><span>${saved ? "★" : "☆"}</span><small>收藏</small></button>
      <button class="ab-icon" onclick="openCheckin('${id}')"><span>📍</span><small>打卡</small></button>
      <button class="cta neon" onclick="openSquadSheet('${id}')">👥 发起组队</button>
    </div>`;
}

// ---------- 组队 ----------
function squadStatus(s) {
  const mine = s.role === "host" || s.role === "joined";
  if (mine && S.checkins.some((c) => c.activityId === s.activityId && c.createdAt > (s.createdAt || 0))) return ["已打卡", "full"];
  return s.members.length >= s.cap ? ["已满员", "full"] : ["招募中", ""];
}
function squadCard(s, noAction) {
  const a = ACT[s.activityId]; if (!a) return "";
  const [st, cls] = squadStatus(s);
  const mine = s.role === "host" || s.role === "joined";
  const full = s.members.length >= s.cap;
  const seats = s.members.map((m) => `<span class="seat" title="${esc(m)}">${esc([...m][0])}</span>`).join("") +
    Array.from({ length: Math.max(0, s.cap - s.members.length) }, () => `<span class="seat empty">+</span>`).join("");
  return `<div class="squad-card">
    <div class="squad-head" onclick="go('#/activity/${a.id}')" style="cursor:pointer">
      <div class="squad-emoji" style="background:${a.cover.bg}">${a.cover.emoji}</div>
      <div style="flex:1;min-width:0"><div class="squad-title">${esc(a.title)}</div>
      <div class="squad-sub">🕐 ${esc(s.time)} · 📍 ${esc(s.meetPoint)} · ${s.costMode === "AA" ? `AA 约 ${priceLabel(a.price)}/人` : "发起人请客 🎉"}</div></div>
      <span class="status ${cls}">${st}</span>
    </div>
    ${s.note ? `<div style="font-size:13px;color:#555">💬 ${esc(s.note)} <span style="color:var(--gray)">— ${esc(s.host)}</span></div>` : ""}
    <div class="row"><div class="seats">${seats}<span style="font-size:12px;color:var(--gray);margin-left:4px">${s.members.length}/${s.cap}</span></div>
      ${noAction ? "" : mine ? `<button class="btn-sm neon" onclick="shareSquad('${s.id}')">邀请</button>`
        : `<button class="btn-sm" ${full ? "disabled" : ""} onclick="joinSquad('${s.id}')">${full ? "已满" : "加入"}</button>`}
    </div></div>`;
}
function joinSquad(id) {
  const s = S.squads.find((x) => x.id === id);
  if (!s || s.members.length >= s.cap) return;
  if (!s.members.includes(S.prefs.nick)) s.members.push(S.prefs.nick);
  s.role = "joined"; persist("squads");
  toast("加入成功！出发前记得在群里打招呼");
  render();
}
const squadLink = (s) => { const { role, ...p } = s; return location.origin + location.pathname + "#/join/" + b64e(p); };
function shareSquad(id) {
  const s = S.squads.find((x) => x.id === id);
  openSheet(`<h2>邀请好友入队</h2><div class="sub">把链接发到群里，对方打开就能加入</div>
    <div class="share-box"><input class="input" id="shareLink" readonly value="${esc(squadLink(s))}"><button class="btn-sm neon" onclick="copy($('#shareLink').value,'#shareLink')">复制</button></div>`);
}
function renderSquadTab() {
  const seg = S.ui.squadSeg;
  const list = S.squads.filter((s) => seg === "host" ? s.role === "host" : seg === "joined" ? s.role === "joined" : s.role === "public");
  const empty = seg === "public" ? "广场暂时没有队伍" : seg === "host" ? "你还没发起过组队<br>在活动详情页点「发起组队」试试" : "还没加入任何队伍<br>去广场看看有没有想去的";
  $("#view").innerHTML = `<div class="page">
    <div class="header"><div class="header-row"><div class="wordmark" style="font-size:24px">组队出发<sup>*</sup></div>
      <button class="btn-sm neon" onclick="openSquadSheet()">＋ 发起</button></div></div>
    <div class="seg">${[["host", "我发起的"], ["joined", "我加入的"], ["public", "组队广场"]].map(([k, l]) => `<button class="${seg === k ? "on" : ""}" onclick="S.ui.squadSeg='${k}';renderSquadTab()">${l}</button>`).join("")}</div>
    ${list.length ? list.map((s) => squadCard(s)).join("") : `<div class="empty-state"><div class="e">🫂</div>${empty}<br><br><button class="btn-sm" onclick="S.ui.squadSeg='public';renderSquadTab()">去组队广场</button></div>`}
    <div class="footnote">雏形说明：队伍信息通过分享链接传递，成员名单保存在各自浏览器；接入后端后可实时同步</div>
    </div>${tabbar("squad")}`;
}
function renderJoin(payload) {
  let s;
  try { s = b64d(payload); } catch { s = null; }
  if (!s || !ACT[s.activityId]) { $("#view").innerHTML = `<div class="empty-state"><div class="e">🔗</div>链接好像坏了<br><br><button class="btn-sm" onclick="go('#/discover')">去首页</button></div>`; return; }
  const local = S.squads.find((x) => x.id === s.id);
  if (local) s = local;
  const a = ACT[s.activityId];
  const nick = S.prefs?.nick;
  const isIn = nick && s.members.includes(nick);
  const full = s.members.length >= s.cap;
  $("#view").innerHTML = `<div class="page">
    <div class="hero" style="background:${a.cover.bg};height:220px">${a.cover.emoji}</div>
    <div class="detail">
      <div style="font-size:13px;color:var(--gray);font-weight:700">${esc(s.host)} 邀请你一起去</div>
      <h1 style="margin-top:4px">${esc(a.title)}</h1>
    </div>
    ${squadCard(s, true)}
    <div class="detail">
      ${isIn ? `<div class="empty-state" style="padding:16px">✅ 你已在队伍中</div>`
        : full ? `<div class="empty-state" style="padding:16px">😢 队伍已满员</div>`
        : `${nick ? "" : `<div class="field"><label>你的昵称</label><input class="input" id="joinNick" maxlength="12" placeholder="队友怎么称呼你"></div>`}
           <button class="cta neon" style="margin-top:16px" onclick="acceptInvite('${payload}')">加入队伍（${s.members.length}/${s.cap}）</button>`}
      <button class="cta" style="margin-top:10px;background:var(--plate);color:var(--ink)" onclick="go('#/activity/${a.id}')">看看活动详情</button>
    </div></div>`;
}
function acceptInvite(payload) {
  let s = S.squads.find((x) => x.id === b64d(payload).id) || { ...b64d(payload), role: "joined" };
  if (!S.prefs?.nick) {
    const n = ($("#joinNick")?.value || "").trim();
    if (!n) { toast("先填个昵称吧"); return; }
    S.prefs = { likes: ["展览", "市集"], budget: 100, groupSize: 2, city: "上海", avatar: "🐱", ...(S.prefs || {}), nick: n };
    persist("prefs");
  }
  if (!s.members.includes(S.prefs.nick)) s.members.push(S.prefs.nick);
  if (s.role !== "host") s.role = "joined";
  if (!S.squads.includes(s)) S.squads.push(s);
  persist("squads");
  toast("🎉 入队成功！");
  S.ui.squadSeg = "joined";
  go(S.prefs.done ? "#/squad" : "#/onboarding");
}

// ---------- 底部弹层 ----------
let F = {};
function openSheet(html) {
  $("#layer").querySelectorAll(".sheet-mask,.sheet").forEach((e) => e.remove());
  $("#layer").insertAdjacentHTML("beforeend", `<div class="sheet-mask" onclick="closeSheet()"></div><div class="sheet"><div class="grabber"></div>${html}</div>`);
}
function closeSheet() { $("#layer")?.querySelectorAll(".sheet-mask,.sheet").forEach((e) => e.remove()); }
function pick(el, key, val) {
  F[key] = val;
  el.parentElement.querySelectorAll(".chip").forEach((c) => c.classList.remove("on"));
  el.classList.add("on");
}
const chipGroup = (key, opts) => `<div class="chips">${opts.map(([v, l]) => `<button class="chip ${F[key] === v ? "on" : ""}" onclick='pick(this,"${key}",${JSON.stringify(v)})'>${l}</button>`).join("")}</div>`;
const actSelect = () => `<select class="input" onchange="F.activityId=this.value">${ACTIVITIES.map((a) => `<option value="${a.id}" ${a.id === F.activityId ? "selected" : ""}>${a.cover.emoji} ${esc(a.title)}</option>`).join("")}</select>`;

function openSquadSheet(aid) {
  const g = S.prefs.groupSize;
  F = { activityId: aid || ACTIVITIES[0].id, time: "周六 下午", meetPoint: "", cap: g === 1 ? 2 : g === 3 ? 4 : g === 5 ? 6 : 2, costMode: "AA", note: "" };
  openSheet(`<h2>发起组队</h2><div class="sub">生成邀请链接，发到群里就能拉人</div>
    <div class="field"><label>去哪</label>${actSelect()}</div>
    <div class="field"><label>什么时候</label>${chipGroup("time", ["周六 上午", "周六 下午", "周六 晚上", "周日 上午", "周日 下午", "周日 晚上"].map((t) => [t, t]))}</div>
    <div class="field"><label>人数上限（含自己）</label>${chipGroup("cap", [2, 3, 4, 5, 6].map((n) => [n, n + " 人"]))}</div>
    <div class="field"><label>费用</label>${chipGroup("costMode", [["AA", "AA 制"], ["treat", "我请客 🎉"]])}</div>
    <div class="field"><label>集合点</label><input class="input" placeholder="默认：活动地点" oninput="F.meetPoint=this.value"></div>
    <div class="field"><label>说一句</label><input class="input" maxlength="30" placeholder="比如：i 人友好，拍照互拍" oninput="F.note=this.value"></div>
    <button class="cta neon" style="margin-top:20px" onclick="createSquad()">生成邀请链接</button>`);
}
function createSquad() {
  const a = ACT[F.activityId];
  const s = { id: uid("s"), activityId: a.id, host: S.prefs.nick, time: F.time, meetPoint: F.meetPoint.trim() || a.district, cap: F.cap, costMode: F.costMode, note: F.note.trim(), members: [S.prefs.nick], createdAt: Date.now(), role: "host" };
  S.squads.unshift(s); persist("squads");
  openSheet(`<div style="text-align:center;font-size:56px;margin-top:6px">🎉</div>
    <h2 style="text-align:center">队伍已创建</h2><div class="sub" style="text-align:center">${esc(a.title)} · ${esc(s.time)}</div>
    <div class="share-box"><input class="input" id="shareLink" readonly value="${esc(squadLink(s))}"><button class="btn-sm neon" onclick="copy($('#shareLink').value,'#shareLink')">复制</button></div>
    <button class="cta" style="margin-top:16px" onclick="S.ui.squadSeg='host';closeSheet();go('#/squad');render()">查看我的队伍</button>`);
  copy(squadLink(s), "#shareLink");
}

async function addPhotos(input, max, previewSel) {
  const files = [...input.files].slice(0, max - F.images.length);
  for (const f of files) { try { F.images.push(await compress(f)); } catch { toast("图片读取失败"); } }
  input.value = "";
  renderUpload(max, previewSel);
}
function renderUpload(max, sel) {
  $(sel).innerHTML = F.images.map((src, i) => `<img class="thumb" src="${src}" onclick="F.images.splice(${i},1);renderUpload(${max},'${sel}')" title="点击删除">`).join("") +
    (F.images.length < max ? `<label>＋<input type="file" accept="image/*" ${max > 1 ? "multiple" : ""} hidden onchange="addPhotos(this,${max},'${sel}')"></label>` : "");
}

function openCheckin(aid) {
  const a = ACT[aid] || ACTIVITIES[0];
  F = { activityId: a.id, images: [], mood: "", rating: 5, cost: a.price, companions: S.prefs.groupSize };
  openSheet(`<h2>📍 打卡</h2><div class="sub">记录这一次周末，之后可一键转成攻略</div>
    <div class="field"><label>去了哪</label>${actSelect()}</div>
    <div class="field"><label>照片</label><div class="upload" id="ciUp"></div></div>
    <div class="field"><label>一句话心情</label><input class="input" maxlength="60" placeholder="今天的风很舒服…" oninput="F.mood=this.value"></div>
    <div class="field"><label>评分</label><div class="stars" id="stars"></div></div>
    <div class="field" style="display:flex;gap:10px">
      <div style="flex:1"><label style="display:block;font-size:13px;font-weight:800;margin-bottom:8px">花费 ¥</label><input class="input" type="number" min="0" value="${F.cost}" oninput="F.cost=+this.value||0"></div>
      <div style="flex:1"><label style="display:block;font-size:13px;font-weight:800;margin-bottom:8px">同行人数</label><input class="input" type="number" min="1" value="${F.companions}" oninput="F.companions=+this.value||1"></div>
    </div>
    <button class="cta neon" style="margin-top:20px" onclick="submitCheckin()">盖章打卡 ✓</button>`);
  renderUpload(1, "#ciUp"); renderStars();
}
function renderStars() {
  $("#stars").innerHTML = [1, 2, 3, 4, 5].map((n) => `<button class="${n <= F.rating ? "on" : ""}" onclick="F.rating=${n};renderStars()">⭐</button>`).join("");
}
function submitCheckin() {
  const c = { id: uid("c"), activityId: F.activityId, photo: F.images[0] || null, mood: F.mood.trim(), rating: F.rating, cost: F.cost, companions: F.companions, createdAt: Date.now() };
  S.checkins.unshift(c); persist("checkins");
  closeSheet();
  const a = ACT[c.activityId];
  $("#layer").insertAdjacentHTML("beforeend", `<div class="stamp-wrap" id="stamp"><div class="stamp"><div>已打卡 ✓<small>${esc(a.type)} · ${new Date().toLocaleDateString("zh-CN")}</small></div></div></div>`);
  setTimeout(() => { $("#stamp")?.remove(); S.ui.meSeg = "trail"; go("#/me"); render(); }, 1400);
}

function openGuideEditor(prefill = {}) {
  F = { title: "", body: "", images: [], activityId: ACTIVITIES[0].id, tags: "", ...prefill };
  openSheet(`<h2>✍️ 写攻略</h2><div class="sub">分享你的路线和避坑经验</div>
    <div class="field"><label>图片（最多 4 张）</label><div class="upload" id="gUp"></div></div>
    <div class="field"><label>标题</label><input class="input" maxlength="24" placeholder="填写标题会有更多赞哦" value="${esc(F.title)}" oninput="F.title=this.value"></div>
    <div class="field"><label>正文</label><textarea class="input" placeholder="路线、花费、避坑…" oninput="F.body=this.value">${esc(F.body)}</textarea></div>
    <div class="field"><label>关联活动</label>${actSelect()}</div>
    <div class="field"><label>话题（空格分隔）</label><input class="input" placeholder="上海周末 免费展览" value="${esc(F.tags)}" oninput="F.tags=this.value"></div>
    <button class="cta neon" style="margin-top:20px" onclick="publishGuide()">发布</button>`);
  renderUpload(4, "#gUp");
}
function publishGuide() {
  if (!F.title.trim()) { toast("写个标题吧"); return; }
  const a = ACT[F.activityId];
  const g = { id: uid("g"), activityId: a.id, title: F.title.trim(), body: F.body.trim(), images: F.images, tags: F.tags.split(/\s+/).map((t) => t.replace(/^#/, "")).filter(Boolean),
    author: S.prefs.nick, avatar: S.prefs.avatar, likes: 0, ratio: 1.33, emoji: a.cover.emoji, bg: a.cover.bg, isMine: true, createdAt: Date.now() };
  S.guides.unshift(g); persist("guides");
  closeSheet(); toast("发布成功 🎉");
  S.ui.gchip = "全部"; go("#/guides"); render();
}
function checkinToGuide(cid) {
  const c = S.checkins.find((x) => x.id === cid), a = ACT[c.activityId];
  openGuideEditor({ title: `${a.type}打卡｜${a.title}`.slice(0, 24), body: `${c.mood ? c.mood + "\n\n" : ""}⭐ 评分：${c.rating}/5\n💰 花费：¥${c.cost}\n👥 同行：${c.companions} 人\n\n`, images: c.photo ? [c.photo] : [], activityId: a.id, tags: `${S.prefs.city}周末 ${a.type}` });
}

// ---------- 攻略 ----------
function renderGuides() {
  const c = S.ui.gchip;
  let list = allGuides();
  if (c === "我发布的") list = list.filter((g) => g.isMine);
  else if (c !== "全部") list = list.filter((g) => ACT[g.activityId]?.type === c);
  $("#view").innerHTML = `<div class="page">
    <div class="header"><div class="header-row"><div class="wordmark" style="font-size:24px">周末攻略<sup>*</sup></div>
      <button class="btn-sm neon" onclick="openGuideEditor()">✍️ 写攻略</button></div></div>
    <div class="chips">${["全部", "我发布的", ...TYPES].map((x) => `<button class="chip ${c === x ? "on" : ""}" onclick="S.ui.gchip='${x}';renderGuides()">#${x}</button>`).join("")}</div>
    ${list.length ? masonry(list, guideHeight, guideCard) : `<div class="empty-state"><div class="e">📝</div>还没有攻略，来写第一篇</div>`}
    </div>${tabbar("guides")}`;
}
function renderGuide(id) {
  const g = findGuide(id);
  if (!g) { $("#view").innerHTML = `<div class="empty-state"><div class="e">🔒</div>这篇攻略仅作者本机可见<br>（雏形阶段未接入后端）<br><br><button class="btn-sm" onclick="go('#/guides')">看看其他攻略</button></div>`; return; }
  const a = ACT[g.activityId], liked = !!S.likes[id], saved = !!S.saves[id];
  const slides = g.images?.length ? g.images.map((src) => `<img src="${src}">`).join("") : `<div style="background:${g.bg}">${g.emoji}</div>`;
  $("#view").innerHTML = `<div class="page" style="position:relative">
    <button class="back" onclick="history.length>1?history.back():go('#/guides')">‹</button>
    <div class="carousel">${slides}</div>
    ${g.images?.length > 1 ? `<div style="text-align:center;font-size:11px;color:var(--gray);margin-top:6px">← 左右滑动查看 ${g.images.length} 张 →</div>` : ""}
    <div class="author-row"><span class="avatar">${g.avatar}</span><b>${esc(g.author)}</b>${g.isMine ? `<span class="status">我的</span>` : `<button class="btn-sm" onclick="this.textContent=this.textContent==='关注'?'已关注':'关注';this.classList.toggle('ghost')">关注</button>`}</div>
    <div class="detail">
      <h1 style="font-size:19px">${esc(g.title)}</h1>
      <div class="desc" style="margin-top:10px">${esc(g.body)}</div>
      <div class="tagline">${(g.tags || []).map((t) => `<span>#${esc(t)}</span>`).join("")}</div>
      ${a ? `<div class="linked" onclick="go('#/activity/${a.id}')"><div class="squad-emoji" style="background:${a.cover.bg}">${a.cover.emoji}</div>
        <div style="flex:1;min-width:0"><div class="squad-title" style="font-size:14px">${esc(a.title)}</div><div class="squad-sub">${priceLabel(a.price)} · ${esc(a.district)} · ${openSquads(a.id)} 队招募中</div></div><span style="font-size:20px">›</span></div>` : ""}
    </div></div>
    <div class="action-bar">
      <button class="like ab-icon ${liked ? "on" : ""}" onclick="toggleLike('${id}',this)"><span class="h">${liked ? "❤️" : "♡"}</span><small class="n">${fmt(g.likes + (liked ? 1 : 0))}</small></button>
      <button class="ab-icon ${saved ? "on" : ""}" onclick="toggleSave('${id}',this)"><span>${saved ? "★" : "☆"}</span><small>收藏</small></button>
      <button class="ab-icon" onclick="copy(location.href)"><span>↗</span><small>分享</small></button>
      <button class="cta neon" onclick="go('#/activity/${g.activityId}')">📍 我也要去</button>
    </div>`;
}

// ---------- 我的 ----------
function renderMe() {
  const p = S.prefs, now = new Date();
  const month = S.checkins.filter((c) => { const d = new Date(c.createdAt); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
  const places = new Set(S.checkins.map((c) => c.activityId)).size;
  const spent = S.checkins.reduce((s, c) => s + (+c.cost || 0), 0);
  const seg = S.ui.meSeg;
  let body = "";
  if (seg === "trail") {
    body = S.checkins.length ? `<div class="timeline">${S.checkins.map((c) => {
      const a = ACT[c.activityId];
      return `<div class="tl-item">${c.photo ? `<img src="${c.photo}">` : `<div class="ph" style="background:${a.cover.bg}">${a.cover.emoji}</div>`}
        <div class="info"><span class="tl-date">${new Date(c.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" })}</span>
        <b>${esc(a.title)}</b><span>${"⭐".repeat(c.rating)} · ¥${c.cost} · ${c.companions} 人</span>
        ${c.mood ? `<span style="color:#555">“${esc(c.mood)}”</span>` : ""}
        <button class="link-btn" onclick="checkinToGuide('${c.id}')">✍️ 转成攻略</button></div></div>`;
    }).join("")}</div>` : `<div class="empty-state"><div class="e">👣</div>还没有足迹<br>去活动详情页点「打卡」吧</div>`;
  } else if (seg === "guides") {
    const mine = S.guides;
    body = mine.length ? masonry(mine, guideHeight, guideCard) : `<div class="empty-state"><div class="e">📝</div>还没写过攻略</div>`;
  } else {
    const acts = ACTIVITIES.filter((a) => S.saves[a.id]);
    const gs = allGuides().filter((g) => S.saves[g.id]);
    body = acts.length + gs.length
      ? (acts.length ? `<div class="section-title">活动</div>${masonry(acts, actHeight, actCard)}` : "") + (gs.length ? `<div class="section-title">攻略</div>${masonry(gs, guideHeight, guideCard)}` : "")
      : `<div class="empty-state"><div class="e">☆</div>还没有收藏</div>`;
  }
  $("#view").innerHTML = `<div class="page">
    <div class="me-head"><span class="avatar">${p.avatar || "🐱"}</span><div><h2>${esc(p.nick)}</h2><p>📍 ${p.city} · 周末探索家</p></div></div>
    <div class="stats"><div class="stat"><b>${month.length}</b><span>本月打卡</span></div><div class="stat"><b>${places}</b><span>去过的地方</span></div><div class="stat"><b>¥${spent}</b><span>累计花费</span></div></div>
    <div class="pref-summary"><span>❤️ ${p.likes.join(" / ")}<br>💰 ${BUDGETS.find((b) => b.value === p.budget)?.label} · 👥 ${GROUPS.find((g) => g.value === p.groupSize)?.label}</span>
      <button class="btn-sm ghost" onclick="go('#/onboarding')">改偏好</button></div>
    <div class="seg">${[["trail", "足迹"], ["guides", "我的攻略"], ["saved", "收藏"]].map(([k, l]) => `<button class="${seg === k ? "on" : ""}" onclick="S.ui.meSeg='${k}';renderMe()">${l}</button>`).join("")}</div>
    ${body}
    <div class="footnote"><button onclick="if(confirm('清空本机所有数据，重新体验？')){localStorage.clear();location.hash='';location.reload()}" style="color:var(--icon);text-decoration:underline">重置演示数据</button></div>
    </div>${tabbar("me")}`;
}

// ---------- 启动 ----------
if (S.prefs?.done) loadWeather();
render();
