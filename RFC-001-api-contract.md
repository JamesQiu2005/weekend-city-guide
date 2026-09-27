# RFC-001 · 周末去哪* API 合约（v1）

> 状态：**已实现并部署** · 2026-09-27
> Base URL：`https://weekend-api.weekend-api.workers.dev`（Cloudflare Worker）
> 代码：`backend/`（零依赖 Worker + D1 + KV）· 冒烟测试：`backend/test/smoke.sh`（39 项，本地全部通过）
> 需求来源：`PRD.md` v0.2 §3–§4

---

## 1. 目标与非目标

**目标**：把 PRD v0.2 的「帖子即局」变成真正的多人数据。朋友打开链接能看到同一个局；加入、打卡、传照片、记账对所有成员实时可见（刷新或轮询即可）。

**非目标**：真实账号体系（手机号、微信登录）、支付、推送、WebSocket 实时推送、内容审核。

## 2. 架构

```
GitHub Pages（静态前端） ──HTTPS/JSON──▶ Cloudflare Worker `weekend-api`
                                         ├─ D1 `weekend-db`（SQLite）：users / places / sessions / stops / members / entries
                                         ├─ KV `MEDIA`：照片二进制（R2 未开通，见 §8）
                                         └─ Open-Meteo（天气代理 + 30 分钟边缘缓存）
```

## 3. 通用约定

| 项 | 约定 |
|---|---|
| 格式 | 请求和响应都是 JSON（`Content-Type: application/json`）。唯一例外是 `/v1/media` 上传和下载，走原始二进制 |
| 认证 | `Authorization: Bearer <token>`。token 是 64 位 hex，由 `POST /v1/users` 签发一次；服务端只存它的 sha256 |
| 时间 | 时间戳一律为毫秒 epoch（number）。`date` 为 `YYYY-MM-DD`，`time` 为 `HH:MM`，都按 **Asia/Shanghai** 解释 |
| ID | `u_…` 用户，`s_…` 局，`e_…` 动态，`m_….ext` 媒体；地点沿用 `a1…a16` |
| 错误 | 非 2xx 一律返回 `{ "error": { "code": "SESSION_FULL", "message": "…" } }`，**前端按 `code` 分支**，`message` 只用于调试 |
| CORS | 允许 `https://jamesqiu2005.github.io`，以及任意端口的 `http://localhost` 和 `http://127.0.0.1` |
| 分页 | 用游标：响应里有 `nextCursor`（为 `null` 表示没有下一页），请求时带 `?cursor=` |

**错误码**：`BAD_REQUEST` 400 · `UNAUTHORIZED` 401 · `FORBIDDEN` / `NOT_A_MEMBER` 403 · `NOT_FOUND` / `SESSION_NOT_FOUND` / `PLACE_NOT_FOUND` / `ENTRY_NOT_FOUND` / `MEDIA_NOT_FOUND` 404 · `METHOD_NOT_ALLOWED` 405 · `SESSION_FULL` / `SESSION_CLOSED` / `ALREADY_CHECKED_IN` / `ORGANIZER_CANNOT_LEAVE` 409 · `TOO_LARGE` 413 · `UNSUPPORTED_MEDIA` 415 · `NO_PLAN` 422 · `INTERNAL` 500

## 4. 数据类型

