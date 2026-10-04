/* 用户偏好（主题 / 特效 / 音效），存于 localStorage，失败时静默降级 */
(function () {
  "use strict";

  const KEY = "n9:prefs";
  const defaults = { theme: "amber", fx: "on", sound: "off", booted: false };

  let state = { ...defaults };
  try {
    Object.assign(state, JSON.parse(localStorage.getItem(KEY) || "{}"));
  } catch (_) { /* 隐私模式等 */ }

  const listeners = new Set();

  N9.store = {
    get: (k) => state[k],
    set(k, v) {
      state[k] = v;
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {}
      listeners.forEach((fn) => fn(k, v));
    },
    on: (fn) => listeners.add(fn),
  };

  N9.THEMES = ["amber", "green", "vapor", "ice"];
})();
