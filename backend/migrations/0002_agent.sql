-- AI 局长（DeepSeek）：地点文案 + 邮箱验证 + 限额 / 并发锁 / 对话轮次。

-- 地点文案，作为模型上下文（与前端 data.js 同源，seed-places.mjs 写入）
ALTER TABLE places ADD COLUMN blurb      TEXT;
ALTER TABLE places ADD COLUMN open_hours TEXT;
ALTER TABLE places ADD COLUMN tags       TEXT;

-- 邮箱验证码：每个邮箱同时只有一条，存 sha256，不存明文
CREATE TABLE agent_email_codes (
  email       TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  code_hash   TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  expires_at  INTEGER NOT NULL,
  sent_at     INTEGER NOT NULL
);

-- 验证通过后的授权。email 为主键 → 一个邮箱同一时间只绑定一个登录（单登录），新验证会顶掉旧的
CREATE TABLE agent_grants (
  email       TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  verified_at INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);
CREATE INDEX idx_agent_grants_user ON agent_grants(user_id);

-- 通用计数器：每日调用额度（按邮箱 / 全站）、IP 与发信频率限制。条件 UPSERT 保证原子性
CREATE TABLE agent_counters (
  k      TEXT PRIMARY KEY,   -- 例：calls:<email>:<day>、calls:*:<day>、mail:ip:<ip>:<hour>
  n      INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

-- 并发锁：同一邮箱同一时间只允许一个模型请求
CREATE TABLE agent_locks (
  k      TEXT PRIMARY KEY,
  until  INTEGER NOT NULL
);

-- 多轮对话（限制最大回复次数）
CREATE TABLE agent_threads (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  turns      INTEGER NOT NULL DEFAULT 0,
  messages   TEXT NOT NULL,          -- JSON，只存用户请求和模型的 JSON 回复
  params     TEXT NOT NULL,          -- JSON：date / people / budgetTotal / likes / maxStops / sessionId
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
