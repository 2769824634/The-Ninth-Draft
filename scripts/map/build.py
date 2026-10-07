"""
Build the street map of Gerimis, as surveyed in 1999, from the sources that
scripts/map/fetch.py leaves in .cache/map-src/.

  python3 scripts/map/build.py

Writes
  public/map/base.json    the island sheet: land, water, green, roads, rail, districts
  public/map/detail.json  close up: small roads, streams, HDB blocks with their addresses, place names
  public/map/index.json   the index at the back: every name on the sheet, A to Z
  src/data/gerimis/sheet.ts   a light coast for the office and the small maps

Shapes follow OpenStreetMap, then go back to 1999: reclamation after 1999 is
cut off, roads and blocks built after 1999 are left out, the MRT is the 1999
network. Everything written here is derived from OpenStreetMap and is ODbL,
(c) OpenStreetMap contributors.

Needs: pyarrow, shapely, pyproj.
"""
import json, math, os, re
import pyarrow.parquet as pq
import pyarrow.compute as pc
import shapely
from shapely.geometry import Polygon, MultiPolygon, LineString, MultiLineString, Point, box
from shapely.ops import unary_union, linemerge, transform as stransform
from pyproj import Transformer

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
SRC = os.path.join(ROOT, '.cache', 'map-src')
OUT = os.path.join(ROOT, 'public', 'map')

# The survey sheet (same as src/data/gerimis/districts.ts): 2150 units a degree from 103.605E, 1.475N.
K, LON0, LAT0 = 2150, 103.605, 1.475
Q = 10  # stored to a tenth of a unit, about 5 m


def to_sheet(g):
    return stransform(lambda x, y, z=None: ((x - LON0) * K, (LAT0 - y) * K), g)


def table(name, **eq):
    t = pq.read_table(os.path.join(SRC, f'{name}.parquet'))
    for k, v in eq.items():
        t = t.filter(pc.is_in(t[k], value_set=__import__('pyarrow').array(v if isinstance(v, list) else [v])))
    return t


def geoms(t):
    return shapely.from_wkb(t['geometry'].to_pylist())


def names(t):
    out = []
    for n in t['names'].to_pylist():
        n = n or {}
        common = dict(n.get('common') or [])
        out.append((n.get('primary'), common.get('zh') or common.get('zh-Hans')))
    return out


def polys(g):
    if g is None or g.is_empty: return []
    if isinstance(g, Polygon): return [g]
    if isinstance(g, MultiPolygon): return list(g.geoms)
    if hasattr(g, 'geoms'): return [p for x in g.geoms for p in polys(x)]
    return []


def lines(g):
    if g is None or g.is_empty: return []
    if isinstance(g, LineString): return [g]
    if isinstance(g, MultiLineString): return list(g.geoms)
    if hasattr(g, 'geoms'): return [p for x in g.geoms for p in lines(x)]
    return []


# ---------- encoding: rings and lines as delta-coded integers ----------
def enc(coords):
    out, px, py = [], 0, 0
    for x, y in coords:
        ix, iy = round(x * Q), round(y * Q)
        if out and ix == px and iy == py: continue
        out += [ix - px, iy - py]
        px, py = ix, iy
    return out


def enc_poly(p, tol, min_area=0):
    p = p.simplify(tol, preserve_topology=True)
    if p.is_empty or p.area < min_area: return None
    rings = [enc(p.exterior.coords)] + [enc(r.coords) for r in p.interiors if Polygon(r).area >= max(min_area, tol * tol * 4)]
    return [r for r in rings if len(r) >= 6] or None


def enc_line(l, tol):
    l = l.simplify(tol)
    c = enc(l.coords)
    return c if len(c) >= 4 else None


def r1(v):
    return round(v, 1)


# ---------- 1999 land ----------
div = table('division_area')
dn = names(div)
dg = geoms(div)
subtype = div['subtype'].to_pylist()
cls = div['class'].to_pylist()
country = div['country'].to_pylist()
sg_sea = unary_union([g for g, s, c, k in zip(dg, subtype, cls, country) if s == 'country' and c == 'maritime' and k == 'SG'])
sg_div = unary_union([g for g, s, c, k in zip(dg, subtype, cls, country) if s == 'country' and c == 'land' and k == 'SG'])
# the coast itself comes from OpenStreetMap's coastline (the land layer), cut to Singapore's waters
_land = table('land', **{'class': ['land', 'island', 'islet']})
sg_land = unary_union([g for g in geoms(_land) if g.intersects(sg_div)]).intersection(sg_sea.union(sg_div))

# reclaimed after 1999, in degrees: these go back to sea
LATER = [
    # Tuas View and the Tuas port
    Polygon([(103.57, 1.297), (103.616, 1.294), (103.636, 1.286), (103.66, 1.272), (103.68, 1.25), (103.68, 1.18), (103.57, 1.18)]),
    # the western half of Jurong Island (Banyan, Jurong Island west), joined in the 2000s
    Polygon([(103.64, 1.30), (103.676, 1.30), (103.684, 1.262), (103.672, 1.226), (103.64, 1.226)]),
    # Pulau Tekong's polder
    Polygon([(103.985, 1.43), (104.012, 1.43), (104.014, 1.408), (104.0, 1.39), (103.985, 1.385)]),
]
later = unary_union(LATER)
land99 = sg_land.difference(later)
# Pulau Ubin sits next to Tekong's polder; keep whatever of it the cut touched
land99 = unary_union([land99] + [p for p in polys(sg_land.intersection(later)) if p.representative_point().x < 103.99 and p.representative_point().y > 1.39])

far = unary_union([g for g, s, c, k in zip(dg, subtype, cls, country) if s == 'country' and c == 'land' and k in ('MY', 'ID')]).intersection(box(103.55, 1.13, 104.15, 1.50))

land99_s = to_sheet(land99)
far_s = to_sheet(far)

# ---------- districts ----------
URA = {
    'DOWNTOWN CORE': 'axis', 'BUKIT MERAH': 'bukit-merah', 'TOA PAYOH': 'toa-payoh', 'BISHAN': 'bishan', 'BUKIT TIMAH': 'bukit-timah',
    'ORCHARD': 'orchard', 'NEWTON': 'newton', 'NOVENA': 'novena', 'TANGLIN': 'tanglin', 'RIVER VALLEY': 'river-valley',
    'SINGAPORE RIVER': 'gerimis-river', 'ROCHOR': 'rochor', 'MUSEUM': 'bukit-larangan', 'OUTRAM': 'kreta-ayer', 'QUEENSTOWN': 'queenstown',
    'KALLANG': 'kallang', 'GEYLANG': 'geylang', 'MARINE PARADE': 'marine-parade', 'MARINA EAST': 'marina', 'MARINA SOUTH': 'marina',
    'STRAITS VIEW': 'marina', 'SOUTHERN ISLANDS': 'southern-islands', 'BEDOK': 'bedok', 'TAMPINES': 'tampines', 'PASIR RIS': 'pasir-ris',
    'CHANGI': 'changi', 'CHANGI BAY': 'changi', 'PAYA LEBAR': 'paya-lebar', 'WOODLANDS': 'woodlands', 'SEMBAWANG': 'sembawang',
    'YISHUN': 'yishun', 'MANDAI': 'mandai', 'CENTRAL WATER CATCHMENT': 'central-catchment', 'SUNGEI KADUT': 'sungei-kadut',
    'SIMPANG': 'simpang', 'LIM CHU KANG': 'lim-chu-kang', 'ANG MO KIO': 'ang-mo-kio', 'SERANGOON': 'serangoon', 'HOUGANG': 'hougang',
    'SENGKANG': 'sengkang', 'PUNGGOL': 'punggol', 'SELETAR': 'seletar', 'NORTH-EASTERN ISLANDS': 'north-eastern-islands',
    'CLEMENTI': 'west-coast', 'JURONG EAST': 'jurong-east', 'JURONG WEST': 'jurong-west', 'BOON LAY': 'boon-lay', 'PIONEER': 'pioneer',
    'TUAS': 'tuas', 'WESTERN ISLANDS': 'western-islands', 'WESTERN WATER CATCHMENT': 'western-catchment', 'TENGAH': 'tengah',
    'BUKIT BATOK': 'bukit-batok', 'BUKIT PANJANG': 'bukit-panjang', 'CHOA CHU KANG': 'choa-chu-kang',
}
parts = {}
for g, s, c, k, (en, zh) in zip(dg, subtype, cls, country, dn):
    if s == 'county' and k == 'SG' and en and en.upper() in URA:
        parts.setdefault(URA[en.upper()], []).append(g)
