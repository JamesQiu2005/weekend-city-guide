// 周末去哪* API — Cloudflare Worker + D1 (data) + KV (photos). Contract: ../RFC-001-api-contract.md
// Zero dependencies. All responses are JSON except GET /v1/media/:key.

const VERSION = "2026-09-27";
const GEOFENCE_M = 500;
const MAX_ACCURACY_M = 1000;
const MAX_MEDIA_BYTES = 2 * 1024 * 1024;
const MEDIA_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
const FORECAST_DAYS = 16;

// ---------- small utils ----------
class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const bad = (msg, code = "BAD_REQUEST") => new ApiError(400, code, msg);
const now = () => Date.now();
const todaySH = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const addDays = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400e3).toISOString().slice(0, 10);

const B62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
function rid(prefix, n = 12) {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  let s = "";
  for (const b of bytes) s += B62[b % 62];
  return prefix + s;
}
async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371e3, toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ---------- validation ----------
function str(v, name, { max = 200, required = false } = {}) {
  if (v === undefined || v === null || v === "") {
    if (required) throw bad(`${name} is required`);
    return null;
  }
  if (typeof v !== "string") throw bad(`${name} must be a string`);
  const t = v.trim();
  if (required && !t) throw bad(`${name} is required`);
  if ([...t].length > max) throw bad(`${name} must be at most ${max} characters`);
  return t || null;
}
function int(v, name, { min = 0, max = 1e7, required = false } = {}) {
  if (v === undefined || v === null || v === "") {
    if (required) throw bad(`${name} is required`);
    return null;
  }
  if (!Number.isInteger(v) || v < min || v > max) throw bad(`${name} must be an integer in [${min}, ${max}]`);
  return v;
}
function oneOf(v, name, opts, fallback) {
  if (v === undefined || v === null) return fallback;
  if (!opts.includes(v)) throw bad(`${name} must be one of ${opts.join(", ")}`);
  return v;
}
function date(v, name, required = false) {
  if (v == null) { if (required) throw bad(`${name} is required`); return null; }
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(Date.parse(v))) throw bad(`${name} must be YYYY-MM-DD`);
  return v;
}
function hhmm(v, name) {
  if (v == null || v === "") return null;
  if (typeof v !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) throw bad(`${name} must be HH:MM`);
  return v;
}
function coords(v) {
  if (v == null) return null;
  if (typeof v !== "object" || typeof v.lat !== "number" || typeof v.lon !== "number" || Math.abs(v.lat) > 90 || Math.abs(v.lon) > 180)
    throw bad("coords must be {lat, lon, accuracy?}");
  const accuracy = typeof v.accuracy === "number" && v.accuracy >= 0 ? v.accuracy : null;
  return { lat: v.lat, lon: v.lon, accuracy };
}
const mediaKey = (v, name) => {
  const k = str(v, name, { max: 40 });
  if (k && !/^m_[0-9A-Za-z]{16}\.(jpg|png|webp|gif)$/.test(k)) throw bad(`${name} must be a media key from POST /v1/media`);
  return k;
};

// ---------- http ----------
function corsHeaders(req, env) {
  const origin = req.headers.get("Origin");
  if (!origin) return {};
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  if (!local && !allowed.includes(origin) && !allowed.includes("*")) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });

async function body(req) {
  try { const b = await req.json(); if (b && typeof b === "object") return b; } catch {}
  throw bad("body must be a JSON object");
}

// ---------- auth ----------
async function viewer(req, env) {
  const h = req.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+([0-9a-f]{64})$/i);
  if (!m) return null;
  return env.DB.prepare("SELECT id, name, avatar FROM users WHERE token_hash = ?").bind(await sha256(m[1].toLowerCase())).first();
}
function need(user) {
  if (!user) throw new ApiError(401, "UNAUTHORIZED", "missing or invalid token; call POST /v1/users first");
  return user;
}

// ---------- serializers ----------
const mediaUrl = (env, origin, key) => (key ? `${env.PUBLIC_BASE || origin}/v1/media/${key}` : null);
const placeOut = (p) => p && ({
  id: p.id, city: p.city, name: p.name, category: p.category, district: p.district,
  lat: p.lat, lon: p.lon, indoor: !!p.indoor, avgCost: p.avg_cost,
});
function statusOf(s, today = todaySH()) {
  if (s.closed_at) return "done";
  if (s.date > today) return "planning";
  if (s.date === today) return "live";
  return "done";
}
const userOut = (u) => ({ id: u.id, name: u.name, avatar: u.avatar });

