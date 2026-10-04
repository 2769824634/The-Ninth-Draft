/* ==========================================================================
   主程序：开机、频道路由、换台动画、键盘、硬件面板联动
   ========================================================================== */
(function () {
  "use strict";

  const site = window.SITE;
  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;

  const channels = (site.channels || []).map((c, i) => ({ ...c, code: N9.pad(i + 1) }));
  const screen = $("screen");
  const noise = N9.noise($("noise"));
  const osd = $("osd");

  let current = null;     // { channel, view }
  let switching = null;   // Promise，防止连续换台冲突
  let pending = null;

  /* ---------------- 偏好 ---------------- */
  function setTheme(t) {
    N9.store.set("theme", t);
    root.dataset.theme = t;
    N9.emit("theme", t);
    flashOSD(`COLOR ${t.toUpperCase()}`);
  }
  const nextTheme = () => {
    const i = N9.THEMES.indexOf(N9.store.get("theme"));
    return N9.THEMES[(i + 1) % N9.THEMES.length];
  };
  function setFx(v) {
    N9.store.set("fx", v);
    root.dataset.fx = v;
    syncToggles();
  }
  function setSound(v) {
    N9.store.set("sound", v);
    if (v === "on") { N9.audio.unlock(); N9.audio.click(); }
    syncToggles();
  }
  function syncToggles() {
    $("btn-fx").setAttribute("aria-pressed", String(N9.store.get("fx") === "on"));
    $("btn-sound").setAttribute("aria-pressed", String(N9.store.get("sound") === "on"));
    $("btn-theme").setAttribute("aria-pressed", "true");
  }

  /* ---------------- 面板 ---------------- */
  function buildPanel() {
    document.title = `${site.meta.title} // ${channels[0]?.label || ""}`;
    $("brand-title").textContent = site.meta.title;
    $("brand-sub").textContent = site.meta.subtitle || "";

    $("keys").innerHTML = channels.map((c) => `
      <li role="presentation">
        <a class="key" role="tab" href="#/${N9.escape(c.id)}" data-id="${N9.escape(c.id)}" aria-selected="false">
          <span class="key__code">${c.code}</span>
          <span class="key__label" data-text="${N9.escape(c.label)}">${N9.escape(c.label)}</span>
          <span class="key__led"></span>
        </a>
      </li>`).join("");

    $("keys").addEventListener("pointerenter", (ev) => {
      const label = ev.target.closest?.(".key")?.querySelector(".key__label");
      if (label) N9.text.scramble(label);
    }, true);
    $("keys").addEventListener("click", () => N9.audio.key());

    const track = $("ticker");
    const items = (site.ticker || []).map((t) => `<span>${N9.escape(t)}</span>`).join("");
    track.innerHTML = items;
    track.style.setProperty("--ticker-dur", `${Math.max(20, track.textContent.length * 0.32)}s`);
  }

  /* ---------------- OSD ---------------- */
  function flashOSD(text, ms = 1400) {
    osd.textContent = text;
    osd.classList.add("is-on");
    clearTimeout(osd._t);
    osd._t = setTimeout(() => osd.classList.remove("is-on"), ms);
  }

  /* ---------------- 路由 ---------------- */
  const find = (q) => {
    q = String(q || "").toLowerCase().replace(/^ch-?/, "");
    return channels.find((c) => c.id.toLowerCase() === q || c.code === N9.pad(q) || c.label === q);
  };
  const idFromHash = () => decodeURIComponent(location.hash.replace(/^#\/?/, "")).split("/")[0];

  function go(id) {
    if (location.hash !== `#/${id}`) location.hash = `#/${id}`;
    else show(id);
  }

  async function show(id) {
    const ch = find(id) || null;
    if (current && ch && current.channel === ch) return;
    if (switching) { pending = id; return; }

    const first = !current;
    switching = (async () => {
      const animate = !first && !N9.reducedMotion();
      if (animate) {
        N9.audio.channel();
        noise.burst(520);
        screen.classList.remove("is-on");
        screen.classList.add("is-off");
        await wait(260);
      }
      if (current) current.view.destroy();

      screen.innerHTML = "";
      let view;
      if (ch) {
        view = N9.blocks.render(ch, screen);
      } else {
        const el = N9.h(`<div class="page nosignal"><div><strong>NO SIGNAL</strong><p>频道「${N9.escape(id)}」不存在。按 1 返回主控台。</p></div></div>`);
        view = { el, mount() {}, destroy() {} };
      }
      screen.appendChild(view.el);
      screen.scrollTop = 0;
      current = { channel: ch, view };

      updatePanel(ch);
      screen.classList.remove("is-off");
      if (animate) {
        screen.classList.add("is-on");
        setTimeout(() => screen.classList.remove("is-on"), 520);
      }
      view.mount();
      flashOSD(ch ? `CH ${ch.code}` : "CH --");
    })();

    await switching;
    switching = null;
    if (pending) { const p = pending; pending = null; show(p); }
  }

  function updatePanel(ch) {
    document.querySelectorAll(".key").forEach((k) => {
      const on = ch && k.dataset.id === ch.id;
      k.setAttribute("aria-selected", String(!!on));
      if (on) k.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    });
    const code = ch ? ch.code : "--";
    $("chin-ch").textContent = `CH ${code}`;
    $("cassette-title").textContent = ch ? `CH-${code} · ${ch.id.toUpperCase()}`.slice(0, 22) : "NO TAPE";
    document.title = ch ? `${ch.label} // ${site.meta.title}` : `NO SIGNAL // ${site.meta.title}`;
  }

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ---------------- 时钟 / 磁带计数 / 卷盘 ---------------- */
  function startHardware() {
    const clock = $("clock");
    const tick = () => {
      const d = new Date();
      clock.textContent = `${N9.pad(d.getHours())}:${N9.pad(d.getMinutes())}:${N9.pad(d.getSeconds())}`;
    };
    tick();
    setInterval(tick, 1000);

    const counter = $("tape-counter");
    const reels = [$("reel-l"), $("reel-r")];
    const base = [[70, 47], [130, 47]];
    let angle = 0, vel = 0, lastTop = 0;

    const loop = () => {
      const top = screen.scrollTop;
      const max = Math.max(1, screen.scrollHeight - screen.clientHeight);
      vel += (top - lastTop) * 0.6;
      lastTop = top;
      vel *= 0.9;
      angle += 0.6 + vel;
      reels.forEach((r, i) => r.setAttribute("transform", `translate(${base[i]}) rotate(${(angle * (i ? 1.15 : 1)) % 360})`));
      const idx = current?.channel ? channels.indexOf(current.channel) : 0;
      counter.textContent = N9.pad((idx * 100 + Math.round((top / max) * 99)) % 1000, 3);
      requestAnimationFrame(loop);
    };
    if (!N9.reducedMotion()) requestAnimationFrame(loop);
    else screen.addEventListener("scroll", () => {
      const max = Math.max(1, screen.scrollHeight - screen.clientHeight);
      counter.textContent = N9.pad(Math.round((screen.scrollTop / max) * 999), 3);
    }, { passive: true });
  }

  /* ---------------- 键盘 ---------------- */
  function bindKeys(term) {
    document.addEventListener("keydown", (ev) => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName) || ev.target.isContentEditable;
      if (typing) return;

      if (ev.key === "`" || ev.key === "~") { ev.preventDefault(); term.toggle(); return; }
      if (term.isOpen()) return;

      const idx = current?.channel ? channels.indexOf(current.channel) : -1;
      if (/^[1-9]$/.test(ev.key) && channels[+ev.key - 1]) { N9.audio.key(); go(channels[+ev.key - 1].id); }
      else if (ev.key === "ArrowRight") { N9.audio.key(); go(channels[(idx + 1) % channels.length].id); }
      else if (ev.key === "ArrowLeft") { N9.audio.key(); go(channels[(idx - 1 + channels.length) % channels.length].id); }
      else if (ev.key === "t" || ev.key === "T") setTheme(nextTheme());
      else if (ev.key === "f" || ev.key === "F") { setFx(N9.store.get("fx") === "on" ? "off" : "on"); flashOSD(`FX ${N9.store.get("fx").toUpperCase()}`); }
      else if (ev.key === "m" || ev.key === "M") { setSound(N9.store.get("sound") === "on" ? "off" : "on"); flashOSD(`AUDIO ${N9.store.get("sound").toUpperCase()}`); }
      else return;
    });
  }

  /* ---------------- 开机 ---------------- */
  async function boot(force = false) {
    const el = $("boot");
    const log = $("boot-log");
    let seen = false;
    try { seen = sessionStorage.getItem("n9:booted") === "1"; } catch (_) {}
    const lines = site.boot || [];

    if ((!force && seen) || !lines.length || N9.reducedMotion()) {
      el.classList.add("is-done");
      return;
    }

    el.classList.remove("is-done");
    log.innerHTML = "";
    let skip = false;
    const onSkip = () => (skip = true);
    window.addEventListener("keydown", onSkip, { once: true });
    window.addEventListener("pointerdown", onSkip, { once: true });

    for (const line of lines) {
      if (skip) break;
      const row = document.createElement("div");
      log.appendChild(row);
      const html = N9.tags(line, ["hl"]);
      if (/\.{3,}/.test(line)) {
        // 「......... OK」类行：先打点再出结果
        const [head, tail] = html.split(/(?<=\.{3,})\s(?=\S+$)/);
        row.innerHTML = head;
        await wait(140 + Math.random() * 260);
        if (tail) row.innerHTML = `${head} <span class="hl">${tail}</span>`;
      } else {
        row.innerHTML = html || "&nbsp;";
        await wait(line ? 120 : 60);
      }
    }
    if (!skip) await wait(650);
    window.removeEventListener("keydown", onSkip);
    window.removeEventListener("pointerdown", onSkip);
    try { sessionStorage.setItem("n9:booted", "1"); } catch (_) {}
    el.classList.add("is-done");
    N9.audio.power();
  }

  /* ---------------- 启动 ---------------- */
  async function init() {
    root.dataset.theme = N9.store.get("theme");
    root.dataset.fx = N9.store.get("fx");
    syncToggles();
    buildPanel();

    const bg = N9.vapor($("bg"), { horizon: 0.64, stars: 180, speed: 0.25 });
    N9.on("theme", bg.refresh);

    const app = {
      site, channels, find, go, setTheme, nextTheme, setFx, setSound,
      reboot: () => { term.close(); boot(true); },
    };
    const term = N9.createConsole({ app });

    $("btn-theme").addEventListener("click", () => setTheme(nextTheme()));
    $("btn-fx").addEventListener("click", () => setFx(N9.store.get("fx") === "on" ? "off" : "on"));
    $("btn-sound").addEventListener("click", () => setSound(N9.store.get("sound") === "on" ? "off" : "on"));
    $("btn-console").addEventListener("click", () => term.toggle());
    document.querySelectorAll(".toggle").forEach((b) => b.addEventListener("click", () => N9.audio.click()));

    bindKeys(term);
    window.addEventListener("hashchange", () => show(idFromHash() || channels[0].id));

    await boot();
    document.body.classList.add("is-ready");
    show(idFromHash() || channels[0]?.id);
    startHardware();
    screen.focus({ preventScroll: true });
  }

  init();
})();
