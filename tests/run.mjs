// 周末去哪* 端到端测试
//
//   cd tests && npm install && npm test            # 默认：强制断网，只用本地静态文件 + 固定数据
//   ONLINE=1 npm test                              # 额外跑多人在线用例：打本地 wrangler dev（127.0.0.1:8787）
//   ONLINE=1 API=https://… npm test                # 只有显式给出 API 才会打别的后端；用例结束一定删除自己建的局
//   PW_CHROMIUM=/path/to/chrome npm test           # 指定浏览器（默认用 playwright 自带的 chromium）
//   ONLY=onboarding npm test                       # 只跑名字里含关键字的用例
//
// 断网方式有两层：页面里 localStorage.wk2_api_base 指向不可达的 127.0.0.1:9；
// 浏览器层面拦截所有非本机请求（天气、Leaflet、地图瓦片由下面的固定数据提供，其余一律 abort）。
import { chromium } from "playwright";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, mkdirSync } from "node:fs";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ART = join(ROOT, "tests", "artifacts");
mkdirSync(ART, { recursive: true });
const require = createRequire(import.meta.url);

// ---------- 本地静态服务器 ----------
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".webp": "image/webp", ".md": "text/markdown", ".json": "application/json" };
const server = http.createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = join(ROOT, path === "/" ? "index.html" : path);
  if (!file.startsWith(ROOT) || file.includes("/tests/") || file.includes("/backend/")) { res.writeHead(404); return res.end(); }
  try { const buf = await readFile(file); res.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream" }); res.end(buf); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

// ---------- 固定数据 ----------
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// 周六降水 70%，周日 20%：发现页的理由必须和这组数字对得上
const RAIN = { 6: 70, 0: 20 };
const rainOf = (date) => RAIN[new Date(date + "T00:00:00").getDay()] ?? 10;
function weatherFixture(url) {
  const u = new URL(url);
  if (u.searchParams.get("daily")) {
    const days = Array.from({ length: 7 }, (_, i) => ymd(new Date(Date.now() + i * 864e5)));
    return { daily: { time: days, weathercode: days.map((d) => (rainOf(d) > 50 ? 61 : 1)), temperature_2m_max: days.map(() => 24), temperature_2m_min: days.map(() => 18), precipitation_probability_max: days.map(rainOf) } };
  }
  const d = u.searchParams.get("start_date"), r = rainOf(d);
  return { hourly: { time: Array.from({ length: 24 }, (_, h) => `${d}T${pad(h)}:00`), temperature_2m: Array(24).fill(22), precipitation_probability: Array(24).fill(r), weathercode: Array(24).fill(r > 50 ? 61 : 1) } };
}
const TILE = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==", "base64");
const LEAFLET_DIR = dirname(require.resolve("leaflet/dist/leaflet.js"));

// net: { weather: "ok" | "off", leaflet: "ok" | "off", tiles: "ok" | "off" }
async function newCtx(browser, { net = {}, geo, width = 375, online } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 812 }, deviceScaleFactor: 1, ...(geo ? { geolocation: geo, permissions: ["geolocation"] } : {}) });
  const apiBase = online ? process.env.API || "http://127.0.0.1:8787" : "http://127.0.0.1:9";
  await ctx.addInitScript((b) => { try { localStorage.setItem("wk2_api_base", b); } catch {} }, apiBase);
  await ctx.route("**/*", async (route) => {
    const url = route.request().url();
    if (url.startsWith(BASE)) return route.continue();
    if (online && url.startsWith(apiBase)) return route.continue();
    if (url.includes("api.open-meteo.com") && net.weather === "ok") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(weatherFixture(url)) });
    if (url.includes("cdnjs.cloudflare.com/ajax/libs/leaflet") && net.leaflet !== "off") {
      const f = url.endsWith(".css") ? "leaflet.css" : "leaflet.js";
      return route.fulfill({ status: 200, contentType: f.endsWith("css") ? "text/css" : "text/javascript", body: await readFile(join(LEAFLET_DIR, f)) });
    }
    if ((url.includes("tile.openstreetmap.org") || url.includes("basemaps.cartocdn.com")) && net.tiles === "ok") return route.fulfill({ status: 200, contentType: "image/png", body: TILE });
    return route.abort();                                   // 其余外网一律不通
  });
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|ERR_FAILED|net::/.test(m.text())) page.errors.push(m.text()); });
  page.on("dialog", (d) => d.accept("测试路人"));
  return { ctx, page };
}

