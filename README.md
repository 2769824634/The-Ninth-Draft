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
- **检索**：按 `/` 打开全文检索，可以搜索标题、编号、字段和正文
- **昼 / 夜**：白天是灰白档案室；夜晚只有一盏台灯照着当前档案，切换时颜色平滑过渡
- **声音**：环境底噪加低频嗡鸣，以及纸张、抽屉、盖章、打字等音效，全部由 WebAudio 实时合成，可以随时关闭
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
src/app/scene/            3D：场景、档案夹、程序化纸张贴图
src/app/ui/               档案栏、检索、开机、文字动效
src/app/audio.ts          合成音效
```
