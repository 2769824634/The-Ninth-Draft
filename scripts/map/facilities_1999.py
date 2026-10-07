"""
What the island had in 1999 besides flats and roads: the lists scripts/map/build.py
reads to put markets, bus interchanges, shopping centres, post offices, clinics,
libraries, community centres, pools, schools, places of worship and ferry
terminals on the sheet.

Positions come from OpenStreetMap (buildings, land use, transit), looked up by
the names here. A town that had something in 1999 that OpenStreetMap no longer
names (the interchange was rebuilt, the polyclinic moved) gets it at its town
centre. Names follow the map's rule: nothing named for a governor, a royal or a
politician (CLAUDE.md); those take a local name or are left out.
"""

# kinds: code -> (English, Chinese, abbreviation on the sheet (en, zh))
KINDS = {
    'mk': ('Market and food centre', '巴刹 · 熟食中心', 'MKT', '市'),
    'bi': ('Bus interchange', '巴士转换站', 'BUS', '站'),
    'sc': ('Shopping centre', '购物中心', 'SC', '商'),
    'po': ('Post office', '邮局', 'PO', '邮'),
    'pc': ('Polyclinic', '综合诊疗所', 'POLY', '诊'),
    'hp': ('Hospital', '医院', 'HOSP', '医'),
    'cc': ('Community centre', '民众联络所', 'CC', '联'),
    'lb': ('Public library', '公共图书馆', 'LIB', '图'),
    'sw': ('Swimming complex', '游泳池', 'POOL', '泳'),
    'sh': ('School', '学校', 'SCH', '校'),
    'wo': ('Place of worship', '宗教场所', '+', '+'),
    'fr': ('Ferry terminal', '渡轮码头', 'FERRY', '渡'),
}

# Where each town's centre is, by a name OpenStreetMap has; the rest use their MRT station.
TOWN_CENTRE = {
    'ang-mo-kio': 'Ang Mo Kio Town Centre', 'bedok': 'Bedok Town Centre', 'bishan': 'Bishan Town Centre',
    'bukit-batok': 'Bukit Batok Town Centre', 'bukit-merah': 'Bukit Merah Central', 'west-coast': 'Clementi Town Centre',
    'toa-payoh': 'Toa Payoh Central', 'hougang': 'Hougang Central', 'serangoon': 'Serangoon Central',
    'yishun': 'Yishun Central', 'jurong-west': 'Jurong Central', 'geylang': 'Geylang East Central',
    'pasir-ris': 'Pasir Ris Neighbourhood Centre', 'sembawang': 'Sembawang Shopping Centre', 'woodlands': 'Woodlands Mart',
    'choa-chu-kang': 'Choa Chu Kang Bus Interchange', 'bukit-panjang': 'Bukit Panjang Neighbourhood Centre',
    'marine-parade': 'Parkway Parade', 'tampines': 'Tampines Mall', 'jurong-east': 'Jurong East Bus Interchange',
    'queenstown': 'Queenstown Community Centre', 'kallang': 'Kallang Community Club', 'changi': 'Changi Village',
    'kreta-ayer': "People's Park Complex", 'rochor': 'Bugis Junction', 'novena': 'Balestier Plaza',
}