// Full session with stops, members, entries. Returns null if not visible to viewer.
async function loadSession(env, origin, id, me) {
  const s = await env.DB.prepare(
    `SELECT s.*, u.name AS org_name, u.avatar AS org_avatar FROM sessions s JOIN users u ON u.id = s.organizer_id
     WHERE s.id = ? AND s.deleted_at IS NULL`
  ).bind(id).first();
  if (!s) return null;
  const [stops, members, entries] = await env.DB.batch([
    env.DB.prepare(
      `SELECT st.*, p.city, p.name, p.category, p.district, p.lat, p.lon, p.indoor, p.avg_cost
       FROM stops st JOIN places p ON p.id = st.place_id WHERE st.session_id = ? ORDER BY st.idx`
    ).bind(id),
    env.DB.prepare(
      `SELECT m.user_id, m.role, m.joined_at, u.name, u.avatar FROM members m JOIN users u ON u.id = m.user_id
       WHERE m.session_id = ? ORDER BY m.joined_at`
    ).bind(id),
    env.DB.prepare(
      `SELECT e.*, u.name AS author_name, u.avatar AS author_avatar FROM entries e JOIN users u ON u.id = e.author_id
       WHERE e.session_id = ? ORDER BY e.created_at DESC LIMIT 200`
    ).bind(id),
  ]);
  const memberRows = members.results;
  const isMember = !!me && memberRows.some((m) => m.user_id === me.id);
  if (s.visibility === "private" && !isMember) return null;

  const entryRows = entries.results;
  const checkins = entryRows.filter((e) => e.type === "checkin");
  const memberIds = memberRows.map((m) => m.user_id);
  const stopsOut = stops.results.map((st) => {
    const here = checkins.filter((e) => e.place_id === st.place_id);
    const ids = [...new Set(here.map((e) => e.author_id))];
    return {
      idx: st.idx, placeId: st.place_id, place: placeOut({ ...st, id: st.place_id }),
      time: st.time, estCost: st.est_cost, note: st.note, backupPlaceId: st.backup_place_id,
      checkedInUserIds: ids,
      verifiedUserIds: [...new Set(here.filter((e) => e.verified).map((e) => e.author_id))],
      allArrived: memberIds.length > 0 && memberIds.every((m) => ids.includes(m)),
    };
  });
  const estPerPerson = stopsOut.reduce((a, st) => a + st.estCost, 0);
  const actualTotal = entryRows.reduce((a, e) => a + ((e.type === "spend" || e.type === "checkin") && e.amount ? e.amount : 0), 0);
  return {
    id: s.id, title: s.title, cover: s.cover, date: s.date, startTime: s.start_time,
    visibility: s.visibility, status: statusOf(s), closedAt: s.closed_at,
    organizer: { id: s.organizer_id, name: s.org_name, avatar: s.org_avatar },
    cap: s.cap,
    budget: {
      total: s.budget_total, mode: s.budget_mode,
      perPerson: s.cap ? Math.round(s.budget_total / s.cap) : s.budget_total,
      estPerPerson, estTotal: estPerPerson * s.cap, actualTotal,
      overBudget: s.budget_total > 0 && estPerPerson * s.cap > s.budget_total,
    },
    stops: stopsOut,
    members: memberRows.map((m) => ({ id: m.user_id, name: m.name, avatar: m.avatar, role: m.role, joinedAt: m.joined_at })),
    entries: entryRows.map((e) => entryOut(env, origin, e)),
    counts: {
      members: memberRows.length,
      entries: entryRows.length,
      checkins: checkins.length,
      photos: entryRows.filter((e) => e.photo).length,
    },
    viewer: { isMember, isOrganizer: !!me && me.id === s.organizer_id },
    createdAt: s.created_at, updatedAt: s.updated_at,
  };
}
function entryOut(env, origin, e) {
  return {
    id: e.id, sessionId: e.session_id, type: e.type, stopIdx: e.stop_idx, placeId: e.place_id,
    author: { id: e.author_id, name: e.author_name, avatar: e.author_avatar },
    text: e.text, photo: e.photo, photoUrl: mediaUrl(env, origin, e.photo),
    amount: e.amount, rating: e.rating, verified: !!e.verified, distanceM: e.distance_m, createdAt: e.created_at,
  };
}

// Compact cards for feed / lists. `rows` are sessions rows joined with organizer.
async function summaries(env, origin, rows) {
  if (!rows.length) return [];
  const stmts = [];
  for (const s of rows) {
    stmts.push(
      env.DB.prepare("SELECT place_id FROM stops WHERE session_id = ? ORDER BY idx").bind(s.id),
      env.DB.prepare(
        `SELECT u.avatar, u.name FROM members m JOIN users u ON u.id = m.user_id WHERE m.session_id = ? ORDER BY m.joined_at`
      ).bind(s.id),
      env.DB.prepare(
        `SELECT photo, type, amount FROM entries WHERE session_id = ? AND (photo IS NOT NULL OR type IN ('checkin','spend')) ORDER BY created_at DESC LIMIT 100`
      ).bind(s.id)
    );
  }
  const res = await env.DB.batch(stmts);
  return rows.map((s, i) => {
    const stops = res[i * 3].results, mem = res[i * 3 + 1].results, ent = res[i * 3 + 2].results;
    return {
      id: s.id, title: s.title, cover: s.cover, date: s.date, startTime: s.start_time,
      status: statusOf(s), visibility: s.visibility,
      organizer: { id: s.organizer_id, name: s.org_name, avatar: s.org_avatar },
      placeIds: stops.map((x) => x.place_id), stopCount: stops.length,
      memberCount: mem.length, memberAvatars: mem.slice(0, 5).map((m) => m.avatar), cap: s.cap,
      budget: { total: s.budget_total, perPerson: s.cap ? Math.round(s.budget_total / s.cap) : s.budget_total },
      photoUrls: ent.filter((e) => e.photo).slice(0, 4).map((e) => mediaUrl(env, origin, e.photo)),
      checkinCount: ent.filter((e) => e.type === "checkin").length,
      role: s.role || undefined,
      updatedAt: s.updated_at,
    };
  });
}
const SUMMARY_SELECT = `SELECT s.*, u.name AS org_name, u.avatar AS org_avatar FROM sessions s JOIN users u ON u.id = s.organizer_id`;

