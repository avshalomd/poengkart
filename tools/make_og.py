#!/usr/bin/env python3
"""Render web/og.png — the 1200x630 card that messaging apps and social
networks show when someone pastes the link.

It is drawn from the real dataset on a real basemap, not mocked up: the same
CARTO tiles the app uses, with one dot per school coloured by the same five
threshold bins as the in-app legend. A preview that shows the actual map is
also the honest thing to put in front of someone deciding whether to click.

Attribution for the tiles is painted onto the card itself, because an image
travels without the page that credits them.
"""
import io
import json
import math
import os
import urllib.request

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(HERE, '..', 'web')
DATA = os.path.join(WEB, 'data', 'schools.json')
CACHE = os.path.join(HERE, '.cache')
UA = {'User-Agent': 'poengkart/0.1 (og image build)'}

W, H = 1200, 630
MAP_W = 620                      # right-hand map panel
BG = (14, 17, 22)                # --page, dark
INK = (242, 245, 248)
INK2 = (169, 180, 192)
INK3 = (109, 118, 129)
ACCENT = (57, 135, 229)
# --seq-250 .. --seq-700 from the dark palette, same order as the app's legend
BINS = [(30, (158, 197, 244)), (34, (109, 167, 236)), (38, (57, 135, 229)),
        (42, (37, 106, 191)), (99, (24, 79, 149))]
EDGES = ['<30', '30–34', '34–38', '38–42', '42+']


# ----------------------------------------------------------------- fonts
def font(size, weight='regular'):
    """Instrument Sans is what the app renders in; ask Google Fonts for a TTF
    (the modern css2 endpoint only serves woff2, which PIL cannot read, so use
    the legacy endpoint with an ancient UA) and fall back to a system face."""
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, f'InstrumentSans-{weight}.ttf')
    if not os.path.exists(path):
        try:
            css = urllib.request.urlopen(urllib.request.Request(
                'https://fonts.googleapis.com/css?family=Instrument+Sans:'
                + ('700' if weight == 'bold' else '400'),
                headers={'User-Agent': 'Mozilla/4.0'}), timeout=20).read().decode()
            url = css.split('url(')[1].split(')')[0].strip("'\"")
            open(path, 'wb').write(urllib.request.urlopen(
                urllib.request.Request(url, headers=UA), timeout=20).read())
        except Exception as e:
            print(f'  (Instrument Sans unavailable: {e}; using the system face)')
    for p in (path,
              '/System/Library/Fonts/Supplemental/Arial Bold.ttf' if weight == 'bold'
              else '/System/Library/Fonts/Supplemental/Arial.ttf'):
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()


