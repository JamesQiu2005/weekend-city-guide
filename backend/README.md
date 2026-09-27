# weekend-api

The 周末去哪* backend: a Cloudflare Worker with D1 and KV and no dependencies. It's live at https://weekend-api.weekend-api.workers.dev

- Contract: [`../RFC-001-api-contract.md`](../RFC-001-api-contract.md)
- Frontend client: [`client/api.js`](client/api.js). Copy it to the site root and load it before `app.js`.
- Schema: `migrations/`. Place coordinates: `seed/places.json`. Demo public sessions: `seed/demo.sql`.

```bash
npm install
npm run migrate:local && npm run seed:local
npm run dev                                   # http://127.0.0.1:8787
npm run smoke                                 # 39 end-to-end checks against local
bash test/smoke.sh https://weekend-api.weekend-api.workers.dev   # …or against prod
npm run deploy
```

Running the smoke test against production leaves test users behind, plus one private quick-check-in session per run. It's harmless.