// ---------- session writes ----------
async function validateStops(env, raw) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 8) throw bad("stops must be an array of 1–8 items");
  const stops = raw.map((st, i) => {
    if (!st || typeof st !== "object") throw bad(`stops[${i}] must be an object`);
    return {
      placeId: str(st.placeId, `stops[${i}].placeId`, { required: true, max: 40 }),
      time: hhmm(st.time, `stops[${i}].time`),
      estCost: int(st.estCost, `stops[${i}].estCost`, { max: 100000 }),
      note: str(st.note, `stops[${i}].note`, { max: 140 }),
      backupPlaceId: str(st.backupPlaceId, `stops[${i}].backupPlaceId`, { max: 40 }),
    };
  });
  const ids = [...new Set(stops.flatMap((s) => [s.placeId, s.backupPlaceId].filter(Boolean)))];
  const found = await env.DB.prepare(`SELECT id, avg_cost FROM places WHERE id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all();
  const cost = Object.fromEntries(found.results.map((p) => [p.id, p.avg_cost]));
  for (const id of ids) if (!(id in cost)) throw new ApiError(404, "PLACE_NOT_FOUND", `unknown placeId ${id}`);
  for (const st of stops) if (st.estCost === null) st.estCost = cost[st.placeId];
  return stops;
}
const stopInserts = (env, sid, stops) =>
  stops.map((st, i) =>
    env.DB.prepare("INSERT INTO stops (session_id, idx, place_id, time, est_cost, note, backup_place_id) VALUES (?,?,?,?,?,?,?)")
      .bind(sid, i, st.placeId, st.time, st.estCost, st.note, st.backupPlaceId)
  );
const systemEntry = (env, sid, authorId, text) =>
  env.DB.prepare("INSERT INTO entries (id, session_id, author_id, type, text, created_at) VALUES (?,?,?,?,?,?)")
    .bind(rid("e_"), sid, authorId, "system", text, now());

async function getSessionRow(env, id) {
  const s = await env.DB.prepare("SELECT * FROM sessions WHERE id = ? AND deleted_at IS NULL").bind(id).first();
  if (!s) throw new ApiError(404, "SESSION_NOT_FOUND", "session not found");
  return s;
}
async function isMemberOf(env, sid, uid) {
  return !!(await env.DB.prepare("SELECT 1 FROM members WHERE session_id = ? AND user_id = ?").bind(sid, uid).first());
}

// Validates + inserts one entry. Returns the new entry id. `s` is a sessions row.
async function insertEntry(env, s, me, b) {
  const type = oneOf(b.type, "type", ["checkin", "photo", "spend", "note"]);
  if (!type) throw bad("type is required");
  const text = str(b.text, "text", { max: 500 });
  const photo = mediaKey(b.photo, "photo");
  const amount = int(b.amount, "amount", { max: 100000 });
  const rating = int(b.rating, "rating", { min: 1, max: 5 });
  const stopIdx = int(b.stopIdx, "stopIdx", { max: 7 });
  const c = coords(b.coords);
  if (type === "photo" && !photo) throw bad("photo entries need photo");
  if (type === "spend" && amount === null) throw bad("spend entries need amount");
  if (type === "note" && !text) throw bad("note entries need text");

  let placeId = null, verified = 0, distance = null;
  if (stopIdx !== null) {
    const st = await env.DB.prepare(
      "SELECT st.place_id, p.lat, p.lon FROM stops st JOIN places p ON p.id = st.place_id WHERE st.session_id = ? AND st.idx = ?"
    ).bind(s.id, stopIdx).first();
    if (!st) throw bad(`stopIdx ${stopIdx} does not exist in this session`);
    placeId = st.place_id;
    if (type === "checkin" && c) {
      distance = Math.round(haversine(c.lat, c.lon, st.lat, st.lon));
      verified = distance <= GEOFENCE_M && (c.accuracy === null || c.accuracy <= MAX_ACCURACY_M) ? 1 : 0;
    }
  } else if (type === "checkin") throw bad("checkin entries need stopIdx");

  if (type === "checkin") {
    const dup = await env.DB.prepare(
      "SELECT 1 FROM entries WHERE session_id = ? AND author_id = ? AND type = 'checkin' AND place_id = ?"
    ).bind(s.id, me.id, placeId).first();
    if (dup) throw new ApiError(409, "ALREADY_CHECKED_IN", "you already checked in at this stop");
  }
  const id = rid("e_");
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO entries (id, session_id, stop_idx, place_id, author_id, type, text, photo, amount, rating, verified, distance_m, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(id, s.id, stopIdx, placeId, me.id, type, text, photo, amount, rating, verified, distance, now()),
    env.DB.prepare("UPDATE sessions SET updated_at = ? WHERE id = ?").bind(now(), s.id),
  ]);
  return id;
}

// ---------- weather (Open-Meteo proxy, cached) ----------
async function weather(env, url, ctx) {
  const lat = Number(url.searchParams.get("lat")), lon = Number(url.searchParams.get("lon"));
  const d = date(url.searchParams.get("date"), "date", true);
  if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw bad("lat and lon are required numbers");
  const today = todaySH();
  if (d > addDays(today, FORECAST_DAYS - 1)) {
    return { available: false, reason: "beyond_horizon", availableFrom: addDays(d, -(FORECAST_DAYS - 1)), date: d };
  }
  const la = lat.toFixed(2), lo = lon.toFixed(2);
  const upstream = `https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}` +
    `&hourly=temperature_2m,precipitation_probability,weathercode&timezone=Asia%2FShanghai&start_date=${d}&end_date=${d}`;
  const cache = caches.default, key = new Request(upstream);
  let res = await cache.match(key);
  if (!res) {
    const r = await fetch(upstream, { signal: AbortSignal.timeout(4000) }).catch(() => null);
    if (!r || !r.ok) return { available: false, reason: "upstream_error", date: d };
    res = new Response(await r.text(), { headers: { "Content-Type": "application/json", "Cache-Control": "max-age=1800" } });
    ctx.waitUntil(cache.put(key, res.clone()));
  }
  const w = await res.json();
  const h = w.hourly || {};
  const hourly = (h.time || []).map((t, i) => ({
    time: t.slice(11, 16), temp: h.temperature_2m[i], precipProb: h.precipitation_probability[i], code: h.weathercode[i],
  }));
  if (!hourly.length) return { available: false, reason: "no_data", date: d };
  const temps = hourly.map((x) => x.temp), probs = hourly.map((x) => x.precipProb ?? 0);
  const noon = hourly.find((x) => x.time === "12:00") || hourly[0];
  return {
    available: true, date: d, lat: Number(la), lon: Number(lo), source: "open-meteo",
    summary: { tempMax: Math.max(...temps), tempMin: Math.min(...temps), precipProbMax: Math.max(...probs), code: noon.code },
    hourly,
  };
}

// ---------- AI 局长 (rules-v0; LLM later) ----------
async function agentPlan(env, b) {
  const city = str(b.city, "city", { max: 10 }) || "上海";
  const d = date(b.date, "date") || nextSaturday();
  const people = int(b.people, "people", { min: 1, max: 20 }) || 2;
  const budgetTotal = int(b.budgetTotal, "budgetTotal", { max: 1e6 }) ?? people * 100;
  const likes = Array.isArray(b.likes) ? b.likes.filter((x) => typeof x === "string").slice(0, 10) : [];
  const rainy = !!b.rainy;
  const maxStops = int(b.maxStops, "maxStops", { min: 1, max: 5 }) || 3;

  const { results } = await env.DB.prepare("SELECT * FROM places WHERE city = ?").bind(city).all();
  if (!results.length) throw new ApiError(404, "NO_PLACES", `no places in ${city}`);
  const score = (p) => (likes.includes(p.category) ? 3 : 0) + (rainy ? (p.indoor ? 2 : -3) : 0) - p.avg_cost / 200;
  const pool = [...results].sort((a, b2) => score(b2) - score(a));
  const picked = [], why = [];
  let spent = 0;
  for (const p of pool) {
    if (picked.length >= maxStops) break;
    if (picked.length && haversine(picked[0].lat, picked[0].lon, p.lat, p.lon) > 15000) continue; // keep the route compact
    if (spent + p.avg_cost * people > budgetTotal) continue;
    picked.push(p); spent += p.avg_cost * people;
  }
  if (!picked.length) throw new ApiError(422, "NO_PLAN", "no combination of places fits this budget");
  // nearest-neighbour ordering from the top pick
  const route = [picked.shift()];
  while (picked.length) {
    const last = route[route.length - 1];
    picked.sort((a, b2) => haversine(last.lat, last.lon, a.lat, a.lon) - haversine(last.lat, last.lon, b2.lat, b2.lon));
    route.push(picked.shift());
  }
  const times = ["10:00", "13:00", "15:30", "18:00", "20:00"];
  for (const p of route) {
    const r = [];
    if (likes.includes(p.category)) r.push(`你喜欢${p.category}`);
    if (rainy && p.indoor) r.push("室内，不怕下雨");
    r.push(p.avg_cost === 0 ? "免费" : `人均 ¥${p.avg_cost}`);
    why.push({ placeId: p.id, reasons: r });
  }
  return {
    engine: "rules-v0",
    draft: {
      title: `${route.map((p) => p.name.split(/[ ·｜]/)[0]).join(" → ")}`.slice(0, 40),
      date: d, visibility: "link", cap: people,
      budget: { total: budgetTotal, mode: "AA" },
      stops: route.map((p, i) => ({ placeId: p.id, time: times[i], estCost: p.avg_cost })),
    },
    rationale: why,
    estTotal: spent,
  };
}
function nextSaturday() {
  const t = todaySH(), dow = new Date(t + "T00:00:00Z").getUTCDay();
  return addDays(t, ((6 - dow + 7) % 7) || 7);
}

// ---------- router ----------
const routes = [];
const on = (method, pattern, handler) =>
  routes.push({ method, re: new RegExp("^" + pattern.replace(/:(\w+)/g, "(?<$1>[^/]+)") + "$"), handler });

on("GET", "/v1/health", async ({ env }) => {
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM places").first();
  return { ok: true, version: VERSION, places: r.n, today: todaySH() };
});

// users
on("POST", "/v1/users", async ({ env, req }) => {
  const b = await body(req);
  const name = str(b.name, "name", { required: true, max: 20 });
  const avatar = str(b.avatar, "avatar", { max: 8 }) || "🙂";
  const token = [...crypto.getRandomValues(new Uint8Array(32))].map((x) => x.toString(16).padStart(2, "0")).join("");
  const id = rid("u_");
  await env.DB.prepare("INSERT INTO users (id, name, avatar, token_hash, created_at) VALUES (?,?,?,?,?)")
    .bind(id, name, avatar, await sha256(token), now()).run();
  return [{ user: { id, name, avatar }, token }, 201];
});
on("GET", "/v1/me", async ({ env, me }) => {
  need(me);
  const month = todaySH().slice(0, 7);
  const monthStart = Date.parse(month + "-01T00:00:00+08:00");
  const r = await env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM members m JOIN sessions s ON s.id = m.session_id WHERE m.user_id = ?1 AND s.deleted_at IS NULL) AS sessions,
       (SELECT COUNT(*) FROM entries WHERE author_id = ?1 AND type = 'checkin' AND created_at >= ?2) AS checkins_month,
       (SELECT COUNT(DISTINCT place_id) FROM entries WHERE author_id = ?1 AND type = 'checkin') AS places,
       (SELECT COUNT(*) FROM entries WHERE author_id = ?1 AND type = 'checkin' AND verified = 1) AS verified,
       (SELECT COALESCE(SUM(amount), 0) FROM entries WHERE author_id = ?1 AND type IN ('checkin','spend')) AS spent`
  ).bind(me.id, monthStart).first();
  return {
    user: userOut(me),
    stats: { sessions: r.sessions, checkinsThisMonth: r.checkins_month, placesVisited: r.places, verifiedCheckins: r.verified, spentTotal: r.spent },
  };
});
on("PATCH", "/v1/me", async ({ env, req, me }) => {
  need(me);
  const b = await body(req);
  const name = str(b.name, "name", { max: 20 }) ?? me.name;
  const avatar = str(b.avatar, "avatar", { max: 8 }) ?? me.avatar;
  await env.DB.prepare("UPDATE users SET name = ?, avatar = ? WHERE id = ?").bind(name, avatar, me.id).run();
  return { user: { id: me.id, name, avatar } };
});
on("GET", "/v1/me/sessions", async ({ env, origin, me, url }) => {
  need(me);
  const status = oneOf(url.searchParams.get("status") || undefined, "status", ["planning", "live", "done"], null);
  const { results } = await env.DB.prepare(
    `${SUMMARY_SELECT.replace("SELECT s.*", "SELECT s.*, m.role")} JOIN members m ON m.session_id = s.id
     WHERE m.user_id = ? AND s.deleted_at IS NULL ORDER BY s.date DESC, s.updated_at DESC LIMIT 100`
  ).bind(me.id).all();
  const items = await summaries(env, origin, results);
  return { items: status ? items.filter((x) => x.status === status) : items };
});
on("GET", "/v1/me/trail", async ({ env, origin, me, url }) => {
  need(me);
  const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 100);
  const before = Number(url.searchParams.get("cursor")) || 9e15;
  const { results } = await env.DB.prepare(
    `SELECT e.*, u.name AS author_name, u.avatar AS author_avatar, s.title AS session_title, s.visibility, p.name AS place_name
     FROM entries e JOIN users u ON u.id = e.author_id JOIN sessions s ON s.id = e.session_id LEFT JOIN places p ON p.id = e.place_id
     WHERE e.author_id = ? AND e.type = 'checkin' AND s.deleted_at IS NULL AND e.created_at < ?
     ORDER BY e.created_at DESC LIMIT ?`
  ).bind(me.id, before, limit).all();
  return {
    items: results.map((e) => ({
      ...entryOut(env, origin, e),
      session: { id: e.session_id, title: e.session_title, visibility: e.visibility },
      placeName: e.place_name,
    })),
    nextCursor: results.length === limit ? String(results[results.length - 1].created_at) : null,
  };
});

