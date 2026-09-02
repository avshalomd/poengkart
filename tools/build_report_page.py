"""Render docs/technical-report.md as web/report.html.

A deliberately small converter for this one document: headings, paragraphs,
lists, tables, emphasis, links, images (inlined as SVG), and the report's own
mathematical notation. The maths subset is hand-mapped — display equations by
their \tag number, inline maths by a token table — so the page needs no
JavaScript and no external assets. Run after editing the report or the
figures.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MD = (ROOT / 'docs/technical-report.md').read_text()
OUT = ROOT / 'web/report.html'
FIGDIR = ROOT / 'docs/figures'

# ---------------------------------------------------------------- maths

def frac(num, den):
    return ("<span class='frac'><span class='num'>%s</span>"
            "<span class='den'>%s</span></span>" % (num, den))

VAR = lambda s: "<var>%s</var>" % s

DISPLAY = {
    '1': "<var>P</var>(place&#8201;|&#8201;<var>x</var>) = (1 &minus; <var>&pi;</var>) + <var>&pi;</var>&#8201;<var>&Phi;<sub>F</sub></var>&#8239;(" + frac("<var>x</var> &minus; <var>m</var>", "<var>s</var>") + ")",
    '2': "<var>y<sub>it</sub></var>&#8201;|&#8201;<var>Q<sub>it</sub></var> = 1, <var>y<sub>it</sub></var> &gt; 0 &nbsp;&sim;&nbsp; \U0001d4a9(<var>&mu;</var> + <var>&alpha;<sub>sc[i]</sub></var> + <var>&beta;<sub>p[i]</sub></var> + <var>&gamma;<sub>a[i]</sub></var> + <var>u<sub>i</sub></var> + <var>w<sub>c[i],t</sub></var> + <var>&rho;<sub>r(i,t)</sub></var>,&nbsp;<var>&sigma;</var><sup>2</sup>)",
    '3': "logit&#8201;<var>P</var>(<var>Q<sub>it</sub></var> = 1) = <var>&nu;</var> + <var>&alpha;&prime;<sub>sc[i]</sub></var> + <var>&beta;&prime;<sub>p[i]</sub></var> + <var>&gamma;&prime;<sub>a[i]</sub></var> + <var>u&prime;<sub>i</sub></var> + <var>w&prime;<sub>c[i],t</sub></var> + <var>&rho;&prime;<sub>r(i,t)</sub></var>",
    '4': "<var>w<sub>c,t</sub></var> = <var>w<sub>c,t&minus;1</sub></var> + <var>&eta;<sub>c,t</sub></var>, &nbsp;&nbsp; <var>&eta;<sub>c,t</sub></var> &sim; \U0001d4a9(0, <var>&tau;<sub>w</sub></var><sup>2</sup>)",
    # eq (5) quotes fitted constants, so it is typeset from the shipped model
    # rather than hand-maintained — a hardcoded copy drifted once already.
    '5': None,   # filled in below from model.json
}

_FC = json.loads((ROOT / 'web/data/model.json').read_text())['meta']['fill_calibration']
_sgn = lambda v: ('&minus;' if v < 0 else '') + ('%.3f' % abs(v))
DISPLAY['5'] = ("logit&#8201;<var>&pi;</var>&prime; = %s + %s&#8201;logit&#8201;<var>&pi;</var>"
                % (_sgn(_FC['a']), _sgn(_FC['b'])))

DISPLAY.update({
    '6': "<var>P</var>(place by round 3) = (1 &minus; <var>&pi;</var>) + <var>&pi;</var>&#8201;(<var>v<sub>p</sub></var> + (1 &minus; <var>v<sub>p</sub></var>)&#8201;<var>&Phi;<sub>F</sub></var>&#8239;(" + frac("<var>x</var> &minus; <var>m</var> &minus; <var>&delta;<sub>p</sub></var>", "<var>s</var>") + "))",
})

INLINE = [
    (r'\operatorname{logit}', 'logit&#8201;'),
    (r'\mathcal{N}', '\U0001d4a9'),
    (r'\Phi_F', '<var>&Phi;<sub>F</sub></var>'),
    (r'\alpha_{s[i]}', '<var>&alpha;<sub>sc[i]</sub></var>'),
    (r'\alpha_s', '<var>&alpha;<sub>s</sub></var>'),
    (r'\alpha', '<var>&alpha;</var>'),
    (r'\beta', '<var>&beta;</var>'),
    (r'\gamma', '<var>&gamma;</var>'),
    (r'\rho', '<var>&rho;</var>'),
    (r"\pi'", '<var>&pi;</var>&prime;'),
    (r'\pi', '<var>&pi;</var>'),
    (r'\sigma^2', '<var>&sigma;</var><sup>2</sup>'),
    (r'\tau_w^2', '<var>&tau;<sub>w</sub></var><sup>2</sup>'),
    (r'Q_{it} \in \{0, 1\}', '<var>Q<sub>it</sub></var> &isin; {0,&#8201;1}'),
    (r'Q_{it} = 1', '<var>Q<sub>it</sub></var> = 1'),
    (r'Q_{it} = 1,\, y_{it} > 0', '<var>Q<sub>it</sub></var> = 1, <var>y<sub>it</sub></var> &gt; 0'),
    (r'Q = 1', '<var>Q</var> = 1'),
    (r'y > 0', '<var>y</var> &gt; 0'),
    (r'r(i,t)', '<var>r</var>(<var>i</var>,<var>t</var>)'),
    (r'y_{it}', '<var>y<sub>it</sub></var>'),
    (r'u_i', '<var>u<sub>i</sub></var>'),
    (r'w_{c[i],t}', '<var>w<sub>c[i],t</sub></var>'),
    (r'w_{c,t}', '<var>w<sub>c,t</sub></var>'),
    (r'sc[i]', '<var>sc</var>[<var>i</var>]'),
    (r'p[i]', '<var>p</var>[<var>i</var>]'),
    (r'a[i]', '<var>a</var>[<var>i</var>]'),
    (r'c[i]', '<var>c</var>[<var>i</var>]'),
    (r't \in \{2020, \dots, 2026\}', '<var>t</var> &isin; {2020, &hellip;, 2026}'),
    (r'x \in \{20, 25, \dots, 55\}', '<var>x</var> &isin; {20, 25, &hellip;, 55}'),
    (r'm \pm 1.2816\,s', '<var>m</var> &plusmn; 1.2816&#8201;<var>s</var>'),
    (r'|z| \ge 3', '|<var>z</var>| &ge; 3'),
    (r'|z| > 3', '|<var>z</var>| &gt; 3'),
    (r'1 - \prod_k (1 - p_k)', '1 &minus; &prod;<sub><var>k</var></sub>&#8201;(1 &minus; <var>p<sub>k</sub></var>)'),
    (r'v_p', '<var>v<sub>p</sub></var>'),
    (r'\delta_p', '<var>&delta;<sub>p</sub></var>'),
    (r'\eta_{c,t}', '<var>&eta;<sub>c,t</sub></var>'),
    (r'\nu', '<var>&nu;</var>'),
    (r'\mu', '<var>&mu;</var>'),
    (r'1 - \pi', '1 &minus; <var>&pi;</var>'),
    (r'y', '<var>y</var>'),
    (r'w', '<var>w</var>'),
    (r'i', '<var>i</var>'),
    (r't', '<var>t</var>'),
    (r'x', '<var>x</var>'),
    (r'm', '<var>m</var>'),
    (r's', '<var>s</var>'),
]

def inline_math(expr):
    expr = expr.strip()
    for latex, html in INLINE:
        if expr == latex:
            return html
    raise SystemExit('unmapped inline math: %r' % expr)

# ------------------------------------------------------------- markdown

def span(text):
    text = text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    text = re.sub(r'\$([^$]+)\$', lambda m2: inline_math(
        m2.group(1).replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>')), text)
    text = re.sub(r'`([^`]+)`', r'<code>\1</code>', text)
    text = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', text)
    text = re.sub(r'\*([^*]+)\*', r'<em>\1</em>', text)
    text = re.sub(r'\[([^\]]+)\]\(([^)]+)\)',
                  lambda m2: '<a href="%s">%s</a>' % (
                      m2.group(2) if m2.group(2).startswith('http')
                      else 'https://github.com/avshalomd/poengkart/blob/main/docs/' + m2.group(2),
                      m2.group(1)), text)
    return text

body = []
lines = MD.split('\n')
i = 0
in_list = None
pending_fig_caption = None

def close_list():
    global in_list
    if in_list:
        body.append('</%s>' % in_list)
        in_list = None

# header block: everything before first '---'
head_end = lines.index('---')
title = lines[0].lstrip('# ')
header_lines = [l for l in lines[1:head_end] if l.strip()]
i = head_end + 1

while i < len(lines):
    line = lines[i]
    if line.startswith('$$'):
        close_list()
        block = line
        while not block.rstrip().endswith('$$') or block.strip() == '$$' or len(block.strip()) <= 2:
            i += 1
            block += ' ' + lines[i]
        tag = re.search(r'\\tag\{(\d+)\}', block).group(1)
        body.append("<div class='eq'><span class='eq-body'>%s</span><span class='eq-no'>(%s)</span></div>" % (DISPLAY[tag], tag))
    elif line.startswith('### '):
        close_list()
        txt = line[4:]
        body.append("<h3 id='%s'>%s</h3>" % (re.sub(r'[^a-z0-9]+', '-', txt.lower()).strip('-'), span(txt)))
    elif line.startswith('## '):
        close_list()
        txt = line[3:]
        body.append("<h2 id='%s'>%s</h2>" % (re.sub(r'[^a-z0-9]+', '-', txt.lower()).strip('-'), span(txt)))
    elif line.startswith('|'):
        close_list()
        rows = []
        while i < len(lines) and lines[i].startswith('|'):
            rows.append([c.strip() for c in lines[i].strip('|').split('|')])
            i += 1
        i -= 1
        html = ["<div class='tbl'><table>"]
        html.append('<thead><tr>' + ''.join('<th>%s</th>' % span(c) for c in rows[0]) + '</tr></thead><tbody>')
        for r in rows[2:]:
            html.append('<tr>' + ''.join('<td>%s</td>' % span(c) for c in r) + '</tr>')
        html.append('</tbody></table></div>')
        body.append('\n'.join(html))
    elif re.match(r'!\[([^\]]*)\]\(figures/([^)]+)\)', line):
        m = re.match(r'!\[([^\]]*)\]\(figures/([^)]+)\)', line)
        svg = (FIGDIR / m.group(2)).read_text()
        cap = pending_fig_caption or ''
        pending_fig_caption = None
        body.append("<figure>%s<figcaption>%s</figcaption></figure>" % (svg, cap))
    elif re.match(r'\*\*Figure \d+:', line):
        close_list()
        para = line
        while i + 1 < len(lines) and lines[i + 1].strip() and not lines[i + 1].startswith(('!', '#', '|', '-', '$')):
            i += 1
            para += ' ' + lines[i]
        pending_fig_caption = span(para)
    elif re.match(r'\*\*Table [A-Z]?\d+:', line):
        close_list()
        para = line
        while i + 1 < len(lines) and lines[i + 1].strip() and not lines[i + 1].startswith(('!', '#', '|', '-', '$')):
            i += 1
            para += ' ' + lines[i]
        body.append("<p class='caption'>%s</p>" % span(para))
    elif line.startswith('- '):
        if in_list != 'ul':
            close_list()
            body.append('<ul>')
            in_list = 'ul'
        item = line[2:]
        while i + 1 < len(lines) and lines[i + 1].startswith('  ') and lines[i + 1].strip():
            i += 1
            item += ' ' + lines[i].strip()
        body.append('<li>%s</li>' % span(item))
    elif re.match(r'\d+\. ', line):
        if in_list != 'ol':
            close_list()
            body.append('<ol>')
            in_list = 'ol'
        item = re.sub(r'^\d+\. ', '', line)
        while i + 1 < len(lines) and lines[i + 1].startswith('   ') and lines[i + 1].strip():
            i += 1
            item += ' ' + lines[i].strip()
        body.append('<li>%s</li>' % span(item))
    elif line.strip() == '---':
        close_list()
    elif line.strip():
        close_list()
        para = line
        while i + 1 < len(lines) and lines[i + 1].strip() and not lines[i + 1].startswith(('#', '|', '- ', '$$', '**Table', '**Figure', '!', '---')) and not re.match(r'\d+\. ', lines[i + 1]):
            i += 1
            para += ' ' + lines[i]
        body.append('<p>%s</p>' % span(para))
    i += 1
close_list()

# abstract: wrap the block between the "Abstract" h2 and the next h2
html_body = '\n'.join(body)
html_body = re.sub(
    r"(<h2 id='abstract'>Abstract</h2>)\n(<p>.*?</p>)",
    r"\1\n<div class='abstract'>\2</div>", html_body, count=1, flags=re.S)

header_html = "<p class='byline'>" + "<br>".join(span(h) for h in header_lines) + "</p>"

CSS = """
:root { --ink:#1d2733; --soft:#4a5568; --line:#d9dee5; --accent:#2b6cb8; --bg:#ffffff; --wash:#f5f7fa; }
* { box-sizing:border-box; }
body { margin:0; background:var(--bg); color:var(--ink);
  font:17px/1.65 Georgia, 'Times New Roman', serif; }
.page { max-width:47rem; margin:0 auto; padding:2.5rem 1.25rem 5rem; }
.topbar { font:14px/1.4 Georgia, serif; margin-bottom:2.5rem; }
.topbar a { color:var(--accent); text-decoration:none; }
h1 { font-size:1.7rem; line-height:1.25; margin:0 0 1rem; text-wrap:balance; }
.byline { color:var(--soft); font-size:.95rem; margin:0 0 2rem; }
.byline a { color:var(--accent); text-decoration:none; }
h2 { font-size:1.25rem; margin:2.6rem 0 .8rem; }
h3 { font-size:1.05rem; margin:2rem 0 .6rem; }
p { margin:.8rem 0; }
a { color:var(--accent); }
.abstract { background:var(--wash); border-left:3px solid var(--accent);
  padding:.25rem 1.2rem; margin:1rem 0 1.5rem; font-size:.95rem; }
.eq { display:flex; align-items:center; gap:1rem; margin:1.3rem 0;
  overflow-x:auto; }
.eq-body { flex:1; text-align:center; font-size:1.02rem; }
.eq-no { color:var(--soft); }
var { font-style:italic; font-family:inherit; }
.frac { display:inline-flex; flex-direction:column; vertical-align:middle;
  text-align:center; font-size:.88em; line-height:1.25; margin:0 .15em; }
.frac .num { border-bottom:1px solid var(--ink); padding:0 .3em; }
.frac .den { padding:0 .3em; }
.caption { font-size:.88rem; color:var(--soft); margin:1.4rem 0 .4rem; }
.tbl { overflow-x:auto; margin:0 0 1.2rem; }
table { border-collapse:collapse; width:100%; font-size:.9rem;
  font-variant-numeric:tabular-nums; }
th { text-align:left; border-top:2px solid var(--ink);
  border-bottom:1px solid var(--ink); padding:.45rem .6rem .45rem 0; font-weight:600; }
td { border-bottom:1px solid var(--line); padding:.4rem .6rem .4rem 0; }
tbody tr:last-child td { border-bottom:2px solid var(--ink); }
figure { margin:1.6rem 0; }
figure svg { width:100%; height:auto; max-width:620px; display:block; margin:0 auto; }
figcaption { font-size:.88rem; color:var(--soft); margin-top:.5rem; }
ul, ol { padding-left:1.4rem; }
li { margin:.45rem 0; }
code { font:.85em/1.4 ui-monospace, 'SF Mono', Menlo, monospace;
  background:var(--wash); padding:.1em .3em; border-radius:3px; }
#references + ul, #references ~ ul { list-style:none; padding-left:1.4rem; }
#references ~ ul li, #references + ul li { text-indent:-1.4rem; margin:.55rem 0; font-size:.92rem; }
@media print {
  body { font-size:11pt; }
  .page { max-width:none; padding:0; }
  .topbar { display:none; }
  h2 { break-after:avoid; }
  .tbl, figure, .eq { break-inside:avoid; }
  a { color:inherit; text-decoration:none; }
}
"""

page = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="Technical report: an open dataset of Norwegian upper-secondary admission thresholds and a calibrated hurdle-model forecast of the next intake.">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="canonical" href="https://poengkart-no.vercel.app/report">
<!-- cookieless page counts; a no-op until Web Analytics is enabled on the Vercel project -->
<script defer src="/_vercel/insights/script.js"></script>
<style>{CSS}</style>
</head>
<body>
<div class="page">
<nav class="topbar"><a href="./">&larr; poengkart</a></nav>
<h1>{span(title)}</h1>
{header_html}
{html_body}
</div>
</body>
</html>
"""
OUT.write_text(page)
print('wrote', OUT, len(page), 'bytes')