// ---------- 断言与版面检查 ----------
class Fail extends Error {}
const expect = (cond, msg) => { if (!cond) throw new Fail(msg); };
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}]/u;
// 每一屏都跑：可点元素不能太小、输入框不能被压扁、不能横向溢出、界面文字里不能有 emoji
async function audit(page, where) {
  // 先等一次性的进场动画播完（滑入、弹出），无限循环的动画（滚动条、定位脉冲）不等
  await page.evaluate(() => Promise.all(document.getAnimations().filter((x) => x.playState === "running" && isFinite(x.effect?.getComputedTiming().iterations ?? 1)).map((x) => x.finished.catch(() => {}))));
  const r = await page.evaluate(() => {
    const vw = innerWidth, bad = [];
    const vis = (el) => { const s = getComputedStyle(el), b = el.getBoundingClientRect(); return s.display !== "none" && s.visibility !== "hidden" && b.width > 0 && b.height > 0 && !el.closest("[hidden]"); };
    const name = (el) => `${el.tagName.toLowerCase()}.${[...el.classList].join(".")} "${(el.textContent || el.placeholder || el.value || "").trim().slice(0, 16)}"`;
    for (const el of document.querySelectorAll("#app button, #app a, #app input, #app select, #app textarea, #layer button, #layer input, #layer textarea, #float button")) {
      if (!vis(el) || el.type === "file" || el.closest(".leaflet-container, .map-attr, .foot")) continue;   // 署名 / 页脚里的文字链接不算操作按钮
      const b = el.getBoundingClientRect();
      if (b.width < 24 || b.height < 24) bad.push(`太小 ${Math.round(b.width)}×${Math.round(b.height)}: ${name(el)}`);
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && el.type !== "checkbox" && b.width < 60) bad.push(`输入框被压扁 ${Math.round(b.width)}px: ${name(el)}`);
      if (b.right > vw + 1 && !el.closest(".chips, .rail, .gallery, .cover-pick, .ticker, .strip")) bad.push(`超出屏幕右边 ${Math.round(b.right - vw)}px: ${name(el)}`);
    }
    const chrome = [...document.querySelectorAll(".tabbar, .top, .action-bar, .onb, .sheet, .add-menu, .seg, .chips, .map-top, .map-card")].filter(vis).map((e) => e.innerText).join(" ");
    return { bad, scrollW: document.documentElement.scrollWidth, vw, chrome };
  });
  expect(r.scrollW <= r.vw + 1, `${where}：页面横向溢出 ${r.scrollW - r.vw}px`);
  expect(!r.bad.length, `${where}：\n    ${r.bad.slice(0, 6).join("\n    ")}`);
  const m = r.chrome.match(EMOJI);
  expect(!m, `${where}：界面文字里出现了 emoji「${m?.[0]}」（设计系统规定界面不用 emoji）`);
}
const noErrors = (page, where) => expect(!page.errors.length, `${where}：页面报错 ${page.errors.slice(0, 3).join(" | ")}`);
const shot = (page, n) => page.screenshot({ path: join(ART, `${n}.png`) }).catch(() => {});

// 走完引导（每一步都做版面检查）
async function onboardAll(page, tag, { nick = "测试员", age = "21" } = {}) {
  const step = async (n) => { await page.waitForTimeout(120); await audit(page, `${tag} 第 ${n} 步`); };
  await step(1); await page.fill(".big-in", nick); await page.click("#onbNext");
  await step(2); await page.click(".opt >> nth=0"); await page.click("#onbNext");
  await step(3);
  const ageBox = await page.$eval(".age-row .big-in", (e) => { const b = e.getBoundingClientRect(); return [b.width, b.height]; });
  expect(ageBox[0] > 120 && ageBox[1] > 40, `${tag} 年龄输入框尺寸异常 ${ageBox.map(Math.round).join("×")}（历史 bug：被 .num 样式压成小圆点）`);
  await page.fill(".age-row .big-in", age); await page.click("#onbNext");
  await step(4); await page.click('.chip:has-text("上海纽约大学")'); await page.click("#onbNext");
  await step(5); await page.fill(".big-in.area", "上午练琴，下午看展"); await page.click("#onbNext");
  await step(6); await page.click('.chip:has-text("展览")'); await page.click('.chip:has-text("Citywalk")'); await page.click("#onbNext");
  await step(7); await page.click('.opt:has-text("≤ ¥100")'); await page.click("#onbNext");
  await step(8); await page.click('.opt:has-text("2 人")'); await page.click("#onbNext");
  await step(9);
}
const skipOnboarding = async (page) => { await page.goto(BASE); await page.click("button.browse"); await page.waitForTimeout(300); };

