/* 通用工具 —— 全局命名空间 N9 */
(function () {
  "use strict";

  const N9 = (window.N9 = window.N9 || {});

  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const escape = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

  // 只允许安全协议的链接
  const safeHref = (url) => {
    const u = String(url ?? "").trim();
    return /^(https?:|mailto:|#|\/|\.\/|\.\.\/)/i.test(u) || !/^[a-z][a-z0-9+.-]*:/i.test(u) ? u : "#";
  };

  // 行内标记：**粗** `码` ==亮== [文](链) \n
  const inline = (src) =>
    escape(src)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/==([^=]+)==/g, "<mark>$1</mark>")
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, href) => {
        const h = safeHref(href.replace(/&amp;/g, "&"));
        const ext = /^https?:/i.test(h);
        return `<a href="${escape(h)}"${ext ? ' target="_blank" rel="noopener"' : ""}>${text}</a>`;
      })
      .replace(/\n/g, "<br>");

  // 着色标签：{ok}..{/ok} 等
  const tags = (src, allowed) =>
    escape(src).replace(/\{(\w+)\}([\s\S]*?)\{\/\1\}/g, (m, t, body) =>
      allowed.includes(t) ? `<span class="${t}">${body}</span>` : m
    );

  const h = (html) => {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  };

  const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const pad = (n, w = 2) => String(n).padStart(w, "0");

  // 极简事件总线；传入 ctx 时在频道切走后自动解绑
  const bus = new Map();
  const on = (evt, fn, ctx) => {
    if (!bus.has(evt)) bus.set(evt, new Set());
    bus.get(evt).add(fn);
    if (ctx) ctx.cleanup(() => bus.get(evt).delete(fn));
  };
  const emit = (evt, data) => (bus.get(evt) || []).forEach((fn) => fn(data));

  Object.assign(N9, { escape, safeHref, inline, tags, h, reducedMotion, pad, on, emit });
})();
