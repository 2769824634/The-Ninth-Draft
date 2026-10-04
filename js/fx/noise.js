/* CRT 雪花噪点：常驻低透明度颗粒，换台时爆发 */
(function () {
  "use strict";

  function noise(canvas) {
    const W = 200, H = 150;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(W, H);
    const buf = new Uint32Array(img.data.buffer);
    let raf = 0, lastFrame = 0;

    function paint() {
      for (let i = 0; i < buf.length; i++) {
        const v = (Math.random() * 255) | 0;
        buf[i] = 0xff000000 | (v << 16) | (v << 8) | v;
      }
      // 偶发的横向撕裂条
      if (Math.random() < 0.3) {
        const y = (Math.random() * H) | 0, hh = (Math.random() * 6) | 0;
        buf.fill(0xffffffff, y * W, Math.min(buf.length, (y + hh) * W));
      }
      ctx.putImageData(img, 0, 0);
    }

    function loop(now) {
      raf = requestAnimationFrame(loop);
      const busy = canvas.classList.contains("is-burst");
      if (!busy && now - lastFrame < 66) return; // 常驻约 15fps
      lastFrame = now;
      if (document.documentElement.dataset.fx === "off" && !busy) return;
      paint();
    }

    function burst(ms = 320) {
      canvas.classList.add("is-burst");
      clearTimeout(canvas._t);
      canvas._t = setTimeout(() => canvas.classList.remove("is-burst"), ms);
    }

    if (N9.reducedMotion()) paint();
    else raf = requestAnimationFrame(loop);
    document.addEventListener("visibilitychange", () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && !N9.reducedMotion()) raf = requestAnimationFrame(loop);
    });

    return { burst };
  }

  N9.noise = noise;
})();
