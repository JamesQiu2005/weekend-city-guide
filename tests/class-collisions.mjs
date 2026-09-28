// 静态检查：类名撞车（历史上出过两次：年龄输入框撞上 .num，药丸滑块撞上 .drag）。
// 规则：同一个元素上的多个类里，如果有两个类都在 CSS 里「单独」定义过尺寸（width/height/padding/min-*/display），
// 就算冲突 —— 其中一个会悄悄覆盖另一个。JS 动态加的状态类（classList.add/toggle）也不能是单独定义过尺寸的类。
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GEOM = /(^|;)\s*(width|height|min-width|min-height|padding[a-z-]*|display)\s*:/;

export function findCollisions() {
  const css = readFileSync(join(ROOT, "style.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/@keyframes[^{]+\{(?:[^{}]*\{[^}]*\})*[^}]*\}/g, "");
  // 只看顶层规则（@media 里的也算，去掉外壳）
  const flat = css.replace(/@media[^{]+\{((?:[^{}]*\{[^}]*\})*)[^}]*\}/g, "$1");
  const standaloneGeom = new Map();          // 类名 → 定义尺寸的那条规则
  for (const [, sel, body] of flat.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (!GEOM.test(body)) continue;
    for (const s of sel.split(",").map((x) => x.trim())) {
      const m = s.match(/^\.([\w-]+)(?::[\w-]+(?:\([^)]*\))?)*$/);   // 整个选择器就是 .name（可带伪类）
      if (m && !standaloneGeom.has(m[1])) standaloneGeom.set(m[1], `${s} { ${body.trim().slice(0, 60)}… }`);
    }
  }
  const problems = [];
  for (const f of ["app.js", "map.js", "agent.js", "hscroll.js"]) {
    const src = readFileSync(join(ROOT, f), "utf8");
    // 模板里的 class="a b c"：只取静态部分
    for (const [, attr] of src.matchAll(/class="([^"]*)"/g)) {
      const names = attr.replace(/\$\{[^}]*\}/g, " ").split(/\s+/).filter((x) => /^[a-z][\w-]*$/.test(x));
      const hits = [...new Set(names)].filter((n) => standaloneGeom.has(n));
      if (hits.length > 1) problems.push(`${f}: class="${attr.slice(0, 60)}" 里 ${hits.map((h) => "." + h).join(" 和 ")} 都单独定义了尺寸`);
    }
    // 三元里切换的状态类：${x ? "empty" : ""}
    for (const [, attr] of src.matchAll(/class="([^"]*)"/g)) {
      const base = attr.replace(/\$\{[^}]*\}/g, " ").split(/\s+/).filter((n) => standaloneGeom.has(n));
      if (!base.length) continue;
      for (const [, n] of attr.matchAll(/["']([a-z][\w-]*)["']/g)) if (standaloneGeom.has(n) && !base.includes(n)) problems.push(`${f}: class="${attr.slice(0, 60)}" 会切换出 .${n}，它和 .${base[0]} 都单独定义了尺寸`);
    }
    // classList.add/toggle 的动态状态类
    for (const [, n] of src.matchAll(/classList\.(?:add|toggle)\(\s*["']([\w-]+)["']/g)) {
      if (standaloneGeom.has(n)) problems.push(`${f}: classList 动态加的 .${n} 在 CSS 里单独定义了尺寸：${standaloneGeom.get(n)}`);
    }
  }
  return [...new Set(problems)];
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const p = findCollisions();
  console.log(p.length ? p.join("\n") : "没有类名冲突");
  process.exit(p.length ? 1 : 0);
}
