#!/usr/bin/env python3
"""Render web/og.png — the 1200x630 card that messaging apps and social
networks show when someone pastes the link.

Nothing on it is mocked up. The map is the real basemap with one dot per
school, coloured by the same five threshold bins as the in-app legend; the
panel down the right-hand side is the app's own school page, photographed
from a local copy of web/ so the card can never advertise a layout the site
does not have. A preview that shows the actual product is also the honest
thing to put in front of someone deciding whether to click.

The capture needs Playwright:

    .venv/bin/pip install playwright
    .venv/bin/playwright install chromium-headless-shell

Without it the build falls back to tools/og-panel.png, the last capture,
which is committed for exactly that reason — a refresh on a machine with no
browser still produces a correct card, only an older photograph of the panel.

Attribution for the tiles is painted onto the card itself, because an image
travels without the page that credits them.
"""
import functools
import http.server
import io
import json
import math
import os
import re
import socketserver
import threading
import urllib.request

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(HERE, '..', 'web')
INDEX = os.path.join(WEB, 'index.html')
DATA = os.path.join(WEB, 'data', 'schools.json')
CACHE = os.path.join(HERE, '.cache')
PANEL_FALLBACK = os.path.join(HERE, 'og-panel.png')
UA = {'User-Agent': 'poengkart/0.1 (og image build)'}

W, H = 1200, 630
BG = (14, 17, 22)                # --page, dark
INK = (242, 245, 248)
INK2 = (169, 180, 192)
INK3 = (109, 118, 129)
ACCENT = (57, 135, 229)
# --seq-250 .. --seq-700 from the dark palette, same order as the app's legend
BINS = [(30, (158, 197, 244)), (34, (109, 167, 236)), (38, (57, 135, 229)),
        (42, (37, 106, 191)), (99, (24, 79, 149))]
EDGES = ['<30', '30–34', '34–38', '38–42', '42+']

# The school on the card. Elvebakken has a photograph with sky and greenery in
# it, ten years of history, and figures from a county everyone recognises.
PANEL_SCHOOL = ('Oslo', 'Elvebakken videregående skole')
PANEL_W = 405                    # how wide the panel is on the card
SIDE_CSS_W = 480                 # what the app renders it at


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
def carto_key():
    """The app's own CARTO key, read from the page so there is one copy of it.

    Without a key the tiles come back stamped API KEY REQUIRED across the
    diagonal — which is exactly what the shared card showed until 4 Sept 2026.
    """
    m = re.search(r"const CARTO_KEY = '([^']+)'", open(INDEX, encoding='utf-8').read())
    if not m:
        raise SystemExit('CARTO_KEY not found in web/index.html')
    return m.group(1)


