"""SVG figures for docs/technical-report.md, drawn from web/data/model.json.

Run after tools/model.py so the figures always show the shipped model's own
numbers. No plotting library: the figures are simple enough to emit directly,
and this keeps the report's pipeline dependency-free.
"""
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
META = json.loads((ROOT / 'web/data/model.json').read_text())['meta']
OUT = ROOT / 'docs/figures'

BLUE = '#2b6cb8'
COPPER = '#b0672e'
GREY = '#8a8f98'
INK = '#1d2733'

FONT = "font-family='Georgia, \"Times New Roman\", serif'"


def reliability_svg():
    rel = META['backtest_eval_years']['chance']['reliability']
    W, H = 560, 500
    L, R, T, B = 70, 20, 20, 70   # margins
    pw, ph = W - L - R, H - T - B
    def X(p): return L + p * pw
    def Y(p): return T + (1 - p) * ph
    parts = [f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 {W} {H}' "
             f"role='img' aria-label='Reliability diagram of the held-out admission probability'>"]
    parts.append(f"<rect width='{W}' height='{H}' fill='white'/>")
    # gridlines + axis labels
    for i in range(6):
        p = i / 5
        parts.append(f"<line x1='{X(p):.1f}' y1='{Y(0):.1f}' x2='{X(p):.1f}' y2='{Y(1):.1f}' stroke='#e6e9ee' stroke-width='1'/>")
        parts.append(f"<line x1='{X(0):.1f}' y1='{Y(p):.1f}' x2='{X(1):.1f}' y2='{Y(p):.1f}' stroke='#e6e9ee' stroke-width='1'/>")
        parts.append(f"<text x='{X(p):.1f}' y='{H-B+22}' {FONT} font-size='13' fill='{INK}' text-anchor='middle'>{p:.1f}</text>")
        parts.append(f"<text x='{L-10}' y='{Y(p)+4:.1f}' {FONT} font-size='13' fill='{INK}' text-anchor='end'>{p:.1f}</text>")
    # bin-count bars along the bottom (height ∝ share of predictions in bin)
    total = sum(r['n'] for r in rel)
    for r in rel:
        lo, hi = (int(v) / 100 for v in r['bin'].split('-'))
        share = r['n'] / total
        bh = share * ph * 0.55
        parts.append(f"<rect x='{X(lo)+2:.1f}' y='{Y(0)-bh:.1f}' width='{X(hi)-X(lo)-4:.1f}' height='{bh:.1f}' fill='{GREY}' opacity='0.18'/>")
    # diagonal
    parts.append(f"<line x1='{X(0):.1f}' y1='{Y(0):.1f}' x2='{X(1):.1f}' y2='{Y(1):.1f}' stroke='{GREY}' stroke-width='1.5' stroke-dasharray='5 4'/>")
    # points
    for r in rel:
        lo, hi = (int(v) / 100 for v in r['bin'].split('-'))
        mid = r['predicted']
        parts.append(f"<circle cx='{X(mid):.1f}' cy='{Y(r['observed']):.1f}' r='5.5' fill='{BLUE}'/>")
    parts.append(f"<text x='{X(0.5):.1f}' y='{H-B+48}' {FONT} font-size='15' fill='{INK}' text-anchor='middle'>Predicted probability of admission</text>")
    parts.append(f"<text x='20' y='{Y(0.5):.1f}' {FONT} font-size='15' fill='{INK}' text-anchor='middle' transform='rotate(-90 20 {Y(0.5):.1f})'>Observed admission frequency</text>")
    parts.append('</svg>')
    (OUT / 'reliability.svg').write_text('\n'.join(parts))


def rmse_svg():
    ev = META['backtest_eval_years']['level']
    W, H = 620, 420
    L, R, T, B = 64, 16, 24, 84
    pw, ph = W - L - R, H - T - B
    labels = {'0': '0 years', '1': '1 year', '2-3': '2–3 years', '4+': '4+ years'}
    series = [('model', 'rmse', BLUE), ('persistence', 'rmse_last_year', COPPER),
              ('programme–county mean', 'rmse_prog_mean', GREY)]
    # the axis follows the data: a fixed ceiling once clipped the tallest bar
    top = max(row.get(k) or 0 for row in ev for _, k, _ in series)
    ymax = 2 * math.ceil(top * 1.12 / 2)
    parts = [f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 {W} {H}' role='img' "
             f"aria-label='Held-out RMSE by history stratum, model against two baselines'>"]
    parts.append(f"<rect width='{W}' height='{H}' fill='white'/>")
    def Y(v): return T + (1 - v / ymax) * ph
    for g in range(0, int(ymax) + 1, 2):
        parts.append(f"<line x1='{L}' y1='{Y(g):.1f}' x2='{W-R}' y2='{Y(g):.1f}' stroke='#e6e9ee'/>")
        parts.append(f"<text x='{L-8}' y='{Y(g)+4:.1f}' {FONT} font-size='13' fill='{INK}' text-anchor='end'>{g}</text>")
    gw = pw / len(ev)
    bw = 30
    for i, row in enumerate(ev):
        cx = L + (i + 0.5) * gw
        offsets = [-bw - 4, 0, bw + 4]
        for (name, key, col), off in zip(series, offsets):
            v = row.get(key)
            if v is None:
                continue
            x = cx + off - bw / 2
            parts.append(f"<rect x='{x:.1f}' y='{Y(v):.1f}' width='{bw}' height='{Y(0)-Y(v):.1f}' fill='{col}'/>")
            parts.append(f"<text x='{x+bw/2:.1f}' y='{Y(v)-6:.1f}' {FONT} font-size='12' fill='{INK}' text-anchor='middle'>{v:.1f}</text>")
        parts.append(f"<text x='{cx:.1f}' y='{H-B+24}' {FONT} font-size='14' fill='{INK}' text-anchor='middle'>{labels[row['history']]}</text>")
    parts.append(f"<text x='{L + pw/2:.1f}' y='{H-B+48}' {FONT} font-size='14' fill='{INK}' text-anchor='middle'>History of the series at forecast time</text>")
    # legend
    lx = L + 6
    for (name, _k, col) in series:
        parts.append(f"<rect x='{lx}' y='{H-26}' width='12' height='12' fill='{col}'/>")
        parts.append(f"<text x='{lx+17}' y='{H-16}' {FONT} font-size='13' fill='{INK}'>{name}</text>")
        lx += 17 + 8 * len(name) + 26
    parts.append(f"<text x='18' y='{T + ph/2:.1f}' {FONT} font-size='14' fill='{INK}' text-anchor='middle' transform='rotate(-90 18 {T + ph/2:.1f})'>RMSE (points)</text>")
    parts.append('</svg>')
    (OUT / 'rmse-by-history.svg').write_text('\n'.join(parts))


if __name__ == '__main__':
    OUT.mkdir(exist_ok=True)
    reliability_svg()
    rmse_svg()
    print('wrote', OUT / 'reliability.svg', 'and', OUT / 'rmse-by-history.svg')