// ---------- 用例 ----------
const cases = [];
const test = (name, fn) => cases.push({ name, fn });

for (const width of [375, 1280]) {
  test(`引导九步：每一步版面正常（${width}px）`, async (browser) => {
    const { page } = await newCtx(browser, { width, net: { weather: "ok", leaflet: "ok", tiles: "ok" }, geo: { latitude: 31.2150, longitude: 121.4460 } });
    await page.goto(BASE);
    await onboardAll(page, `新用户 ${width}px`);
    await page.click('button:has-text("允许定位")');
    await page.waitForURL(/#\/map/, { timeout: 8000 });
    const prefs = await page.evaluate(() => S.prefs);
    expect(prefs.age === 21 && prefs.school === "上海纽约大学" && prefs.gender === "female" && !prefs.demo, "引导结束后资料没有正确保存：" + JSON.stringify(prefs));
    noErrors(page, "引导");
  });
}

test("编辑资料：重新走一遍引导，每一步版面正常且带着原来的值", async (browser) => {
  const { page } = await newCtx(browser, { net: { weather: "ok" } });
  await page.goto(BASE); await onboardAll(page, "首次"); await page.click('button:has-text("以后再说")');
  await page.goto(BASE + "#/me"); await page.click('button:has-text("编辑资料")');
  expect(await page.inputValue(".big-in") === "测试员", "编辑资料第 1 步没有带出原来的昵称");
  await audit(page, "编辑资料 第 1 步"); await page.click("#onbNext");
  await audit(page, "编辑资料 第 2 步"); await page.click("#onbNext");
  await audit(page, "编辑资料 第 3 步");
  expect(await page.inputValue(".age-row .big-in") === "21", "编辑资料第 3 步没有带出原来的年龄");
  const w = await page.$eval(".age-row .big-in", (e) => e.getBoundingClientRect().width);
  expect(w > 120, `编辑资料第 3 步年龄输入框只有 ${Math.round(w)}px 宽`);
  await shot(page, "edit-age");
  for (let i = 4; i <= 9; i++) { await page.click("#onbNext"); await audit(page, `编辑资料 第 ${i} 步`); }
  noErrors(page, "编辑资料");
});

test("先逛逛：示例偏好要说明白，不能说「你喜欢…」", async (browser) => {
  const { page } = await newCtx(browser, { net: { weather: "ok" } });
  await skipOnboarding(page);
  expect(/#\/discover/.test(page.url()), "先逛逛之后没有进入发现页");
  await page.waitForSelector(".pc .prompt-a");
  expect(await page.textContent(".pref-bar") .then((t) => t.includes("按示例偏好推荐")), "发现页没有标明「按示例偏好推荐」");
  const reasons = await page.$$eval(".prompt-a", (els) => els.map((e) => e.textContent));
  expect(!reasons.some((r) => r.includes("你喜欢")), "示例偏好下仍然出现「你喜欢…」：" + reasons.find((r) => r.includes("你喜欢")));
  await audit(page, "发现页（示例偏好）");
  await page.click('.pref-bar button:has-text("改成我的")');
  expect(/#\/onboarding/.test(page.url()), "「改成我的」没有进入引导");
});

test("天气理由和天气数据一致（周六 70%、周日 20%）", async (browser) => {
  const { page } = await newCtx(browser, { net: { weather: "ok" } });
  await skipOnboarding(page);
  await page.waitForFunction(() => S.wx && !S.wx.mock);
  const res = await page.evaluate(() => PLACES.map((p) => ({ id: p.id, indoor: p.indoor, days: p.days, reasons: score(p).reasons })));
  for (const r of res) for (const t of r.reasons) {
    const m = t.match(/(周六|周日|周末两天)降水(?:只有)? (\d+)%/);
    if (!m) continue;
    const expected = m[1] === "周六" ? 70 : m[1] === "周日" ? 20 : 20;
    expect(+m[2] === expected, `${r.id} 的理由「${t}」和固定天气（${m[1]} ${expected}%）对不上`);
    if (t.includes("适合在外面")) expect(!r.indoor && +m[2] < 30, `${r.id} 的理由「${t}」在降水 ${m[2]}% 时说适合在外面`);
  }
  expect(res.find((r) => r.id === "a2").reasons.every((t) => !t.includes("适合在外面")), "安福路市集只在周六（70% 降水）开，却说适合在外面");
  await audit(page, "发现页（有天气）");
});

test("拿不到天气时不输出任何天气结论（发现页 + 规则版排局）", async (browser) => {
  const { page } = await newCtx(browser, { net: { weather: "off" } });
  await skipOnboarding(page);
  await page.waitForTimeout(3500);
  const all = await page.evaluate(() => PLACES.flatMap((p) => score(p).reasons));
  // 天气接口失败时发现页会退回「示例天气」并在滚动条上标明；这里只要求理由里的数字和示例天气一致，不能出现无依据的判断
  const wx = await page.evaluate(() => S.wx);
  if (!wx) expect(!all.some((t) => /降水|天气|下雨|户外/.test(t)), "天气未知时仍然输出了天气理由");
  else expect(wx.mock, "天气接口被拦截，却没有标记为示例天气");
  await page.evaluate(() => { WX.clear(); });
  await page.click(".tab.plus"); await page.click('.add-item:has-text("AI 局长")');
  await page.click('button:has-text("排一个局")');
  await page.waitForSelector(".agent-plan", { timeout: 9000 });
  const plan = await page.textContent(".agent-plan");
  const hourly = await page.evaluate(() => [...WX.values()].some((v) => v.mock));
  if (!hourly) expect(!/适合在外面|降水/.test(plan), "规则版在天气未知时给出了天气判断：" + plan.slice(0, 120));
  expect(!/mock|rules-v0|\/v1\//.test(plan), "规则版界面里露出了技术细节（mock / rules-v0 / 接口路径）");
  await audit(page, "规则版排局");
});

test("发现页：内容层切换 + 条件叠加", async (browser) => {
  const { page } = await newCtx(browser, { net: { weather: "ok" } });
  await skipOnboarding(page);
  expect(await page.$$eval(".rail .mtk", (x) => x.length) > 0, "首屏没有露出「这周末在招人的局」");
  const count = async () => page.textContent(".count");
  await page.click('.conds .chip:has-text("雨天也能去")');
  const rainy = await count();
  expect(rainy.includes("推荐 + 雨天也能去"), "条件没有显示为叠加：" + rainy);
  const nRainy = await page.$$eval(".pc", (x) => x.length);
  await page.click('.seg button:has-text("可加入的局")');
  expect((await count()).includes("可加入的局 + 雨天也能去"), "切换内容层后条件丢了");
  expect(await page.$$eval(".pc", (x) => x.length) === 0, "「可加入的局」层里不应该出现地点卡");
  await page.click('.seg button:has-text("推荐")');
  await page.click('.conds .chip:has-text("雨天也能去")');
  expect(await page.$$eval(".pc", (x) => x.length) > nRainy, "再点一次条件没有取消");
  await audit(page, "发现页（筛选）");
});

test("核心流程（离线）：想去 → 开局加两站 → 预算 → 进行中 → 到场打卡 → 收局", async (browser) => {
  const { page } = await newCtx(browser, { net: { weather: "ok" }, geo: { latitude: 31.2066, longitude: 121.4389 } });
  await skipOnboarding(page);
  await page.goto(BASE + "#/place/a1"); await audit(page, "地点页");
  await page.click('.action-bar .ab:has-text("想去")');
  await page.click('.action-bar .cta:has-text("在这开局")');
  await page.waitForSelector(".stop-row"); await audit(page, "开局编辑器");
  await page.click("button.add-stop"); await page.waitForSelector(".sheet .pick-row");
  expect(await page.textContent(".sheet").then((t) => t.includes("想去")), "添加地点里没有「想去」分组");
  await audit(page, "添加地点弹层");
  await page.click('.sheet .pick-row:has-text("武康路")');
  const nums = await page.$$eval(".budget-nums div", (d) => Object.fromEntries(d.map((x) => [x.querySelector("small").textContent, x.querySelector("b").textContent])));
  expect(nums["人均预算"] && nums["人均预估"] && nums["总预算"], "预算卡没有区分人均预算 / 人均预估：" + JSON.stringify(nums));
  expect(nums["人均预估"] === "¥100", `两站（西岸 ¥100 + 武康路 免费）的人均预估应为 ¥100，实际 ${nums["人均预估"]}`);
  await page.click('.seg button:has-text("链接可见")');
  await page.click(".action-bar .cta");
  await page.waitForSelector(".sheet #shareLink");
  expect((await page.inputValue("#shareLink")).includes("#/s/"), "离线时分享链接应该是快照链接");
  await audit(page, "分享弹层");
  await page.keyboard.press("Escape");
  expect(!(await page.$(".sheet")), "Esc 没有关闭弹层");
  await page.click('button:has-text("演示用")');
  await page.waitForSelector('.action-bar .cta:has-text("打卡这一站")');
  await audit(page, "进行中的局");
  await page.click('.action-bar .cta:has-text("打卡这一站")');
  await page.click('.sheet .chip:has-text("2.")');
  await page.click("#ciBtn");
  await page.waitForSelector(".stamp");
  expect(await page.textContent(".stamp").then((t) => t.includes("到场认证")), "在武康路 500m 内打卡却没有到场认证");
  await page.waitForSelector(".stamp", { state: "detached", timeout: 5000 });
  await page.click('.ab:has-text("收局")');
  await page.waitForSelector('.stk:has-text("已完成")');
  await page.goto(BASE + "#/me");
  expect(await page.$$eval(".tl-item", (x) => x.length) === 1, "足迹里应该有 1 条打卡");
  await audit(page, "我");
  noErrors(page, "核心流程");
});

test("分享弹层：关闭按钮可用，改日期后不残留旧弹层", async (browser) => {
  const { page } = await newCtx(browser, { net: { weather: "ok" } });
  await skipOnboarding(page);
  await page.goto(BASE + "#/new?place=a7"); await page.click(".action-bar .cta");
  await page.waitForSelector(".sheet .sheet-x");
  await page.click(".sheet .sheet-x");
  expect(!(await page.$(".sheet")), "关闭按钮没有关掉弹层");
  await page.click('.ab:has-text("分享")'); await page.waitForSelector(".sheet");
  await page.evaluate(() => document.querySelector('button.linkish')?.click());
  await page.waitForTimeout(300);
  expect(!(await page.$(".sheet")), "改日期之后旧的分享弹层还在");
});

test("地图正常：底图、16 个标记、点开迷你卡、定位", async (browser) => {
  const { page } = await newCtx(browser, { net: { weather: "ok", leaflet: "ok", tiles: "ok" }, geo: { latitude: 31.2150, longitude: 121.4460 } });
  await skipOnboarding(page);
  await page.goto(BASE + "#/map");
  await page.waitForSelector(".pin", { timeout: 8000 });
  await page.waitForFunction(() => !document.querySelector("#mapStatus")?.textContent.trim(), null, { timeout: 8000 });
  expect(await page.$$eval(".pin", (x) => x.length) === 16, "地图上应该有 16 个标记");
  await audit(page, "地图");
  await page.click(".pin >> nth=0");
  await page.waitForSelector(".map-card .mc-actions");
  await audit(page, "地图迷你卡");
  await page.click(".loc-btn");
  await page.waitForSelector(".me-dot", { timeout: 8000 });
  noErrors(page, "地图");
});

test("地图瓦片被拦截：换源后仍失败 → 明确提示 + 标记还能点 + 列表入口", async (browser) => {
  const { page } = await newCtx(browser, { net: { weather: "ok", leaflet: "ok", tiles: "off" } });
  await skipOnboarding(page);
  await page.goto(BASE + "#/map");
  await page.waitForSelector(".map-fail", { timeout: 16000 });
  expect(await page.$$eval(".pin", (x) => x.length) === 16, "底图失败时标记也不见了");
  await shot(page, "map-tiles-blocked");
  await page.click('.map-fail button:has-text("看列表")');
  expect(/#\/discover/.test(page.url()), "「看列表」没有回到发现页");
});

test("Leaflet 加载失败：不留空白地图", async (browser) => {
  const { page } = await newCtx(browser, { net: { weather: "ok", leaflet: "off" } });
  await skipOnboarding(page);
  await page.goto(BASE + "#/map");
  await page.waitForSelector(".map-fail", { timeout: 14000 });
  expect(await page.textContent(".map-fail").then((t) => t.includes("看列表")), "失败提示里没有列表入口");
});

test("离线快照链接：另一个人能打开并加入", async (browser) => {
  const a = await newCtx(browser, { net: { weather: "ok" } });
  await skipOnboarding(a.page);
  await a.page.goto(BASE + "#/new?place=a7"); await a.page.click(".action-bar .cta");
  const link = await a.page.inputValue("#shareLink");
  const b = await newCtx(browser, { net: { weather: "ok" } });
  await b.page.goto(link);
  await b.page.click('button:has-text("加入这个局")');
  await b.page.click("button.browse");
  await b.page.waitForURL(/#\/session\//);
  const people = await b.page.$$eval(".person:not(.empty) .person-main b", (x) => x.map((e) => e.textContent));
  expect(people.length === 2 && people.includes("测试路人"), "加入后成员列表不对：" + people.join("、"));
  await audit(b.page, "加入后的局");
});

test("所有主要页面：无报错、版面正常", async (browser) => {
  const { page } = await newCtx(browser, { net: { weather: "ok", leaflet: "ok", tiles: "ok" } });
  await skipOnboarding(page);
  for (const r of ["#/discover", "#/place/a8", "#/session/g11", "#/session/s6", "#/new?place=a12", "#/sessions", "#/me"]) {
    await page.goto(BASE + r); await page.waitForTimeout(400); await audit(page, r);
  }
  for (const seg of ["收藏", "关于"]) { await page.click(`.seg button:has-text("${seg}")`); await audit(page, `#/me ${seg}`); }
  await page.click(".tab.plus"); await audit(page, "＋ 菜单");
  noErrors(page, "主要页面");
});

// ---------- 在线用例（默认跳过；只打本地 wrangler dev，除非显式给 API） ----------
if (process.env.ONLINE) {
  test("在线：两个人开局、加入、看到对方（结束后删除）", async (browser) => {
    const created = [];
    const a = await newCtx(browser, { online: true, net: { weather: "ok" } });
    try {
      await a.page.goto(BASE); await a.page.fill(".big-in", "测试-组织者"); await a.page.click("#onbNext"); await a.page.click(".skip");
      await a.page.waitForFunction(() => API.online === true, null, { timeout: 5000 });
      await a.page.goto(BASE + "#/new?place=a7"); await a.page.click(".action-bar .cta");
      await a.page.waitForURL(/#\/session\/s_/); created.push(a.page.url().split("/").pop());
      const b = await newCtx(browser, { online: true, net: { weather: "ok" } });
      await b.page.goto(await a.page.inputValue("#shareLink"));
      await b.page.click('button:has-text("加入这个局")'); await b.page.click("button.browse");
      await b.page.waitForURL(/#\/session\//);
      await a.page.reload(); await a.page.waitForTimeout(1500);
      expect(await a.page.$$eval(".person:not(.empty)", (x) => x.length) === 2, "组织者看不到新加入的人");
    } finally {
      for (const id of created) await a.page.evaluate((i) => API.deleteSession(i).catch(() => {}), id);
    }
  });
}

// ---------- 执行 ----------
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const only = process.env.ONLY;
let pass = 0, fail = 0;
for (const c of cases) {
  if (only && !c.name.includes(only)) continue;
  const t0 = Date.now();
  try {
    await c.fn(browser);
    pass++; console.log(`  ✓ ${c.name} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } catch (e) {
    fail++; console.log(`  ✗ ${c.name}\n    ${e instanceof Fail ? e.message : e.stack.split("\n").slice(0, 3).join("\n    ")}`);
  }
  for (const ctx of browser.contexts()) await ctx.close();
}
await browser.close(); server.close();
console.log(`\n${pass} 通过，${fail} 失败${fail ? `（截图在 tests/artifacts/）` : ""}`);
process.exit(fail ? 1 : 0);
