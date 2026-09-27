// 周末去哪* API client (RFC-001). Plain script, no modules: exposes window.API.
// Copy to the frontend root and load before app.js.
(function () {
  // swap to the custom domain once it exists (RFC §8). On localhost only, localStorage.wk2_api_base can point at `wrangler dev`.
  const API_BASE = (() => { try { return /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && localStorage.getItem("wk2_api_base"); } catch { return null; } })()
    || "https://weekend-api.weekend-api.workers.dev";
  const AUTH_KEY = "wk2_auth";

  const store = {
    get() { try { return JSON.parse(localStorage.getItem(AUTH_KEY)); } catch { return null; } },
    set(v) { try { localStorage.setItem(AUTH_KEY, JSON.stringify(v)); } catch {} },
  };

  class ApiError extends Error {
    constructor(status, code, message) { super(message); this.status = status; this.code = code; }
  }

  async function call(method, path, body, { raw, timeout = 8000 } = {}) {
    const auth = store.get();
    const headers = {};
    if (auth?.token) headers.Authorization = "Bearer " + auth.token;
    if (body !== undefined && !raw) headers["Content-Type"] = "application/json";
    if (raw) headers["Content-Type"] = body.type;
    let res;
    try {
      res = await fetch(API_BASE + path, {
        method, headers, body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
        signal: AbortSignal.timeout(timeout),
      });
    } catch (e) {
      API.online = false;
      throw new ApiError(0, "NETWORK", "无法连接服务器");
    }
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, data.error?.code || "HTTP_" + res.status, data.error?.message || res.statusText);
    return data;
  }

  const q = (o) => { const s = new URLSearchParams(Object.entries(o).filter(([, v]) => v != null && v !== "")); return s.toString() ? "?" + s : ""; };

  const API = {
    base: API_BASE,
    online: null,          // null = unknown, true/false after probe()
    ApiError,
    get auth() { return store.get(); },

    /** Probe the backend (3s). Sets API.online. Never throws. */
    async probe() {
      try { await call("GET", "/v1/health", undefined, { timeout: 3000 }); API.online = true; }
      catch { API.online = false; }
      return API.online;
    },
    /** Returns the stored identity, creating one on first use. */
    async ensureUser(name, avatar) {
      const a = store.get();
      if (a?.token) return a;
      const r = await call("POST", "/v1/users", { name: name || "周末人", avatar });
      store.set(r);
      return r;
    },

    me: () => call("GET", "/v1/me"),
    updateMe: (patch) => call("PATCH", "/v1/me", patch),
    mySessions: (status) => call("GET", "/v1/me/sessions" + q({ status })),
    trail: (cursor) => call("GET", "/v1/me/trail" + q({ cursor })),

    places: (city = "上海") => call("GET", "/v1/places" + q({ city })),
    place: (id) => call("GET", "/v1/places/" + encodeURIComponent(id)),
    feed: ({ status = "all", cursor } = {}) => call("GET", "/v1/feed" + q({ status, cursor })),

    createSession: (body) => call("POST", "/v1/sessions", body),
    session: (id) => call("GET", "/v1/sessions/" + encodeURIComponent(id)),
    updateSession: (id, patch) => call("PATCH", "/v1/sessions/" + encodeURIComponent(id), patch),
    deleteSession: (id) => call("DELETE", "/v1/sessions/" + encodeURIComponent(id)),
    join: (id) => call("POST", `/v1/sessions/${encodeURIComponent(id)}/join`),
    leave: (id) => call("POST", `/v1/sessions/${encodeURIComponent(id)}/leave`),
    addEntry: (id, entry) => call("POST", `/v1/sessions/${encodeURIComponent(id)}/entries`, entry),
    deleteEntry: (id, entryId) => call("DELETE", `/v1/sessions/${encodeURIComponent(id)}/entries/${encodeURIComponent(entryId)}`),
    quickCheckin: (body) => call("POST", "/v1/checkins", body),

    /** Upload a Blob/File (already compressed, ≤2MB). Returns {key, url}. */
    upload: (blob) => call("POST", "/v1/media", blob, { raw: true, timeout: 20000 }),
    weather: (lat, lon, date) => call("GET", "/v1/weather" + q({ lat, lon, date })),
    plan: (body) => call("POST", "/v1/agent/plan", body),
    // AI 局长（LLM，RFC-001 §5.11）：先邮箱验证，再对话。密钥只在服务端。
    agentStatus: () => call("GET", "/v1/agent/status"),
    agentEmailStart: (email) => call("POST", "/v1/agent/email/start", { email }),
    agentEmailVerify: (email, code) => call("POST", "/v1/agent/email/verify", { email, code }),
    agentChat: (body) => call("POST", "/v1/agent/chat", body, { timeout: 40000 }),

    /** Current position as {lat, lon, accuracy}, or null if denied/unavailable (5s). */
    locate() {
      return new Promise((resolve) => {
        if (!navigator.geolocation) return resolve(null);
        navigator.geolocation.getCurrentPosition(
          (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy }),
          () => resolve(null),
          { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
        );
      });
    },
    /** Shareable link for a session on the current page. */
    shareLink: (id) => location.origin + location.pathname + "#/session/" + id,
  };

  window.API = API;
})();
