/* 命令终端：按 ` 打开。内置命令 + content.js 中的自定义 commands */
(function () {
  "use strict";

  function createConsole({ app }) {
    const box = document.getElementById("console");
    const out = document.getElementById("console-out");
    const form = document.getElementById("console-form");
    const input = document.getElementById("console-input");
    const history = [];
    let hIndex = 0;
    let greeted = false;

    const print = (text, cls = "") => {
      const line = document.createElement("div");
      if (cls) line.className = cls;
      line.textContent = text;
      out.appendChild(line);
      out.scrollTop = out.scrollHeight;
    };

    const builtins = {
      help: {
        desc: "列出所有命令",
        run() {
          print("可用命令：", "acc");
          Object.entries(builtins).forEach(([k, v]) => print(`  ${k.padEnd(10)} ${v.desc}`));
          const custom = Object.keys(app.site.commands || {});
          if (custom.length) print(`  ${custom.join("  ")}`, "in");
        },
      },
      ls: {
        desc: "列出频道",
        run: () => app.channels.forEach((c) => print(`  CH-${c.code}  ${c.id.padEnd(12)} ${c.label}`)),
      },
      cd: {
        desc: "切换频道：cd <id|编号>",
        run(arg) {
          if (!arg) return print("用法：cd <id|编号>", "err");
          const ch = app.find(arg);
          if (!ch) return print(`找不到频道：${arg}`, "err");
          app.go(ch.id);
          print(`>> TUNING TO CH-${ch.code}`, "acc");
        },
      },
      theme: {
        desc: `切换荧光色：${N9.THEMES.join(" / ")}`,
        run(arg) {
          if (arg && !N9.THEMES.includes(arg)) return print(`未知主题：${arg}`, "err");
          app.setTheme(arg || app.nextTheme());
          print(`PHOSPHOR = ${N9.store.get("theme").toUpperCase()}`, "acc");
        },
      },
      fx: {
        desc: "CRT 特效：fx on|off",
        run(arg) {
          app.setFx(arg === "on" || arg === "off" ? arg : N9.store.get("fx") === "on" ? "off" : "on");
          print(`CRT FX = ${N9.store.get("fx").toUpperCase()}`, "acc");
        },
      },
      sound: {
        desc: "音效：sound on|off",
        run(arg) {
          app.setSound(arg === "on" || arg === "off" ? arg : N9.store.get("sound") === "on" ? "off" : "on");
          print(`AUDIO = ${N9.store.get("sound").toUpperCase()}`, "acc");
        },
      },
      date: { desc: "显示系统时间", run: () => print(new Date().toString()) },
      clear: { desc: "清屏", run: () => (out.innerHTML = "") },
      reboot: { desc: "重新开机", run: () => app.reboot() },
      exit: { desc: "关闭终端", run: () => close() },
    };

    function exec(raw) {
      const line = raw.trim();
      if (!line) return;
      print(`> ${line}`, "in");
      history.push(line);
      hIndex = history.length;
      const [cmd, ...rest] = line.split(/\s+/);
      const arg = rest.join(" ");
      const key = cmd.toLowerCase();
      if (builtins[key]) return builtins[key].run(arg);
      const custom = (app.site.commands || {})[key];
      if (custom !== undefined) return print(typeof custom === "function" ? String(custom(arg)) : String(custom));
      // 直接输入频道 id 也能跳转
      if (app.find(key)) return builtins.cd.run(key);
      N9.audio.error();
      print(`未知命令：${cmd}。输入 help 查看列表。`, "err");
    }

    function open() {
      box.hidden = false;
      if (!greeted) {
        greeted = true;
        print(`${app.site.meta.title} // N9-OS SHELL`, "acc");
        print("输入 help 查看命令。Esc 关闭。");
      }
      requestAnimationFrame(() => input.focus());
      document.getElementById("btn-console").setAttribute("aria-pressed", "true");
    }
    function close() {
      box.hidden = true;
      document.getElementById("btn-console").setAttribute("aria-pressed", "false");
      document.getElementById("screen").focus({ preventScroll: true });
    }
    const toggle = () => (box.hidden ? open() : close());

    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      exec(input.value);
      input.value = "";
    });
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" || ev.key === "`") { ev.preventDefault(); close(); }
      else if (ev.key === "ArrowUp" && history.length) {
        ev.preventDefault();
        hIndex = Math.max(0, hIndex - 1);
        input.value = history[hIndex];
      } else if (ev.key === "ArrowDown" && history.length) {
        ev.preventDefault();
        hIndex = Math.min(history.length, hIndex + 1);
        input.value = history[hIndex] || "";
      } else if (ev.key === "Tab") {
        ev.preventDefault();
        const all = [...Object.keys(builtins), ...Object.keys(app.site.commands || {}), ...app.channels.map((c) => c.id)];
        const hit = all.find((k) => k.startsWith(input.value.trim().toLowerCase()));
        if (hit) input.value = hit + " ";
      } else if (ev.key.length === 1) N9.audio.tick();
    });
    document.getElementById("console-close").addEventListener("click", close);

    return { open, close, toggle, isOpen: () => !box.hidden };
  }

  N9.createConsole = createConsole;
})();