def merc(lat, lon, z, tile=512):
    n = 2 ** z
    x = (lon + 180) / 360 * n * tile
    r = math.radians(lat)
    y = (1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * n * tile
    return x, y


def basemap(cx_lat, cx_lon, z, win_w, win_h, tile=512):
    """Stitch CARTO dark tiles into a window centred on a point."""
    key = carto_key()
    cx, cy = merc(cx_lat, cx_lon, z, tile)
    x0, y0 = cx - win_w / 2, cy - win_h / 2
    tx0, ty0 = int(x0 // tile), int(y0 // tile)
    tx1, ty1 = int((x0 + win_w) // tile), int((y0 + win_h) // tile)
    canvas = Image.new('RGB', ((tx1 - tx0 + 1) * tile, (ty1 - ty0 + 1) * tile), BG)
    for tx in range(tx0, tx1 + 1):
        for ty in range(ty0, ty1 + 1):
            url = (f'https://a.basemaps.cartocdn.com/dark_all/{z}/{tx}/{ty}'
                   f'{"@2x" if tile == 512 else ""}.png?key={key}')
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


# ------------------------------------------------------------------ the panel
class _Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def serve_web():
    """Serve web/ on a free port, so the panel is photographed from the build
    that is about to ship rather than from whatever production still has."""
    handler = functools.partial(_Quiet, directory=os.path.abspath(WEB))
    srv = socketserver.TCPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f'http://127.0.0.1:{srv.server_address[1]}/'


def capture_panel(css_h):
    """Photograph the app's school page: the real photo, figures and chart.

    Two pieces of chrome are hidden first. The close button is a control, not
    content, and the "skriv inn poengene dine" nudge asks the reader to type
    into a field the card does not have.
    """
    from playwright.sync_api import sync_playwright
    fylke, name = PANEL_SCHOOL
    srv, base = serve_web()
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            ctx = b.new_context(viewport={'width': 1500, 'height': 1100},
                                device_scale_factor=2, color_scheme='dark', locale='nb-NO')
            ctx.add_init_script("""
                localStorage.setItem('pk-theme', 'dark');
                localStorage.setItem('pk-intro-v1', '1');
                localStorage.setItem('pk-help-hint', '9');
                localStorage.removeItem('pk-points');
            """)
            page = ctx.new_page()
            url = f'{base}#s={urllib.request.quote(fylke)}/{urllib.request.quote(name)}'
            page.goto(url, wait_until='networkidle')
            page.reload(wait_until='networkidle')
            page.wait_for_selector('#side .chart-card', timeout=30000)
            page.wait_for_timeout(2500)
            page.evaluate("""() => {
                document.querySelectorAll('#side .close').forEach(e => e.style.display = 'none');
                document.querySelectorAll('#side .chance').forEach(e => {
                    if (/Skriv inn|Enter your/.test(e.textContent)) e.style.display = 'none';
                });
            }""")
            page.wait_for_timeout(400)
            got = page.evaluate("""() => {
                const r = document.querySelector('#side .scroll').getBoundingClientRect();
                const n = document.querySelector('#s-photo .name');
                return { x: r.x, y: r.y, w: r.width, name: n ? n.textContent.trim() : '' };
            }""")
            if not got['name'].startswith(name):
                raise RuntimeError(f'the panel shows {got["name"]!r}, not {name!r}')
            blob = page.screenshot(clip={'x': got['x'], 'y': got['y'],
                                         'width': got['w'], 'height': css_h},
                                   animations='disabled', timeout=60000)
            b.close()
    finally:
        srv.shutdown()
    im = Image.open(io.BytesIO(blob)).convert('RGB')
    im.save(PANEL_FALLBACK, optimize=True)     # keep the fallback current
    return im.convert('RGBA')


def panel_image(css_h):
    try:
        im = capture_panel(css_h)
        print(f'  panel captured from the local build: {PANEL_SCHOOL[1]}')
        return im
    except Exception as e:
        if not os.path.exists(PANEL_FALLBACK):
            raise SystemExit(f'no panel: capture failed ({type(e).__name__}: {e}) '
                             f'and {PANEL_FALLBACK} is missing')
        print(f'  panel capture skipped ({type(e).__name__}: {e}); '
              f'using the committed tools/og-panel.png')
        return Image.open(PANEL_FALLBACK).convert('RGBA')


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

    # the map fills the whole card; the panel is laid over its right-hand end
    z, tile = 5, 512
    span_y = merc(min(lats), cx_lon, z, tile)[1] - merc(max(lats), cx_lon, z, tile)[1]
    win_h = span_y * 1.13                      # a little sea above and below
    win_w = win_h * W / H
    m, (x0, y0) = basemap(cx_lat, cx_lon, z, win_w, win_h, tile)
    scale = W / win_w
    m = m.resize((W, H), Image.LANCZOS).convert('RGBA')

    d = ImageDraw.Draw(m, 'RGBA')
    for lat, lon, v in pts:
        px, py = merc(lat, lon, z, tile)
        x, y = (px - x0) * scale, (py - y0) * scale
        if not (-20 < x < W + 20 and -20 < y < H + 20):
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

    card = Image.new('RGBA', (W, H), BG + (255,))
    # fade the map out under the text column (paste through the mask only —
    # an opaque paste first would leave a hard seam)
    fade = Image.new('L', (W, H), 255)
    fd = ImageDraw.Draw(fade)
    for i in range(760):
        fd.line([(i, 0), (i, H)], fill=int(255 * (i / 760) ** 2.7))
    card.paste(m, (0, 0), fade)

    d = ImageDraw.Draw(card, 'RGBA')
    d.text((W - PANEL_W - 250, H - 26), '© OpenStreetMap  © CARTO',
           font=font(13), fill=(120, 130, 142))

    # the app's own school page, edge to edge down the right
    css_h = math.ceil(H * SIDE_CSS_W / PANEL_W) + 6
    p = panel_image(css_h)
    p = p.resize((PANEL_W, int(p.size[1] * PANEL_W / p.size[0])), Image.LANCZOS)
    if p.size[1] < H:
        raise SystemExit(f'the panel capture is {p.size[1]}px tall, short of the '
                         f'card: recapture it at {css_h} css pixels')
    p = p.crop((0, 0, PANEL_W, H))
    px = W - PANEL_W
    sh = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rectangle([px, 0, W, H], fill=(0, 0, 0, 190))
    card.alpha_composite(sh.filter(ImageFilter.GaussianBlur(18)))
    card.paste(p, (px, 0))
    d.line([(px, 0), (px, H)], fill=(255, 255, 255, 26), width=1)

    x = 68
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

    out = os.path.join(WEB, 'og.png')
    card.convert('RGB').save(out, optimize=True)
    print(f'{out}  {os.path.getsize(out)//1024} KB  ({len(pts)} schools plotted)')


if __name__ == '__main__':
    main()
