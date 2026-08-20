#!/usr/bin/env python3
"""Lay staged candidates out as contact sheets for human review.

Images are letterboxed, never cropped: the review has to be able to see people
at the edge of a frame, which is exactly what a cover-crop would hide.
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

STAGE = ('/private/tmp/claude-501/-Users-avshalom-projects/'
         'b6cc5fd7-b026-44c5-803f-f7c99fea7cf5/scratchpad/photohunt')
COLS, ROWS = 4, 4
CW, CH, PAD, LAB = 360, 205, 10, 26

def font(sz):
    for p in ('/System/Library/Fonts/Supplemental/Arial Bold.ttf',
              '/System/Library/Fonts/Helvetica.ttc'):
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, sz)
            except Exception:
                pass
    return ImageFont.load_default()

def main():
    rows = json.load(open(os.path.join(STAGE, 'staged.json')))
    items = [(i, r) for i, r in enumerate(rows) if r.get('best')]
    per = COLS * ROWS
    f, fs = font(14), font(12)
    sheets = []
    for sh in range((len(items) + per - 1) // per):
        chunk = items[sh * per:(sh + 1) * per]
        W = COLS * (CW + PAD) + PAD
        H = ROWS * (CH + LAB + PAD) + PAD
        sheet = Image.new('RGB', (W, H), (24, 26, 30))
        d = ImageDraw.Draw(sheet)
        for k, (idx, r) in enumerate(chunk):
            cx = PAD + (k % COLS) * (CW + PAD)
            cy = PAD + (k // COLS) * (CH + LAB + PAD)
            try:
                im = Image.open(r['best']['thumb']).convert('RGB')
                im.thumbnail((CW, CH), Image.LANCZOS)
                sheet.paste(im, (cx + (CW - im.width) // 2, cy + (CH - im.height) // 2))
            except Exception:
                d.text((cx + 8, cy + 8), 'missing', font=f, fill=(255, 90, 90))
            d.rectangle([cx, cy, cx + CW, cy + CH], outline=(70, 74, 82))
            d.text((cx + 2, cy + CH + 3), f"[{idx}] {r['name'][:34]}", font=f,
                   fill=(240, 240, 245))
            d.text((cx + 2, cy + CH + 15), f"{r['fylke']} · {r['best']['tier']}",
                   font=fs, fill=(150, 155, 165))
        p = os.path.join(STAGE, f'sheet{sh + 1:02d}.png')
        sheet.save(p)
        sheets.append(p)
        print(p, f'({len(chunk)} schools)')
    print(f'{len(items)} images on {len(sheets)} sheets')

if __name__ == '__main__':
    main()