// places
on("GET", "/v1/places", async ({ env, url }) => {
  const city = url.searchParams.get("city") || "上海";
  const today = todaySH();
  const { results } = await env.DB.prepare(
    `SELECT p.*,
       (SELECT COUNT(*) FROM entries e WHERE e.place_id = p.id AND e.type = 'checkin') AS checkin_count,
       (SELECT COUNT(*) FROM entries e WHERE e.place_id = p.id AND e.type = 'checkin' AND e.verified = 1) AS verified_count,
       (SELECT COUNT(DISTINCT s.id) FROM stops st JOIN sessions s ON s.id = st.session_id
         WHERE st.place_id = p.id AND s.visibility = 'public' AND s.deleted_at IS NULL AND s.closed_at IS NULL AND s.date >= ?) AS open_sessions
     FROM places p WHERE p.city = ? ORDER BY p.id`
  ).bind(today, city).all();
  return {
    items: results.map((p) => ({ ...placeOut(p), checkinCount: p.checkin_count, verifiedCount: p.verified_count, openSessionCount: p.open_sessions })),
  };
});
on("GET", "/v1/places/:id", async ({ env, origin, params }) => {
  const p = await env.DB.prepare("SELECT * FROM places WHERE id = ?").bind(params.id).first();
  if (!p) throw new ApiError(404, "PLACE_NOT_FOUND", "place not found");
  const [{ results }, cnt] = await env.DB.batch([
    env.DB.prepare(
      `${SUMMARY_SELECT} WHERE s.visibility = 'public' AND s.deleted_at IS NULL
       AND s.id IN (SELECT session_id FROM stops WHERE place_id = ?) ORDER BY s.updated_at DESC LIMIT 30`
    ).bind(p.id),
    env.DB.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(verified),0) AS v FROM entries WHERE place_id = ? AND type = 'checkin'").bind(p.id),
  ]);
  const items = await summaries(env, origin, results);
  const c = cnt.results[0];
  return {
    place: { ...placeOut(p), checkinCount: c.n, verifiedCount: c.v },
    sessions: { open: items.filter((x) => x.status !== "done"), done: items.filter((x) => x.status === "done") },
  };
});