assert len(parts) == 52, sorted(set(URA.values()) - set(parts))
district_deg = {d: unary_union(gs).intersection(land99) for d, gs in parts.items()}
district_s = {d: to_sheet(g) for d, g in district_deg.items()}
UNSURVEYED = {'paya-lebar', 'western-catchment', 'tengah'}


def in_district(pt_deg):
    for d, g in district_deg.items():
        shapely.prepare(g)
        if g.contains(pt_deg): return d
    return None


# military ground drawn blank (besides the three unsurveyed districts): Tekong and the bases
lu = table('land_use')
lu_g, lu_n = geoms(lu), names(lu)
lu_sub, lu_cls = lu['subtype'].to_pylist(), lu['class'].to_pylist()
military = unary_union([g for g, s in zip(lu_g, lu_sub) if s == 'military' and g.area * 111 ** 2 > 0.05])
tekong = [p for p in polys(land99) if p.contains(Point(104.03, 1.405))]
blank_deg = unary_union([military] + tekong + [district_deg[d] for d in UNSURVEYED]).intersection(land99)

# ---------- water ----------
wt = table('water')
w_g, w_n, w_cls = geoms(wt), names(wt), wt['class'].to_pylist()
POST99_WATER = {'Punggol Reservoir', 'Serangoon Reservoir', 'Marina Reservoir'}  # in 1999 these are still river mouths and sea
water_polys, water_lines, stream_lines = [], [], []
for g, (en, zh), c in zip(w_g, w_n, w_cls):
    if c in ('swimming_pool', 'reflecting_pool', 'fountain', 'ocean', 'strait', 'bay', 'cape', 'shoal', 'waterfall', 'spring', 'hot_spring', 'wastewater', 'sewage'):
        continue
    if g.geom_type.endswith('Polygon'):
        a = g.area * 111 ** 2
        if a < (0.004 if c in ('reservoir', 'lake', 'river', 'canal', 'water', 'basin', 'lagoon') else 0.02): continue
        water_polys.append(g)
    elif g.geom_type.endswith('LineString'):
        if c in ('river', 'canal'): water_lines.append((g, en, zh))
        elif c in ('stream', 'drain') and g.length * 111 > 0.3: stream_lines.append(g)
# the barrages came after 1999: these reservoirs are still the sea and river mouths, so they come out of the land
later_water = unary_union([g for g, (en, _) in zip(w_g, w_n) if en in POST99_WATER and g.geom_type.endswith('Polygon')])
land99 = land99.difference(later_water.buffer(0.00005))
land99_s = to_sheet(land99)
district_deg = {d: g.difference(later_water) for d, g in district_deg.items()}
district_s = {d: to_sheet(g) for d, g in district_deg.items()}
water_polys = [g for g in water_polys if not g.within(later_water.buffer(0.0002))]
water_deg = unary_union(water_polys).intersection(land99.buffer(0.0004))
on_island = land99.buffer(0.0008)
water_lines = [(l, en, zh) for g, en, zh in water_lines for l in lines(g.intersection(on_island))]
stream_lines = [l for g in stream_lines for l in lines(g.intersection(on_island))]

# ---------- green, golf, cemeteries, industry ----------
land_t = table('land')
l_g, l_cls = geoms(land_t), land_t['class'].to_pylist()
LATER_PARKS = re.compile(r'Gardens by the Bay|Bay (East|South|Central) Garden|Jurong Lake Gardens|Punggol Waterway|Coney Island|Lorong Halus|Eco Green|Sengkang (Riverside|Sculpture)|Marina Barrage|Rail Corridor', re.I)
forest = [g for g, c in zip(l_g, l_cls) if c in ('forest', 'wood') and g.area * 111 ** 2 > 0.03]
parks = [g for g, s, c, (en, _) in zip(lu_g, lu_sub, lu_cls, lu_n) if (c in ('park', 'nature_reserve', 'recreation_ground') or s == 'protected') and g.area * 111 ** 2 > 0.03 and not (en and LATER_PARKS.search(en))]
green_deg = unary_union(forest + parks).intersection(land99).difference(water_deg)
golf_deg = unary_union([g for g, c in zip(lu_g, lu_cls) if c == 'golf_course']).intersection(land99)
cem_deg = unary_union([g for g, c in zip(lu_g, lu_cls) if c == 'cemetery' and g.area * 111 ** 2 > 0.01]).intersection(land99)
ind_deg = unary_union([g for g, c in zip(lu_g, lu_cls) if c in ('industrial', 'works') and g.area * 111 ** 2 > 0.04]).intersection(land99)

# ---------- airfields and the cable car ----------
inf = table('infrastructure')
i_g, i_n, i_cls = geoms(inf), names(inf), inf['class'].to_pylist()
runways = []
for g, (en, _), c in zip(i_g, i_n, i_cls):
    if c != 'runway': continue
    x, y = g.centroid.x, g.centroid.y
    # Changi's two runways and Seletar's; the air bases stay blank, and Changi's third and fourth came later
    if (103.975 < x < 104.0 and 1.34 < y < 1.37) or (103.86 < x < 103.87 and 1.41 < y < 1.42 and g.length * 111 > 1):
        runways.append(g)
cable = [g for g, (en, _), c in zip(i_g, i_n, i_cls) if c == 'gondola' and g.bounds[1] > 1.245 and g.bounds[0] < 103.825]

# ---------- HDB blocks ----------
hdb = json.load(open(os.path.join(SRC, 'hdb.json')))
svy = Transformer.from_crs('EPSG:3414', 'EPSG:4326', always_xy=True)
V = hdb['vertices']
blocks = []
for oid, o in hdb['CityObjects'].items():
    a = o['attributes']
    year = int(a.get('hdb_year_completed') or 9999)
    if year > 1999: continue
    best = None
    for shell in o['geometry'][0]['boundaries']:
        for surf in shell:
            ring = surf[0]
            if all(V[i][2] == 0 for i in ring):
                best = ring
                break
        if best: break
    if not best: continue
    pts = [svy.transform(V[i][0], V[i][1]) for i in best]
    p = Polygon(pts).buffer(0)
    if p.is_empty: continue
    blocks.append({'p': p, 'no': a.get('hdb_blk_no') or '', 'street': a.get('osm_addr:street') or '', 'year': year,
                   'res': a.get('hdb_residential') == 'Y', 'floors': int(a.get('hdb_max_floor_lvl') or 0),
                   'hs': a.get('hdb_street') or '', 'pc': (a.get('osm_addr:postcode') or '').strip(),
                   'com': a.get('hdb_commercial') == 'Y', 'mkt': a.get('hdb_market_hawker') == 'Y'})
