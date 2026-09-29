#!/usr/bin/env python3
"""Render the favicon set from the same mark the app draws in its header.

The mark is a white pin holding a map cluster: the accent dot inside a ring of
the chance colours, in the legend's order clockwise from twelve o'clock, the
way a cluster reads on the map once points are entered. The ring is drawn
heavier than the map's own 4 px so the colours still show in a 16 px tab.
The pin's colours stay the light theme's in every theme: the ring always sits
on white.

Everything is drawn at 8x and downsampled; PIL has no anti-aliased shape
drawing of its own. The SVG and the header's inline copy in shell.html use the
same geometry (pin space 0-100, head centred at 50,39, radius 28).
"""
import math
import os

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(HERE, '..', 'web', 'public')
BLUE = '#2876d4'                    # --accent
# --good, --dot-possible, --dot-unlikely, --ink-3 (light theme), with each
# arc's share of the ring: a mark, not data, so any mix that shows all four
RING = (('#0b7f0b', 45), ('#a1620a', 20), ('#c0392f', 25), ('#616a75', 10))
RING_R, RING_W, DOT_R = 17, 5.5, 11   # in pin space
SCALE, OFF_Y = 0.7, 51.5              # pin space -> tile: centred, 70 % tall
SS = 8                                # supersample factor


def rgba(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) + (255,)


def pin_outline():
    """The pin's outline in pin space: two cubic flanks and the head's top half."""
    def cubic(p0, p1, p2, p3, n=40):
        return [tuple((1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t ** 2 * c + t ** 3 * d
                      for a, b, c, d in zip(p0, p1, p2, p3))
                for t in (i / n for i in range(n + 1))]
    left = cubic((50, 91), (46.5, 86.5), (22, 63), (22, 39))
    head = [(50 - 28 * math.cos(a), 39 - 28 * math.sin(a))
            for a in (math.pi * i / 60 for i in range(61))]
    right = cubic((78, 39), (78, 63), (53.5, 86.5), (50, 91))
    return left + head + right


def render(size, radius_ratio=0.22):
    n = size * SS
    u = n / 100                                   # one tile unit in pixels
    im = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if radius_ratio:
        d.rounded_rectangle([0, 0, n - 1, n - 1], radius=n * radius_ratio, fill=rgba(BLUE))
    else:
        d.rectangle([0, 0, n - 1, n - 1], fill=rgba(BLUE))

    def tile(x, y):
        return ((50 + SCALE * (x - 50)) * u, (OFF_Y + SCALE * (y - 51)) * u)

    d.polygon([tile(x, y) for x, y in pin_outline()], fill=(255, 255, 255, 255))
    cx, cy = tile(50, 39)
    r, w = RING_R * SCALE * u, RING_W * SCALE * u
    box = [cx - r - w / 2, cy - r - w / 2, cx + r + w / 2, cy + r + w / 2]
    at = -90.0                                    # PIL: 0 is three o'clock, clockwise
    for col, share in RING:
        d.arc(box, at, at + 3.6 * share + 0.5, fill=rgba(col), width=round(w))
        at += 3.6 * share
    dr = DOT_R * SCALE * u
    d.ellipse([cx - dr, cy - dr, cx + dr, cy + dr], fill=rgba(BLUE))
    return im.resize((size, size), Image.LANCZOS)


def ring_svg():
    out, at = [], 0
    for col, share in RING:
        out.append(f'    <circle cx="50" cy="39" r="{RING_R}" stroke="{col}" pathLength="100" '
                   f'stroke-dasharray="{share + 0.6} {100 - share - 0.6}" stroke-dashoffset="{-at}"/>')
        at += share
    return '\n'.join(out)


SVG = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="22" fill="{BLUE}"/>
  <g transform="translate(50 {OFF_Y}) scale({SCALE}) translate(-50 -51)">
    <path d="M50 91C46.5 86.5 22 63 22 39a28 28 0 0 1 56 0c0 24-24.5 47.5-28 52z" fill="#fff"/>
    <g fill="none" stroke-width="{RING_W}" transform="rotate(-90 50 39)">
{ring_svg()}
    </g>
    <circle cx="50" cy="39" r="{DOT_R}" fill="{BLUE}"/>
  </g>
</svg>
'''


def main():
    open(os.path.join(WEB, 'favicon.svg'), 'w').write(SVG)
    for name, size in (('favicon-32.png', 32), ('favicon-192.png', 192)):
        render(size).save(os.path.join(WEB, name))
        print(' ', name)
    # iOS rounds the corners itself and paints transparent ones black, so the
    # home-screen icon is a full square
    render(180, radius_ratio=0).save(os.path.join(WEB, 'apple-touch-icon.png'))
    print('  apple-touch-icon.png')
    # .ico so old browsers and bookmark bars have something too
    render(64).save(os.path.join(WEB, 'favicon.ico'),
                    sizes=[(16, 16), (32, 32), (48, 48)])
    print('  favicon.ico, favicon.svg')


if __name__ == '__main__':
    main()
