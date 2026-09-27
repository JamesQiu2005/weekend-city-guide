// AI 局长：在线走 /v1/agent/*（邮箱验证 + DeepSeek），离线 / 未配置时退回规则版。依赖 app.js 里的全局函数。
// ---------- AI 局长（P2：规则 mock，打分 + 距离贪心） ----------
// 在线：先查 LLM 是否可用、邮箱是否已验证；离线或 LLM 不可用时用规则版
async function openAgent() {
  if (!online()) return openAgentRules();
  openSheet(`<h2 class="sheet-t">AI 局长</h2><div class="agent-think">连接中…</div>`);
  let st;
  try { await ensureMe(); st = await API.agentStatus(); } catch (e) { apiErr(e); return openAgentRules(); }
  if (!st.llm) return openAgentRules("AI 模型还没在服务器上配置，先用规则版排局");
  if (!st.verified) return openAgentEmail(st);
  openAgentLLM(st);
}
const AGENT_ERR = { DAILY_LIMIT: "今天的次数用完了，明天再来", GLOBAL_LIMIT: "AI 局长今天太忙了（全站额度用完），明天再来", TURN_LIMIT: "这个对话的轮数用完了，开个新对话吧", BUSY: "上一个请求还在处理，稍等一下", RATE_LIMITED: "操作太频繁了，稍后再试", TOO_MANY_ATTEMPTS: "错误次数太多，请重新获取验证码", CODE_INVALID: "验证码不对", CODE_EXPIRED: "验证码过期了，重新获取一个", INVALID_EMAIL: "邮箱格式不对", EMAIL_NOT_CONFIGURED: "邮件服务还没配置好", EMAIL_SEND_FAILED: "邮件发送失败，换个邮箱试试", DAILY_LIMIT_MAIL: "今天发出的验证码太多了", LLM_UNAVAILABLE: "模型暂时不可用", LLM_BAD_OUTPUT: "模型这次没答好，再试一次", LLM_NOT_CONFIGURED: "模型还没配置" };
function openAgentEmail(st) {
  F = { email: "", code: "", cool: 0 };
  openSheet(`<h2 class="sheet-t">AI 局长</h2>
    <div class="sub">AI 局长由大模型驱动，会读取当天逐小时天气、地点介绍、公开攻略和你的偏好来排局。为了防止额度被滥用，第一次使用需要邮箱验证。</div>
    <div class="field"><label>邮箱</label><div class="row" style="gap:8px"><input class="input" id="agEmail" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com" oninput="F.email=this.value.trim()"><button class="btn-sm neon" id="agSend" onclick="agentSendCode()">发验证码</button></div></div>
    <div class="field"><label>验证码</label><div class="row" style="gap:8px"><input class="input" id="agCode" inputmode="numeric" maxlength="6" placeholder="6 位数字" oninput="F.code=this.value.trim()"><button class="btn-sm" onclick="agentVerify()">验证</button></div></div>
    <div class="hint">邮箱只用来验证，不会交给模型，也不会公开。一个邮箱同一时间只能在一处登录；每天 ${st.perDay} 次，每个对话最多 ${st.maxTurns} 轮。</div>
    <div id="agMsg" class="hint"></div>
    <button class="linkish" style="margin-top:14px" onclick="openAgentRules()">先不验证，用规则版排局 →</button>`);
}
async function agentSendCode() {
  const btn = $("#agSend");
  if (!F.email) { toast("先填邮箱"); return; }
  btn.disabled = true;
  try {
    const r = await API.agentEmailStart(F.email);
    $("#agMsg").textContent = `验证码已发到 ${r.emailMasked}，10 分钟内有效。${r.devCode ? `（本地开发：${r.devCode}）` : ""}`;
    let n = 60; const tick = () => { if (!document.body.contains(btn)) return; btn.textContent = n ? `${n}s` : "重发"; btn.disabled = n > 0; if (n-- > 0) setTimeout(tick, 1000); }; tick();
    $("#agCode").focus();
  } catch (e) {
    btn.disabled = false;
    $("#agMsg").textContent = AGENT_ERR[e.code] || e.message;
    if (e.code === "EMAIL_NOT_CONFIGURED") $("#agMsg").innerHTML += `，<button class="linkish" onclick="openAgentRules()">先用规则版</button>`;
  }
}
async function agentVerify() {
  if (!/^\d{6}$/.test(F.code || "")) { toast("填 6 位验证码"); return; }
  try { await API.agentEmailVerify(F.email, F.code); toast("验证成功 ✓"); openAgentLLM(await API.agentStatus()); }
  catch (e) { $("#agMsg").textContent = AGENT_ERR[e.code] || e.message; }
}
function agentFields() {
  return `<div class="field" style="display:flex;gap:10px">
      <div style="flex:1"><label>几个人</label><input class="input" type="number" min="1" max="12" value="${F.people}" oninput="F.people=Math.max(1,+this.value||1)"></div>
      <div style="flex:1"><label>总预算 ¥</label><input class="input" type="number" min="0" value="${F.total}" oninput="F.total=+this.value||0"></div></div>
    <div class="field"><label>哪天</label><input class="input" type="date" min="${today()}" value="${F.date}" onchange="F.date=this.value"></div>
    <div class="field"><label>想玩什么</label><div class="chips">${TYPES.map((t) => `<button class="chip ${F.likes.includes(t) ? "on" : ""}" onclick="F.likes=F.likes.includes('${t}')?F.likes.filter(x=>x!=='${t}'):[...F.likes,'${t}'];this.classList.toggle('on')">${t}</button>`).join("")}</div></div>
    <div class="field"><label>几站</label><div class="chips">${[1, 2, 3, 4].map((n) => `<button class="chip ${F.n === n ? "on" : ""}" onclick="F.n=${n};this.parentElement.querySelectorAll('.chip').forEach(c=>c.classList.remove('on'));this.classList.add('on')">${n} 站</button>`).join("")}</div></div>`;
}
const agentDefaults = () => ({ people: S.prefs.groupSize === 3 ? 4 : S.prefs.groupSize === 5 ? 5 : Math.max(2, S.prefs.groupSize), total: 400, likes: [...S.prefs.likes], n: 3, date: nextSaturday() });
function openAgentLLM(st) {
  F = { ...agentDefaults(), idea: "", thread: null, st };
  openSheet(`<h2 class="sheet-t">AI 局长</h2>
    <div class="agent-quota">✓ ${esc(st.emailMasked)} · 今天还剩 <b id="agLeft">${st.remainingToday}</b> 次 · 每个对话最多 ${st.maxTurns} 轮</div>
    ${agentFields()}
    <div class="field"><label>还有什么想法（可选）</label><textarea class="input" maxlength="300" style="min-height:70px" placeholder="比如：想拍照，不想走太多路，晚上想吃点好的" oninput="F.idea=this.value"></textarea></div>
    <button class="cta neon" id="agRun" style="margin-top:12px" onclick="runAgentLLM()">让 AI 局长排一个局</button>
    <div id="agentOut"></div>
    <div class="hint" style="margin-top:12px">由 DeepSeek 驱动，密钥只保存在服务器上。模型只能从地点库里选，预算和地点由服务器二次校验。</div>`);
}
async function runAgentLLM(followUp) {
  const out = $("#agentOut"), btn = followUp ? $("#agFollowBtn") : $("#agRun");
  if (btn) btn.disabled = true;
  if (!followUp) { F.thread = null; out.innerHTML = ""; }
  out.insertAdjacentHTML("beforeend", `<div class="agent-think" id="agThink">正在看天气、翻攻略、算预算…</div>`);
  let r;
  try {
    r = followUp
      ? await API.agentChat({ threadId: F.thread, message: followUp })
      : await API.agentChat({ date: F.date, people: F.people, budgetTotal: F.total, likes: F.likes, maxStops: F.n, ...(F.idea.trim() ? { message: F.idea.trim() } : {}) });
  } catch (e) {
    $("#agThink")?.remove(); if (btn) btn.disabled = false;
    if (e.code === "EMAIL_NOT_VERIFIED") { toast("这个邮箱已在别处登录，请重新验证"); return openAgentEmail(F.st); }
    out.insertAdjacentHTML("beforeend", `<div class="agent-err">${esc(AGENT_ERR[e.code] || e.message)}${/^LLM_/.test(e.code) ? ` · <button class="linkish" onclick="openAgentRules()">改用规则版</button>` : ""}</div>`);
    return;
  }
  $("#agThink")?.remove(); if (btn) btn.disabled = false;
  F.thread = r.threadId; $("#agLeft").textContent = r.remainingToday;
  $("#agFollow")?.remove();
  const plan = r.draft ? draftFromApi(r.draft) : null;
  const why = Object.fromEntries((r.rationale || []).map((x) => [x.placeId, x.reasons || []]));
  out.insertAdjacentHTML("beforeend", `<div class="agent-turn">
    ${followUp ? `<div class="agent-me">${esc(followUp)}</div>` : ""}
    <div class="agent-bubble">${esc(r.reply || "排好了")}${r.tip ? `<div class="mini" style="margin-top:4px">💡 ${esc(r.tip)}</div>` : ""}</div>
    ${plan ? agentPlanHtml(plan.stops.map((x) => ({ p: PL[x.placeId], reasons: why[x.placeId] || [] })), plan.stops, Math.round(r.estTotal / Math.max(1, plan.cap)), F.total / F.people, `DeepSeek · 第 ${r.turn}/${r.maxTurns} 轮`, "", `window.__agentDraft=${esc(JSON.stringify(plan))};closeSheet();go('#/new?from=agent')`) : ""}
  </div>`);
  if (r.turn < r.maxTurns) out.insertAdjacentHTML("beforeend", `<div class="composer" id="agFollow" style="margin:10px 0 0"><input class="input" id="agFollowIn" maxlength="300" placeholder="继续调整：比如「换成更便宜的」" onkeydown="if(event.key==='Enter')agentFollow()"><button class="btn-sm" id="agFollowBtn" onclick="agentFollow()">发送</button></div>`);
  else out.insertAdjacentHTML("beforeend", `<div class="hint">这个对话的 ${r.maxTurns} 轮用完了，点上面的按钮可以开个新对话。</div>`);
  $("#agFollowIn")?.scrollIntoView({ block: "nearest" });
}
function agentFollow() { const v = ($("#agFollowIn")?.value || "").trim(); if (v) runAgentLLM(v); }
function draftFromApi(d) {
  const draft = { ...newDraft([]), title: d.title || "", titleTouched: !!d.title, date: d.date || F.date, cap: d.cap || F.people, budget: { total: d.budget?.total ?? F.total, mode: d.budget?.mode || "AA" }, visibility: d.visibility || "link" };
  draft.stops = (d.stops || []).filter((x) => PL[x.placeId]).map((x) => ({ placeId: x.placeId, time: x.time || "14:00", estCost: x.estCost ?? PL[x.placeId].avgCost, note: x.note || "" }));
  return draft;
}
function openAgentRules(notice) {
  F = agentDefaults();
  openSheet(`<h2>AI 局长 · 规则版</h2><div class="sub">${notice ? esc(notice) : "告诉我人数、预算和想玩什么，帮你排一个局的草稿"}</div>
    ${agentFields()}
    <button class="cta neon" style="margin-top:16px" onclick="runAgent()">排一个局</button>
    <div id="agentOut"></div>
    <div class="hint" style="margin-top:12px">规则版：按你的偏好、预算、当天天气和站点之间的距离排一个草稿，排好后还可以再改。</div>`);
}
async function runAgent() {
  const out = $("#agentOut");
  out.innerHTML = `<div class="agent-think">正在看天气、算预算…</div>`;
  if (online()) {
    try {
      const r = await API.plan({ date: F.date, people: F.people, budgetTotal: F.total, likes: F.likes, maxStops: F.n });
      const d = r.draft;
      const draft = { ...newDraft([]), title: d.title || "", titleTouched: !!d.title, date: d.date || F.date, cap: d.cap || F.people, budget: { total: d.budget?.total ?? F.total, mode: d.budget?.mode || "AA" }, visibility: d.visibility || "link" };
      draft.stops = d.stops.filter((x) => PL[x.placeId]).map((x) => ({ placeId: x.placeId, time: x.time || "14:00", estCost: x.estCost ?? PL[x.placeId].avgCost, note: x.note || "" }));
      window.__agentPlan = draft;
      const why = Object.fromEntries((r.rationale || []).map((x) => [x.placeId, x.reasons || []]));
      out.innerHTML = agentPlanHtml(draft.stops.map((x) => ({ p: PL[x.placeId], reasons: why[x.placeId] || [] })), draft.stops, Math.round(draft.stops.reduce((a, x) => a + x.estCost, 0)), F.total / F.people, "规则版");
      return;
    } catch (e) { if (e.code !== "NO_PLAN") toast("服务器排局失败，改用本地规则"); else { out.innerHTML = `<div class="agent-think">预算内排不出这么多站，试试减少站数或提高预算</div>`; return; } }
  }
  const perHead = F.total / F.people;
  const prefs = { likes: F.likes.length ? F.likes : TYPES, budget: perHead, groupSize: F.people >= 5 ? 5 : F.people >= 3 ? 3 : F.people };
  // 先拉一遍候选地点当天下午的天气（同一网格只请求一次）
  // 等天气真正回来（最多 4 秒）；拿不到的就当「未知」，不写天气理由
  const loading = () => PLACES.some((p) => wxFor(p, F.date, "14:00")?.kind === "loading");
  for (let t = 0; t < 40 && loading(); t++) await new Promise((r) => setTimeout(r, 100));
  const md = F.date.slice(5).replace("-", "/");
  const rainOf = (p) => { const w = wxFor(p, F.date, "14:00"); return w && (w.kind === "ok" || w.kind === "mock") ? { rain: w.rain, label: `${md} 下午` } : null; };
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
  out.innerHTML = agentPlanHtml(picked, draft.stops, spent, perHead, "规则版", picked.length < F.n ? ` · 预算内只排得下 ${picked.length} 站` : "");
}
function agentPlanHtml(picked, stops, spent, perHead, engine, extra = "", useJs = "window.__agentDraft=window.__agentPlan;closeSheet();go('#/new?from=agent')") {
  return `<div class="agent-plan"><b>草稿：${picked.map((c) => shortName(c.p)).join(" → ")}</b>
    ${picked.map((c, i) => `<div class="agent-stop"><span class="num">${i + 1}</span><div><b>${esc(shortName(c.p))}</b> <span class="mini">${stops[i].time} · ${money(c.p.avgCost)}/人${i ? ` · 距上一站 ${km(picked[i - 1].p, c.p).toFixed(1)}km` : ""}</span>
      <div class="reasons">${c.reasons.slice(0, 3).map((r) => `<span class="reason">${esc(r)}</span>`).join("")}</div></div></div>`).join("")}
    <div class="mini" style="margin-top:6px">人均预估 ¥${spent} / 人均预算 ¥${Math.round(perHead)}${extra} · 引擎：${engine}</div>
    <button class="cta" style="margin-top:12px" onclick="${useJs}">用这个草稿开局 →</button></div>`;
}