# (kind, English, Chinese, year opened or None, OpenStreetMap name to find it by (default: the English), district for a town-centre fallback)
# A facility whose OSM name is None and has a district is put at that town's centre.
LISTED = [
    # bus interchanges and terminals that ran in 1999
    ('bi', 'Ang Mo Kio Bus Interchange', '宏茂桥巴士转换站', 1979, None, 'ang-mo-kio'),
    ('bi', 'Bedok Bus Interchange', '勿洛巴士转换站', 1979, None, 'bedok'),
    ('bi', 'Bishan Bus Interchange', '碧山巴士转换站', 1989, None, None),
    ('bi', 'Boon Lay Bus Interchange', '文礼巴士转换站', 1990, 'Boon Lay Interchange', None),
    ('bi', 'Bukit Batok Bus Interchange', '武吉巴督巴士转换站', 1989, None, None),
    ('bi', 'Bukit Merah Bus Interchange', '红山巴士转换站', 1981, None, 'bukit-merah'),
    ('bi', 'Bukit Panjang Bus Interchange', '武吉班让巴士转换站', 1983, None, 'bukit-panjang'),
    ('bi', 'Choa Chu Kang Bus Interchange', '蔡厝港巴士转换站', 1990, None, None),
    ('bi', 'West Coast Bus Interchange', '西海岸巴士转换站', 1980, None, 'west-coast'),
    ('bi', 'Kampong Melayu Bus Interchange', '甘榜马来由巴士转换站', 1989, 'Eunos Bus Interchange', None),
    ('bi', 'Hougang Central Bus Interchange', '后港中心巴士转换站', 1990, None, None),
    ('bi', 'Jurong East Bus Interchange', '裕廊东巴士转换站', 1985, None, None),
    ('bi', 'Pasir Ris Bus Interchange', '巴西立巴士转换站', 1989, None, None),
    ('bi', 'Serangoon Bus Interchange', '实龙岗巴士转换站', 1988, None, None),
    ('bi', 'Tampines Bus Interchange', '淡滨尼巴士转换站', 1983, None, 'tampines'),
    ('bi', 'Toa Payoh Bus Interchange', '大巴窑巴士转换站', 1973, None, 'toa-payoh'),
    ('bi', 'Woodlands Regional Bus Interchange', '兀兰区域巴士转换站', 1996, 'Woodlands Integrated Transport Hub', None),
    ('bi', 'Yishun Bus Interchange', '义顺巴士转换站', 1987, None, None),
    ('bi', 'Yio Chu Kang Bus Interchange', '杨厝港巴士转换站', 1987, None, None),
    ('bi', 'Axis Bus Terminal', '中枢巴士终站', 1970, 'Shenton Way Terminal', None),
    ('bi', 'Changi Village Bus Terminal', '樟宜村巴士终站', 1975, None, None),
    ('bi', "St Michael's Bus Terminal", '圣米迦勒巴士终站', 1980, "Saint Michael's Bus Terminal", None),

    # shopping centres open by 1999
    ('sc', 'Plaza Singapura', '狮城大厦', 1974, None, None),
    ('sc', 'Lucky Plaza', '幸运商业中心', 1978, None, None),
    ('sc', 'Tang Plaza', '东陵坊', 1982, None, None),
    ('sc', 'Wisma Atria', '威士马广场', 1986, None, None),
    ('sc', 'Ngee Ann City', '义安城', 1993, None, None),
    ('sc', 'Paragon', '百丽宫', 1980, None, None),
    ('sc', 'The Centrepoint', '森德坊', 1983, None, None),
    ('sc', 'Far East Plaza', '远东广场', 1983, None, None),
    ('sc', 'Orchard Plaza', '乌节坊', 1980, None, None),
    ('sc', 'Cuppage Plaza', '卡佩芝广场', 1978, None, None),
    ('sc', 'Orchard Towers', '乌节大厦', 1975, None, None),
    ('sc', 'Shaw House', '邵氏楼', 1993, None, None),
    ('sc', 'Forum The Shopping Mall', '福临门购物中心', 1985, None, None),
    ('sc', 'The Heeren', '希尔伦', 1990, None, None),
    ('sc', 'Palais Renaissance', '百利宫', 1993, None, None),
    ('sc', 'Tanglin Mall', '东陵购物中心', 1995, None, None),
    ('sc', 'Delfi Orchard', '德尔菲乌节', 1983, None, None),
    ('sc', 'Liat Towers', '丽雅大厦', 1984, 'Liat Tower', None),
    ('sc', 'Bugis Junction', '白沙浮广场', 1995, None, None),
    ('sc', 'Sim Lim Square', '森林广场', 1985, None, None),
    ('sc', 'Funan Centre', '福南电脑中心', 1985, 'Funan', None),
    ('sc', 'Peninsula Plaza', '半岛广场', 1980, None, None),
    ('sc', 'Peninsula Shopping Centre', '半岛购物中心', 1970, None, None),
    ('sc', 'Bras Basah Complex', '百胜楼', 1980, None, None),
    ('sc', 'Fortune Centre', '富康中心', 1983, None, None),
    ('sc', 'Marina Square', '滨海广场', 1987, None, None),
    ('sc', 'Suntec City', '新达城', 1995, None, None),
    ('sc', 'Millenia Walk', '美年径', 1996, None, None),
    ('sc', "People's Park Complex", '珍珠坊', 1973, None, None),
    ('sc', "People's Park Centre", '珍珠大厦', 1976, None, None),
    ('sc', 'Chinatown Point', '唐城坊', 1993, 'Perennial Chinatown Point', None),
    ('sc', 'Hong Lim Complex', '芳林苑', 1980, None, None),
    ('sc', 'Golden Mile Complex', '黄金坊', 1973, None, None),
    ('sc', 'Golden Mile Tower', '黄金大厦', 1974, None, None),
    ('sc', 'World Trade Centre', '世界贸易中心', 1977, 'HarbourFront Centre', None),
    ('sc', 'Parkway Parade', '百汇广场', 1983, None, None),
    ('sc', 'Katong Shopping Centre', '加东购物中心', 1973, None, None),
    ('sc', 'Katong Plaza', '加东广场', 1975, None, None),
    ('sc', 'Odeon Katong Shopping Complex', '奥迪安加东购物中心', 1985, None, None),
    ('sc', 'Tanjong Katong Complex', '丹戎加东坊', 1980, None, None),
    ('sc', 'City Plaza', '城市广场', 1979, None, None),
    ('sc', 'Joo Chiat Complex', '如切坊', 1985, None, None),
    ('sc', 'Kallang Leisure Park', '加冷休闲园', 1982, 'Leisure Park Kallang', None),
    ('sc', 'Mustafa Centre', '慕斯达法中心', 1995, None, None),
    ('sc', 'Balestier Plaza', '马里士他广场', 1985, None, None),
    ('sc', 'United Square', '联合广场', 1984, None, None),
    ('sc', 'Thomson Plaza', '汤申广场', 1979, None, None),
    ('sc', 'Junction 8', '八号路口', 1993, None, None),
    ('sc', 'Tiong Bahru Plaza', '中峇鲁广场', 1994, None, None),
    ('sc', 'Bukit Timah Plaza', '武吉知马广场', 1978, None, None),
    ('sc', 'Beauty World Centre', '美世界中心', 1984, None, None),
    ('sc', 'Beauty World Plaza', '美世界广场', 1980, None, None),
    ('sc', 'Holland Road Shopping Centre', '荷兰路购物中心', 1976, None, None),
    ('sc', 'Anchorpoint', '安珀坊', 1997, None, None),
    ('sc', 'Northpoint', '北点', 1992, 'Northpoint City', None),
    ('sc', 'Causeway Point', '长堤坊', 1998, None, None),
    ('sc', 'Sembawang Shopping Centre', '三巴旺购物中心', 1985, None, None),
    ('sc', 'Tampines Mall', '淡滨尼购物中心', 1995, None, None),
    ('sc', 'Century Square', '世纪广场', 1996, None, None),
    ('sc', 'White Sands', '白沙购物中心', 1996, None, None),
    ('sc', 'Bedok Shopping Complex', '勿洛购物中心', 1980, None, None),
    ('sc', 'Hougang Mall', '后港购物中心', 1997, None, None),
    ('sc', 'Jurong Point', '裕廊坊', 1995, None, None),
    ('sc', 'IMM', 'IMM 大厦', 1991, None, None),
    ('sc', 'Lot One', '第一站', 1996, "Lot One Shoppers' Mall", None),
    ('sc', 'West Mall', '西城', 1998, None, None),
    ('sc', 'Bukit Panjang Plaza', '武吉班让广场', 1998, None, None),
    ('sc', 'Teck Whye Shopping Centre', '德惠购物中心', 1985, None, None),

    # hospitals
    ('hp', 'Gerimis General Hospital', '霏微中央医院', 1926, 'Singapore General Hospital', None),
    ('hp', 'Tan Tock Seng Hospital', '陈笃生医院', 1909, None, None),
    ("hp", "KK Women's and Children's Hospital", '竹脚妇幼医院', 1997, None, None),
    ('hp', 'National University Hospital', '国立大学医院', 1985, None, None),
    ('hp', 'Changi General Hospital', '樟宜综合医院', 1998, None, None),
    ('hp', 'Gleneagles Hospital', '鹰阁医院', 1957, None, None),
    ('hp', 'Mount Alvernia Hospital', '阿尔维尼亚山医院', 1961, None, None),
    ('hp', 'East Shore Hospital', '东岸医院', 1942, 'Parkway East Hospital', None),
    ('hp', 'Kwong Wai Shiu Hospital', '广惠肇留医院', 1910, None, None),
    ('hp', "St Luke's Hospital", '圣路加医院', 1996, 'St Luke’s Hospital', None),
    ('hp', 'Ang Mo Kio Community Hospital', '宏茂桥社区医院', 1993, None, None),
    ('hp', 'Woodbridge Hospital', '板桥医院', 1993, 'Buangkok Green Medical Park', None),
    ('hp', 'Communicable Disease Centre', '传染病中心', 1907, None, None),

    # polyclinics
    ('pc', 'Ang Mo Kio Polyclinic', '宏茂桥综合诊疗所', 1988, None, None),
    ('pc', 'Choa Chu Kang Polyclinic', '蔡厝港综合诊疗所', 1993, None, None),
    ('pc', 'Hougang Polyclinic', '后港综合诊疗所', 1991, None, None),
    ('pc', 'Queenstown Polyclinic', '女皇镇综合诊疗所', 1963, None, None),
    ('pc', 'Toa Payoh Polyclinic', '大巴窑综合诊疗所', 1972, None, None),
    ('pc', 'Yishun Polyclinic', '义顺综合诊疗所', 1988, None, None),
    ('pc', 'Bedok Polyclinic', '勿洛综合诊疗所', 1980, None, 'bedok'),
    ('pc', 'Bukit Batok Polyclinic', '武吉巴督综合诊疗所', 1990, None, 'bukit-batok'),
    ('pc', 'West Coast Polyclinic', '西海岸综合诊疗所', 1980, None, 'west-coast'),
    ('pc', 'Geylang Polyclinic', '芽笼综合诊疗所', 1982, None, 'geylang'),
    ('pc', 'Jurong Polyclinic', '裕廊综合诊疗所', 1983, None, 'jurong-east'),
    ('pc', 'Marine Parade Polyclinic', '马林百列综合诊疗所', 1979, None, 'marine-parade'),
    ("pc", "Pearl's Hill Polyclinic", '珍珠山综合诊疗所', 1966, None, 'kreta-ayer'),
    ('pc', 'Pasir Ris Polyclinic', '巴西立综合诊疗所', 1996, None, 'pasir-ris'),
    ('pc', 'Tampines Polyclinic', '淡滨尼综合诊疗所', 1987, None, 'tampines'),
    ('pc', 'Woodlands Polyclinic', '兀兰综合诊疗所', 1990, None, 'woodlands'),

    # public libraries (the National Library still on its old hill: knocked down in 2004, so it stands here)
    ('lb', 'Ang Mo Kio Public Library', '宏茂桥公共图书馆', 1985, None, None),
    ('lb', 'Queenstown Public Library', '女皇镇公共图书馆', 1970, None, None),
    ('lb', 'Toa Payoh Public Library', '大巴窑公共图书馆', 1974, None, None),
    ('lb', 'Marine Parade Public Library', '马林百列公共图书馆', 1978, None, 'marine-parade'),
    ('lb', 'Bedok Public Library', '勿洛公共图书馆', 1985, None, 'bedok'),
    ('lb', 'Geylang East Public Library', '芽笼东公共图书馆', 1988, None, 'geylang'),
    ('lb', 'Bukit Merah Public Library', '红山公共图书馆', 1983, None, 'bukit-merah'),
    ('lb', 'Yishun Public Library', '义顺公共图书馆', 1987, None, 'yishun'),
    ('lb', 'Tampines Public Library', '淡滨尼公共图书馆', 1994, None, 'tampines'),
    ('lb', 'Woodlands Public Library', '兀兰公共图书馆', 1990, None, 'woodlands'),
    ('lb', 'Jurong East Public Library', '裕廊东公共图书馆', 1988, None, 'jurong-east'),
    ('lb', 'Bukit Batok Public Library', '武吉巴督公共图书馆', 1996, None, 'bukit-batok'),
    ('lb', 'Bishan Public Library', '碧山公共图书馆', 1994, None, 'bishan'),

    # ferry terminals (the clerk at the pier hands newcomers their arrival card)
    ('fr', 'Changi Point Ferry Terminal', '樟宜尾渡轮码头', 1970, None, None),
    ('fr', 'Tanah Merah Ferry Terminal', '丹那美拉渡轮码头', 1995, None, None),
    ('fr', 'West Coast Pier', '西海岸码头', 1970, None, None),
    ('fr', 'World Trade Centre Ferry Terminal', '世界贸易中心渡轮码头', 1991, 'Singapore Cruise Centre (HarbourFront) Terminal', None),
]