new_blocks = []
for oid, o in hdb['CityObjects'].items():
    a = o['attributes']
    if int(a.get('hdb_year_completed') or 9999) > 1999:
        ring = o['geometry'][0]['boundaries'][0][0][0]
        x, y = svy.transform(V[ring[0]][0], V[ring[0]][1])
        new_blocks.append(Point(x, y))
old_tree = shapely.STRtree([b['p'].centroid for b in blocks])
new_tree = shapely.STRtree(new_blocks)
print('blocks to 1999:', len(blocks))

# ---------- roads ----------
seg = table('segment', subtype='road')
s_g, s_n, s_cls = geoms(seg), names(seg), seg['class'].to_pylist()
ROAD_LEVEL = {'motorway': 'mw', 'trunk': 'tr', 'primary': 'pr', 'secondary': 'se', 'tertiary': 'te', 'residential': 'rd', 'unclassified': 'rd', 'living_street': 'rd'}
LATER_ROADS = re.compile(r'Kallang[–-]Paya Lebar|Marina Coastal|North[–-]South Corridor|Bayfront|Sheares Avenue|Central Boulevard|Rhu Cross|Gardens by the Bay|Marina Gardens|Punggol (Central|Way|East|Field|Walk|Drive|Place)|Sumang|Edgedale|Edgefield|Northshore|Waterway|Tengah|Plantation|Garden (Avenue|Walk)|Bidadari|Woodleigh Link|Canberra (Link|Drive|Street|Crescent|Road)|Sengkang (East|West) Avenue|Fernvale|Anchorvale|Compassvale (Bow|Link)|Jurong (Lake|Gateway) Link|Changi Business Park|Changi Airport Terminal 3|^T[34] |Expo|Seletar Aerospace|Tampines North|Woodlands North Coast|Bukit Batok West Avenue [89]|Tuas South Boulevard|Tuas Link|Tuas West|Gul (Link|Avenue)|Tanah Merah Coast|Jurong Island Highway extension', re.I)
# within these districts nothing but a few old roads is drawn: the new towns came after 1999
NEW_TOWN = {'punggol': re.compile(r'^(Punggol Road|Tampines Expressway|Punggol Point)$'), 'tengah': re.compile(r'^(Jalan Bahar|Old Choa Chu Kang Road|Pan-Island Expressway|Kranji Expressway|Brickland Road)$'),
            'marina': re.compile(r'^(East Coast Parkway|Benjamin Sheares Bridge|Marina Station Road|Marina Way)$')}
ROAD_TOL = {'mw': 0.25, 'tr': 0.2, 'pr': 0.15, 'se': 0.12, 'te': 0.1, 'rd': 0.08}
roads = {k: [] for k in ROAD_TOL}
road_names = {}
land_near = land99.buffer(0.0012)
for g, (en, zh), c in zip(s_g, s_n, s_cls):
    lvl = ROAD_LEVEL.get(c)
    if not lvl: continue
    if en and LATER_ROADS.search(en): continue
    mid = g.interpolate(0.5, normalized=True)
    if not land_near.contains(mid) and (lvl not in ('mw', 'tr', 'pr') or not sg_sea.contains(mid)): continue
    if later.contains(mid): continue
    d = in_district(mid)
    if d in NEW_TOWN and not (en and NEW_TOWN[d].search(en)): continue
    if lvl in ('rd', 'te', 'se'):
        near_new = new_tree.query(mid.buffer(0.0014), predicate='intersects')
        near_old = old_tree.query(mid.buffer(0.0018), predicate='intersects')
        if len(near_new) and not len(near_old): continue
    roads[lvl].append((g, en, zh))
print({k: len(v) for k, v in roads.items()})

# ---------- labels we do not print ----------
# Street names that carry a governor, royal or politician are left off the map, like the place names (CLAUDE.md).
UNNAMED = re.compile(r"\b(Raffles|Stamford|Clementi|Nicoll|Sheares|Braddell|Eunos|Victoria|Queen'?s?|Queensway|King'?s?|Prince'?s?|Princess|Albert|Elizabeth|Mountbatten|Edinburgh|Connaught|Alexandra|Kitchener|Anson|Cavenagh|Fullerton|Crawfurd|Farquhar|Jervois|Weld|Guillemard|Shenton|Cecil|Robinson|Bonham|Butterworth|Blundell|Ord|Clarke|Elgin|Anderson|Swettenham|Mitchell|Canning|Dalhousie|Minto|Wellington|Outram|Somerset|Farrer|Kent|Clemenceau|Churchill|MacDonald|Marshall|Empress|Emperor|Coronation|Duke|Duchess|Regent|Royal|Sultan|Temenggong|Tengku|Tunku|Rajah?|Yusof Ishak|Wee Kim Wee|Ong Teng Cheong|Lee Kuan Yew|Goh Keng Swee|Rajaratnam|Toh Chin Chye|Lim Kim San|Hon Sui Sen|Governor|Sir|Lord)\b", re.I)


CJK = re.compile(r'[\u3400-\u9fff]')

# Streets of a renamed place take the island's name for it, as the stations do (ideas/霏微-地名录.md):
# the Clementi avenues and streets are West Coast's, the Eunos roads Kampong Melayu's.
STREET_RENAME = [(re.compile(r'^Clementi (?=(Avenue|Street|West Street) )'), 'West Coast '), (re.compile(r'\bEunos\b'), 'Kampong Melayu')]


def renamed(en):
    for pat, to in STREET_RENAME:
        if en and pat.search(en): return pat.sub(to, en)
    return None


def label(en, zh):
    if en and CJK.search(en): en, zh = None, zh or en  # a name only in Chinese: no English to print
    if renamed(en): en, zh = renamed(en), None
    if en in POST99_WATER: return None
    if not en or UNNAMED.search(en): return None
    return [en, zh] if zh else [en]


# ---------- rail ----------
rail = json.load(open(os.path.join(SRC, 'rail.json')))
STATIONS = {
    # 1999 network, with the island's own names where the place names were changed (ideas/霏微-地名录.md)
    'ns': ['NS1', 'NS2', 'NS3', 'NS4', 'NS5', 'NS7', 'NS8', 'NS9', 'NS10', 'NS11', 'NS13', 'NS14', 'NS15', 'NS16', 'NS17', 'NS18', 'NS19', 'NS20', 'NS21', 'NS22', 'NS23', 'NS24', 'NS25', 'NS26', 'NS27'],
    'ew': ['EW1', 'EW2', 'EW3', 'EW4', 'EW5', 'EW6', 'EW7', 'EW8', 'EW9', 'EW10', 'EW11', 'EW12', 'EW13', 'EW14', 'EW15', 'EW16', 'EW17', 'EW18', 'EW19', 'EW20', 'EW21', 'EW23', 'EW24', 'EW25', 'EW26', 'EW27'],
    'bp': ['BP1', 'BP2', 'BP3', 'BP4', 'BP5', 'BP6', 'BP7', 'BP8', 'BP9', 'BP10', 'BP11', 'BP12', 'BP13', 'BP14'],
}
NAME_ZH = {
    'ns': '裕廊东 武吉巴督 武吉甘柏 蔡厝港 油池 克兰芝 马西岭 兀兰 海军部 三巴旺 义顺 卡迪 杨厝港 宏茂桥 碧山 金吉 大巴窑 诺维娜 纽顿 乌节 基里尼 多美歌 政府大厦 中枢 滨海湾'.split(),
    'ew': '巴西立 淡滨尼 四美 丹那美拉 勿洛 景万岸 甘榜马来由 巴耶利峇 阿裕尼 加冷 劳明达 武吉士 政府大厦 中枢 丹戎巴葛 珍珠山 中峇鲁 红山 女皇镇 联邦 波那维斯达 西海岸 裕廊东 裕华园 湖畔 文礼'.split(),
    'bp': '蔡厝港 南山 吉丰 德惠 凤凰 武吉班让 碧迪 秉定 万吉 法嘉 实格 茄兰邦 信佳 十里广场'.split(),
}
RENAME_EN = {'Raffles Place': 'Axis', 'Braddell': 'Kim Keat', 'Somerset': 'Killiney', 'Outram Park': "Pearl's Hill", 'Eunos': 'Kampong Melayu', 'Clementi': 'West Coast'}
pos = {}
for f in rail['features']:
    p = f['properties']
    if f['geometry']['type'] == 'Point' and p.get('stop_type') == 'station':
        for code in (p.get('station_codes') or '').split('-'):
            pos[code] = (f['geometry']['coordinates'], p.get('name'))
