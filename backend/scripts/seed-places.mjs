// Generates seed/places.sql from seed/places.json (ON CONFLICT upsert — never deletes rows that stops reference; safe to re-run).
// Usage: node scripts/seed-places.mjs && npx wrangler d1 execute weekend-db --remote --file seed/places.sql
import { readFileSync, writeFileSync } from "node:fs";

const places = JSON.parse(readFileSync(new URL("../seed/places.json", import.meta.url), "utf8"));
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const rows = places.map((p) =>
  `INSERT INTO places (id, city, name, category, district, lat, lon, indoor, avg_cost, blurb, open_hours, tags) VALUES (${q(p.id)}, ${q(p.city)}, ${q(p.name)}, ${q(p.category)}, ${q(p.district)}, ${p.lat}, ${p.lon}, ${p.indoor ? 1 : 0}, ${p.avgCost}, ${q(p.blurb || "")}, ${q(p.openHours || "")}, ${q((p.tags || []).join(","))}) ON CONFLICT(id) DO UPDATE SET city=excluded.city, name=excluded.name, category=excluded.category, district=excluded.district, lat=excluded.lat, lon=excluded.lon, indoor=excluded.indoor, avg_cost=excluded.avg_cost, blurb=excluded.blurb, open_hours=excluded.open_hours, tags=excluded.tags;`
);
writeFileSync(new URL("../seed/places.sql", import.meta.url), rows.join("\n") + "\n");
console.log(`wrote ${rows.length} places`);
