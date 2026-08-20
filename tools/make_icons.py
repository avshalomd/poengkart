#!/usr/bin/env python3
"""Render the favicon set from the same mark the app draws in its header.

A browser tab shows the icon at 16 px, where the app's thin outlined pin
disappears — so the tab version is a solid pin with a punched-out hole, which
survives being shrunk. Everything is drawn at 8x and downsampled; PIL has no
anti-aliased shape drawing of its own.
"""
import os

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(HERE, '..', 'web')
BLUE = (42, 120, 214, 255)          # --accent
WHITE = (255, 255, 255, 255)
SS = 8                              # supersample factor


def render(size, radius_ratio=0.22, bleed=True):
    n = size * SS
    im = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    pad = 0 if bleed else n * 0.04
    d.rounded_rectangle([pad, pad, n - 1 - pad, n - 1 - pad],
                        radius=n * radius_ratio, fill=BLUE)
    cx, cy, r = n * 0.5, n * 0.415, n * 0.215
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=WHITE)
    d.polygon([(cx - r * 0.88, cy + r * 0.48), (cx + r * 0.88, cy + r * 0.48),
               (cx, n * 0.815)], fill=WHITE)
    h = n * 0.085
    d.ellipse([cx - h, cy - h, cx + h, cy + h], fill=BLUE)
    return im.resize((size, size), Image.LANCZOS)


SVG = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#2a78d6"/>
  <path d="M32 12.5a13.8 13.8 0 0 0-13.8 13.8c0 9.8 11.4 22.1 13.0 23.8a1.1 1.1 0 0 0 1.6 0c1.6-1.7 13.0-14.0 13.0-23.8A13.8 13.8 0 0 0 32 12.5z" fill="#fff"/>
  <circle cx="32" cy="26.3" r="5.4" fill="#2a78d6"/>
</svg>
'''


def main():
    open(os.path.join(WEB, 'favicon.svg'), 'w').write(SVG)
    for name, size in (('favicon-32.png', 32), ('favicon-192.png', 192),
                       ('apple-touch-icon.png', 180)):
        render(size).save(os.path.join(WEB, name))
        print(' ', name)
    # .ico so old browsers and bookmark bars have something too
    render(64).save(os.path.join(WEB, 'favicon.ico'),
                    sizes=[(16, 16), (32, 32), (48, 48)])
    print('  favicon.ico, favicon.svg')


if __name__ == '__main__':
    main()
