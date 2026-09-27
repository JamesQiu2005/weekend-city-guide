# 周末去哪* · 周末城市探索指南

根据偏好、天气、预算推荐本地周末活动，支持组队出发、打卡记录、攻略分享。纯前端雏形，部署在 GitHub Pages。

- 需求文档：[PRD.md](PRD.md) · 设计系统：[DESIGN.md](DESIGN.md) · 接口：[RFC-001](RFC-001-api-contract.md)
- 技术：原生 HTML/CSS/JS，零构建；地图页按需加载 Leaflet + OpenStreetMap；hash 路由；localStorage 持久化；天气来自 [Open-Meteo](https://open-meteo.com/)
- 本地运行：`python3 -m http.server` 后打开 http://localhost:8000

## 测试

```bash
cd tests && npm install && npm test     # 默认强制断网：不会碰线上后端
ONLINE=1 npm test                       # 另跑多人在线用例，打本地 wrangler dev；用例结束一定删除自己建的局
```

`tests/run.mjs`（15 条）用 Playwright 在 375px 和 1280px 两种宽度下走真实流程（引导九步、编辑资料、示例偏好、天气理由、筛选、开局到收局、分享弹层、地图正常 / 瓦片被拦 / Leaflet 加载失败、快照加入、鼠标横向滚动），每一屏都做版面检查：可点元素不小于 24px、输入框不能被压扁、不能横向溢出、界面文字里不能有 emoji。
