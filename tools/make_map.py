# 완도 주변 해안선 SVG 경로 만들기 (통계청 2013 시군구 경계, southkorea/southkorea-maps)
# 사용: python3 -I tools/make_map.py <skorea_municipalities_geo.json> > public/map-paths.js
import json, sys
B = dict(lat0=33.95, lat1=34.48, lon0=126.40, lon1=127.25, W=360, H=330)
def X(lon): return (lon - B['lon0']) / (B['lon1'] - B['lon0']) * B['W']
def Y(lat): return (B['lat1'] - lat) / (B['lat1'] - B['lat0']) * B['H']
def simplify(pts, tol):  # Douglas-Peucker
    if len(pts) < 3: return pts
    import math
    a, b = pts[0], pts[-1]; dmax, idx = 0, 0
    for i in range(1, len(pts) - 1):
        p = pts[i]; dx, dy = b[0]-a[0], b[1]-a[1]
        d = abs(dy*p[0]-dx*p[1]+b[0]*a[1]-b[1]*a[0]) / (math.hypot(dx, dy) or 1)
        if d > dmax: dmax, idx = d, i
    if dmax > tol: return simplify(pts[:idx+1], tol)[:-1] + simplify(pts[idx:], tol)
    return [a, b]
g = json.load(open(sys.argv[1], encoding='utf-8'))
out = {}
for f in g['features']:
    name = f['properties'].get('name') or f['properties'].get('NAME') or ''
    geom = f['geometry']; polys = geom['coordinates'] if geom['type'] == 'MultiPolygon' else [geom['coordinates']]
    paths = []
    for poly in polys:
        ring = poly[0]
        lons = [p[0] for p in ring]; lats = [p[1] for p in ring]
        if max(lons) < B['lon0'] or min(lons) > B['lon1'] or max(lats) < B['lat0'] or min(lats) > B['lat1']: continue
        pts = [(X(p[0]), Y(p[1])) for p in ring]
        w = max(p[0] for p in pts) - min(p[0] for p in pts); h = max(p[1] for p in pts) - min(p[1] for p in pts)
        if w < 1.2 and h < 1.2: continue  # 아주 작은 섬은 뺌
        m = len(pts) // 2  # 닫힌 고리는 반으로 나눠 단순화
        sp = simplify(pts[:m+1], 0.35)[:-1] + simplify(pts[m:], 0.35)
        if len(sp) < 3: continue
        paths.append('M' + 'L'.join('%.1f %.1f' % p for p in sp) + 'Z')
    if paths: out[name] = ''.join(paths)
print('// 자동 생성: tools/make_map.py — 통계청(KOSTAT) 2013 시군구 경계(southkorea/southkorea-maps) 기반, 단순화')
print('globalThis.WANDO_MAP = ' + json.dumps({'bounds': B, 'land': out}, ensure_ascii=False) + ';')