// feed
on("GET", "/v1/feed", async ({ env, origin, url }) => {
  const status = oneOf(url.searchParams.get("status") || "all", "status", ["all", "open", "done"], "all");
  const limit = Math.min(Number(url.searchParams.get("limit")) || 20, 40);
  const [cu, ci] = (url.searchParams.get("cursor") || "").split("_");
  const today = todaySH();
  let where = "s.visibility = 'public' AND s.deleted_at IS NULL";
  const args = [];
  if (status === "open") { where += " AND s.closed_at IS NULL AND s.date >= ?"; args.push(today); }
  if (status === "done") { where += " AND (s.closed_at IS NOT NULL OR s.date < ?)"; args.push(today); }
  if (cu) { where += " AND (s.updated_at < ? OR (s.updated_at = ? AND s.id < ?))"; args.push(Number(cu), Number(cu), ci || ""); }
  const { results } = await env.DB.prepare(`${SUMMARY_SELECT} WHERE ${where} ORDER BY s.updated_at DESC, s.id DESC LIMIT ?`)
    .bind(...args, limit).all();
  const last = results[results.length - 1];
  return {
    items: await summaries(env, origin, results),
    nextCursor: results.length === limit ? `${last.updated_at}_${last.id}` : null,
  };
});

// sessions
on("POST", "/v1/sessions", async ({ env, origin, req, me }) => {
  need(me);
  const b = await body(req);
  const title = str(b.title, "title", { required: true, max: 40 });
  const d = date(b.date, "date", true);
  if (d < todaySH()) throw bad("date cannot be in the past");
  const stops = await validateStops(env, b.stops);
  const budget = b.budget || {};
  const id = rid("s_");
  const t = now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO sessions (id, organizer_id, title, cover, date, start_time, visibility, budget_total, budget_mode, cap, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      id, me.id, title, str(b.cover, "cover", { max: 500 }), d, hhmm(b.startTime, "startTime"),
      oneOf(b.visibility, "visibility", ["private", "link", "public"], "link"),
      int(budget.total, "budget.total", { max: 1e6 }) ?? 0, oneOf(budget.mode, "budget.mode", ["AA", "treat"], "AA"),
      int(b.cap, "cap", { min: 1, max: 20 }) ?? 4, t, t
    ),
    env.DB.prepare("INSERT INTO members (session_id, user_id, role, joined_at) VALUES (?,?,?,?)").bind(id, me.id, "organizer", t),
    ...stopInserts(env, id, stops),
    systemEntry(env, id, me.id, `${me.name} 开了这个局`),
  ]);
  return [{ session: await loadSession(env, origin, id, me) }, 201];
});
on("GET", "/v1/sessions/:id", async ({ env, origin, params, me }) => {
  const s = await loadSession(env, origin, params.id, me);
  if (!s) throw new ApiError(404, "SESSION_NOT_FOUND", "session not found");
  return { session: s };
});
on("PATCH", "/v1/sessions/:id", async ({ env, origin, req, params, me }) => {
  need(me);
  const s = await getSessionRow(env, params.id);
  if (s.organizer_id !== me.id) throw new ApiError(403, "FORBIDDEN", "only the organizer can edit");
  const b = await body(req);
  const sets = [], args = [], notes = [];
  const set = (col, val) => { sets.push(`${col} = ?`); args.push(val); };
  if ("title" in b) set("title", str(b.title, "title", { required: true, max: 40 }));
  if ("cover" in b) set("cover", str(b.cover, "cover", { max: 500 }));
  if ("date" in b) { const d = date(b.date, "date", true); if (d !== s.date) { set("date", d); notes.push(`日期改为 ${d}`); } }
  if ("startTime" in b) set("start_time", hhmm(b.startTime, "startTime"));
  if ("visibility" in b) {
    const v = oneOf(b.visibility, "visibility", ["private", "link", "public"]);
    if (v !== s.visibility) { set("visibility", v); notes.push({ private: "设为私密", link: "设为好友可见", public: "设为公开" }[v]); }
  }
  if ("cap" in b) {
    const cap = int(b.cap, "cap", { min: 1, max: 20, required: true });
    const n = (await env.DB.prepare("SELECT COUNT(*) AS n FROM members WHERE session_id = ?").bind(s.id).first()).n;
    if (cap < n) throw bad(`cap cannot be below current member count (${n})`);
    set("cap", cap);
  }
  if (b.budget) {
    if ("total" in b.budget) set("budget_total", int(b.budget.total, "budget.total", { max: 1e6, required: true }));
    if ("mode" in b.budget) set("budget_mode", oneOf(b.budget.mode, "budget.mode", ["AA", "treat"]));
  }
  if ("closed" in b) {
    if (b.closed && !s.closed_at) { set("closed_at", now()); notes.push("收局 ✓"); }
    if (!b.closed && s.closed_at) { set("closed_at", null); notes.push("重新开局"); }
  }
  const stmts = [];
  if ("stops" in b) {
    const stops = await validateStops(env, b.stops);
    stmts.push(env.DB.prepare("DELETE FROM stops WHERE session_id = ?").bind(s.id), ...stopInserts(env, s.id, stops));
    notes.push(str(b.changeNote, "changeNote", { max: 60 }) || "更新了路线");
  }
  set("updated_at", now());
  stmts.unshift(env.DB.prepare(`UPDATE sessions SET ${sets.join(", ")} WHERE id = ?`).bind(...args, s.id));
  for (const n of notes) stmts.push(systemEntry(env, s.id, me.id, `${me.name} ${n}`));
  await env.DB.batch(stmts);
  return { session: await loadSession(env, origin, s.id, me) };
});
on("DELETE", "/v1/sessions/:id", async ({ env, params, me }) => {
  need(me);
  const s = await getSessionRow(env, params.id);
  if (s.organizer_id !== me.id) throw new ApiError(403, "FORBIDDEN", "only the organizer can delete");
  await env.DB.prepare("UPDATE sessions SET deleted_at = ?, updated_at = ? WHERE id = ?").bind(now(), now(), s.id).run();
  return [null, 204];
});
on("POST", "/v1/sessions/:id/join", async ({ env, origin, params, me }) => {
  need(me);
  const s = await getSessionRow(env, params.id);
  if (s.visibility === "private") throw new ApiError(404, "SESSION_NOT_FOUND", "session not found");
  if (!(await isMemberOf(env, s.id, me.id))) {
    if (statusOf(s) === "done") throw new ApiError(409, "SESSION_CLOSED", "this session has ended");
    const n = (await env.DB.prepare("SELECT COUNT(*) AS n FROM members WHERE session_id = ?").bind(s.id).first()).n;
    if (n >= s.cap) throw new ApiError(409, "SESSION_FULL", "this session is full");
    await env.DB.batch([
      env.DB.prepare("INSERT INTO members (session_id, user_id, role, joined_at) VALUES (?,?,?,?)").bind(s.id, me.id, "member", now()),
      env.DB.prepare("UPDATE sessions SET updated_at = ? WHERE id = ?").bind(now(), s.id),
      systemEntry(env, s.id, me.id, `${me.name} 加入了`),
    ]);
  }
  return { session: await loadSession(env, origin, s.id, me) };
});
on("POST", "/v1/sessions/:id/leave", async ({ env, params, me }) => {
  need(me);
  const s = await getSessionRow(env, params.id);
  if (s.organizer_id === me.id) throw new ApiError(409, "ORGANIZER_CANNOT_LEAVE", "the organizer cannot leave; delete the session instead");
  if (await isMemberOf(env, s.id, me.id)) {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM members WHERE session_id = ? AND user_id = ?").bind(s.id, me.id),
      systemEntry(env, s.id, me.id, `${me.name} 退出了`),
    ]);
  }
  return [null, 204];
});
on("POST", "/v1/sessions/:id/entries", async ({ env, origin, req, params, me }) => {
  need(me);
  const s = await getSessionRow(env, params.id);
  if (!(await isMemberOf(env, s.id, me.id))) throw new ApiError(403, "NOT_A_MEMBER", "join the session first");
  const id = await insertEntry(env, s, me, await body(req));
  const e = await env.DB.prepare(
    "SELECT e.*, u.name AS author_name, u.avatar AS author_avatar FROM entries e JOIN users u ON u.id = e.author_id WHERE e.id = ?"
  ).bind(id).first();
  return [{ entry: entryOut(env, origin, e), session: await loadSession(env, origin, s.id, me) }, 201];
});
on("DELETE", "/v1/sessions/:id/entries/:entryId", async ({ env, params, me }) => {
  need(me);
  const s = await getSessionRow(env, params.id);
  const e = await env.DB.prepare("SELECT * FROM entries WHERE id = ? AND session_id = ?").bind(params.entryId, s.id).first();
  if (!e) throw new ApiError(404, "ENTRY_NOT_FOUND", "entry not found");
  if (e.type === "system") throw new ApiError(403, "FORBIDDEN", "system entries cannot be deleted");
  if (e.author_id !== me.id && s.organizer_id !== me.id) throw new ApiError(403, "FORBIDDEN", "only the author or organizer can delete");
  await env.DB.prepare("DELETE FROM entries WHERE id = ?").bind(e.id).run();
  return [null, 204];
});

