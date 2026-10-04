/* 蒸汽波场景：星空 + 条纹落日 + 线框山脉 + 无限透视网格
   用法：const scene = N9.vapor(canvas, { horizon: .58 }); scene.destroy(); */
(function () {
  "use strict";

  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  function vapor(canvas, opts = {}) {
    const o = { horizon: 0.6, sunX: 0.5, speed: 0.35, stars: 140, sunSize: 0.24, parallax: true, ...opts };
    const ctx = canvas.getContext("2d");
    let w = 0, h = 0, dpr = 1, raf = 0, t = 0, last = 0, running = false;
    let mx = 0, my = 0, tx = 0, ty = 0;
    let stars = [], ridge = [];
    let colors = {};
    const sun = document.createElement("canvas");
    const sctx = sun.getContext("2d");

    function readColors() {
      colors = {
        grid: css("--accent") || "#ff3ea5",
        gridRgb: css("--accent-rgb") || "255 62 165",
        fgRgb: css("--fg-rgb") || "255 176 0",
        top: css("--sky-top") || "#0b0420",
        mid: css("--sky-mid") || "#2a0b4a",
        void: css("--void") || "#07040f",
      };
    }

    function resize() {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.max(1, r.width);
      h = Math.max(1, r.height);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const horizonY = h * o.horizon;
      stars = Array.from({ length: o.stars }, () => ({
        x: Math.random() * w,
        y: Math.random() * horizonY * 0.95,
        r: Math.random() * 1.3 + 0.2,
        p: Math.random() * Math.PI * 2,
        s: Math.random() * 2 + 0.5,
      }));

      // 山脉轮廓（左右两侧较高，中间留给太阳）
      ridge = [];
      const n = 34;
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        const edge = Math.pow(Math.abs(u - 0.5) * 2, 1.6);
        const jag = (Math.sin(i * 1.7) + Math.sin(i * 0.63 + 1) + Math.random() * 0.8) * 0.33;
        ridge.push({ x: u * w, y: horizonY - (edge * 0.75 + jag * 0.25 * edge + 0.02) * h * 0.2 });
      }

      const s = Math.round(Math.min(w, h * 1.4) * o.sunSize * 2);
      sun.width = sun.height = Math.max(2, s);
      if (!running) draw(0);
    }

    function drawSun(time) {
      const s = sun.width, r = s / 2;
      sctx.clearRect(0, 0, s, s);
      const g = sctx.createLinearGradient(0, 0, 0, s);
      g.addColorStop(0, "#fff36b");
      g.addColorStop(0.45, "#ff9a3c");
      g.addColorStop(0.75, "#ff3ea5");
      g.addColorStop(1, "#9b2cff");
      sctx.fillStyle = g;
      sctx.beginPath();
      sctx.arc(r, r, r, 0, Math.PI * 2);
      sctx.fill();
      // 下半部的横向切缝，缓慢上移
      sctx.globalCompositeOperation = "destination-out";
      const bands = 9;
      const shift = (time * 0.02) % 1;
      for (let i = 0; i < bands; i++) {
        const k = (i + shift) / bands;
        const y = r * 0.9 + k * r * 1.1;
        const th = 1 + k * k * s * 0.05;
        sctx.fillRect(0, y, s, th);
      }
      sctx.globalCompositeOperation = "source-over";
    }

    function draw(dt) {
      t += dt * o.speed;
      tx += (mx - tx) * 0.05;
      ty += (my - ty) * 0.05;
      const hy = h * o.horizon + ty * 8;
      const vx = w / 2 + tx * 30;

      // 天空
      const sky = ctx.createLinearGradient(0, 0, 0, hy);
      sky.addColorStop(0, colors.top);
      sky.addColorStop(0.7, colors.mid);
      sky.addColorStop(1, "#5a1450");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, hy + 1);

      // 星
      for (const st of stars) {
        const a = 0.35 + 0.65 * Math.abs(Math.sin(st.p + t * st.s * 0.6));
        ctx.fillStyle = `rgb(255 240 255 / ${a})`;
        ctx.fillRect(st.x - tx * 6 * st.r, st.y, st.r, st.r);
      }

      // 太阳
      drawSun(t);
      const sr = sun.width / 2;
      const sx = w * o.sunX - sr - tx * 10;
      const sy = hy - sr * 1.35;
      const halo = ctx.createRadialGradient(sx + sr, sy + sr, sr * 0.6, sx + sr, sy + sr, sr * 2.2);
      halo.addColorStop(0, "rgb(255 62 165 / .35)");
      halo.addColorStop(1, "rgb(255 62 165 / 0)");
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, w, hy);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, w, hy);
      ctx.clip();
      ctx.drawImage(sun, sx, sy);
      ctx.restore();

      // 山脉
      ctx.beginPath();
      ctx.moveTo(0, hy);
      for (const p of ridge) ctx.lineTo(p.x - tx * 18, p.y + ty * 8);
      ctx.lineTo(w, hy);
      ctx.closePath();
      ctx.fillStyle = "#12051f";
      ctx.fill();
      ctx.strokeStyle = `rgb(${colors.gridRgb} / .55)`;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // 地面
      const ground = ctx.createLinearGradient(0, hy, 0, h);
      ground.addColorStop(0, "#1a0626");
      ground.addColorStop(1, colors.void);
      ctx.fillStyle = ground;
      ctx.fillRect(0, hy, w, h - hy);

      // 网格：横线（透视 + 滚动）
      const depth = h - hy;
      const rows = 18;
      const off = t % 1;
      ctx.lineWidth = 1;
      for (let i = 0; i < rows; i++) {
        const z = (i + 1 - off) / rows;          // 0..1，越大越近
        const y = hy + Math.pow(z, 2.4) * depth;
        const a = Math.min(1, z * 1.6);
        ctx.strokeStyle = `rgb(${colors.gridRgb} / ${a * 0.85})`;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      // 纵线（汇聚于消失点）
      const cols = 26;
      for (let i = -cols; i <= cols; i++) {
        const bx = vx + (i / cols) * w * 2.2;
        ctx.strokeStyle = `rgb(${colors.gridRgb} / .55)`;
        ctx.beginPath();
        ctx.moveTo(vx + (bx - vx) * 0.02, hy);
        ctx.lineTo(bx, h);
        ctx.stroke();
      }
      // 地平线辉光
      const glow = ctx.createLinearGradient(0, hy - 30, 0, hy + 30);
      glow.addColorStop(0, `rgb(${colors.gridRgb} / 0)`);
      glow.addColorStop(0.5, `rgb(${colors.gridRgb} / .45)`);
      glow.addColorStop(1, `rgb(${colors.gridRgb} / 0)`);
      ctx.fillStyle = glow;
      ctx.fillRect(0, hy - 30, w, 60);
    }

    function loop(now) {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      draw(dt);
      raf = requestAnimationFrame(loop);
    }

    function start() {
      if (running || N9.reducedMotion()) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(loop);
    }
    function stop() {
      running = false;
      cancelAnimationFrame(raf);
    }

    const onMove = (e) => {
      mx = (e.clientX / window.innerWidth - 0.5) * 2;
      my = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    const onVis = () => (document.hidden ? stop() : start());
    const ro = new ResizeObserver(resize);

    readColors();
    ro.observe(canvas);
    if (o.parallax) window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("visibilitychange", onVis);
    resize();
    start();
    if (!running) draw(0);

    return {
      start,
      stop,
      refresh() { readColors(); if (!running) draw(0); },
      destroy() {
        stop();
        ro.disconnect();
        window.removeEventListener("pointermove", onMove);
        document.removeEventListener("visibilitychange", onVis);
      },
    };
  }

  N9.vapor = vapor;
})();
