"""
Fetch the map's sources into .cache/map-src/ (not committed).

  python3 scripts/map/fetch.py

- OpenStreetMap, through the Overture Maps release on AWS (base: land, water,
  land use, infrastructure; transportation: segments; divisions: areas;
  buildings: only the ones with a name, for the facilities layer). Only
  the row groups that touch the Singapore box are read.
- HDB blocks with block numbers and completion years: NUS Urban Analytics Lab,
  hdb3d-data (OpenStreetMap footprints joined with HDB open data).
- Rail lines and stations: cheeaun/railrouter-sg.

Needs: pyarrow. Everything derived from these is in public/map/ and is
ODbL, (c) OpenStreetMap contributors. See scripts/map/README.md.
"""
import os, sys, re, io, ssl, urllib.parse, urllib.request
import numpy as np, pyarrow as pa, pyarrow.parquet as pq, pyarrow.compute as pc
BASE='https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com'
REL='release/2026-09-23.1'
BOX=(103.55,1.13,104.15,1.50)
DIR=os.path.join(os.path.dirname(__file__),'..','..','.cache','map-src')
ctx=ssl.create_default_context(cafile=os.environ.get('SSL_CERT_FILE') or os.environ.get('REQUESTS_CA_BUNDLE'))
op=urllib.request.build_opener(urllib.request.ProxyHandler(), urllib.request.HTTPSHandler(context=ctx))
def get(url, rng=None):
    r=urllib.request.Request(url)
    if rng: r.add_header('Range', 'bytes=%d-%d'%rng)
    for i in range(4):
        try: return op.open(r, timeout=120).read()
        except Exception as e: err=e
    raise err
def keys(prefix):
    out=[]; tok=''
    while True:
        x=get(f'{BASE}/?list-type=2&prefix={prefix}'+(f'&continuation-token={urllib.parse.quote(tok)}' if tok else '')).decode()
        out+=re.findall(r'<Key>([^<]+)</Key>.*?<Size>(\d+)</Size>', x)
        m=re.search(r'<NextContinuationToken>([^<]+)<',x)
        if not m: return out
        tok=m.group(1)
class RF(io.RawIOBase):
    def __init__(s,url,size): s.url,s.size,s.pos=url,size,0; s.cache={}
    def seekable(s): return True
    def readable(s): return True
    def tell(s): return s.pos
    def seek(s,o,w=0):
        s.pos = o if w==0 else s.pos+o if w==1 else s.size+o; return s.pos
    def read(s,n=-1):
        if n<0: n=s.size-s.pos
        if n<=0: return b''
        b=get(s.url,(s.pos,min(s.size,s.pos+n)-1)); s.pos+=len(b); return b
    def readinto(s,buf):
        b=s.read(len(buf)); buf[:len(b)]=b; return len(b)

def overture(theme, typ, out, columns=None, named=False):
    # columns / named: read only some columns, keep only rows with a name
    # (buildings: the whole island is ~1 GB, the named ones a few MB)
    if os.path.exists(out): return
    tables=[]
    for k,size in keys(f'{REL}/theme={theme}/type={typ}/'):
        f=pq.ParquetFile(io.BufferedReader(RF(f'{BASE}/{k}',int(size)), buffer_size=1<<20))
        md=f.metadata; names=[md.schema.column(i).path for i in range(md.num_columns)]
        ix={n:names.index('bbox.'+n) for n in ('xmin','xmax','ymin','ymax')}
        for g in range(md.num_row_groups):
            rg=md.row_group(g); st={n:rg.column(i).statistics for n,i in ix.items()}
            if not (st['xmin'].min<BOX[2] and st['xmax'].max>BOX[0] and st['ymin'].min<BOX[3] and st['ymax'].max>BOX[1]): continue
            t=f.read_row_group(g, columns=columns); b=t.column('bbox').combine_chunks()
            m=(b.field('xmin').to_numpy()<BOX[2])&(b.field('xmax').to_numpy()>BOX[0])&(b.field('ymin').to_numpy()<BOX[3])&(b.field('ymax').to_numpy()>BOX[1])
            t=t.filter(pa.array(m))
            if named: t=t.filter(pc.is_valid(t.column('names')))
            if t.num_rows: tables.append(t)
    pq.write_table(pa.concat_tables(tables, promote_options='default'), out)
    print(out, flush=True)

RAW={
    'hdb.json':'https://raw.githubusercontent.com/ualsg/hdb3d-data/master/hdb.json',
    'rail.json':'https://raw.githubusercontent.com/cheeaun/railrouter-sg/master/src/sg-rail.geo.json',
}

if __name__=='__main__':
    os.makedirs(DIR, exist_ok=True)
    for name,url in RAW.items():
        p=os.path.join(DIR,name)
        if not os.path.exists(p): open(p,'wb').write(get(url)); print(p)
    for theme,typ in [('base','land'),('base','water'),('base','land_use'),('base','infrastructure'),('transportation','segment'),('divisions','division_area')]:
        overture(theme, typ, os.path.join(DIR, f'{typ}.parquet'))
    # named buildings: markets, malls, hospitals, schools for the facilities layer
    overture('buildings', 'building', os.path.join(DIR, 'building_named.parquet'), named=True,
             columns=['id','geometry','names','class','subtype','height','num_floors','bbox','sources'])