// quick check-in → private one-person session
on("POST", "/v1/checkins", async ({ env, origin, req, me }) => {
  need(me);
  const b = await body(req);
  const placeId = str(b.placeId, "placeId", { required: true, max: 40 });
  const p = await env.DB.prepare("SELECT * FROM places WHERE id = ?").bind(placeId).first();
  if (!p) throw new ApiError(404, "PLACE_NOT_FOUND", "place not found");
  const id = rid("s_"), t = now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO sessions (id, organizer_id, title, date, visibility, budget_total, budget_mode, cap, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).bind(id, me.id, p.name.slice(0, 40), todaySH(), "private", 0, "AA", 1, t, t),
    env.DB.prepare("INSERT INTO members (session_id, user_id, role, joined_at) VALUES (?,?,?,?)").bind(id, me.id, "organizer", t),
    env.DB.prepare("INSERT INTO stops (session_id, idx, place_id, est_cost) VALUES (?,?,?,?)").bind(id, 0, p.id, p.avg_cost),
  ]);
  const s = await getSessionRow(env, id);
  try {
    const eid = await insertEntry(env, s, me, { ...b, type: "checkin", stopIdx: 0 });
    const e = await env.DB.prepare(
      "SELECT e.*, u.name AS author_name, u.avatar AS author_avatar FROM entries e JOIN users u ON u.id = e.author_id WHERE e.id = ?"
    ).bind(eid).first();
    return [{ entry: entryOut(env, origin, e), session: await loadSession(env, origin, id, me) }, 201];
  } catch (err) {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM stops WHERE session_id = ?").bind(id),
      env.DB.prepare("DELETE FROM members WHERE session_id = ?").bind(id),
      env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(id),
    ]);
    throw err;
  }
});

