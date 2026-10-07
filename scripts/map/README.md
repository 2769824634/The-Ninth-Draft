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
| `public/map/detail.json` | 放大以后才下载：小路、水沟、组屋（座号、街名、邮编、建成年份、层数）、地名、设施 |
| `public/map/index.json` | 地名索引：区、车站、地名、河、路、设施，按字母排，带坐标、所在区和邮编 |
| `src/data/gerimis/sheet.ts` | 简化的海岸线、各区标签位置、街道图分页（办公室墙上的地图、幻灯片、登记页的小地图用） |

## 按 1999 年改回去

改动都写在 `build.py` 里，名单式的，想改哪条直接改名单：

- **填海**：大士西边、裕廊岛西半、德光岛的围垦剪掉；之后才建成的水库（榜鹅、实龙岗、滨海）还是海。
- **路**：名字对得上 `LATER_ROADS` 的路不画；新镇（榜鹅、登加、滨海南）的小路不画；挨着 1999 年以后组屋、又不挨着以前组屋的小路不画。
- **组屋**：只画 1999 年及以前建成的（约八千座）。
- **地铁**：只有南北线、东西线；武吉班让轻轨 11 月 6 日以前画虚线并注明开通日；东北线画成在挖。马来亚铁路还在跑，裕廊支线停用。
- **机场跑道**：只画樟宜两条和实里达一条。
- **未测绘**：军事用地、德光岛、巴耶利峇、登加、西部集水区留白打斜线。
- **路名**：以总督、王室、政治人物命名的路不标名字（`UNNAMED` 名单）；地铁站名按地名录改（如 Raffles Place → Axis），改了名的地方的路跟着改（`STREET_RENAME`：Clementi Avenue 3 → West Coast Avenue 3，Eunos Crescent → Kampong Melayu Crescent）。
- **门牌和邮编**：组屋街名用 OpenStreetMap 的全称，没有的照建屋局的缩写展开（BT BATOK WEST AVE 6 → Bukit Batok West Avenue 6）；街名不标的组屋，地址只写座号和区。邮编照新加坡的规矩：两位邮区 + 一位小区 + 三位座号（宏茂桥 123 座 = 560123），前三位从 OpenStreetMap 里同一条街已有的邮编学来，学不到就用最近一座的；带字母的座号和撞号的往后挪一位小区号，一座一个邮编。

- **设施**（`facilities_1999.py` 是名单，`build.py` 里的「facilities」一段照名单放上图）：
  - 巴刹和熟食中心：组屋数据里标了「楼下有巴刹 / 小贩中心」的那一座，加上 OpenStreetMap 里叫 Market、Food Centre、Hawker Centre 的；挨得近又同名的算一处。楼下的跟着那一座的门牌和邮编走。
  - 巴士转换站、商场、医院、综合诊疗所、图书馆、渡轮码头：`LISTED` 名单，一行一处，写明 1999 年以前开的年份；位置从 OpenStreetMap 同名的楼或地块取，找不到就放在镇中心最近的商业组屋。以政治人物命名的照地名的规矩改名（`LISTED` 里直接写改后的名字）。`MANUAL` 是 OpenStreetMap 里已经没有的（旧国家图书馆、红灯码头、1996 年关的邮政总局，最后这个用红铅笔画）。
  - 邮局：几间老邮局照名单，其余每个住人的区在镇中心放一间。
  - 民众联络所、游泳池：照 OpenStreetMap，`CC_RENAME` 改名。
  - 学校：只取位置，名字虚构，「区名 + 一种树 + 小学 / 中学 / 初级学院」；大学和理工学院用区名或岛名。
  - 宗教场所：只写外观（教堂、庙、清真寺、兴都庙、锡克庙、犹太会堂），不写名字。
  - 名字带 `LATER` 里的字样（超市、海鲜、综合交通枢纽之类）或位置落在 1999 年以后的新地上的，不画。
  - 自己独立的设施配一个邮编：最近一座组屋的邮区 + 四位，全岛不重号。

这些是按公开资料推断的，和真实的 1999 年一定有出入，发现了就改名单重跑。

## 出处与许可

- 地图形状：© OpenStreetMap 贡献者，经 [Overture Maps](https://overturemaps.org/) 发布的数据读取。从它派生的 `public/map/*.json` 和 `sheet.ts` 中的坐标数据按 [ODbL](https://opendatacommons.org/licenses/odbl/) 提供。
- 组屋座号和建成年份：NUS Urban Analytics Lab 的 [hdb3d-data](https://github.com/ualsg/hdb3d-data)（基于 OpenStreetMap、HDB 开放数据和 OneMap）。
- 设施的位置：OpenStreetMap 里有名字的楼、地块和车站；开业年份按公开资料手写在名单里。
- 铁路线和车站位置：[railrouter-sg](https://github.com/cheeaun/railrouter-sg)。

页面上的地图右下角注明「地图参考 © OpenStreetMap 贡献者」。