```ts
type Visibility = 'private' | 'link' | 'public'
type Status     = 'planning' | 'live' | 'done'     // 服务端推导：closedAt 有值 → done；date 在今天之后 → planning；date 是今天 → live；date 已过 → done

type User  = { id: string; name: string; avatar: string }       // avatar 为 1 个 emoji
type Place = { id; city; name; category; district; lat; lon; indoor: boolean; avgCost: number }
          // 列表和详情会额外带上 checkinCount、verifiedCount、openSessionCount（仅列表）

type Stop = {
  idx: number; placeId: string; place: Place;
  time: string | null; estCost: number;            // 人均预估；创建时不传则默认取 place.avgCost
  note: string | null; backupPlaceId: string | null;
  checkedInUserIds: string[]; verifiedUserIds: string[];
  allArrived: boolean                              // 全体成员都在这一站打过卡 → 前端出「到齐」合章
}

type Entry = {
  id; sessionId; type: 'checkin' | 'photo' | 'spend' | 'note' | 'system';
  stopIdx: number | null; placeId: string | null; author: User;
  text: string | null; photo: string | null; photoUrl: string | null;   // photo 是媒体 key，photoUrl 是可以直接显示的地址
  amount: number | null; rating: 1..5 | null;
  verified: boolean; distanceM: number | null;     // 服务端算：打卡坐标到该站的距离，≤ 500m 且精度 ≤ 1000m 才算认证
  createdAt: number
}

type Session = {
  id; title; cover: string | null;                 // cover 为 null → 前端用第一站地点的照片
  date; startTime: string | null; visibility: Visibility; status: Status; closedAt: number | null;
  organizer: User; cap: number;
  budget: { total; mode: 'AA' | 'treat'; perPerson; estPerPerson; estTotal; actualTotal; overBudget: boolean };
      // perPerson = total / cap；estPerPerson = 各站 estCost 之和；estTotal = estPerPerson × cap；
      // actualTotal = checkin 与 spend 动态的 amount 之和；overBudget = estTotal > total
  stops: Stop[];
  members: (User & { role: 'organizer' | 'member'; joinedAt: number })[];
  entries: Entry[];                                // 最新 200 条，按时间倒序
  counts: { members; entries; checkins; photos };
  viewer: { isMember: boolean; isOrganizer: boolean };
  createdAt; updatedAt
}

type SessionSummary = {                            // 信息流卡片
  id; title; cover; date; startTime; status; visibility; organizer: User;
  placeIds: string[]; stopCount; memberCount; memberAvatars: string[] /* 最多 5 个 */; cap;
  budget: { total; perPerson }; photoUrls: string[] /* 最多 4 张 */; checkinCount;
  role?: 'organizer' | 'member';                   // 只在 /v1/me/sessions 中出现
  updatedAt
}
```

## 5. 端点

### 5.1 系统
| 方法 | 路径 | 认证 | 说明 |
|---|---|---|---|
| GET | `/v1/health` | – | `{ ok, version, places, today }`，前端启动时用它探测后端是否在线 |

### 5.2 用户
| 方法 | 路径 | 认证 | 请求 | 响应 |
|---|---|---|---|---|
| POST | `/v1/users` | – | `{ name ≤20, avatar? }` | 201 `{ user, token }`。**token 只返回这一次**，存进 localStorage |
| GET | `/v1/me` | ✓ | – | `{ user, stats: { sessions, checkinsThisMonth, placesVisited, verifiedCheckins, spentTotal } }` |
| PATCH | `/v1/me` | ✓ | `{ name?, avatar? }` | `{ user }` |
| GET | `/v1/me/sessions?status=` | ✓ | status 可选 `planning` / `live` / `done` | `{ items: SessionSummary[] }`（最多 100 条，含私密局） |
| GET | `/v1/me/trail?cursor=&limit=` | ✓ | – | `{ items: (Entry & { session: {id,title,visibility}, placeName })[], nextCursor }`，即足迹页 |

### 5.3 地点
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/v1/places?city=上海` | `{ items: Place[] }`，每项带 `checkinCount`、`verifiedCount`、`openSessionCount` |
| GET | `/v1/places/:id` | `{ place, sessions: { open: SessionSummary[], done: SessionSummary[] } }`，只含公开局 |

> 地点的**文案、照片、推荐理由**仍由前端 `data.js` 按同一个 id 提供。服务端只保存坐标、室内外、人均和计数，用于地理认证、排局和聚合。**两边必须 id 一致**，坐标以 `backend/seed/places.json` 为准。

### 5.4 信息流
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/v1/feed?status=all\|open\|done&cursor=&limit=20` | 只返回公开局，按 `updatedAt` 倒序 → `{ items: SessionSummary[], nextCursor }`。`done` 就是攻略流 |

