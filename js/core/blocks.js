/* ==========================================================================
   内容块渲染器
   每个块：register(type, (data, ctx) => Element)
     ctx.cleanup(fn)  频道切走时执行（停止动画等）
     ctx.mounted(fn)  元素挂到屏幕上之后执行
     ctx.root         CRT 滚动容器（用于可见性检测）
   ========================================================================== */
(function () {
  "use strict";

  const { h, escape: e, inline, tags, safeHref } = N9;
  const registry = new Map();

  function register(type, fn) { registry.set(type, fn); }

  const href = (u) => e(safeHref(u));
  const ext = (u) => (/^https?:/i.test(u || "") ? ' target="_blank" rel="noopener"' : "");

  /* ---------------- hero ---------------- */
  register("hero", (d, ctx) => {
    const el = h(`
      <section class="hero">
        <canvas class="hero__scene" aria-hidden="true"></canvas>
        <div class="hero__inner">
          ${d.kicker ? `<div class="hero__kicker">${e(d.kicker)}</div>` : ""}
          <h1 class="hero__title"><span class="glitch" data-text="${e(d.title)}">${e(d.title)}</span></h1>
          <div class="hero__sub"><span class="hero__line caret"></span></div>
        </div>
      </section>`);

    ctx.mounted(() => {
      const scene = N9.vapor(el.querySelector(".hero__scene"), {
        horizon: 0.62, sunX: 0.74, sunSize: 0.2, stars: 90, speed: 0.5,
      });
      ctx.cleanup(() => scene.destroy());
      N9.on("theme", scene.refresh, ctx);
    });

    const lines = d.lines || [];
    const lineEl = el.querySelector(".hero__line");
    const signal = { cancelled: false };
    ctx.cleanup(() => (signal.cancelled = true));
    (async () => {
      if (!lines.length) return;
      await new Promise((r) => setTimeout(r, 650));
      for (let i = 0; !signal.cancelled; i = (i + 1) % lines.length) {
        await N9.text.type(lineEl, lines[i], { signal, sound: false });
        if (lines.length === 1) break;
        await new Promise((r) => setTimeout(r, 2600));
        if (signal.cancelled) break;
        await N9.text.erase(lineEl, { signal });
        await new Promise((r) => setTimeout(r, 300));
      }
    })();
    return el;
  });

  /* ---------------- heading ---------------- */
  register("heading", (d) =>
    h(`<h2 class="h">${e(d.text)}${d.sub ? ` <small>${e(d.sub)}</small>` : ""}</h2>`)
  );

  /* ---------------- text ---------------- */
  register("text", (d) => {
    const paras = String(d.body || "").split(/\n{2,}/).map((p) => `<p>${inline(p)}</p>`).join("");
    return h(`<div class="prose">${paras}</div>`);
  });

  /* ---------------- cards ---------------- */
  register("cards", (d) => {
    const items = (d.items || []).map((c) => {
      const tag = c.href ? "a" : "article";
      const attrs = c.href ? ` href="${href(c.href)}"${ext(c.href)}` : "";
      return `<${tag} class="card"${attrs}>
          ${c.tag ? `<span class="card__tag">${e(c.tag)}</span>` : ""}
          <h3 class="card__title">${e(c.title)}</h3>
          ${c.body ? `<p class="card__body">${inline(c.body)}</p>` : ""}
          ${c.foot || c.href ? `<div class="card__foot">${e(c.foot || "")}${c.href ? " →" : ""}</div>` : ""}
        </${tag}>`;
    });
    const el = h(`<div class="cards">${items.join("")}</div>`);
    // 光标追随的荧光 + 轻微 3D 倾斜
    el.addEventListener("pointermove", (ev) => {
      const card = ev.target.closest(".card");
      if (!card) return;
      const r = card.getBoundingClientRect();
      const x = ev.clientX - r.left, y = ev.clientY - r.top;
      card.style.setProperty("--x", `${x}px`);
      card.style.setProperty("--y", `${y}px`);
      if (!N9.reducedMotion()) {
        const rx = (y / r.height - 0.5) * -6, ry = (x / r.width - 0.5) * 8;
        card.style.transform = `perspective(700px) rotateX(${rx}deg) rotateY(${ry}deg)`;
      }
    });
    el.addEventListener("pointerout", (ev) => {
      const card = ev.target.closest(".card");
      if (card && !card.contains(ev.relatedTarget)) card.style.transform = "";
    });
    return el;
  });

  /* ---------------- timeline ---------------- */
  register("timeline", (d) =>
    h(`<ol class="timeline">${(d.items || []).map((t) => `
        <li>
          ${t.date ? `<div class="timeline__date">${e(t.date)}</div>` : ""}
          <h3 class="timeline__title">${inline(t.title || "")}</h3>
          ${t.body ? `<p class="timeline__body">${inline(t.body)}</p>` : ""}
        </li>`).join("")}</ol>`)
  );

  /* ---------------- stats ---------------- */
  register("stats", (d, ctx) => {
    const el = h(`<div class="stats">${(d.items || []).map((s) => `
        <div class="stat">
          <div class="stat__value"><span data-count="${Number(s.value) || 0}">0</span>${s.unit ? `<span class="stat__unit">${e(s.unit)}</span>` : ""}</div>
          <div class="stat__label">${e(s.label)}</div>
          ${s.max ? `<div class="stat__bar"><i data-pct="${Math.min(100, (s.value / s.max) * 100)}"></i></div>` : ""}
        </div>`).join("")}</div>`);

    ctx.mounted(() => {
      const io = new IntersectionObserver((entries) => {
        if (!entries.some((en) => en.isIntersecting)) return;
        io.disconnect();
        el.querySelectorAll("[data-pct]").forEach((b) => (b.style.width = b.dataset.pct + "%"));
        el.querySelectorAll("[data-count]").forEach((n) => countUp(n, +n.dataset.count));
      }, { root: ctx.root, threshold: 0.3 });
      io.observe(el);
      ctx.cleanup(() => io.disconnect());
    });
    return el;
  });

  function countUp(node, target) {
    const decimals = (String(target).split(".")[1] || "").length;
    if (N9.reducedMotion()) { node.textContent = target.toFixed(decimals); return; }
    const dur = 1400, start = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 4);
      node.textContent = (target * eased).toFixed(decimals);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ---------------- data ---------------- */
  register("data", (d) =>
    h(`<table class="data"><tbody>${(d.rows || []).map(([k, v]) =>
      `<tr><th scope="row">${e(k)}</th><td>${inline(v ?? "")}</td></tr>`).join("")}</tbody></table>`)
  );

  /* ---------------- log ---------------- */
  register("log", (d, ctx) => {
    const lines = (d.lines || []).map((l) => tags(l, ["ok", "warn", "err", "dim"]));
    const el = h(`<pre class="log"></pre>`);
    // 进入视野时逐行打印
    ctx.mounted(() => {
      if (N9.reducedMotion()) { el.innerHTML = lines.join("\n"); return; }
      el.innerHTML = lines.map(() => "&nbsp;").join("\n");
      const io = new IntersectionObserver((entries) => {
        if (!entries[0].isIntersecting) return;
        io.disconnect();
        let i = 0;
        const out = [];
        const tick = () => {
          out.push(lines[i++]);
          el.innerHTML = out.concat(lines.slice(i).map(() => "&nbsp;")).join("\n");
          N9.audio.tick();
          if (i < lines.length) t = setTimeout(tick, 90 + Math.random() * 140);
        };
        let t = setTimeout(tick, 120);
        ctx.cleanup(() => clearTimeout(t));
      }, { root: ctx.root, threshold: 0.2 });
      io.observe(el);
      ctx.cleanup(() => io.disconnect());
    });
    return el;
  });

  /* ---------------- quote ---------------- */
  register("quote", (d) =>
    h(`<blockquote class="quote">${inline(d.text)}${d.cite ? `<cite>${e(d.cite)}</cite>` : ""}</blockquote>`)
  );

  /* ---------------- image ---------------- */
  register("image", (d) =>
    h(`<figure class="figure">
        <div class="figure__frame"><img src="${href(d.src)}" alt="${e(d.alt || "")}" loading="lazy"></div>
        ${d.caption ? `<figcaption>${inline(d.caption)}</figcaption>` : ""}
      </figure>`)
  );

  /* ---------------- divider ---------------- */
  register("divider", (d) => h(`<div class="divider" role="separator">${e(d.text || "◆ ◆ ◆")}</div>`));

  /* ---------------- links ---------------- */
  register("links", (d) =>
    h(`<div class="links">${(d.items || []).map((l) =>
      `<a class="btn" href="${href(l.href)}"${ext(l.href)}>${e(l.label)}</a>`).join("")}</div>`)
  );

  /* ---------------- 渲染整页 ---------------- */
  function render(channel, root) {
    const cleanups = [];
    const mounts = [];
    const ctx = {
      root,
      cleanup: (fn) => cleanups.push(fn),
      mounted: (fn) => mounts.push(fn),
    };

    const page = document.createElement("article");
    page.className = "page";
    page.appendChild(h(`
      <div class="page__head">
        <span>CH-<b>${e(channel.code)}</b> // ${e(channel.id.toUpperCase())}</span>
        <span>${e(channel.label)}</span>
      </div>`));

    (channel.blocks || []).forEach((b, i) => {
      const fn = registry.get(b.type);
      let el;
      try {
        el = fn ? fn(b, ctx) : h(`<div class="blk--unknown">未知块类型：${e(b.type)}</div>`);
      } catch (err) {
        console.error(`[N9] 块 #${i} (${b.type}) 渲染失败`, err);
        el = h(`<div class="blk--unknown">块渲染失败：${e(b.type)} — ${e(err.message)}</div>`);
      }
      el.classList.add("blk", "reveal");
      el.style.setProperty("--i", i);
      page.appendChild(el);
    });

    return {
      el: page,
      mount() {
        mounts.forEach((fn) => fn());
        const blocks = page.querySelectorAll(".blk.reveal");
        blocks.forEach((b, i) => setTimeout(() => b.classList.add("is-in"), 80 + i * 90));
      },
      destroy: () => cleanups.forEach((fn) => { try { fn(); } catch (_) {} }),
    };
  }

  N9.blocks = { register, render };
})();