pos.setdefault('BP14', ((103.7605, 1.3802), 'Ten Mile Junction'))
stations = []
chains = {}
for line, codes in STATIONS.items():
    chain = []
    for i, code in enumerate(codes):
        if code not in pos:
            raise SystemExit(f'no station {code}')
        (lo, la), en = pos[code]
        en = RENAME_EN.get(en, en)
        x, y = (lo - LON0) * K, (LAT0 - la) * K
        stations.append({'l': line, 'c': code, 'n': [en, NAME_ZH[line][i]], 'x': r1(x), 'y': r1(y)})
        chain.append((lo, la))
    chains[line] = chain
LINE_NAME = {'North South Line': 'ns', 'East West Line': 'ew', 'Bukit Panjang LRT': 'bp', 'North East Line': 'ne'}
rail_lines = {k: [] for k in ('ns', 'ew', 'bp', 'ne', 'ktm', 'spur')}
for f in rail['features']:
    p = f['properties']
    k = LINE_NAME.get(p.get('name'))
    if not k or f['geometry']['type'] not in ('LineString', 'MultiLineString'): continue
    g = shapely.geometry.shape(f['geometry'])
    if k in chains:
        # only the track between 1999 stations: the extensions and the airport branch come later
        corridor = unary_union([LineString([a, b]).buffer(0.01, cap_style=2) for a, b in zip(chains[k], chains[k][1:])] + [Point(c).buffer(0.003) for c in chains[k]] + ([LineString(chains[k][-1:] + chains[k][:1]).buffer(0.0065, cap_style=2)] if k == 'bp' else []))
        g = g.intersection(corridor)
    rail_lines[k] += lines(g)
# The railway across the strait, and the old Jurong branch, from OpenStreetMap
rs = table('segment')
for g, (en, _) in zip(geoms(rs), names(rs)):
    if en and re.search(r'^(Rail Corridor|Overgrown Rail Corridor|Former Rail Corridor|Old KTM Railway Trackbed)$', en):
        rail_lines['ktm'].append(g)  # the line closed in 2011; on the island it still runs
        continue
    if not en or not sg_sea.union(sg_div).contains(g.centroid): continue
    if re.search(r'^(KTM|Rail Corridor|Overgrown Rail Corridor|KTM Laluan kereta api Pantai Barat|Down Main Up)$', en): rail_lines['ktm'].append(g)
    elif re.search(r'Jurong Spur|Brickworks', en): rail_lines['spur'].append(g)
print({k: len(v) for k, v in rail_lines.items()})

# ---------- place names: the districts' own neighbourhoods ----------
dist_ts = open(os.path.join(ROOT, 'src', 'data', 'gerimis', 'districts.ts'), encoding='utf-8').read()
our_blocks = {}
for m in re.finditer(r"id: '([a-z-]+)'.*?blocks: \[(.*?)\],\n\s+transit", dist_ts, re.S):
    our_blocks[m.group(1)] = [x.group(1) for x in re.finditer(r"b\('([^']+)'", m.group(2))]
places = []
for g, s, k, (en, zh) in zip(dg, subtype, country, dn):
    if k != 'SG' or s not in ('neighborhood', 'microhood', 'macrohood') or not en: continue
    pt = g.representative_point()
    d = in_district(pt)
    if not d: continue
    names_ = our_blocks.get(d, [])
    hit = next((i for i, n in enumerate(names_) if n.lower() == en.lower() or n.lower() == re.sub(r' (Estate|Town|Central|Village)$', '', en, flags=re.I).lower()), None)
    if hit is None: continue
    if any(p['d'] == d and p['i'] == hit for p in places): continue
    x, y = (pt.x - LON0) * K, (LAT0 - pt.y) * K
    places.append({'d': d, 'i': hit, 'x': r1(x), 'y': r1(y)})
print('places:', len(places))

# ---------- write ----------
def S(g): return to_sheet(g)


def enc_polys(g, tol, min_area=0):
    return [r for p in polys(S(g)) for r in [enc_poly(p, tol, min_area)] if r]


def enc_lines(ls, tol):
    return [c for l in ls for x in lines(S(l)) for c in [enc_line(x, tol)] if c]


def merged(items, tol):
    """Roads with the same name merged into long strokes; label the longest piece."""
    by = {}
    for g, en, zh in items:
        by.setdefault((en, zh), []).extend(lines(g))
    out = []
    for (en, zh), ls in by.items():
        m = linemerge(ls) if len(ls) > 1 else ls[0]
        for x in lines(m):
            c = enc_line(S(x), tol)
            if c:
                o = {'l': c}
                n = label(en, zh)
                if n and S(x).length > 6: o['n'] = n
                out.append(o)
    return out


blank_sheet = to_sheet(blank_deg).buffer(0)
districts_out = []
for d, g in district_s.items():
    # the name goes on the part of the district that was surveyed, if there is one (Ubin, not Tekong)
    seen = g.difference(blank_sheet) if d not in UNSURVEYED else g
    parts = polys(seen) if not seen.is_empty and seen.area > g.area * 0.05 else polys(g)
    lp = shapely.ops.polylabel(max(parts, key=lambda p: p.area), tolerance=0.5)
    districts_out.append({'id': d, 'r': enc_polys(district_deg[d], 0.25), 'lx': r1(lp.x), 'ly': r1(lp.y)})

base = {
    'v': 1, 'q': Q,
    'credit': 'Map data (c) OpenStreetMap contributors, ODbL. Redrawn for 1999.',
    'land': enc_polys(land99, 0.12, 0.05),
    'far': enc_polys(far, 0.6, 2),
    'water': enc_polys(water_deg, 0.1, 0.02),
    'rivers': [{'l': c, **({'n': label(en, zh)} if label(en, zh) else {})} for g, en, zh in water_lines for x in lines(S(g)) for c in [enc_line(x, 0.12)] if c and x.length > 2],
    'green': enc_polys(green_deg, 0.15, 0.05),
    'golf': enc_polys(golf_deg, 0.15, 0.05),
    'cem': enc_polys(cem_deg, 0.15, 0.03),
    'ind': enc_polys(ind_deg, 0.15, 0.06),
    'blank': enc_polys(blank_deg, 0.15, 0.05),
    'runway': enc_lines(runways, 0.1),
    'cable': enc_lines(cable, 0.1),
    'roads': {k: merged(roads[k], ROAD_TOL[k]) for k in ('mw', 'tr', 'pr', 'se', 'te')},
    'rail': {k: enc_lines(v, 0.1) for k, v in rail_lines.items()},
    'stations': stations,
    'districts': districts_out,
}
# ---------- addresses: every block's street and postcode ----------
# The Housing Board writes streets short ("BT BATOK WEST AVE 6"); OpenStreetMap has most of them in full.
ABBR = {'AVE': 'Avenue', 'ST': 'Street', 'RD': 'Road', 'DR': 'Drive', 'CRES': 'Crescent', 'CL': 'Close', 'CTRL': 'Central',
        'NTH': 'North', 'STH': 'South', 'BT': 'Bukit', 'JLN': 'Jalan', 'KG': 'Kampong', 'LOR': 'Lorong', 'UPP': 'Upper',
        'TER': 'Terrace', 'PK': 'Park', 'GDNS': 'Gardens', 'HTS': 'Heights', 'PL': 'Place', 'IND': 'Industrial',
        'TG': 'Tanjong', "C'WEALTH": 'Commonwealth', 'MKT': 'Market', 'CTR': 'Centre', 'SQ': 'Square', 'PDE': 'Parade'}
