// 地图（参考 Actually 的 Map：地点标记 + 浮动筛选 + 定位按钮 + 点标记弹出迷你预览）
// 瓦片直接用 OpenStreetMap；坐标都是 WGS-84，暂不做 GCJ-02 转换（OSM 底图本身就是 WGS-84，对得上）。
// Leaflet 只在打开地图时从 cdnjs 按需加载，其它页面零依赖。
const LEAFLET_CSS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
const LEAFLET_JS = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
let leafletP = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletP) return leafletP;
  leafletP = new Promise((res, rej) => {
    const css = document.createElement("link"); css.rel = "stylesheet"; css.href = LEAFLET_CSS; document.head.appendChild(css);
    const js = document.createElement("script"); js.src = LEAFLET_JS; js.async = true;
    js.onload = () => res(window.L); js.onerror = () => { leafletP = null; rej(new Error("leaflet")); };
    document.head.appendChild(js);
    setTimeout(() => { if (!window.L) { leafletP = null; rej(new Error("timeout")); } }, 10000);
  });
  return leafletP;
}

const MAP_CHIPS = ["全部", "有局在招人", "雨天也能去", "免费", ...TYPES];
const MS = { sel: null, markers: {}, me: null };
function mapFilter(p) {
  const c = S.ui.mapChip;
  if (c === "全部") return true;
  if (c === "有局在招人") return openCount(p) > 0;
  if (c === "雨天也能去") return p.indoor;
  if (c === "免费") return p.avgCost === 0;
  return p.category === c;
}