### 5.5 局
| 方法 | 路径 | 认证 | 请求 / 规则 | 响应 |
|---|---|---|---|---|
| POST | `/v1/sessions` | ✓ | `{ title ≤40, date, startTime?, cover?, visibility='link', cap=4 (1–20), budget: { total, mode='AA' }, stops: [{ placeId, time?, estCost?, note? ≤140, backupPlaceId? }] (1–8 项) }`；date 不能早于今天 | 201 `{ session }` |
| GET | `/v1/sessions/:id` | 可选 | private 局只有成员能看，其他人一律返回 404（不暴露局是否存在） | `{ session }` |
| PATCH | `/v1/sessions/:id` | 组织者 | 任意子集：`title` `cover` `date` `startTime` `visibility` `cap`（不能低于当前人数） `budget.{total,mode}` `stops`（**整体替换**） `changeNote`（写进系统动态，例如「第 2 站因降雨换成了室内备选」） `closed: true/false`（收局 / 重开） | `{ session }` |
| DELETE | `/v1/sessions/:id` | 组织者 | 软删除 | 204 |
| POST | `/v1/sessions/:id/join` | ✓ | 可以重复调用。满员返回 409 `SESSION_FULL`，已结束返回 409 `SESSION_CLOSED`，私密局返回 404 | `{ session }` |
| POST | `/v1/sessions/:id/leave` | ✓ | 组织者不能退出，返回 409 | 204 |

服务端会自动写入 `system` 动态：开局、加入、退出、改日期、改可见性、改路线、收局。

### 5.6 局内动态
| 方法 | 路径 | 认证 | 请求 | 响应 |
|---|---|---|---|---|
| POST | `/v1/sessions/:id/entries` | 成员 | `{ type: 'checkin'\|'photo'\|'spend'\|'note', stopIdx?, text? ≤500, photo? (媒体 key), amount?, rating? 1–5, coords?: { lat, lon, accuracy? } }` | 201 `{ entry, session }`，**返回更新后的整个局**，前端直接替换状态即可 |
| DELETE | `/v1/sessions/:id/entries/:entryId` | 作者或组织者 | system 动态不能删 | 204 |

规则：
- `checkin` 必须带 `stopIdx`；同一个人在同一站只能打一次卡，重复返回 409 `ALREADY_CHECKED_IN`。
- `photo` 必须带 `photo`，`spend` 必须带 `amount`，`note` 必须带 `text`。
- **到场认证在服务端判定**：前端只上传坐标，`verified` 字段由服务端写入。没有坐标照样可以打卡，只是 `verified: false`。

### 5.7 快速打卡
| 方法 | 路径 | 认证 | 请求 | 响应 |
|---|---|---|---|---|
| POST | `/v1/checkins` | ✓ | `{ placeId, text?, photo?, rating?, amount?, coords? }` | 201 `{ entry, session }`。自动创建一个**单人私密局**（日期为今天，1 站），之后可以 PATCH 改成公开 |

### 5.8 媒体
| 方法 | 路径 | 认证 | 说明 |
|---|---|---|---|
| POST | `/v1/media` | ✓ | **原始二进制请求体**，`Content-Type` 为 `image/jpeg`、`image/png`、`image/webp` 或 `image/gif`，≤ 2MB（前端先压缩到长边 1280、质量 0.8 的 JPEG/WebP）→ 201 `{ key, url }` |
| GET | `/v1/media/:key` | – | 返回图片本身，带一年的 immutable 缓存 |

流程：先调 `POST /v1/media` 拿到 `key`，再把 `key` 放进 entry 的 `photo` 字段；局封面可以直接用返回的 `url`。

### 5.9 天气
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/v1/weather?lat=&lon=&date=` | `{ available: true, date, summary: { tempMax, tempMin, precipProbMax, code }, hourly: [{ time:'HH:MM', temp, precipProb, code }] }`；超过 16 天返回 `{ available:false, reason:'beyond_horizon', availableFrom }`；上游失败返回 `{ available:false, reason:'upstream_error' }` |

说明：坐标按 0.01°（约 1km）取整后在边缘缓存 30 分钟。**每一站天气用该站 `time` 对应的整点 hourly 数据**；户外站且 `precipProb ≥ 50` 时标红（PRD §4.3）。前端也可以直连 Open-Meteo，但推荐走这个代理：可以缓存，而且国内访问多一条路。

### 5.10 AI 局长（rules-v0）
| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/v1/agent/plan` | `{ city?='上海', date?, people?=2, budgetTotal?, likes?: string[], rainy?: boolean, maxStops?=3 }` → `{ engine:'rules-v0', draft: <可以直接 POST /v1/sessions 的请求体>, rationale: [{placeId, reasons[]}], estTotal }` |

