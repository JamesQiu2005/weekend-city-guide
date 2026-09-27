# 周末去哪* · 周末城市探索指南

根据偏好、天气、预算推荐本地周末活动，支持组队出发、打卡记录、攻略分享。纯前端雏形，部署在 GitHub Pages。

- 需求文档：[PRD.md](PRD.md) · 设计系统：[DESIGN.md](DESIGN.md) · 接口：[RFC-001](RFC-001-api-contract.md)
- 技术：原生 HTML/CSS/JS，零构建；地图页按需加载 Leaflet + OpenStreetMap；hash 路由；localStorage 持久化；天气来自 [Open-Meteo](https://open-meteo.com/)
- 本地运行：`python3 -m http.server` 后打开 http://localhost:8000
