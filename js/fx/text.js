/* 文字特效：打字机、乱码解码 */
(function () {
  "use strict";

  const GLYPHS = "!<>-_\\/[]{}—=+*^?#░▒▓█▌▐01";

  /** 逐字打出文本。返回 Promise；signal.cancelled = true 可中止 */
  function type(el, text, { speed = 38, signal = {}, sound = true } = {}) {
    return new Promise((resolve) => {
      if (N9.reducedMotion()) { el.textContent = text; return resolve(); }
      let i = 0;
      el.textContent = "";
      const step = () => {
        if (signal.cancelled) return resolve();
        el.textContent = text.slice(0, ++i);
        if (sound && i % 2) N9.audio.tick();
        if (i < text.length) setTimeout(step, speed + Math.random() * speed * 0.8);
        else resolve();
      };
      step();
    });
  }

  /** 逐字删除 */
  function erase(el, { speed = 18, signal = {} } = {}) {
    return new Promise((resolve) => {
      const step = () => {
        if (signal.cancelled) return resolve();
        const t = el.textContent;
        if (!t.length) return resolve();
        el.textContent = t.slice(0, -1);
        setTimeout(step, speed);
      };
      step();
    });
  }

  /** 乱码解码：文字从随机字符中「锁定」出来 */
  function scramble(el, text = el.dataset.text || el.textContent, { duration = 520 } = {}) {
    if (N9.reducedMotion()) { el.textContent = text; return; }
    if (el._scr) cancelAnimationFrame(el._scr);
    el.dataset.text = text;
    const start = performance.now();
    const frame = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const lock = Math.floor(p * text.length);
      let out = "";
      for (let i = 0; i < text.length; i++) {
        const c = text[i];
        out += i < lock || c === " " ? c : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      el.textContent = out;
      if (p < 1) el._scr = requestAnimationFrame(frame);
      else { el.textContent = text; el._scr = null; }
    };
    el._scr = requestAnimationFrame(frame);
  }

  N9.text = { type, erase, scramble };
})();
