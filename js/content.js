/* ==========================================================================
   THE NINTH DRAFT — 内容数据
   --------------------------------------------------------------------------
   这是你日常唯一需要改的文件。站点 = 若干「频道」(channels)，
   每个频道 = 若干「内容块」(blocks)。块按顺序渲染到 CRT 屏幕里。

   行内标记（text / body 等字段可用）：
     **粗体**   `代码`   ==高亮==   [链接文字](https://...)   换行用 \n

   可用块类型（详见「操作手册」频道的示例）：
     hero / heading / text / cards / timeline / stats / data /
     log / quote / image / divider / links
   ========================================================================== */
window.SITE = {
  meta: {
    title: "THE NINTH DRAFT",
    subtitle: "DATA TERMINAL",
    model: "N9-1984",
    owner: "OPERATOR",
  },

  /* 开机自检文字；{hl}...{/hl} 为荧光高亮。设为 [] 可跳过开机动画 */
  boot: [
    "N9-BIOS v9.0.1  (C) 1984-2049 NINTH DRAFT SYSTEMS",
    "",
    "CPU  : HELIX-9 @ 4.77 MHz ............ OK",
    "MEM  : 640K BASE + 15360K EXT ......... OK",
    "TAPE : C-90 CHROME DIOXIDE ............ LOADED",
    "VIDEO: PHOSPHOR P3 / 80x25 ............ OK",
    "",
    "MOUNTING ARCHIVE /DRAFT/09 ...",
    "{hl}>> WELCOME BACK, OPERATOR.{/hl}",
  ],

  /* 底部跑马灯 */
  ticker: [
    "SIGNAL ACQUIRED — 第九稿正在播送",
    "按 ` 打开终端，输入 help 查看命令",
    "所有内容存放在 js/content.js",
    "未来已经来过一次了",
    "TAPE SIDE A // 45 MIN // DOLBY NR ON",
  ],

  channels: [
    /* ------------------------------------------------------------------ */
    {
      id: "home",
      label: "主控台",
      blocks: [
        {
          type: "hero",
          kicker: "// TRANSMISSION 09",
          title: "The Ninth Draft",
          lines: [
            "一台来自过去的未来终端。",
            "这里存放着第九稿的全部档案。",
            "请调整你的天线，信号即将稳定。",
          ],
        },
        {
          type: "text",
          body: "欢迎来到 **第九稿**。这是一个以 ==复古未来主义== 为外壳的信息档案站：卡带、显像管、霓虹与网格。\n用左侧的频道键或键盘 `1`–`9` 切换频道，`←` `→` 依次换台。",
        },
        {
          type: "stats",
          items: [
            { label: "档案条目", value: 128, max: 200 },
            { label: "信号强度", value: 87, unit: "%", max: 100 },
            { label: "运行时长", value: 9, unit: "YRS", max: 12 },
            { label: "未读频道", value: 4, max: 9 },
          ],
        },
        {
          type: "links",
          items: [
            { label: "进入档案", href: "#/archive" },
            { label: "阅读手册", href: "#/manual" },
          ],
        },
      ],
    },

    /* ------------------------------------------------------------------ */
    {
      id: "archive",
      label: "档案库",
      blocks: [
        { type: "heading", text: "档案库", sub: "ARCHIVE // 12 ENTRIES" },
        {
          type: "cards",
          items: [
            { tag: "PROJ", title: "霓虹回廊", body: "关于城市夜景与 1980 年代广告美学的一组研究笔记。", foot: "2049.03", href: "#/log" },
            { tag: "NOTE", title: "磁带的记忆", body: "模拟介质的失真为什么让人怀念？一篇关于噪声的随笔。", foot: "2048.11" },
            { tag: "SPEC", title: "N9 终端规格", body: "这台机器的设计稿、配色、交互原则与零件清单。", foot: "2048.07", href: "#/spec" },
            { tag: "LOG", title: "第一稿到第九稿", body: "九次推翻与重写的完整记录。", foot: "2047.01", href: "#/log" },
            { tag: "WAV", title: "落日合成器", body: "用 FM 合成器还原一段并不存在的广告配乐。", foot: "2046.08" },
            { tag: "IMG", title: "网格地平线", body: "粉色太阳、紫色天空、无限延伸的线框地面。", foot: "2046.02" },
          ],
        },
      ],
    },

    /* ------------------------------------------------------------------ */
    {
      id: "log",
      label: "航行日志",
      blocks: [
        { type: "heading", text: "航行日志", sub: "CAPTAIN'S LOG" },
        {
          type: "timeline",
          items: [
            { date: "2049.03.09", title: "第九稿上线", body: "所有档案迁移至新终端，信号稳定。" },
            { date: "2048.12.31", title: "第八稿废弃", body: "推倒重来。原因：**不够复古，也不够未来**。" },
            { date: "2047.06.14", title: "接收到第一段信号", body: "来自 1984 年的一卷 C-90 磁带。" },
            { date: "2046.01.01", title: "项目启动", body: "在一台旧电视前，写下第一行字。" },
          ],
        },
        { type: "divider", text: "END OF TAPE" },
        {
          type: "log",
          lines: [
            "{dim}[00:00:01]{/dim} 正在倒带 ...",
            "{ok}[  OK  ]{/ok} 磁头清洁完成",
            "{warn}[ WARN ]{/warn} 检测到轻微抖晃 (wow & flutter 0.08%)",
            "{err}[ FAIL ]{/err} 第三稿 —— 无法读取，磁带已消磁",
            "{ok}[  OK  ]{/ok} 第九稿 —— 读取完整",
          ],
        },
      ],
    },

    /* ------------------------------------------------------------------ */
    {
      id: "spec",
      label: "技术规格",
      blocks: [
        { type: "heading", text: "技术规格", sub: "SPEC SHEET" },
        {
          type: "data",
          rows: [
            ["型号", "N9-1984 DATA TERMINAL"],
            ["显像管", "14 英寸 P3 琥珀荧光 / 可切换 P1 绿色"],
            ["存储介质", "C-90 铬带，双面"],
            ["接口", "RS-232 / 天线 / [超链接](https://github.com)"],
            ["外壳", "枪灰 ABS + 四色警示条纹"],
            ["设计语言", "复古未来主义 · 卡带未来主义 · 蒸汽波"],
          ],
        },
        {
          type: "quote",
          text: "未来不是一个地方，而是一盘我们一直在倒带重听的磁带。",
          cite: "第九稿序言",
        },
      ],
    },

    /* ------------------------------------------------------------------ */
    {
      id: "manual",
      label: "操作手册",
      blocks: [
        { type: "heading", text: "操作手册", sub: "HOW TO EDIT" },
        {
          type: "text",
          body: "所有内容都在 `js/content.js` 里。新增一个频道：在 `channels` 数组里加一个对象，写上 `id`、`label` 和 `blocks` 即可，左侧频道键会自动生成。",
        },
        {
          type: "log",
          lines: [
            "{dim}// 一个频道的最小结构{/dim}",
            "{",
            "  id: \"notes\",",
            "  label: \"随笔\",",
            "  blocks: [",
            "    { type: \"heading\", text: \"随笔\", sub: \"NOTES\" },",
            "    { type: \"text\", body: \"支持 **粗体** 与 [链接](https://...)\" },",
            "  ],",
            "}",
          ],
        },
        { type: "heading", text: "块类型速查" },
        {
          type: "data",
          rows: [
            ["hero", "kicker, title, lines[]（打字机轮播）"],
            ["heading", "text, sub"],
            ["text", "body（支持行内标记）"],
            ["cards", "items[]: tag, title, body, foot, href"],
            ["timeline", "items[]: date, title, body"],
            ["stats", "items[]: label, value, unit, max"],
            ["data", "rows[]: [键, 值]"],
            ["log", "lines[]，可用 {ok}{warn}{err}{dim} 着色"],
            ["quote", "text, cite"],
            ["image", "src, alt, caption"],
            ["divider", "text"],
            ["links", "items[]: label, href"],
          ],
        },
        {
          type: "text",
          body: "需要新的块类型？在 `js/core/blocks.js` 里用 `N9.blocks.register(\"类型名\", 渲染函数)` 注册即可。",
        },
      ],
    },
  ],

  /* 终端自定义命令：输入命令名即输出对应文字 */
  commands: {
    whoami: "OPERATOR // 第九稿的守夜人",
    motd: "今天也是适合倒带的一天。",
  },
};