function renderMap(_arg, query) {
  const focus = query?.get("focus");
  if (focus && PL[focus]) MS.sel = focus;
  $("#view").innerHTML = `<div class="mapwrap">
    <div id="map" aria-label="地图"></div>
    <div class="map-top">
      <div class="map-bar"><span class="brand sm">周末去哪<i>*</i></span><span class="kicker" id="mapCount"></span>
        <button class="icon-btn" onclick="go('#/discover')" aria-label="列表">${ICON.feed}</button></div>
      <div class="chips">${MAP_CHIPS.map((c) => `<button class="chip ${S.ui.mapChip === c ? "on" : ""}" onclick="S.ui.mapChip='${c}';refreshMap()">${c}</button>`).join("")}</div>
    </div>
    <button class="loc-btn" onclick="locateMe(true)" aria-label="定位到我">${ICON.locate}</button>
    <div id="mapCard"></div>
    <div class="map-attr">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors</div>
  </div>${tabbar("map")}`;
  loadLeaflet().then((L) => initMap(L)).catch(() => {
    $("#map").innerHTML = `<div class="empty full"><b>地图没加载出来</b>网络可能访问不了地图服务。<button class="cta ghost" onclick="go('#/discover')">先看列表</button></div>`;
  });
}
function initMap(L) {
  if (route().name !== "map" || !$("#map")) return;
  if (MAP) { MAP.remove(); MAP = null; }
  MAP = L.map("map", { zoomControl: false, attributionControl: false, zoomSnap: 0.5 }).setView([31.2, 121.44], 11.5);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, crossOrigin: true }).addTo(MAP);
  MAP.on("click", () => { MS.sel = null; refreshMap(); });
  MS.markers = {}; MS.me = null;
  refreshMap(true);
  if (S.loc) drawMe(); else if (!S.locAsked) showLocAsk();
}
function pinHtml(p, on) {
  return `<div class="pin ${on ? "on" : ""} ${p.indoor ? "" : "out"}"><b>${money(p.avgCost)}</b>${on ? `<span>${esc(shortName(p))}</span>` : ""}</div>`;
}
function refreshMap(fit) {
  if (!MAP || !window.L) return;
  document.querySelectorAll(".map-top .chip").forEach((b) => b.classList.toggle("on", b.textContent === S.ui.mapChip));
  const shown = PLACES.filter(mapFilter);
  if (MS.sel && !shown.some((p) => p.id === MS.sel)) MS.sel = null;
  Object.values(MS.markers).forEach((m) => m.remove());
  MS.markers = {};
  shown.forEach((p) => {
    const on = MS.sel === p.id;
    const m = L.marker([p.lat, p.lon], { icon: L.divIcon({ className: "pin-wrap", html: pinHtml(p, on), iconSize: null, iconAnchor: [0, 0] }), zIndexOffset: on ? 1000 : 0, keyboard: true, title: shortName(p) }).addTo(MAP);
    m.on("click", (ev) => { L.DomEvent.stopPropagation(ev); selectPlace(p.id); });
    MS.markers[p.id] = m;
  });
  const c = $("#mapCount"); if (c) c.textContent = `${shown.length} 个地方`;
  renderMapCard();
  if (fit) {
    if (MS.sel) MAP.setView([PL[MS.sel].lat, PL[MS.sel].lon], 14);
    else if (S.loc && km(CITIES["上海"], S.loc) < 60) {
      // 有定位：框住「我 + 最近的几个地方」
      const near = shown.slice().sort((a, b) => km(S.loc, a) - km(S.loc, b)).slice(0, 5);
      MAP.fitBounds(L.latLngBounds([[S.loc.lat, S.loc.lon], ...near.map((p) => [p.lat, p.lon])]), { padding: [70, 50], maxZoom: 15 });
    }
    else if (shown.length) {
      // 市区的点先框住；郊区（佘山、朱家角）离得远，缩放到能看清市区即可
      const core = shown.filter((p) => km(CITIES["上海"], p) < 20);
      MAP.fitBounds(L.latLngBounds((core.length ? core : shown).map((p) => [p.lat, p.lon])), { padding: [40, 40], maxZoom: 14 });
    }
  }
}
function selectPlace(id) {
  MS.sel = id;
  refreshMap();
  const p = PL[id];
  MAP.panTo([p.lat, p.lon], { animate: true });
}
function renderMapCard() {
  const el = $("#mapCard"); if (!el) return;
  if (MS.sel === "__ask") return;
  const p = PL[MS.sel];
  if (!p) { el.innerHTML = ""; return; }
  const d = distTo(p), open = openCount(p), rs = S.prefs ? score(p).reasons.slice(0, 2) : [];
  el.innerHTML = `<div class="map-card">
    <button class="mc-close" onclick="MS.sel=null;refreshMap()" aria-label="关闭">${ICON.close}</button>
    <div class="mc-row" onclick="go('#/place/${p.id}')">
      ${photo(p, 0, "mc-ph", "", false)}
      <div class="mc-main">
        <div class="kicker">${esc(p.category)} · ${esc(p.district)}${d != null ? ` · 距你 ${kmLabel(d)}` : ""}</div>
        <h3>${esc(shortName(p))}</h3>
        <div class="mc-sub">${money(p.avgCost)} · ${p.indoor ? "室内" : "户外"} · ${esc(p.openHours)}</div>
        ${rs.length ? `<div class="mc-why">${esc(reasonSentence(rs))}</div>` : ""}
      </div>
    </div>
    <div class="mc-actions">
      <button class="cta ghost sm" onclick="go('#/place/${p.id}')">详情${open ? ` · ${open} 个局` : ""}</button>
      <button class="cta ghost sm" onclick="openRoute('${p.id}')">导航</button>
      <button class="cta acid sm" onclick="go('#/new?place=${p.id}')">在这开局</button>
    </div></div>`;
}
// 精确导航交给系统 / OSM：给出起终点的路线页面
function openRoute(id) {
  const p = PL[id];
  const from = S.loc ? `${S.loc.lat},${S.loc.lon}` : "";
  window.open(`https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=${encodeURIComponent(from)}%3B${p.lat}%2C${p.lon}#map=15/${p.lat}/${p.lon}`, "_blank", "noopener");
}
function showLocAsk() {
  const el = $("#mapCard"); if (!el) return;
  el.innerHTML = `<div class="map-card ask">
    <span class="kicker">定位</span>
    <h3>看看离你最近的周末去处</h3>
    <p>只用来在地图上标出你的位置、把近的地方排前面。不会上传。</p>
    <div class="mc-actions"><button class="cta ghost sm" onclick="S.locAsked=true;renderMapCard()">先不用</button><button class="cta acid sm" onclick="locateMe(true)">${ICON.locate} 允许定位</button></div></div>`;
}
async function locateMe(fly) {
  S.locAsked = true;
  const b = $(".loc-btn"); b?.classList.add("busy");
  const r = await requestLocation();
  b?.classList.remove("busy");
  if (r.error) { toast(r.error); renderMapCard(); return; }
  drawMe();
  renderMapCard();
  if (fly && MAP) {
    const near = PLACES.filter(mapFilter).sort((a, c) => km(S.loc, a) - km(S.loc, c)).slice(0, 4);
    MAP.fitBounds(L.latLngBounds([[S.loc.lat, S.loc.lon], ...near.map((p) => [p.lat, p.lon])]), { padding: [60, 60], maxZoom: 15 });
  }
}
function drawMe() {
  if (!MAP || !S.loc || !window.L) return;
  if (MS.me) MS.me.remove();
  MS.me = L.marker([S.loc.lat, S.loc.lon], { icon: L.divIcon({ className: "me-wrap", html: `<div class="me-dot"><i></i></div>`, iconSize: [22, 22], iconAnchor: [11, 11] }), zIndexOffset: 2000, interactive: false }).addTo(MAP);
}