full = {}
for b in blocks:
    if b['street'] and b['hs']: full.setdefault(b['hs'], {}).setdefault(b['street'], 0); full[b['hs']][b['street']] += 1
full = {hs: max(c, key=c.get) for hs, c in full.items()}


def expand(hs):
    ws = hs.split()
    return ' '.join('St.' if i == 0 and w == 'ST' and len(ws) > 2 else ABBR.get(w, w if re.match(r'^[\dA-Z]\d', w) else w.capitalize()) for i, w in enumerate(ws))


def same(a, b):
    # the same words with better capitals (McNair, not Mcnair)
    return a.lower() == b.lower() and all(w[0].isupper() or w[0].isdigit() for w in a.split())


def street_of(b):
    # the Housing Board's street, written out; OpenStreetMap's spelling where it says the same thing (it has the capitals right: McNair)
    if b['hs']:
        en = expand(b['hs'])
        for cand in (full.get(b['hs']), b['street']):
            if cand and same(cand, en): en = cand; break
    else:
        en = b['street']
    n = label(en, None)
    return n[0] if n else ''  # a street named for a governor or a minister is left blank, like on the map


def num(no):
    m = re.match(r'\d+', no)
    return int(m.group()) if m else None


# A postcode is the sector (two figures), one figure for the estate and the block number: Blk 123 in Ang Mo Kio is 560123.
# The sector and estate figures come from the blocks whose postcodes OpenStreetMap has; the rest follow their street, or the nearest such block.
pref = {}
for b in blocks:
    n = num(b['no'])
    if n is not None and n < 1000 and re.fullmatch(r'\d{6}', b['pc']) and b['pc'][3:] == f'{n:03d}':
        pref.setdefault(b['hs'], {}).setdefault(b['pc'][:3], 0); pref[b['hs']][b['pc'][:3]] += 1
pref = {hs: max(c, key=c.get) for hs, c in pref.items()}
known = [b for b in blocks if b['hs'] in pref]
known_tree = shapely.STRtree([b['p'].centroid for b in known])
used = set()