// media (KV-backed; swap to R2 by changing these two handlers)
on("POST", "/v1/media", async ({ env, origin, req, me }) => {
  need(me);
  const type = (req.headers.get("Content-Type") || "").split(";")[0].trim();
  const ext = MEDIA_TYPES[type];
  if (!ext) throw new ApiError(415, "UNSUPPORTED_MEDIA", `Content-Type must be one of ${Object.keys(MEDIA_TYPES).join(", ")}`);
  const buf = await req.arrayBuffer();
  if (!buf.byteLength) throw bad("empty body");
  if (buf.byteLength > MAX_MEDIA_BYTES) throw new ApiError(413, "TOO_LARGE", "images must be ≤ 2MB; compress on the client");
  const key = `${rid("m_", 16)}.${ext}`;
  await env.MEDIA.put(key, buf, { metadata: { type, owner: me.id, at: now() } });
  return [{ key, url: mediaUrl(env, origin, key) }, 201];
});
on("GET", "/v1/media/:key", async ({ env, params }) => {
  const { value, metadata } = await env.MEDIA.getWithMetadata(params.key, "arrayBuffer");
  if (!value) throw new ApiError(404, "MEDIA_NOT_FOUND", "not found");
  return new Response(value, { headers: { "Content-Type": metadata?.type || "application/octet-stream", "Cache-Control": "public, max-age=31536000, immutable" } });
});

