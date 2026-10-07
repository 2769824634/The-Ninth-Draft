# 街道图的数据

霏微地图（`/map/`、各区页）画的是一本 1999 年的街道图。形状参考 OpenStreetMap，重画成我们自己的线条，再按 1999 年改回去。这里的两个脚本把原始数据变成网站用的文件；平时加档案不用碰它们，只有想改地图本身时才跑。

## 怎么跑

```sh
python3 -m pip install pyarrow shapely pyproj
python3 scripts/map/fetch.py     # 下载原始数据到 .cache/map-src/（不进仓库，约几百 MB）
python3 scripts/map/build.py     # 生成下面三个文件
```

在需要代理证书的环境里，`fetch.py` 前面加 `SSL_CERT_FILE=<证书路径>`。

生成：

| 文件 | 内容 |
| --- | --- |
| `public/map/base.json` | 全岛：陆地、水、绿地、工业区、主要道路、铁路、地铁站、区界 |
| `public/map/detail.json` | 放大以后才下载：小路、水沟、组屋和座号、地名 |
| `src/data/gerimis/sheet.ts` | 简化的海岸线、各区标签位置、街道图分页（办公室墙上的地图、幻灯片、登记页的小地图用） |

## 按 1999 年改回去

改动都写在 `build.py` 里，名单式的，想改哪条直接改名单：

- **填海**：大士西边、裕廊岛西半、德光岛的围垦剪掉；之后才建成的水库（榜鹅、实龙岗、滨海）还是海。
- **路**：名字对得上 `LATER_ROADS` 的路不画；新镇（榜鹅、登加、滨海南）的小路不画；挨着 1999 年以后组屋、又不挨着以前组屋的小路不画。
- **组屋**：只画 1999 年及以前建成的（约八千座）。
- **地铁**：只有南北线、东西线；武吉班让轻轨 11 月 6 日以前画虚线并注明开通日；东北线画成在挖。马来亚铁路还在跑，裕廊支线停用。
- **机场跑道**：只画樟宜两条和实里达一条。
- **未测绘**：军事用地、德光岛、巴耶利峇、登加、西部集水区留白打斜线。
- **路名**：以总督、王室、政治人物命名的路不标名字（`UNNAMED` 名单）；地铁站名按地名录改（如 Raffles Place → Axis）。

这些是按公开资料推断的，和真实的 1999 年一定有出入，发现了就改名单重跑。

## 出处与许可

- 地图形状：© OpenStreetMap 贡献者，经 [Overture Maps](https://overturemaps.org/) 发布的数据读取。从它派生的 `public/map/*.json` 和 `sheet.ts` 中的坐标数据按 [ODbL](https://opendatacommons.org/licenses/odbl/) 提供。
- 组屋座号和建成年份：NUS Urban Analytics Lab 的 [hdb3d-data](https://github.com/ualsg/hdb3d-data)（基于 OpenStreetMap、HDB 开放数据和 OneMap）。
- 铁路线和车站位置：[railrouter-sg](https://github.com/cheeaun/railrouter-sg)。

页面上的地图右下角注明「地图参考 © OpenStreetMap 贡献者」。