def postcode(b):
    n = num(b['no'])
    real = re.fullmatch(r'\d{6}', b['pc']) is not None
    lettered = not re.fullmatch(r'\d+', b['no'])
    if b['hs'] in pref:
        p3 = pref[b['hs']]
        fits = real and n is not None and b['pc'] == f'{p3}{n % 1000:03d}'
    else:
        p3 = pref[known[known_tree.nearest(b['p'].centroid)]['hs']]
        fits = False
    pc = b['pc'] if real and (fits or lettered or b['hs'] not in pref) else f'{p3}{(n or 0) % 1000:03d}'
    # one postcode, one block: a lettered block or a clash takes the next estate figure (and, when those run out, the next sector)
    for k in range(100):
        alt = pc[0] + str((int(pc[1]) + k // 10) % 10) + str((int(pc[2]) + k) % 10) + pc[3:]
        if alt not in used: break
    pc = alt
    used.add(pc)
    return pc


# blocks whose own postcode already fits go first, so they keep it
for b in sorted(blocks, key=lambda b: (not (b['hs'] in pref and b['pc'][:3] == pref[b['hs']]), b['hs'], b['no'])):
    b['addr'] = street_of(b)
    b['post'] = postcode(b)
    b['d'] = in_district(b['p'].representative_point())
streets = sorted({b['addr'] for b in blocks if b['addr']})
street_no = {n: i for i, n in enumerate(streets)}
dist_no = {d['id']: i for i, d in enumerate(districts_out)}
print('postcodes:', len(used), 'for', len(blocks), 'blocks;', len(streets), 'streets')

detail = {
    'v': 1, 'q': Q,
    'roads': merged(roads['rd'], ROAD_TOL['rd']),
    'streams': enc_lines(stream_lines, 0.1),
    'hdb': [],
    'places': places,
    # street names for the blocks' addresses, and the districts in base.json's order
    'streets': streets,
}
for b in blocks:
    p = S(b['p'])
    r = enc_poly(p, 0.06)
    if not r: continue
    c = p.centroid
    b['i'] = len(detail['hdb'])
    detail['hdb'].append({'r': r[0], 'b': b['no'], 's': street_no.get(b['addr'], -1), 'p': b['post'], 'y': b['year'], 'f': b['floors'],
                          'd': dist_no.get(b['d'], -1), **({'c': 1} if not b['res'] else {})})

# ---------- what else the island had: markets, interchanges, shops, post offices, clinics, schools ----------
# Lists and rules in scripts/map/facilities_1999.py; positions from OpenStreetMap, looked up by name.
import hashlib, sys
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import facilities_1999 as F

later_name = re.compile(F.LATER, re.I)
dzh = dict(re.findall(r"id: '([a-z-]+)', en: '[^']*', zh: '([^']+)'", dist_ts))
den = dict(re.findall(r"id: '([a-z-]+)', en: '([^']+)'", dist_ts))
KIND_OF = dict(re.findall(r"id: '([a-z-]+)', en: '[^']*', zh: '[^']+', region: '[a-z]+', kind: '([a-z]+)'", dist_ts))
sg_box = sg_sea.union(sg_div)
named = {}  # lower-case OpenStreetMap name -> [(geometry, area)]


def osm_named(t, ok=lambda r: True):
    for g, (en, _), r in zip(geoms(t), names(t), t.select([c for c in ('class', 'subtype') if c in t.column_names]).to_pylist()):
        if not en or not ok(r) or not sg_box.contains(g.representative_point()): continue
        named.setdefault(en.lower(), []).append((g, g.area, r.get('class')))


bld = pq.read_table(os.path.join(SRC, 'building_named.parquet'))
osm_named(bld)
osm_named(lu)
osm_named(table('infrastructure', **{'class': ['bus_station', 'ferry_terminal']}))


def find(name):
    hits = named.get(name.lower())
    return max(hits, key=lambda h: h[1])[0].representative_point() if hits else None


blk_tree = shapely.STRtree([b['p'] for b in blocks])
com = [b for b in blocks if b['com'] and 'i' in b]
com_tree = shapely.STRtree([b['p'].centroid for b in com])


def block_at(pt, reach=0.00025):
    near = [blocks[i] for i in blk_tree.query(pt.buffer(reach), predicate='intersects')]
    near = [b for b in near if 'i' in b]
    return min(near, key=lambda b: b['p'].distance(pt)) if near else None


def new_ground(pt):
    # in a town built after 1999: flats of after 1999 round it and none from before
    d = in_district(pt)
    if d in NEW_TOWN or later.contains(pt): return True
    return len(new_tree.query(pt.buffer(0.0032), predicate='intersects')) > 0 and not len(old_tree.query(pt.buffer(0.0045), predicate='intersects'))


def own_postcode(pt, name):
    # a building of its own has a postcode of its own, in the sector of the flats nearest it
    sector = blocks[old_tree.nearest(pt)]['post'][:2]
    n = int(hashlib.md5(name.encode()).hexdigest(), 16)
    for k in range(10000):
        pc = f'{sector}{(n + k * 7919) % 10000:04d}'
        if pc not in used: break
    used.add(pc)
    return pc


# Chinese for the place part of a name: districts, stations, the districts' neighbourhoods, and a few the lists need
ZH = {den[k].lower(): v for k, v in dzh.items()}
for st in stations: ZH.setdefault(st['n'][0].lower(), st['n'][1])
for en_, zh_ in re.findall(r"b\('([^']+)', '([^']+)'", dist_ts): ZH.setdefault(en_.lower(), zh_)
ZH.update({k.lower(): v for k, v in {
    'Amoy Street': '厦门街', 'Chomp Chomp': '忠忠', 'Golden Mile': '黄金', 'Hong Lim': '芳林', 'Old Airport Road': '旧机场路', 'Old Airport': '旧机场',
    'Tekka': '竹脚', 'Adam': '亚当路', 'Berseh': '美世', 'Dunman': '伦民', 'Pek Kio': '白桥', 'Seah Im': '佘音', 'Redhill': '红山', 'Whampoa': '黄埔',
    'Geylang Serai': '芽笼士乃', 'Changi Village': '樟宜村', 'Havelock Road': '合乐路', 'Sims Vista': '森士景', 'Circuit Road': '沈氏道',
    'Kallang Estate': '加冷', 'Holland Village': '荷兰村', 'Kim Keat Palm': '金吉棕榈', 'ABC Brickworks': 'ABC 红砖', 'Marsiling Lane': '马西岭巷',
    'Chong Pang': '忠邦', 'Balestier': '马里士他', 'Tanglin Halt': '东陵福', 'Taman Jurong': '达曼裕廊', 'Yuhua Village': '裕华村', 'Yuhua': '裕华',
    'Serangoon Garden': '实龙岗花园', 'Kovan': '高文', 'Kebun Baru': '格本巴鲁', 'Sembawang Hills': '三巴旺山', 'Limbang': '林邦', 'Senja': '信佳',
    'North Bridge Road': '桥北路', 'Depot Road': '德普路', 'Jalan Batu': '惹兰峇都', 'Bukit Merah Village': '红山村', 'Round': '圆形',
    'Kim Keat Heights': '金吉高原', 'Kampong Melayu': '甘榜马来由', 'Kolam Ayer': '哥南亚逸', 'Kampong Glam': '甘榜格南', 'Kampong Ubi': '甘榜乌美',
    'Jalan Besar': '惹兰勿刹', 'Joo Chiat': '如切', 'Katong': '加东', 'Siglap': '实乞纳', 'Siglap South': '实乞纳南', 'Potong Pasir': '波东巴西',
    'MacPherson': '麦波申', 'Cheng San': '静山', 'Teck Ghee': '德义', 'Bukit Timah': '武吉知马', 'Tiong Bahru': '中峇鲁', 'Telok Blangah': '直落布兰雅',
    'Radin Mas': '拉丁马士', 'Henderson': '亨德森', 'Leng Kee': '麟记', 'Ulu Pandan': '乌鲁班丹', 'Buona Vista': '波那维斯达', 'Hillview': '山景',
    'Nanyang': '南洋', 'Fuchun': '富春', 'Marsiling': '马西岭', 'Nee Soon East': '义顺东', 'Pasir Ris East': '巴西立东', 'Pasir Ris Elias': '巴西立伊莱雅',
    'Changi Simei': '樟宜四美', 'Tampines Central': '淡滨尼中', 'Tampines Changkat': '淡滨尼樟加', 'Tampines East': '淡滨尼东', 'Tampines West': '淡滨尼西',
    'Toa Payoh Central': '大巴窑中', 'Toa Payoh East': '大巴窑东', 'Toa Payoh South': '大巴窑南', 'Bukit Batok East': '武吉巴督东', 'Hong Kah North': '丰加北',
    'Gek Poh Ville': '玉宝园', 'Jurong Green': '裕廊绿', 'Jurong Spring': '裕廊泉', 'Keat Hong': '吉丰', 'Kaki Bukit': '加基武吉', 'Yew Tee': '油池',
    'Zhenghua': '正华', 'Woodlands Galaxy': '兀兰银河', 'Senja-Cashew': '信佳 · 腰果', 'Fengshan': '凤山', 'Cairnhill': '经禧', 'Geylang West': '芽笼西',
    'Delta': '德达', 'Geylang East': '芽笼东', 'Paya Lebar Kovan': '巴耶利峇高文', 'Paya Lebar-Kovan': '巴耶利峇高文', 'Boon Lay': '文礼', 'Pioneer': '先驱',
    'Admiralty': '海军部', 'Lim Ah Pin Road': '林亚彬路', 'Upper Serangoon': '上实龙岗', 'Maxwell': '麦士威', 'Bendemeer': '明地迷亚',
    'East Coast Lagoon': '东海岸湖畔', 'Toa Payoh Lorong 8': '大巴窑八巷', 'Toa Payoh Vista': '大巴窑景', 'Kallang Estate': '加冷', 'Taman Jurong': '达曼裕廊',
    'Tanjong Pagar': '丹戎巴葛', 'Old Airport Road': '旧机场路', 'The Pasar 724 Corner': '724 巴刹', 'Quality Road': '品质路', 'Haig Road': '海格路', 'Bukit Panjang': '武吉班让', 'Marine Terrace': '马林台', 'Commonwealth': '联邦',
}.items()})


def zh_place(p):
    p = p.strip()
    if p.lower() in ZH: return ZH[p.lower()]
    m = re.match(r'^(.*?)\s+(\d+[A-Z]?)$', p)  # "Bedok 85"
    if m and m.group(1).lower() in ZH: return f'{ZH[m.group(1).lower()]} {m.group(2)}'
    m = re.match(r'^(?:Blk |Block )(\d+[A-Z]?)\b', p)  # "Blk 11 Telok Blangah Crescent"
    if m: return f'{m.group(1)} 座'
    return None


MKT_SUFFIX = [(r'Food Centre & Shopping Mall', '熟食中心'), (r'Makan Place.*', '美食坊'),
              (r'(?:Fresh |Wet )?Market (?:and|&) (?:Food|Hawker) Cent(?:re|er)', '巴刹与熟食中心'), (r'Cooked Food Cent(?:re|er)', '熟食中心'),
              (r'Food Cent(?:re|er)(?: \d+)?', '熟食中心'), (r'Hawker Cent(?:re|er)(?: and Market)?', '小贩中心'), (r'Food Village', '美食村'),
              (r'Food Market', '巴刹'), (r'Market Place', '巴刹'), (r'(?:Wet |Morning )?Market', '巴刹')]


def zh_of(en, suffixes):
    if en.lower() in ZH: return ZH[en.lower()]
    for pat, z in suffixes:
        m = re.match(rf'^(.*?)\s*\b{pat}$', en, re.I)
        if m:
            p = zh_place(m.group(1)) if m.group(1) else ''
            if p is None: return ''
            return f'{p} {z}' if p and p[-1].isdigit() else f'{p}{z}'
    return ''


def rename(en, pairs):
    for a, b in pairs: en = re.sub(a, b, en)
    return en


MKT_RENAME = [(r'^Alexandra Village', 'Bukit Merah Village'), (r'^Margaret Market', 'Queenstown Market'), (r'^Blk (\d+)', r'Blk \1'), (r'^678A Admiralty Wet Market & MSCP', 'Blk 678A Market')]
fac = []  # [kind, en, zh, lon, lat, year, gone, block or None, postcode]
taken = []


def add(k, en, zh, pt, year=None, gone=None, blk='near'):
    key = re.sub(r'cent(er|re)', 'centre', en.lower())
    key = re.sub(r'\b(?:fresh |wet )?market (?:and|&) ', '', key)  # "X Market and Food Centre" = "X Food Centre"
    for o in taken:
        if o[0] == k and (o[3].distance(pt) < (0.0008 if k in ('mk', 'sh', 'wo') else 0.0004) or (k != 'wo' and o[4] == key)): return False
    b = block_at(pt) if blk == 'near' else blk
    taken.append((k, en, zh, pt, key))
    pc = b['post'] if b else own_postcode(pt, en)
    fac.append([k, en, zh, pt, year, gone, b, pc])
    return True


# town centres: a named place, the town's station, or its label
centre = {}
for d in districts_out:
    if d['id'] in F.TOWN_CENTRE and find(F.TOWN_CENTRE[d['id']]): centre[d['id']] = find(F.TOWN_CENTRE[d['id']]); continue
    st = next((s for s in stations if in_district(Point(s['x'] / K + LON0, LAT0 - s['y'] / K)) == d['id']), None)
    x, y = (st['x'], st['y']) if st else (d['lx'], d['ly'])
    centre[d['id']] = Point(x / K + LON0, LAT0 - y / K)
at_centre = {}


def centre_block(d):
    # the shops at the town centre: the k-th nearest block with shops, so a post office and a clinic are not on one block
    pt = centre[d]
    at_centre[d] = at_centre.get(d, 0) + 1
    near = sorted((b for b in com if b['d'] == d), key=lambda b: b['p'].distance(pt))
    return near[min(len(near) - 1, at_centre[d] - 1)] if near and near[0]['p'].distance(pt) < 0.006 else None


missing = []
for k, en, zh, year, osm, d in F.LISTED:
    pt = find(osm or en)
    if pt is None and d:
        b = centre_block(d) if k != 'bi' else None
        pt = b['p'].representative_point() if b else centre[d]
        add(k, en, zh, pt, year, blk=b)
        continue
    if pt is None: missing.append(en); continue
    add(k, en, zh, pt, year)
for k, en, zh, year, lo, la, gone in F.MANUAL:
    add(k, en, zh, Point(lo, la), year, gone, blk=None)

# markets and food centres: the ones OpenStreetMap names, then the Housing Board's own market blocks
MKT = re.compile(r'Market|\bFood Cent(re|er)|Hawker Cent|Food Village|Makan Place|Pasar', re.I)
orig = {}
for t in (bld, lu):
    for en, _ in names(t):
        if en: orig.setdefault(en.lower(), en)
for name, hits in sorted(named.items()):
    en = orig.get(name, name)
    if not MKT.search(en) or later_name.search(en) or re.search(r'Empress|Margaret Drive', en): continue
    pt = max(hits, key=lambda h: h[1])[0].representative_point()
    if new_ground(pt): continue
    en = rename(en, MKT_RENAME)
    if UNNAMED.search(en): continue
    add('mk', en, zh_of(en, MKT_SUFFIX), pt)
for b in blocks:
    if b['mkt'] and 'i' in b:
        pt = b['p'].representative_point()
        add('mk', f"Blk {b['no']} Market and Food Centre", f"{b['no']} 座巴刹与熟食中心", pt, blk=b)

# post offices: one at each town's centre, and the old ones still named
for name in F.POST_OSM:
    pt = find(name)
    if pt: add('po', name, zh_of(name, [(r'Post Office', '邮局')]), pt)
for d in districts_out:
    dd = d['id']
    if KIND_OF.get(dd) != 'residential' or dd in NEW_TOWN or dd in ('sengkang', 'north-eastern-islands'): continue
    b = centre_block(dd)
    if not b: continue
    en = f"{den[dd]} Post Office" if dd != 'serangoon' else 'Serangoon Central Post Office'
    add('po', en, f"{dzh[dd]}{'中心' if dd == 'serangoon' else ''}邮局", b['p'].representative_point(), blk=b)

# community centres and pools
for name, hits in sorted(named.items()):
    en = orig.get(name, name)
    m = re.match(r'^(.*?) Community (Club|Centre)$', en)
    k = 'cc' if m else 'sw' if re.search(r'Swimming Complex$', en) and en != 'Swimming Complex' else None
    if not k or later_name.search(en): continue
    pt = max(hits, key=lambda h: h[1])[0].representative_point()
    if new_ground(pt): continue
    en = rename(en, F.CC_RENAME)
    if UNNAMED.search(en): continue
    p = re.sub(r' (Community (Club|Centre)|Swimming Complex)$', '', en)
    zp = zh_place(p)
    add(k, en, f"{zp}{'民众联络所' if k == 'cc' else '游泳池'}" if zp else '', pt)

# schools: where OpenStreetMap has them, under the island's own names
LEVEL = [(r'Primary', 'Primary School', '小学'), (r'Secondary|High School|Methodist Girls|Convent|Institution', 'Secondary School', '中学'),
         (r'Junior College|Centralised Institute', 'Junior College', '初级学院'), (r'Polytechnic', 'Polytechnic', '理工学院')]
UNI = {'national university of singapore': ('University of Gerimis', '霏微大学'), 'nanyang technological university': ('Jurong Technological University', '裕廊理工大学')}
schools = {}
for name, hits in sorted(named.items()):
    en = orig.get(name, name)
    if name in UNI:
        g = max(hits, key=lambda h: h[1])[0]
        if g.area > 1e-5: schools[name] = ('uni',) + UNI[name] + (g.representative_point(),)
        continue
    if later_name.search(en) or re.search(r'Kindergarten|Pre-?School|Childcare|Student Care|International|Learning|Tuition|Academy|Enrichment|Driving|Hostel|Hall|Block|Canteen', en, re.I): continue
    lv = next((l for l in LEVEL if re.search(l[0], en, re.I)), None)
    if not lv: continue
    g = max(hits, key=lambda h: h[1])[0]
    pt = g.representative_point()
    if new_ground(pt): continue
    schools[name] = (lv[1], lv[2], None, pt)
per = {}
for name, s in sorted(schools.items(), key=lambda kv: (kv[1][3].x, kv[1][3].y)):
    if s[0] == 'uni': add('sh', s[1], s[2], s[3]); continue
    d = in_district(s[3])
    if not d: continue
    if s[0] == 'Polytechnic':
        add('sh', f'{den[d]} Polytechnic', f'{dzh[d]}理工学院', s[3]); continue
    n = per.get((d, s[0]), 0)
    per[(d, s[0])] = n + 1
    tree = F.TREES[(n + len(d)) % len(F.TREES)]
    add('sh', f'{den[d]} {tree[0]} {s[0]}', f'{dzh[d]}{tree[1]}{s[1]}', s[3])

# places of worship: the survey writes down what they look like, not their names
WORSHIP = {'mosque': ('Mosque', '清真寺'), 'church': ('Church', '教堂'), 'hindu': ('Hindu temple', '兴都庙'), 'sikh': ('Gurdwara', '锡克庙'),
           'jewish': ('Synagogue', '犹太会堂'), 'temple': ('Temple', '庙')}


def faith(en, cls, tags):
    rel = (tags or {}).get('religion')
    t = f'{en or ""} {cls or ""}'
    if rel == 'muslim' or re.search(r'mosque|masjid', t, re.I): return 'mosque'
    if rel == 'christian' or re.search(r'church|chapel|cathedral|assembly|parish|methodist|presbyterian', t, re.I): return 'church'
    if rel == 'hindu' or re.search(r'\bsri\b|hindu|murugan|perumal|amman|vinayagar|siva', t, re.I): return 'hindu'
    if rel == 'sikh' or re.search(r'gurdwara|sikh', t, re.I): return 'sikh'
    if rel == 'jewish' or re.search(r'synagogue', t, re.I): return 'jewish'
    if rel in ('buddhist', 'taoist', 'chinese_folk', 'confucian') or re.search(r'temple|tong|kuan|miow|bio|keng|si\b|tian|kong|shrine', t, re.I) or cls in ('temple', 'shrine', 'religious'): return 'temple'
    return None


wo = []
for g, (en, _), r in zip(geoms(bld), names(bld), bld.select(['class']).to_pylist()):
    if r['class'] in ('temple', 'church', 'mosque', 'chapel', 'cathedral', 'shrine', 'religious', 'synagogue') or (en and re.search(r'Mosque|Masjid|Church|Temple|Gurdwara|Synagogue', en)):
        wo.append((g, en, r['class'], None))
for g, (en, _), r in zip(geoms(lu), names(lu), lu.select(['class', 'source_tags']).to_pylist()):
    if r['class'] == 'religious': wo.append((g, en, None, dict(r['source_tags'] or {})))
for g, en, cls, tags in wo:
    pt = g.representative_point()
    if not sg_div.contains(pt) or new_ground(pt) or (en and later_name.search(en)): continue
    f = faith(en, cls, tags)
    if f: add('wo', *WORSHIP[f], pt, blk=None)

print('facilities:', {k: sum(1 for f in fac if f[0] == k) for k in F.KINDS}, 'missing:', missing)

detail['fac'] = []
for k, en, zh, pt, year, gone, b, pc in fac:
    x, y = (pt.x - LON0) * K, (LAT0 - pt.y) * K
    d = in_district(pt) or min(district_deg, key=lambda i: district_deg[i].distance(pt))
    detail['fac'].append([k, en, zh, r1(x), r1(y), pc, b['i'] if b else -1, year or 0, gone or 0, dist_no.get(d, -1)])
detail['kinds'] = {k: list(v) for k, v in F.KINDS.items()}

os.makedirs(OUT, exist_ok=True)
for name, data in (('base.json', base), ('detail.json', detail)):
    s = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    open(os.path.join(OUT, name), 'w', encoding='utf-8').write(s)
    print(name, round(len(s) / 1024), 'KB')

# ---------- the index at the back of the directory ----------
# Every name on the sheet, A to Z, with where it is: [english, chinese, kind, x, y, district number].
# Kinds: d district, m MRT station, l LRT station, p neighbourhood, w river, r road.
def entry(en, zh, kind, x, y, d=None):
    if d is None: d = in_district(Point(x / K + LON0, LAT0 - y / K))
    return [en, zh or '', kind, r1(x), r1(y), dist_no.get(d, -1)]


index = []
dzh = dict(re.findall(r"id: '([a-z-]+)', en: '[^']*', zh: '([^']+)'", dist_ts))
den = dict(re.findall(r"id: '([a-z-]+)', en: '([^']+)'", dist_ts))
for d in districts_out: index.append(entry(den[d['id']], dzh[d['id']], 'd', d['lx'], d['ly'], d['id']))
seen = set()
for st in stations:
    if st['n'][0] in seen: continue
    seen.add(st['n'][0])
    index.append(entry(st['n'][0], st['n'][1], 'l' if st['l'] == 'bp' else 'm', st['x'], st['y']))
for pl in places:
    nm = re.findall(r"b\('([^']+)', '([^']+)'", re.search(rf"id: '{pl['d']}'.*?blocks: \[(.*?)\],\n\s+transit", dist_ts, re.S).group(1))[pl['i']]
    index.append(entry(nm[0], nm[1], 'p', pl['x'], pl['y'], pl['d']))


def spots(items, kind):
    """One entry for each stretch of a name: the same name a kilometre or more away is another place."""
    by = {}
    for g, en, zh in items:
        n = label(en, zh)
        if n: by.setdefault(n[0], [n, []])[1].extend(lines(g))
    for en, (n, ls) in by.items():
        parts = lines(linemerge(ls)) if len(ls) > 1 else ls
        groups = []
        for l in sorted(parts, key=lambda l: -l.length):
            near = [g for g in groups if any(x.distance(l) < 0.009 for x in g)]
            if near:
                near[0].append(l)
                for g in near[1:]: near[0].extend(g); groups.remove(g)
            else: groups.append([l])
        done = set()
        for g in sorted(groups, key=lambda g: -sum(l.length for l in g)):
            if sum(l.length for l in g) * 111 < 0.06: continue
            pt = g[0].interpolate(0.5, normalized=True)
            e = entry(n[0], n[1] if len(n) > 1 else '', kind, (pt.x - LON0) * K, (LAT0 - pt.y) * K)
            if e[5] in done: continue  # one line a district: the longest stretch
            done.add(e[5])
            index.append(e)


spots([x for k in ROAD_TOL for x in roads[k]], 'r')
spots(water_lines, 'w')
# facilities, with their kind and postcode: [english, chinese, 'f', x, y, district, kind, postcode] (places of worship have no names to index)
index += [[en, zh, 'f', x, y, d, k, pc] for k, en, zh, x, y, pc, _, _, _, d in detail['fac'] if k != 'wo']
nat = lambda t: [int(x) if x.isdigit() else x.lower() for x in re.split(r'(\d+)', t)]
index.sort(key=lambda e: (nat(e[0]), e[2]))
s = json.dumps({'v': 1, 'districts': [d['id'] for d in districts_out], 'kinds': {k: list(v) for k, v in F.KINDS.items()}, 'index': index}, ensure_ascii=False, separators=(',', ':'))
open(os.path.join(OUT, 'index.json'), 'w', encoding='utf-8').write(s)
print('index.json', len(index), 'entries,', round(len(s) / 1024), 'KB')

# ---------- the light coast for the office and the small maps ----------
def pts(p, tol):
    q = S(p).simplify(tol)
    return [[round(x), round(y)] for x, y in q.exterior.coords[:-1]]


main = max(polys(land99), key=lambda p: p.area)
isles = sorted([p for p in polys(land99) if p is not main and p.area * 111 ** 2 > 0.6], key=lambda p: -p.area)
sheet = {'coast': pts(main, 1.2), 'islands': [pts(p, 1.2) for p in isles]}

# Street-directory pages: 40 x 28 units (about 2 x 1.5 km), numbered from the north-west, row by row, where there is land.
PW, PH, PC = 40, 28, 26
land_s = land99_s.buffer(0)
pages = [r * PC + c for r in range(21) for c in range(PC) if land_s.intersection(box(c * PW, r * PH, (c + 1) * PW, (r + 1) * PH)).area > 4]
labels = {d['id']: [round(d['lx']), round(d['ly'])] for d in districts_out}
open(os.path.join(ROOT, 'src', 'data', 'gerimis', 'sheet.ts'), 'w', encoding='utf-8').write(
    '// Generated by scripts/map/build.py from OpenStreetMap (ODbL, (c) OpenStreetMap contributors), set back to 1999. Do not edit.\n'
    '/** The 1999 coast on the survey sheet, light enough for the office canvases and the small maps. */\n'
    f"export const COAST: [number, number][] = {json.dumps(sheet['coast'], separators=(',', ':'))};\n"
    f"export const ISLANDS: [number, number][][] = {json.dumps(sheet['islands'], separators=(',', ':'))};\n"
    '/** Where each district\'s name sits: the point deepest inside it. */\n'
    f"export const LABEL: Record<string, [number, number]> = {json.dumps(labels, separators=(',', ':'))};\n"
    '/** Street-directory pages: size on the sheet, columns, and the cells that have land, in page order. */\n'
    f"export const PAGE = {{ w: {PW}, h: {PH}, cols: {PC} }};\n"
    f"export const PAGES: number[] = {json.dumps(pages, separators=(',', ':'))};\n")
print('sheet.ts', len(sheet['coast']), 'points,', len(sheet['islands']), 'islands,', len(pages), 'pages')