# Put by hand: what OpenStreetMap no longer has because it was knocked down after 1999,
# and what was gone before 1999 (drawn faint, in red pencil: gone=year).
MANUAL = [
    # (kind, English, Chinese, year opened, lon, lat, gone)
    ('lb', 'National Library', '国家图书馆', 1960, 103.8508, 1.2972, None),
    ('fr', 'Red Lantern Pier', '红灯码头', 1933, 103.8532, 1.2838, None),
    ('po', 'General Post Office', '邮政总局', 1928, 103.8530, 1.2862, 1996),
]

# Post offices: one in each town, at the town centre; and the old ones OpenStreetMap still names.
POST_OSM = ['Killiney Post Office', 'Lim Ah Pin Road Post Office', 'Serangoon Garden Post Office', 'Upper Serangoon Post Office']

# Names that came after 1999, or are not what they say (a supermarket called "market"), left out.
LATER = (r'Super ?[Mm]arket|Hypermarket|Seafood|Mini ?Market|Night Market|Market Square|MarketPlace|Market Village|Traders Market|Guoco|ActiveSG|storeroom|^Food Centre$|'
         r'Greenwich|Kusu|Shiok|Meng Soon Huat|Interim|Gluttons|Bukit Batok West Hawker|Bukit Canberra|Ci Yuan|Jurong West Hawker|Marsiling Mall Hawker|'
         r'Pasir Ris Central Hawker|Senja Hawker|Yishun Park Hawker|Bukit Panjang Hawker|Our Tampines|Kampung Admiralty|'
         r'Anchorvale|Fernvale|Punggol|Rivervale|Tengah|Frontier|Canberra|Tampines North|Sengkang|Compassvale|Buangkok|Woodleigh|'
         r'Joint Testing|Republic Polytechnic|Nanyang Polytechnic|Singapore Institute of Technology|Singapore University of Technology|'
         r'Singapore Management University|SIM |Institute of Technical Education|ITE College|Yale-NUS|Tembusu|Cinnamon|U ?Town|'
         r'Integrated Transport Hub')

