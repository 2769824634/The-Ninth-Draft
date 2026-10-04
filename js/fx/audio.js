/* 合成音效：纯 WebAudio，无音频文件。默认关闭，由 AUDIO 开关控制 */
(function () {
  "use strict";

  let ctx = null;
  let master = null;

  const enabled = () => N9.store.get("sound") === "on";

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.18;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function tone({ freq = 880, to = freq, dur = 0.05, type = "square", vol = 0.5, delay = 0 }) {
    if (!enabled() || !ensure()) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function noise({ dur = 0.25, vol = 0.35, freq = 2400 } = {}) {
    if (!enabled() || !ensure()) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = freq;
    f.Q.value = 0.6;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t);
  }

  N9.audio = {
    unlock: ensure,
    click: () => tone({ freq: 1400, to: 700, dur: 0.035, vol: 0.25 }),
    tick: () => tone({ freq: 2200 + Math.random() * 400, dur: 0.012, vol: 0.08 }),
    key: () => tone({ freq: 520, to: 260, dur: 0.06, type: "triangle", vol: 0.5 }),
    channel() {
      noise({ dur: 0.32, vol: 0.4 });
      tone({ freq: 15700 / 4, dur: 0.12, type: "sine", vol: 0.05 });
    },
    power() {
      tone({ freq: 60, to: 120, dur: 0.5, type: "sawtooth", vol: 0.15 });
      tone({ freq: 3900, to: 3900, dur: 0.6, type: "sine", vol: 0.03, delay: 0.05 });
    },
    error: () => tone({ freq: 180, to: 120, dur: 0.18, type: "square", vol: 0.3 }),
  };
})();
