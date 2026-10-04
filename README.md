# THE NINTH DRAFT · 第九稿

一座冷战风格的解密档案馆。网站界面全英文；本说明为中文。

访问者走进一间档案室：一排排钢制抽屉里插满马尼拉纸档案夹，用长焦镜头拍摄。选中的档案会从抽屉里升起，打开后飞到镜头前翻开封面，露出夹着回形针的照片页和借阅登记表，右侧同时展开打字机风格的档案正文。太空元素只作为风格出现：轨道线、星图坐标、档案馆徽章上的卫星，不限定内容题材。

视觉与交互参考了《明日方舟》「莱茵生命：访问」的档案终端（[RhineLabUI](https://github.com/LBEILC/RhineLabUI) / [Rhine-Music-Demo](https://github.com/RonaldDeng/Rhine-Music-Demo)）和 [OHM TAPE](https://github.com/zcy83821448/cassette) 的「没有硬切」原则。代码、模型、贴图、音效全部为本项目原创，场景完全程序化生成，没有使用外部模型或图片。

## 功能

- **3D 档案室**（Three.js）：抽屉、档案夹、回形针、印章、打字机文字全部用代码生成
- **浏览**：`↑ ↓` 翻档案（前面的档案会向前倾倒），`← →` 换抽屉，滚轮或拖动也可以翻，点击档案选中，再点一次打开
- **档案详情**：档案飞到镜头前翻开；可以拖动旋转，双击复位；正文分「Overview / Record / Related」三栏，切换时有自上而下的解密效果
- **涂黑文字**：正文里 `||这样写||` 会显示为黑条，鼠标悬停或点按后显示
- **关联档案**：`related` 字段自动生成双向链接（被引用的档案也会反向列出）
- **线索墙**（第二个房间，`/wall/`）：所有档案以卡片钉在软木板上，红线直接来自 `related` 字段，不用多写任何东西。按 `W` 或点右上角 Links 进入，档案详情的 Related 栏也可以「Show on the link wall」。鼠标停在卡片上只显示它的联系；卡片可以拖动，红线会下垂摆动；点击卡片回到档案室打开它。滚轮缩放，拖动空白处平移，`← →` 轮流聚焦，Reset wall 恢复原来的排布。拖过的位置只保存在你自己的浏览器里
- **套色网点照片**：档案的 `image` 照片会在浏览器里自动转成网点，用黑、红两色套印，红版故意错开一点。3D 档案夹内页、详情栏 Overview 和线索墙卡片上都用这张网点照片。没有照片的人员档案会显示一张代码生成的网点剪影（每个编号的剪影都不一样），说明文字写 "No photograph on file · Composite"；有照片时显示 `imageCaption`
- **Programs 章节页**：每次访问第一次打开 Programs 抽屉时，会先闪过一张构成主义风格的章节页（斜向红块、黑色楔形、超宽小写标题、徽章、档案数量和年份范围），约两秒后自动消失，点击或按任意键可以跳过。NASA 蓝只在这里出现
- **光圈转场**：两个房间之间用相机光圈切换，六片叶片收拢再张开；系统开启「减少动态效果」时改为淡入淡出
- **检索**：按 `/` 打开全文检索，可以搜索标题、编号、字段和正文
- **昼 / 夜**：白天是灰白档案室；夜晚只有一盏台灯照着当前档案，切换时颜色平滑过渡
- **声音**：环境底噪加低频嗡鸣，纸张、抽屉、盖章、打字等音效；切换抽屉时有调频杂音，Programs 抽屉里能听到 Sputnik 的「哔—哔—」；每隔一两分钟，远处的数字电台会放一段旋律，再报一组数字。全部实时合成，可以随时关闭
- **每份档案都有独立网址**（`/records/p-0001/`），可以直接分享
- 适配手机竖屏；系统开启「减少动态效果」时自动降级

## 添加 / 修改档案

每份档案是 `src/content/records/` 下的一个 Markdown 文件，子文件夹只是为了方便整理：

```markdown
---
file: "P-0005"                 # 档案编号，必须唯一
category: personnel            # personnel 人员 / events 事件 / programs 计划
title: "Full Name"
subtitle: "Role or alias"
stamp: "SECRET"                # TOP SECRET / SECRET / CONFIDENTIAL / RESTRICTED / DECLASSIFIED
status: "Declassified"
date: "1931 – 1990"
place: "Berlin"
image: "records/p-0005.jpg"    # 可选，图片放在 public/records/ 下
fields:
  - label: "Role"
    value: "Courier"
summary: "Overview 栏的摘要，可以用 ||涂黑||。"
related: ["E-0001", "R-0002"]  # 关联档案的编号
tags: ["berlin"]
order: 5                       # 在同一类别里的排序
---

Record 栏的正文，标准 Markdown，同样支持 ||涂黑||。
```

保存后，开发模式下页面会自动刷新；推送到 `main` 后会自动部署。

### 修订痕迹（第九稿）

在 `summary`、`fields` 的值或正文里加修订标记，档案详情页左下角就会出现 **Draft 01 → 09 修订滑杆**（键盘 `[` `]` 也能切换）。第 9 稿就是你写的定稿；没有任何标记的档案不显示滑杆。拖动滑杆时，3D 档案夹封面和内页上的印章也会换成那一稿的密级。

| 写法 | 效果 |
| --- | --- |
| `[[+5: 文字]]` | 第 5 稿新加入（当稿以蓝底高亮），之前的稿里不存在 |
| `[[-6: 文字]]` | 第 6 稿被红线划掉，之后消失 |
| `[[#3-7: 文字]]` | 第 3–7 稿被涂黑；只写一个数字（如 `[[#3: …]]`）表示从第 3 稿起一直涂黑 |
| `[[note 4-6: 文字]]` | 第 4–6 稿出现手写批注，自动署名 **— Heuss**；只写一个数字表示仅那一稿 |
| `\|\|文字\|\|` | 定稿中的涂黑，读者悬停或点按可以揭开 |

每一稿的标签、日期、经手人和印章可以在 frontmatter 里写（可选，不写就用默认值）：

```yaml
drafts:
  - n: 1
    label: "Field notes"
    date: "1959-11-04"
    by: "A. Reiss"
    stamp: "DRAFT"        # DRAFT / TOP SECRET / SECRET / CONFIDENTIAL / RESTRICTED / DECLASSIFIED
  - n: 5
    label: "Amended"
    by: "Heuss"
    stamp: "TOP SECRET"
```

滑到哪一稿，界面颜色就跟着那一稿的密级变化。

### 密级颜色

| 密级 | 颜色 |
| --- | --- |
| TOP SECRET | 朱红 |
| SECRET | 琥珀 |
| CONFIDENTIAL | 钴蓝 |
| RESTRICTED | 橄榄绿 |
| DECLASSIFIED | 墨黑（夜间为纸白） |

档案夹标签、印章墨色、界面强调线、页面背景的大编号、夜间台灯色温都会跟着当前档案的密级变化。

### ARCHIVIST（档案馆管理员）

页面左下角的那行话来自 `src/data/archivist.json`。每类事件（欢迎、开抽屉、打开某个密级的档案、翻回早期稿、揭开涂黑、检索无结果、发呆太久、进出线索墙等）都是一组台词，随机挑一句说。`{title}`、`{file}`、`{draft}` 会自动替换成当前的档案标题、编号和稿号。想加多少句都行。

## 本地运行

```bash
npm install
npm run dev       # http://localhost:4321/The-Ninth-Draft/
npm run build     # 输出到 dist/
```

## 部署（GitHub Pages）

`.github/workflows/deploy.yml` 会在每次推送到 `main` 时构建并发布。首次使用需要把仓库 **Settings → Pages → Source** 改成 **GitHub Actions**。

网址：<https://2769824634.github.io/The-Ninth-Draft/>

## 目录

```
src/content/records/      档案（Markdown）
src/content.config.ts     档案字段定义
src/lib/records.ts        读取档案、生成涂黑、校验编号和关联
src/components/           页面结构（Archive.astro）与徽章
src/styles/               设计令牌、HUD、档案栏、开机与检索
src/app/main.ts           状态、路由、键盘
src/app/scene/            3D：档案室、线索墙（wall.ts）、档案夹、程序化纸张贴图
src/app/ui/               档案栏、检索、开机、文字动效、光圈转场（iris.ts）
src/app/audio.ts          合成音效、数字电台、Sputnik
src/app/clearance.ts      密级 → 颜色
src/app/ui/archivist.ts   ARCHIVIST 台词
src/data/archivist.json   ARCHIVIST 台词表（可以随意改）
```