# ------------------------------------------------------------------ tiles
def merc(lat, lon, z, tile=512):
    n = 2 ** z
    x = (lon + 180) / 360 * n * tile
    r = math.radians(lat)
    y = (1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * n * tile
    return x, y


def basemap(cx_lat, cx_lon, z, win_w, win_h, tile=512):
    """Stitch CARTO dark tiles into a window centred on a point."""
    cx, cy = merc(cx_lat, cx_lon, z, tile)
    x0, y0 = cx - win_w / 2, cy - win_h / 2
    tx0, ty0 = int(x0 // tile), int(y0 // tile)
    tx1, ty1 = int((x0 + win_w) // tile), int((y0 + win_h) // tile)
    canvas = Image.new('RGB', ((tx1 - tx0 + 1) * tile, (ty1 - ty0 + 1) * tile), BG)
    for tx in range(tx0, tx1 + 1):
        for ty in range(ty0, ty1 + 1):
            url = (f'https://a.basemaps.cartocdn.com/dark_all/{z}/{tx}/{ty}'
                   f'{"@2x" if tile == 512 else ""}.png')
            try:
                blob = urllib.request.urlopen(
                    urllib.request.Request(url, headers=UA), timeout=25).read()
                canvas.paste(Image.open(io.BytesIO(blob)).convert('RGB'),
                             ((tx - tx0) * tile, (ty - ty0) * tile))
            except Exception as e:
                print(f'  tile {z}/{tx}/{ty} failed: {type(e).__name__}')
    ox, oy = x0 - tx0 * tile, y0 - ty0 * tile
    return canvas.crop((int(ox), int(oy), int(ox + win_w), int(oy + win_h))), (x0, y0)


# ------------------------------------------------------------------ data
def pressure(s, stale_before):
    """Mirror of the app's schoolPressure(): mean threshold among the
    programmes that filled up, judged in that school's own newest year.

    It has to stay a mirror, or the card advertises colours the map does not
    have. Two rules are easy to leave out and both change dots: a 0,0 is a
    real threshold but not part of the mean, and a school whose newest
    figures predate stale_before is drawn as no-data rather than coloured.
    """
    years = sorted({y for p in s['programs'] for y in p['values']})
    if not years:
        return None
    yr = years[-1]
    if int(yr) < stale_before:
        return None
    pool = [p['values'][yr] for p in s['programs']
            if yr in p['values'] and p['values'][yr] not in ('F', 'U')]
    nums = sorted(v for v in pool if isinstance(v, (int, float)) and v > 0)
    if not nums:
        if not pool:
            return None
        # the app's rule: any 0-cell with no positive figure is 'zero' (the
        # programmes filled, the last admitted had no points), drawn like
        # open but solid and never called "ingen venteliste"; 'open' only
        # when no cell is 0
        return 'zero' if any(v == 0 for v in pool) else 'open'
    return sum(nums) / len(nums)


def colour(v):
    return next(c for edge, c in BINS if v < edge)


# ------------------------------------------------------------------ card
def main():
    data = json.load(open(DATA))
    stale_before = data['years'][-1] - 1        # the app's staleBefore()
    pts = [(s['lat'], s['lon'], pressure(s, stale_before))
           for s in data['schools'] if s.get('lat')]
    lats = [p[0] for p in pts]
    lons = [p[1] for p in pts]
    cx_lat = (max(lats) + min(lats)) / 2
    cx_lon = (max(lons) + min(lons)) / 2

    z, tile = 5, 512
    span_y = merc(min(lats), cx_lon, z, tile)[1] - merc(max(lats), cx_lon, z, tile)[1]
    win_h = span_y * 1.13                      # a little sea above and below
    win_w = win_h * MAP_W / H
    panel, (x0, y0) = basemap(cx_lat, cx_lon, z, win_w, win_h, tile)
    scale = MAP_W / win_w
    panel = panel.resize((MAP_W, H), Image.LANCZOS)

    d = ImageDraw.Draw(panel, 'RGBA')
    for lat, lon, v in pts:
        px, py = merc(lat, lon, z, tile)
        x, y = (px - x0) * scale, (py - y0) * scale
        if not (-20 < x < MAP_W + 20 and -20 < y < H + 20):
            continue
        if v is None:
            d.ellipse([x - 3, y - 3, x + 3, y + 3], fill=(58, 69, 83, 220))
        elif v in ('open', 'zero'):
            d.ellipse([x - 4.5, y - 4.5, x + 4.5, y + 4.5],
                      outline=ACCENT + (230,), width=2,
                      fill=ACCENT + (90,) if v == 'zero' else None)
        else:
            c = colour(v)
            d.ellipse([x - 7, y - 7, x + 7, y + 7], fill=c + (70,))
            d.ellipse([x - 4.2, y - 4.2, x + 4.2, y + 4.2], fill=c + (255,))

    card = Image.new('RGB', (W, H), BG)
    # fade the map's left edge into the text column (paste through the mask
    # only — an opaque paste first would leave a hard seam)
    fade = Image.new('L', (MAP_W, H), 255)
    fd = ImageDraw.Draw(fade)
    for i in range(230):
        fd.line([(i, 0), (i, H)], fill=int(255 * (i / 230) ** 1.6))
    card.paste(panel, (W - MAP_W, 0), fade)

    d = ImageDraw.Draw(card, 'RGBA')
    x = 68
    # brand
    icon = Image.open(os.path.join(WEB, 'favicon-192.png')).convert('RGBA') \
                .resize((46, 46), Image.LANCZOS)
    card.paste(icon, (x, 74), icon)
    d.text((x + 60, 82), 'Poengkart', font=font(31, 'bold'), fill=INK)

    d.text((x, 168), 'Hva krevdes for', font=font(56, 'bold'), fill=INK)
    d.text((x, 228), 'å komme inn?', font=font(56, 'bold'), fill=ACCENT)

    d.text((x, 316), 'Poenggrensene for videregående skole,', font=font(23), fill=INK2)
    # every number here comes from the dataset: the counties and the year range
    # were once written into the string, and the card was still claiming
    # 2018-2026 months after Vestland took the data back to 2017
    fylker = len({s['fylke'] for s in data['schools'] if s.get('fylke')})
    years = data['years']
    d.text((x, 348), f"på kart. {len(data['schools'])} skoler · {fylker} fylker"
                     f" · {years[0]}–{years[-1]}.", font=font(23), fill=INK2)

    # the legend, so the colours on the map mean something at a glance
    ly, lw = 432, 78
    d.text((x, ly - 26), 'TYPISK POENGGRENSE', font=font(14, 'bold'), fill=INK3)
    for i, (_, c) in enumerate(BINS):
        d.rectangle([x + i * lw, ly, x + (i + 1) * lw - 2, ly + 12], fill=c)
        d.text((x + i * lw, ly + 20), EDGES[i], font=font(15), fill=INK3)

    d.text((x, 545), 'poengkart-no.vercel.app', font=font(20, 'bold'), fill=INK2)
    d.text((W - 250, H - 26), '© OpenStreetMap  © CARTO', font=font(13), fill=(120, 130, 142))

    out = os.path.join(WEB, 'og.png')
    card.save(out, optimize=True)
    print(f'{out}  {os.path.getsize(out)//1024} KB  ({len(pts)} schools plotted)')


if __name__ == '__main__':
    main()
