# 완도뱃길 아이콘·카톡 미리보기 그림 만들기 (python3 tools/make_icons.py)
import math, sys
from PIL import Image, ImageDraw, ImageFont
OUT = sys.argv[1] if len(sys.argv) > 1 else "public"
TOP, BOT = (31, 86, 140), (13, 44, 78)

def scene(S):
    im = Image.new("RGB", (S, S)); d = ImageDraw.Draw(im)
    for y in range(S):
        f = y / S; d.line([(0, y), (S, y)], fill=tuple(int(TOP[i] + (BOT[i] - TOP[i]) * f) for i in range(3)))
    u = S / 512
    d.ellipse([370*u, 100*u, 432*u, 162*u], fill=(255, 201, 61))
    # 섬 세 개 (완도의 여러 섬)
    for cx, w, h in [(70, 120, 70), (430, 150, 95), (300, 90, 45)]:
        d.ellipse([(cx-w/2)*u, (345-h)*u, (cx+w/2)*u, (345+h)*u], fill=(46, 125, 96))
    # 배
    d.polygon([(120*u, 300*u), (392*u, 300*u), (360*u, 352*u), (150*u, 352*u)], fill="white")
    d.rectangle([180*u, 250*u, 330*u, 300*u], fill="white")
    d.rectangle([214*u, 215*u, 300*u, 250*u], fill="white")
    d.rectangle([272*u, 180*u, 296*u, 215*u], fill=(232, 89, 12))
    for x in (196, 230, 264, 298): d.rectangle([x*u, 264*u, (x+20)*u, 282*u], fill=BOT)
    # 물결
    for k, (base, col) in enumerate([(350, (42, 143, 184)), (385, (30, 110, 160)), (425, (20, 80, 125))]):
        pts = [(x*u, (base + 14*math.sin(x/60 + k))*u) for x in range(0, 513, 8)] + [(S, S), (0, S)]
        d.polygon(pts, fill=col)
    return im

big = scene(512); big.save(f"{OUT}/icons/icon-512.png")
big.resize((192, 192), Image.LANCZOS).save(f"{OUT}/icons/icon-192.png")
big.resize((180, 180), Image.LANCZOS).save(f"{OUT}/icons/apple-touch-icon.png")

# 카톡 미리보기 1200x630
og = Image.new("RGB", (1200, 630), BOT); d = ImageDraw.Draw(og)
for y in range(630):
    f = y / 630; d.line([(0, y), (1200, y)], fill=tuple(int(TOP[i] + (BOT[i] - TOP[i]) * f) for i in range(3)))
for k, (base, col) in enumerate([(480, (30, 110, 160)), (530, (36, 125, 172)), (580, (42, 143, 184))]):
    d.polygon([(x, base + 16*math.sin(x/90 + k*1.3)) for x in range(0, 1201, 10)] + [(1200, 630), (0, 630)], fill=col)
ic = scene(300); m = Image.new("L", (300, 300), 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, 299, 299], 60, fill=255)
og.paste(ic, (80, 110), m)
F = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
d.text((430, 140), "완도뱃길", font=ImageFont.truetype(F, 112), fill="white")
d.text((436, 290), "청산·노화·보길·소안·금일·생일·금당·덕우", font=ImageFont.truetype(F, 38), fill=(255, 209, 102))
d.text((436, 350), "배 시간 · 운항 통제 · 날씨 · 물때", font=ImageFont.truetype(F, 40), fill=(234, 246, 246))
og.save(f"{OUT}/og.png", optimize=True)

# 지역별 카톡 미리보기 (tools/regions.json 은 build-pages.mjs 가 만듦)
import json, os
os.makedirs(f"{OUT}/og", exist_ok=True)
for r in json.load(open(os.path.join(os.path.dirname(__file__), "regions.json"))):
    im = og.copy(); d = ImageDraw.Draw(im)
    d.rectangle([420, 120, 1200, 420], fill=None)
    # 글자 자리 다시 칠하기
    for y in range(120, 430):
        f = y / 630; d.line([(420, y), (1200, y)], fill=tuple(int(TOP[i] + (BOT[i] - TOP[i]) * f) for i in range(3)))
    d.text((430, 120), "완도뱃길", font=ImageFont.truetype(F, 52), fill=(234, 246, 246))
    name = r["name"]; size = 112 if len(name) <= 4 else 92
    d.text((426, 182), name, font=ImageFont.truetype(F, size), fill="white")
    d.text((436, 320), r["title"], font=ImageFont.truetype(F, 40), fill=(255, 209, 102))
    d.text((436, 378), "배 시간 · 운항 통제 · 날씨 · 물때", font=ImageFont.truetype(F, 36), fill=(234, 246, 246))
    im.save(f"{OUT}/og/{r['id']}.png", optimize=True)