规则：偏好命中 +3、雨天室内 +2 / 户外 −3、按价格轻微惩罚；控制在预算内，站点彼此不超过 15km，最后按最近邻排序。**v0.3 换成 LLM 时路径和响应结构不变**，只改 `engine` 字段，前端不用动。

## 6. 前端集成要求（给前端 agent）

1. **API 客户端**：直接复制 `backend/client/api.js` 到前端根目录，在 `index.html` 里先于 `app.js` 引入。
2. **身份**：首次需要写操作时，用 onboarding 的昵称和头像调 `POST /v1/users`，把 `{user, token}` 存进 `localStorage.wk2_auth`（读写包 try/catch）。**只读浏览不需要身份**。
3. **在线 / 离线双模**：启动时请求 `GET /v1/health`，3 秒超时。
   - 在线：所有局、打卡、照片都走 API。
   - 离线（国内网络访问 workers.dev 可能失败）：退回 v0.2 的纯 localStorage 模式，页脚显示「离线演示模式」。**演示时不能出现白屏**。
4. **分享链接**改为 `#/session/<id>`（真实 id），不再把整个局编码进 base64；旧的 `#/s/<payload>` 和 `#/join/<payload>` 路由保留，用于兼容和离线模式。
5. **轮询**：局详情页在 `status === 'live'` 时每 15 秒重新请求一次，其他状态只在进入页面时请求。
6. **地理认证**：打卡前调 `navigator.geolocation.getCurrentPosition`（5 秒超时，`enableHighAccuracy: true`），把 `{lat, lon, accuracy}` 放进 `coords`。拒绝授权时不带 `coords`，UI 上说明「未认证：未开启定位」。认证结果以响应里的 `entry.verified` 为准。
7. **v0.1 本地数据**不上传，留在本机，在「我的」里作为「本机记录」显示。

## 7. 安全与限额（诚实说明）

- 身份就是一个 bearer token，丢了就丢了，没有找回。这是作品集级别的设计，不是生产级。
- 链接可见的局靠不可猜的 12 位 base62 id 保护（约 71 bit）。
- 目前没有限流，所有写操作都要求 token，文本字段和媒体大小都有上限。上线公开演示后如果发现滥用，再加基于 IP 的 KV 计数器。
- Cloudflare 免费额度（Workers 10 万请求/天，D1 读 500 万行/天、写 10 万行/天，KV 写 1000 次/天）对演示足够用。**KV 每天 1000 次写入意味着每天最多上传约 1000 张照片。**

## 8. 已知问题与下一步

| # | 问题 | 计划 |
|---|---|---|
| 1 | `*.workers.dev` 在中国大陆经常无法访问 | 绑定自定义域名（任何一个接入 Cloudflare 的域名，加一条 Worker route），前端的 `API_BASE` 只改一个常量 |
| 2 | R2 未开通（需要在 dashboard 绑卡开通） | 开通后把 §5.8 的两个 handler 换成 R2 binding，接口不变 |
| 3 | 没有实时推送 | 用 Durable Objects + WebSocket 做局内实时，放在 v0.3 |
| 4 | AI 局长是规则版 | v0.3 用 Worker secret 存 key，调 LLM，接口不变 |

## 9. 运维

```bash
cd backend
npm install
npm run dev                  # 本地 http://127.0.0.1:8787（先跑 npm run migrate:local && npm run seed:local）
npm run smoke                # 对本地跑 39 项冒烟测试；也可以 bash test/smoke.sh <URL> 对线上跑
npm run deploy               # 部署
npm run migrate:remote       # 新增 migrations/000N_*.sql 后执行
npm run seed:remote          # 更新地点坐标或演示数据（幂等）
npx wrangler tail            # 线上日志
```
