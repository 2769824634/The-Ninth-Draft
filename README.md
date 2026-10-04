# THE NINTH DRAFT // 第九稿

复古未来主义 · 卡带未来主义 · 蒸汽波 · CRT 的信息档案站。纯 HTML / CSS / JS，零依赖，无需构建。

## 运行

- 直接双击 `index.html` 即可（支持 `file://`）
- 或本地起服务：`python3 -m http.server`，访问 <http://localhost:8000>
- 部署：推到 GitHub Pages / Netlify / 任意静态托管

## 日常编辑：只改 `js/content.js`

站点由 **频道 (channels)** 组成，每个频道是一串 **内容块 (blocks)**。新增频道 = 往 `channels` 数组里加一个对象，左侧频道键、键盘快捷键、终端命令全部自动生成。

| 块类型 | 字段 |
| --- | --- |
| `hero` | `kicker`, `title`, `lines[]`（打字机轮播，背景是实时渲染的落日网格） |
| `heading` | `text`, `sub` |
| `text` | `body` |
| `cards` | `items[]: { tag, title, body, foot, href }` |
| `timeline` | `items[]: { date, title, body }` |
| `stats` | `items[]: { label, value, unit, max }`（进入视野时计数动画） |
| `data` | `rows[]: [键, 值]` |
| `log` | `lines[]`，`{ok}..{/ok}` `{warn}` `{err}` `{dim}` 着色，逐行打印 |
| `quote` | `text`, `cite` |
| `image` | `src`, `alt`, `caption`（默认单色荧光，悬停还原彩色） |
| `divider` | `text` |
| `links` | `items[]: { label, href }` |

行内标记：`**粗体**`、`` `代码` ``、`==高亮==`、`[文字](链接)`，`\n` 换行，`\n\n` 分段。

## 交互

| 操作 | 说明 |
| --- | --- |
| `1`–`9` / `←` `→` | 换台（CRT 关机收缩 → 雪花 → 开机展开） |
| `` ` `` | 打开命令终端（`help` `ls` `cd` `theme` `fx` `sound` `reboot`…，支持 Tab 补全与历史） |
| `T` | 切换荧光色：琥珀 / 绿 / 蒸汽粉 / 冰蓝 |
| `F` | CRT 特效开关（扫描线、闪烁、噪点） |
| `M` | 合成音效开关（WebAudio 实时合成，无音频文件） |

磁带卷盘随滚动速度转动，TAPE 计数器显示当前位置。偏好保存在本地；系统开启「减少动态效果」时自动降级。

## 目录

```
index.html            外壳结构
css/tokens.css        配色 / 字体 / 主题 —— 换肤改这里
css/deck.css          硬件外壳（顶栏、频道键、卡带、跑马灯）
css/crt.css           显像管（扫描线、暗角、换台动画）
css/blocks.css        各内容块样式
css/overlays.css      开机自检、终端
js/content.js         ★ 内容
js/core/blocks.js     块渲染器 —— N9.blocks.register() 新增块类型
js/core/console.js    命令终端
js/fx/background.js   蒸汽波场景（Canvas）
js/fx/noise.js        雪花噪点
js/fx/text.js         打字机 / 乱码解码
js/fx/audio.js        合成音效
js/app.js             路由、开机、键盘、面板联动
```

### 自定义块

```js
// 在 js/core/blocks.js 末尾或新文件中
N9.blocks.register("gauge", (data, ctx) => {
  const el = N9.h(`<div class="gauge">${N9.escape(data.label)}</div>`);
  ctx.mounted(() => { /* 挂载后 */ });
  ctx.cleanup(() => { /* 换台时清理 */ });
  return el;
});
```
