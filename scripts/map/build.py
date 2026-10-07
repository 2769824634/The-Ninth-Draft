"""
Build the street map of Gerimis, as surveyed in 1999, from the sources that
scripts/map/fetch.py leaves in .cache/map-src/.

  python3 scripts/map/build.py

Writes
  public/map/base.json    the island sheet: land, water, green, roads, rail, districts
  public/map/detail.json  close up: small roads, streams, HDB blocks, place names
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
                   'res': a.get('hdb_residential') == 'Y', 'floors': int(a.get('hdb_max_floor_lvl') or 0)})
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
LATER_ROADS = re.compile(r'Kallang[–-]Paya Lebar|Marina Coastal|North[–-]South Corridor|Bayfront|Sheares Avenue|Central Boulevard|Rhu Cross|Gardens by the Bay|Marina Gardens|Punggol (Central|Way|East|Field|Walk|Drive|Place)|Sumang|Edgedale|Edgefield|Northshore|Waterway|Tengah|Plantation|Garden (Avenue|Walk)|Bidadari|Woodleigh Link|Canberra (Link|Drive|Street|Crescent|Road)|Sengkang (East|West) Avenue|Fernvale|Anchorvale|Compassvale (Bow|Link)|Jurong (Lake|Gateway) Link|Changi Business Park|Changi Airport Terminal 3|Expo|Seletar Aerospace|Tampines North|Woodlands North Coast|Bukit Batok West Avenue [89]|Tuas South Boulevard|Tuas Link|Tuas West|Gul (Link|Avenue)|Tanah Merah Coast|Jurong Island Highway extension', re.I)
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


def label(en, zh):
    if en and CJK.search(en): en, zh = None, zh or en  # a name only in Chinese: no English to print
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


districts_out = []
for d, g in district_s.items():
    lp = shapely.ops.polylabel(max(polys(g), key=lambda p: p.area), tolerance=0.5)
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
detail = {
    'v': 1, 'q': Q,
    'roads': merged(roads['rd'], ROAD_TOL['rd']),
    'streams': enc_lines(stream_lines, 0.1),
    'hdb': [],
    'places': places,
}
for b in blocks:
    p = S(b['p'])
    r = enc_poly(p, 0.06)
    if not r: continue
    c = p.centroid
    detail['hdb'].append({'r': r[0], 'b': b['no'], 's': b['street'], 'y': b['year'], **({'c': 1} if not b['res'] else {})})

os.makedirs(OUT, exist_ok=True)
for name, data in (('base.json', base), ('detail.json', detail)):
    s = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    open(os.path.join(OUT, name), 'w', encoding='utf-8').write(s)
    print(name, round(len(s) / 1024), 'KB')

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