# Community centres renamed with their place
CC_RENAME = [(r'^Braddell Heights', 'Kim Keat Heights'), (r'^Mountbatten', 'Old Airport'), (r'^Clementi', 'West Coast'), (r'^Eunos', 'Kampong Melayu'),
             (r'^Chua Chu Kang', 'Choa Chu Kang')]

# School names on the island are its own: a tree for each, with the town. (People and institutions are fictional.)
TREES = [('Angsana', '紫檀'), ('Tembusu', '灰莉'), ('Saga', '相思'), ('Jambu', '蒲桃'), ('Ketapang', '榄仁'), ('Pulai', '糖胶'),
         ('Bintangor', '红厚壳'), ('Merbau', '印茄'), ('Simpoh', '五桠果'), ('Rambai', '木奶果'), ('Kemuning', '九里香'),
         ('Cempaka', '黄兰'), ('Kenanga', '依兰'), ('Tanjung', '香榄'), ('Mahang', '血桐'), ('Pandan', '香兰'), ('Nangka', '波罗蜜'),
         ('Belimbing', '杨桃'), ('Rambutan', '红毛丹'), ('Durian', '榴莲'), ('Mempat', '黄牛木'), ('Gelam', '白千层'),
         ('Medang', '樟木'), ('Petai', '臭豆'), ('Kapok', '木棉'), ('Rengas', '漆树'), ('Senduduk', '野牡丹'), ('Kelat', '赤楠')]
