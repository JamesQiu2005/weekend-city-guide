// 横向滚动区的「药丸滑块」：滚动条被藏起来之后，鼠标用户没法横着滚。
// 只在精确指针（鼠标 / 触控板）设备上启用：在每个横向滚动区下方加一条轨道 + 可拖动的药丸，
// 并把悬停时的竖向滚轮转成横向滚动。触屏设备保持原样（手指本来就能横滑）。
(() => {
  const SEL = ".chips, .rail, .gallery, .cover-pick";
  const fine = window.matchMedia("(pointer: fine)");
  const ro = "ResizeObserver" in window ? new ResizeObserver((es) => es.forEach((e) => sync(e.target))) : null;

  function sync(el) {
    const bar = el._hbar; if (!bar) return;
    const over = el.scrollWidth - el.clientWidth;
    bar.hidden = over < 4;
    if (bar.hidden) return;
    const track = bar.clientWidth, w = Math.max(36, (el.clientWidth / el.scrollWidth) * track);
    bar.firstChild.style.width = w + "px";
    bar.firstChild.style.transform = `translateX(${(el.scrollLeft / over) * (track - w)}px)`;
  }
  function attach(el) {
    if (el._hbar || !fine.matches) return;
    const bar = document.createElement("div");
    bar.className = "hbar"; bar.setAttribute("aria-hidden", "true");
    bar.innerHTML = '<div class="hbar-thumb"></div>';
    el.after(bar); el._hbar = bar;
    el.addEventListener("scroll", () => sync(el), { passive: true });
    // 悬停时竖向滚轮 → 横向滚动（到头了就放行给页面）
    el.addEventListener("wheel", (e) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max < 4 || (e.deltaY < 0 && el.scrollLeft <= 0) || (e.deltaY > 0 && el.scrollLeft >= max - 1)) return;
      e.preventDefault(); el.scrollLeft += e.deltaY;
    }, { passive: false });
    // 拖药丸
    const thumb = bar.firstChild;
    thumb.addEventListener("pointerdown", (e) => {
      e.preventDefault(); e.stopPropagation();
      thumb.setPointerCapture(e.pointerId); thumb.classList.add("is-grabbed");
      const x0 = e.clientX, s0 = el.scrollLeft, ratio = (el.scrollWidth - el.clientWidth) / (bar.clientWidth - thumb.offsetWidth || 1);
      const move = (ev) => { el.scrollLeft = s0 + (ev.clientX - x0) * ratio; };
      const up = () => { thumb.classList.remove("is-grabbed"); thumb.removeEventListener("pointermove", move); thumb.removeEventListener("pointerup", up); };
      thumb.addEventListener("pointermove", move); thumb.addEventListener("pointerup", up);
    });
    // 点轨道：跳到那个位置
    bar.addEventListener("pointerdown", (e) => {
      if (e.target !== bar) return;
      const r = bar.getBoundingClientRect(), p = (e.clientX - r.left - thumb.offsetWidth / 2) / (r.width - thumb.offsetWidth);
      el.scrollTo({ left: Math.max(0, Math.min(1, p)) * (el.scrollWidth - el.clientWidth), behavior: "smooth" });
    });
    ro?.observe(el);
    requestAnimationFrame(() => sync(el));
    el.querySelectorAll("img").forEach((im) => im.addEventListener("load", () => sync(el), { once: true }));
  }
  let queued = false;
  const scan = () => { queued = false; document.querySelectorAll(SEL).forEach(attach); };
  const mo = new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(scan); } });
  const start = () => { mo.observe(document.getElementById("app"), { childList: true, subtree: true }); scan(); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
  fine.addEventListener?.("change", scan);
})();