on("GET", "/v1/weather", async ({ env, url, ctx }) => weather(env, url, ctx));
on("POST", "/v1/agent/plan", async ({ env, req }) => agentPlan(env, await body(req)));

// ---------- entry ----------
export default {
  async fetch(req, env, ctx) {
    const cors = corsHeaders(req, env);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const url = new URL(req.url);
    let res;
    try {
      const match = routes.find((r) => r.method === req.method && r.re.test(url.pathname));
      if (!match) {
        const any = routes.some((r) => r.re.test(url.pathname));
        throw new ApiError(any ? 405 : 404, any ? "METHOD_NOT_ALLOWED" : "NOT_FOUND", `${req.method} ${url.pathname}`);
      }
      const params = Object.fromEntries(Object.entries(url.pathname.match(match.re).groups || {}).map(([k, v]) => [k, decodeURIComponent(v)]));
      const me = await viewer(req, env);
      const out = await match.handler({ env, req, url, params, me, ctx, origin: url.origin });
      if (out instanceof Response) res = out;
      else if (Array.isArray(out)) res = out[1] === 204 ? new Response(null, { status: 204 }) : json(out[0], out[1]);
      else res = json(out);
    } catch (err) {
      if (err instanceof ApiError) res = json({ error: { code: err.code, message: err.message } }, err.status);
      else {
        console.error(err);
        res = json({ error: { code: "INTERNAL", message: "internal error" } }, 500);
      }
    }
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(cors)) headers.set(k, v);
    return new Response(res.body, { status: res.status, headers });
  },
};
