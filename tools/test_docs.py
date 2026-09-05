"""The documentation quotes the model; the model changes on every refresh.

These checks pin every meta-derived number quoted in docs/model.md and
docs/technical-report.md to the shipped
web/data/model.json, so a refit can no longer leave the prose describing a
model that is not the one deployed. Comparisons carry a tolerance of half a
unit in the last displayed digit, so a value that sits exactly on a rounding
boundary (3.45 shown as 3.4 or 3.5) never fails on the coin flip. Numbers the
docs state as one-off measurements of the sources (year-to-year sd, the
the institutional figures of Section 2) are not re-derivable from meta and
are not checked here. Panel counts come from
schools.json, the two test-suite sizes from running the suites, and the
rest from meta and the backtest file.
"""
import csv
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODEL = json.loads((ROOT / 'web/data/model.json').read_text())
META = MODEL['meta']
N_FORECASTS = sum(len(v.get('programs') or {}) for v in MODEL['schools'].values())
N_FORECASTS_H0 = sum(pr['h'] == 0 for v in MODEL['schools'].values() for pr in (v.get('programs') or {}).values())

failures = []
checked = 0

# --write: re-pin the numbers in place. Every refit moves ~60 of these, and
# retyping them by hand is both slow and a fresh chance to transcribe one
# wrongly. The rewrite uses THE SAME patterns as the checks — a group is only
# ever replaced inside a sentence that still matches, so reworded prose still
# fails loudly and gets updated by a person. Formatting follows the old text:
# same number of decimals, same thousands separator.
WRITE = '--write' in sys.argv
RAW = {}          # doc -> current raw text, mutated by rewrites
ANCHOR = {}       # id(searched text) -> where that text begins in the raw doc.
                  # Without it, a check scoped to an appendix would rewrite the
                  # FIRST match in the file — table C1\'s rows landing on table
                  # 5, which shares the same row shape. That happened.


def _flex(pattern):
    """The check patterns match whitespace-collapsed text; the files have real
    newlines. Turn every literal space OUTSIDE a character class into \s+."""
    out, depth, i = [], 0, 0
    while i < len(pattern):
        c = pattern[i]
        if c == '\\' and i + 1 < len(pattern):
            out.append(pattern[i:i + 2]); i += 2; continue
        if c == '[':
            depth += 1
        elif c == ']':
            depth = max(0, depth - 1)
        out.append('\\s+' if c == ' ' and depth == 0 else c)
        i += 1
    return ''.join(out)


def _fmt(old, value):
    """Format `value` the way `old` was written: decimals and separators."""
    sep = ',' if (',' in old and not re.match(r'^\d+,\d$', old)) else (' ' if ' ' in old else '')
    if sep == ',' and re.match(r'^\d+,\d{1,2}$', old):
        sep = ''                       # "7,4" was a decimal, not thousands
    frac = len(old.split('.')[1]) if '.' in old else 0
    txt = f'{float(value):,.{frac}f}'
    if sep == ' ':
        txt = txt.replace(',', ' ')
    elif sep == '':
        txt = txt.replace(',', '')
    return txt


def rewrite(doc, name, pattern, expected, anchor=None):
    raw = RAW[doc]
    base = raw.index(anchor) if anchor and anchor in raw else 0
    m = re.search(_flex(pattern), raw[base:])
    if not m:
        return False
    out, last = [], len(raw)
    for gi in range(m.lastindex or 0, 0, -1):
        s0, e0 = m.span(gi)[0] + base, m.span(gi)[1] + base   # slice -> file
        out.append(raw[e0:last])
        out.append(_fmt(m.group(gi), float(expected[gi - 1])))
        last = s0
    out.append(raw[:last])
    RAW[doc] = ''.join(reversed(out))
    return True

# tolerance = half a unit in the last displayed digit, plus float slack
D1, D2, D3, PCT, N = 0.0500001, 0.0050001, 0.0005001, 0.5000001, 0.0000001


def norm(text):
    return (text.replace('\u202f', ' ').replace('\u00a0', ' ')
            .replace('−', '-'))


def flatten(text):
    return re.sub(r'\s+', ' ', norm(text))


def num(s):
    # "1,138" and "5 433" are thousands; "7,4" is a Norwegian decimal
    s = re.sub(r'(\d),(?=\d{3}\b)', r'\1', s.replace(' ', ''))
    return float(s.replace(',', '.').rstrip('.'))


def check(doc, name, pattern, expected, text, tol):
    global checked
    checked += 1
    m = re.search(pattern, text)
    if not m:
        failures.append(f'{doc}: {name}: pattern not found — the sentence was reworded; update the check')
        return
    got = [num(g) for g in m.groups()]
    tols = tol if isinstance(tol, (list, tuple)) else [tol] * len(got)
    bad = [(g, w) for g, w, tl in zip(got, expected, tols) if abs(g - float(w)) > tl]
    if bad:
        if WRITE and rewrite(doc, name, pattern, expected, ANCHOR.get(id(text))):
            print(f'  re-pinned {doc}: {name}')
            return
        failures.append(f'{doc}: {name}: doc says {got}, model.json says {[float(e) for e in expected]}')


ev = META['backtest_eval_years']
lvl = {r['history']: r for r in ev['level']}
sig = META['sigma_forecast']
sig_by = {'0': sig['(0, 0)'], '1': sig['(1, 1)'], '2-3': sig['(2, 3)'], '4+': sig['(4, 99)']}
rel_chance = ev['chance']['reliability']
rel_fill = ev['fill']['reliability']
rb_a = META['round_bridge']['Akershus:1->2']
rb_v = META['round_bridge']['Vestland:1->3']
cal = META['fill_calibration']
TAUS = [META['taus'][k] for k in ('school', 'prog', 'series', 'cy')]
TAUS_F = [META['taus_fill'][k] for k in ('school', 'prog', 'series', 'cy')]
SIGMAS = [sig_by[b] for b in ('0', '1', '2-3', '4+')]

# MAE and interval width come from the backtest file, not meta
rows = [r for r in csv.DictReader(open(ROOT / 'data/model-backtest.csv'))
        if int(r['year']) >= 2025 and r['state'] == 'num' and r['actual'] and r['forecast']]
def bucket(h):
    h = int(h)
    return '0' if h == 0 else '1' if h == 1 else '2-3' if h <= 3 else '4+'
mae_model, mae_ly = {}, {}
for b in sig_by:
    e = [float(r['actual']) - float(r['forecast']) for r in rows if bucket(r['history_years']) == b]
    mae_model[b] = sum(abs(x) for x in e) / len(e)
    ly = [float(r['actual']) - float(r['last_year_value'])
          for r in rows if bucket(r['history_years']) == b and r['last_year_value']]
    if ly:
        mae_ly[b] = sum(abs(x) for x in ly) / len(ly)
all_err = [float(r['actual']) - float(r['forecast']) for r in rows]
mae_all = sum(abs(x) for x in all_err) / len(all_err)
mean_width = sum(2 * 1.28 * sig_by[bucket(r['history_years'])] for r in rows) / len(rows)
by_year = {}
for r in rows:
    by_year.setdefault(r['year'], []).append(float(r['actual']) - float(r['forecast']))
year_row = {y: [len(e), (sum(x * x for x in e) / len(e)) ** 0.5, sum(abs(x) for x in e) / len(e)]
            for y, e in by_year.items()}

# panel counts come from schools.json, the dataset the model was fitted on
DATA = json.loads((ROOT / 'web/data/schools.json').read_text())
N_SCHOOLS = len(DATA['schools'])
N_ROWS = n_cells = n_competed = n_series_num = n_series_one = N_GREP = N_SERIES_U = 0
BY_FYLKE = {}
for s in DATA['schools']:
    c = BY_FYLKE.setdefault(s['fylke'], {'cells': 0, 'num': 0, 'open': 0, 'zero': 0, 'F': 0, 'D': 0, 'U': 0})
    for p in s['programs']:
        N_ROWS += 1
        N_GREP += bool(p.get('grep'))
        vals = list(p['values'].values())
        if vals and p['values'][max(p['values'], key=int)] == 'U':
            N_SERIES_U += 1
        for v in vals:
            c['cells'] += 1
            if isinstance(v, (int, float)) and not isinstance(v, bool):
                c['zero' if v == 0 else 'num'] += 1
            else:
                c[v] += 1
        n_cells += len(vals)
        nums = [v for v in vals if isinstance(v, (int, float)) and not isinstance(v, bool)]
        n_competed += len(nums) + sum(1 for v in vals if v == 'open')
        pos = [v for v in nums if v > 0]          # a poenggrense, not the 0 state
        if pos:
            n_series_num += 1
            n_series_one += len(pos) == 1

# the reliability table's shape, quoted in the prose around it
mass_hi = 100 * sum(r['n'] for r in rel_chance if r['bin'] in ('80-90', '90-100')) / sum(r['n'] for r in rel_chance)
max_gap = 100 * max(abs(r['observed'] - r['predicted']) for r in rel_chance)
fill_5060 = next(r['observed'] for r in rel_fill if r['bin'] == '50-60') * 100


def _count(script, pattern):
    """How many checks a test script runs; the report quotes the counts."""
    out = subprocess.run([sys.executable, str(ROOT / 'tools' / script)],
                         capture_output=True, text=True).stdout
    m = re.search(pattern, out)
    return int(m.group(1)) if m else -1


def rel(rows, b):
    """A reliability row by its bin label, never by list position."""
    return next(r for r in rows if r['bin'] == b)


GAP = {r['bin']: 100 * (r['predicted'] - r['observed']) for r in rel_chance}   # + = optimistic
max_gap_lo60 = max(GAP[b] for b in ('0-10', '10-20', '20-30', '30-40', '40-50', '50-60'))

# the raw (pre-Platt) fill probability is not in meta; its top bin comes from
# the backtest file, calibration years and held-out years separately
_bt = list(csv.DictReader(open(ROOT / 'data/model-backtest.csv')))
FILL_BLIND = {'Møre og Romsdal'}      # no "ingen venteliste" state: outside every fill score


def raw_top(years):
    t = [r for r in _bt if int(r['year']) in years and r['p_fill_raw'] and float(r['p_fill_raw']) >= 0.9
         and r['fylke'] not in FILL_BLIND]
    return [sum(float(r['p_fill_raw']) for r in t) / len(t), 100 * sum(r['state'] != 'open' for r in t) / len(t)]


RAW_CAL, RAW_EVAL = raw_top(range(2020, 2025)), raw_top({2025, 2026})

N_PARSE = _count('test_parse.py', r'(\d+)/\d+ checks passed')
N_MODEL = _count('test_model.py', r'(\d+) checks, \d+ failed')


def reliability_row(r):
    """expected (observed %, n) and the display convention of the tables"""
    obs = r['observed'] * 100
    return obs, r['n'], (D2 * 10 if obs < 10 or obs > 95 else PCT)


def level_row(h):
    r = lvl[h]
    exp = [r['n'], r['rmse']]
    if 'rmse_last_year' in r:
        exp += [r['rmse_last_year'], r['rmse_prog_mean'], r['within3'] * 100]
    else:
        exp += [r['rmse_prog_mean'], r['within3'] * 100]
    return r, exp


BRIDGE_TOL = [N, D1, D1, PCT, N]
BRIDGE_A = [rb_a['n_pairs'], rb_a['mean'], rb_a['sd'], rb_a['share_vanished'] * 100, rb_a['n_had_queue']]
BRIDGE_V = [rb_v['n_pairs'], rb_v['mean'], rb_v['sd'], rb_v['share_vanished'] * 100, rb_v['n_had_queue']]

# ---------------------------------------------------------------- model.md
doc = 'docs/model.md'
raw = norm((ROOT / doc).read_text())
RAW[doc] = (ROOT / doc).read_text()
flat = flatten(raw)
check(doc, 'sigma table', r'\| 0 years \| ([\d.]+) \| \| 1 year \| ([\d.]+) \| \| 2–3 years \| ([\d.]+) \| \| 4\+ years \| ([\d.]+) \|',
      SIGMAS, flat, D1)
check(doc, 'taus level', r'school ([\d.]+), programme ([\d.]+), series ([\d.]+), county×year innovations ([\d.]+), residual ([\d.]+)',
      TAUS + [META['sigma_model']], flat, D1)
check(doc, 'taus fill', r'for fill: school ([\d.]+), programme ([\d.]+), series ([\d.]+)', TAUS_F[:3], flat, D1)
for h, label in (('0', '0 years'), ('1', '1 year'), ('2-3', '2–3 years'), ('4+', r'4\+ years')):
    r, exp = level_row(h)
    pat = rf'\| {label} \| (\d+) \| ([\d.]+) \|'
    pat += r' ([\d.]+) \| ([\d.]+) \| (\d+)%' if 'rmse_last_year' in r else r' — \| ([\d.]+) \| (\d+)%'
    check(doc, f'level eval {h}', pat, exp, flat, [N] + [D1] * (len(exp) - 2) + [PCT])
check(doc, 'coverage', r'contained the published figure (\d+)% of the time', [ev['coverage']['gaussian']['80'] * 100], flat, PCT)
check(doc, 'platt', r'logit π′ = (-[\d.]+) \+ ([\d.]+) logit π', [cal['a'], cal['b']], flat, D3)
check(doc, 'fill brier', r'[Hh]eld-out Brier ([\d.]+) against ([\d.]+) for the base rate',
      [ev['fill']['brier'], ev['fill']['brier_base_rate']], flat, D3)
check(doc, 'chance brier', r'Brier ([\d.]+), against ([\d.]+) for the rule',
      [ev['chance']['brier_model_common'], ev['chance']['brier_last_year_rule']], flat, D3)
check(doc, 'chance brier all pairs', r"over all pairs the model's Brier is ([\d.]+)",
      [ev['chance']['brier']], flat, D3)
check(doc, 'chance brier persistence', r'that scores ([\d.]+), so most of the gain',
      [ev['chance']['brier_persistence_prob']], flat, D3)
sm = META['school_means']
check(doc, 'school means', r"over the (\d+) schools whose α rests on five or more fitted cells: the school's own effect explains (\d+)% of the variance between schools, the programme mix (\d+)%, the county's level that year \([^)]*\) (\d+)%, and the series interactions (\d+)%\. Ranked within their own county by α instead of by raw mean, schools move ([\d.]+) places on average and at most (\d+)",
      [sm['n_schools'], sm['share']['alpha'] * 100, sm['share']['mix'] * 100, sm['share']['county_year'] * 100, sm['share']['series'] * 100,
       sm['within_county']['rank_move_mean'], sm['within_county']['rank_move_max']], flat, [N, PCT, PCT, PCT, PCT, D1, N])
check(doc, 'coupling interval', r'puts the difference at \[(-[\d.]+), \+([\d.]+)\]',
      META['halflife_search']['coupled_fill_logloss']['ci_coupled_minus_independent'], flat, D3)
check(doc, 'year pairs', r'standard deviation of ([\d.]+) points from one year to the next \((\d[\d ]+) consecutive-year pairs',
      [META['year_pairs']['sd'], META['year_pairs']['n']], flat, [D1, N])
for r in rel_chance:
    lo, hi = r['bin'].split('-')
    obs, n, tol = reliability_row(r)
    check(doc, f'chance reliability {r["bin"]}', rf'\| {lo}–{hi}% \| ([\d.]+)% \| ([\d ]+) \|', [obs, n], flat, [tol, N])
check(doc, 'outliers', r'\|z\| ≥ 3: (\d+) of ([\d ]+) cells, (\d+) of them in Møre og Romsdal',
      [META['outliers_z3']['n'], META['n_level'], META['outliers_z3']['n_fill_blind']], flat, N)
check(doc, 'series', r'([\d ]+) of the ([\d ]+) series have exactly one year', [n_series_one, n_series_num], flat, N)
check(doc, 'level cells', r'\*\*Level\*\* \(on the ([\d ]+) cells that carry a number\)', [META['n_level']], flat, N)
check(doc, 'fill cells', r'\*\*Fill\*\* \(on the ([\d ]+) cells that competed on points', [META['n_fill']], flat, N)
check(doc, 'held-out n', r'held-out 2025–26\*\* \(([\d ]+) cells that got a number\)', [ev['level_all']['n']], flat, N)
hs = META['halflife_search']
check(doc, 'halflife margin', r'4 years won by ([\d.]+) RMSE over no decay', [hs['None'] - hs['4.0']], flat, D3)
check(doc, 'coupling', r'verdict flipped — ([\d.]+) coupled against ([\d.]+) —',
      [hs['coupled_fill_logloss']['coupled'], hs['coupled_fill_logloss']['independent']], flat, D3)
check(doc, 'residual sd', r'The residual sd is ([\d.]+) points', [META['sigma_model']], flat, D1)
check(doc, 'sigma floor', r'saw no held-out year \(([\d.]+)\)', [META['sigma_floor']], flat, D1)
check(doc, 'raw fill held-out', r'gave ([\d.]+) filled ([\d.]+) of the time in the held-out years',
      [RAW_EVAL[0], RAW_EVAL[1] / 100], flat, D2)
check(doc, 'calibration prose', r'optimistic by up to ([\d.]+) points — a (\d+)% chance was really (\d+)% — and by (\d+) point in the 60–70% bin',
      [max_gap_lo60, 100 * rel(rel_chance, '10-20')['predicted'], 100 * rel(rel_chance, '10-20')['observed'], GAP['60-70']],
      flat, [D2, PCT, PCT, PCT])
check(doc, 'calibration prose 70–80', r'a stated (\d+)% came true (\d+)% of the time',
      [100 * rel(rel_chance, '70-80')['predicted'], 100 * rel(rel_chance, '70-80')['observed']], flat, PCT)
check(doc, 'round bridge A', r'\| Akershus, 1\. → 2\. inntak \| (\d+) \| (-[\d.]+) \(sd ([\d.]+)\) \| (\d+)% of ([\d ]+) \|',
      BRIDGE_A, flat, BRIDGE_TOL)
check(doc, 'round bridge V', r'\| Vestland, 1\. → 3\. inntak \| (\d+) \| (-[\d.]+) \(sd ([\d.]+)\) \| (\d+)% of ([\d ]+) \|',
      BRIDGE_V, flat, BRIDGE_TOL)

# ------------------------------------------------------ technical-report.md
doc = 'docs/technical-report.md'
raw = norm((ROOT / doc).read_text())
RAW[doc] = (ROOT / doc).read_text()
flat = flatten(raw)
appendix_c = flatten(raw.split('## Appendix C')[1])
ANCHOR[id(appendix_c)] = '## Appendix C'
CI = ev['ci']['intervals']
ch = ev['chance']
def pct2(x): return [100 * v for v in x]
check(doc, 'n_level', r'([\d,]+) carry a numeric threshold', [META['n_level']], flat, N)
check(doc, 'n_fill', r'the ([\d,]+) of them outside Møre og Romsdal inform the fill model', [META['n_fill']], flat, N)
check(doc, 'cells', r'Among the ([\d,]+) cells, ([\d,]+) competed on points', [n_cells, n_competed], flat, N)
check(doc, 'series', r'Of the ([\d,]+) school×programme series that ever carry a numeric threshold, ([\d,]+) have exactly one observed year',
      [n_series_num, n_series_one], flat, N)
check(doc, 'related work series', r'([\d,]+) of the ([\d,]+) series with any numeric threshold have a single observation',
      [n_series_one, n_series_num], flat, N)
check(doc, 'abstract panel', r'([\d,]+) schools, ([\d,]+) programme rows, ([\d,]+) observations', [N_SCHOOLS, N_ROWS, n_cells], flat, N)
check(doc, 'intro panel', r'([\d,]+) schools, ([\d,]+) programme rows, ([\d,]+) cell-level', [N_SCHOOLS, N_ROWS, n_cells], flat, N)
h4 = lvl['4+']
check(doc, 'abstract rmse', r'\(([\d.]+) vs ([\d.]+) points on series with four or more observed years', [h4['rmse'], h4['rmse_last_year']], flat, D2)
check(doc, 'abstract coverage', r'nominal 80% intervals cover ([\d.]+)% \[([\d.]+), ([\d.]+)\] of outcomes',
      pct2([ev['coverage']['gaussian']['80']] + CI['coverage80']), flat, D2 * 10)
check(doc, 'abstract calibration gap', r'calibrated to within ([\d.]+) points in every decile', [max_gap], flat, D2)
check(doc, 'abstract brier', r'probabilistic persistence rule \(Brier ([\d.]+) vs ([\d.]+) and ([\d.]+)\)',
      [ch['brier_model_common'], ch['brier_last_year_rule'], ch['brier_persistence_prob']], flat, D3)
check(doc, 'intro bullet', r'\(([\d.]+) vs ([\d.]+) and ([\d.]+) points in the deepest stratum\), covers ([\d.]+)% of outcomes with nominal 80% intervals, and produces calibrated probabilities that beat both a deterministic and a probabilistic persistence rule \(Brier ([\d.]+) vs ([\d.]+) and ([\d.]+)\)',
      [h4['rmse'], h4['rmse_last_year'], h4['rmse_prog_mean'], ev['coverage']['gaussian']['80'] * 100,
       ch['brier_model_common'], ch['brier_last_year_rule'], ch['brier_persistence_prob']], flat, [D2, D2, D2, D2 * 10, D3, D3, D3])
check(doc, 'parser checks (4.1)', r'A suite of (\d+) regression checks locks known failure modes', [N_PARSE], flat, N)
check(doc, 'grep rows', r'([\d,]+) of ([\d,]+) rows carry a register code', [N_GREP, N_ROWS], flat, N)
# Table 1b: the panel by county, straight from schools.json
for fylke, c in sorted(BY_FYLKE.items()):
    check(doc, f'table 1b {fylke}', rf'\| {fylke} \| [^|]* \| [^|]* \| ([\d,]+) \| ([\d,]+) \| ([\d,]+) \| (\d+) \| (\d+) \| (\d+) \| (\d+) \|',
          [c['cells'], c['num'], c['open'], c['zero'], c['F'], c['D'], c['U']], flat, N)
check(doc, '5.2 cells', r'fitted on the ([\d,]+) cells with a numeric threshold; the fill component on the ([\d,]+) cells that competed on points',
      [META['n_level'], META['n_fill']], flat, N)
check(doc, 'sigma prose', r'forecast ([\d.]+) points loose; four observed years buy the spread down to ([\d.]+)\.', [sig_by['0'], sig_by['4+']], flat, D1)
check(doc, 'raw fill top bin', r'cells the raw model gave a mean \$\\pi\$ of ([\d.]+) \(the ≥ 0\.9 bin\) filled (\d+)% of the time, and in the held-out years cells given a mean ([\d.]+) filled (\d+)%',
      RAW_CAL + RAW_EVAL, flat, [D2, PCT, D2, PCT])
check(doc, 'fill brier (6.3)', r'Held-out Brier for the fill event on those counties: ([\d.]+) against ([\d.]+) for the base-rate forecaster \(base rate ([\d.]+); difference (-[\d.]+), cluster-bootstrap 95% interval \[(-[\d.]+), (-[\d.]+)\]',
      [ev['fill']['brier'], ev['fill']['brier_base_rate'], ev['fill']['base_rate'],
       ev['fill']['brier'] - ev['fill']['brier_base_rate']] + CI['fill: model minus base rate, brier'], flat, D3)
check(doc, 'fill mid bins', r'\((\d+)% observed in the 50–60% bin, (\d+)% in the 60–70% bin\)',
      [fill_5060, 100 * rel(rel_fill, '60-70')['observed']], flat, PCT)
check(doc, 'bootstrap design', r'school×year \((\d+) clusters, ([\d,]+) resamples\)', [ev['ci']['n_clusters'], ev['ci']['replicates']], flat, N)
check(doc, 'table 4 caption', r'2025–2026 \(([\d,]+) cells with a published number\)', [ev['level_all']['n']], flat, N)
check(doc, 'table 4 caption 0-year', r"only (\d+) of the (\d+) 0-year cells \(the model's RMSE on those \d+ is ([\d.]+)\)",
      [lvl['0']['n_prog_mean'], lvl['0']['n'], lvl['0']['rmse_model_on_prog_mean_cells']], flat, [N, N, D2])
for h, label in (('0', '0 years'), ('1', '1 year'), ('2-3', '2–3 years'), ('4+', r'4\+ years')):
    r = lvl[h]
    B = r'\*{0,2}'
    if 'rmse_last_year' in r:
        pat = rf'\| {label} \| ([\d,]+) \| \*\*([\d.]+)\*\* \| ([\d.]+) \| ([\d.]+) \| \*\*([\d.]+)\*\* \| ([\d.]+) \| ([-+][\d.]+) \| {B}(\d+)%{B} \| {B}(\d+)%{B} \|'
        exp = [r['n'], r['rmse'], r['rmse_last_year'], r['rmse_prog_mean'], r['mae'], r['mae_last_year'], r['bias'],
               r['within3'] * 100, r['within3_last_year'] * 100]
        n_pct = 2
    else:
        pat = rf'\| {label} \| ([\d,]+) \| \*\*([\d.]+)\*\* \| — \| ([\d.]+) \| \*\*([\d.]+)\*\* \| — \| ([-+][\d.]+) \| {B}(\d+)%{B} \| — \|'
        exp = [r['n'], r['rmse'], r['rmse_prog_mean'], r['mae'], r['bias'], r['within3'] * 100]
        n_pct = 1
    check(doc, f'table 4 {h}', pat, exp, flat, [N] + [D2] * (len(exp) - 1 - n_pct) + [PCT] * n_pct)
d = lambda h: lvl[h]['rmse'] - lvl[h]['rmse_last_year']
check(doc, 'table 4 intervals',
      r'is (-[\d.]+) points \[(-[\d.]+), (-[\d.]+)\] with one year of history, (-[\d.]+) \[(-[\d.]+), (-[\d.]+)\] with two or three, and (-[\d.]+) \[(-[\d.]+), (-[\d.]+)\] with four or more; against the programme–county mean the intervals are \[(-[\d.]+), (-[\d.]+)\], \[(-[\d.]+), (-[\d.]+)\] and \[(-[\d.]+), (-[\d.]+)\]',
      [d('1')] + CI['level 1: model minus persistence, rmse'] + [d('2-3')] + CI['level 2-3: model minus persistence, rmse']
      + [d('4+')] + CI['level 4+: model minus persistence, rmse'] + CI['level 1: model minus programme-county mean, rmse']
      + CI['level 2-3: model minus programme-county mean, rmse'] + CI['level 4+: model minus programme-county mean, rmse'], flat, D2)
check(doc, '0-year interval', r'the difference, (-[\d.]+) points on those (\d+), has an interval \[(-[\d.]+), \+([\d.]+)\]',
      [lvl['0']['rmse_model_on_prog_mean_cells'] - lvl['0']['rmse_prog_mean'], lvl['0']['n_prog_mean']]
      + CI['level 0: model minus programme-county mean, rmse'], flat, [D2, N, D2, D2])
check(doc, 'deepest stratum ±3', r'deepest stratum \((\d+)% vs (\d+)%\), a difference whose interval \[(-[\d.]+), \+([\d.]+)\]',
      [h4['within3_last_year'] * 100, h4['within3'] * 100] + CI['level 4+: model minus persistence, within3'], flat, [PCT, PCT, D2, D2])
check(doc, 'bias prose', r'forecast ([\d.]+) points too low on average and one-year series ([\d.]+) too low',
      [-lvl['0']['bias'], -lvl['1']['bias']], flat, D1)
check(doc, 'overall', r'Overall: RMSE ([\d.]+) \[([\d.]+), ([\d.]+)\], MAE ([\d.]+), bias (-[\d.]+), (\d+)% of forecasts within ±3',
      [ev['level_all']['rmse']] + CI['level all: rmse'] + [ev['level_all']['mae'], ev['level_all']['bias'], ev['level_all']['within3'] * 100],
      flat, [D2, D2, D2, D2, D2, PCT])
check(doc, 'year pairs', r'standard deviation of ([\d.]+) points between consecutive published years \(([\d,]+) pairs; (\d+)% of moves',
      [META['year_pairs']['sd'], META['year_pairs']['n'], META['year_pairs']['within3'] * 100], flat, [D1, N, PCT])
cov_g, cov_e = ev['coverage']['gaussian'], ev['coverage']['empirical']
check(doc, 'coverage+width', r'contained the published figure \*\*([\d.]+)%\*\* of the time on held-out cells \(n = ([\d,]+); cluster-bootstrap interval \[([\d.]+), ([\d.]+)\]\), at a mean width of ([\d.]+) points',
      [cov_g['80'] * 100, ev['level_all']['n']] + pct2(CI['coverage80']) + [ev['interval_width80']], flat, [D2 * 10, N, D2 * 10, D2 * 10, D1])
check(doc, 'coverage gaussian levels', r'Gaussian intervals covered ([\d.]+), ([\d.]+) and ([\d.]+)%', pct2([cov_g['50'], cov_g['90'], cov_g['95']]), flat, D2 * 10)
check(doc, 'coverage empirical', r'central 80% band covered ([\d.]+)% \(50/90/95: ([\d.]+), ([\d.]+), ([\d.]+)%\)',
      pct2([cov_e['80'], cov_e['50'], cov_e['90'], cov_e['95']]), flat, D2 * 10)
BAND_LABEL = {'0-25': 'below 25', '25-30': '25–30', '30-35': '30–35', '35-40': '35–40', '40-45': '40–45', '45+': '45 and above'}
for r in ev['coverage80_by_forecast']:
    check(doc, f'table 4b band {r["band"]}', rf'\| {BAND_LABEL[r["band"]]} \| (\d+) \| ([\d.]+)% \| ([\d.]+) \| ([\d.]+) \|',
          [r['n'], r['coverage80'] * 100, r['rmse'], r['s_mean']], flat, [N, D2 * 10, D2, D2])
cov_f = {r['fylke']: r for r in ev['coverage80_by_fylke']}
for f, r in cov_f.items():
    check(doc, f'table 4b {f}', rf'\| {f} \| (\d+) \| ([\d.]+)% \|', [r['n'], r['coverage80'] * 100], flat, [N, D2 * 10])
lo_f, hi_f = min(cov_f.values(), key=lambda r: r['coverage80']), max(cov_f.values(), key=lambda r: r['coverage80'])
check(doc, 'coverage by county prose', rf'coverage runs from (\d+)% in {lo_f["fylke"]}, forecast from one prior year, to (\d+)% in {hi_f["fylke"]}',
      [lo_f['coverage80'] * 100, hi_f['coverage80'] * 100], flat, PCT)
check(doc, 'limitations coverage range', r'Table 4b, from (\d+)% to (\d+)%', [lo_f['coverage80'] * 100, hi_f['coverage80'] * 100], flat, PCT)
check(doc, 'cold start Buskerud', r"Buskerud's intervals cover (\d+)% instead of 80%", [cov_f['Buskerud']['coverage80'] * 100], flat, PCT)
check(doc, 'chance brier all', r'over all ([\d,]+) score–cell pairs \(([\d,]+) cells\),[^:]*: Brier score \*\*([\d.]+)\*\* \[([\d.]+), ([\d.]+)\]',
      [ch['n_pairs'], ch['n_cells'], ch['brier']] + CI['chance: brier'], flat, [N, N, D3, D3, D3])
check(doc, 'chance brier common', r"([\d,]+) of those pairs; on that common subset the model scores \*\*([\d.]+)\*\* against the step rule's \*\*([\d.]+)\*\* \(difference \[(-[\d.]+), (-[\d.]+)\]\) and the probabilistic persistence forecast's \*\*([\d.]+)\*\* \(difference (-[\d.]+) \[(-[\d.]+), (-[\d.]+)\]\)",
      [ch['n_last_year_rule'], ch['brier_model_common'], ch['brier_last_year_rule']] + CI['chance: model minus step persistence, brier']
      + [ch['brier_persistence_prob'], ch['brier_model_common'] - ch['brier_persistence_prob']] + CI['chance: model minus probabilistic persistence, brier'],
      flat, [N] + [D3] * 8)
check(doc, '7.4 calibration gap', r'largest gap between prediction and outcome in any decile is ([\d.]+) points', [max_gap], flat, D2)
if not 2.5 <= max_gap_lo60 <= 4.5:
    failures.append(f'{doc}: "optimistic by three to four points in every bin" — the largest gap below 60% is now {max_gap_lo60:.1f}')
checked += 1
check(doc, 'table 5 prose below 60', r'a stated (\d+)% was realised at (\d+)% — and by (\d+) point in the 60–70% bin',
      [100 * rel(rel_chance, '20-30')['predicted'], 100 * rel(rel_chance, '20-30')['observed'], GAP['60-70']], flat, PCT)
check(doc, 'limitations optimism', r'is three to four points optimistic, and (\d+) point in the 60–70% bin', [GAP['60-70']], flat, PCT)
check(doc, 'table 5 prose 70–80', r'a stated (\d+)% was realised at (\d+)%, so',
      [100 * rel(rel_chance, '70-80')['predicted'], 100 * rel(rel_chance, '70-80')['observed']], flat, PCT)
for r in rel_chance:
    lo, hi = r['bin'].split('-')
    obs, n, tol = reliability_row(r)
    check(doc, f'table 5 {r["bin"]}', rf'\| {lo}–{hi}% \| ([\d.]+)% \| ([\d,]+) \|', [obs, n], flat, [tol, N])
check(doc, 'figure 2 mass', r'\((\d+)% of score–cell pairs land above 80%\)', [mass_hi], flat, PCT)
hs = META['halflife_search']
check(doc, 'halflife', r'RMSE was \{([\d.]+), ([\d.]+), ([\d.]+), ([\d.]+)\}', [hs['1.5'], hs['2.5'], hs['4.0'], hs['None']], flat, D3)
check(doc, 'halflife interval', r'by ([\d.]+) points over no decay \[(-[\d.]+), \+([\d.]+)\]',
      [hs['None'] - hs['4.0']] + hs['ci_none_minus_best'], flat, D3)
cp = hs['coupled_fill_logloss']
check(doc, 'coupling', r'lowered calibration-year fill log-loss from ([\d.]+) to ([\d.]+) \(difference \[(-[\d.]+), \+([\d.]+)\]\)',
      [cp['independent'], cp['coupled']] + cp['ci_coupled_minus_independent'], flat, D3)
check(doc, 'coupling held-out', r'the same fill Brier \(([\d.]+) against ([\d.]+)\)', [cp['heldout_brier']['coupled'], cp['heldout_brier']['independent']], flat, D3)
fb = hs['fill_blind_experiment']
check(doc, 'fill-blind experiment', r'flattens the Platt slope from ([\d.]+) to ([\d.]+) and raises the held-out fill Brier on the seven counties with real labels from ([\d.]+) to ([\d.]+)',
      [fb['platt_b_excluded'], fb['platt_b_included'], fb['heldout_brier7_excluded'], fb['heldout_brier7_included']], flat, D3)
check(doc, 'sigma floor', r'floored at the residual sd of the newest fit that saw no evaluation year \(([\d.]+) points', [META['sigma_floor']], flat, D1)
check(doc, 'residual sd (6.1)', r'the residual standard deviation is ([\d.]+) points', [META['sigma_model']], flat, D1)
check(doc, 'sigma table', r'\| 0 years \| ([\d.]+) \| \| 1 year \| ([\d.]+) \| \| 2–3 years \| ([\d.]+) \| \| 4\+ years \| ([\d.]+) \|', SIGMAS, flat, D1)
check(doc, 'taus table', r'\| School \| ([\d.]+) \| ([\d.]+) \| \| Programme area \(within level\) \| ([\d.]+) \| ([\d.]+) \| \| Series \(school×programme\) \| ([\d.]+) \| ([\d.]+) \| \| County–year innovation \| ([\d.]+) \| ([\d.]+) \| \| Residual \| ([\d.]+) \| — \|',
      [TAUS[0], TAUS_F[0], TAUS[1], TAUS_F[1], TAUS[2], TAUS_F[2], TAUS[3], TAUS_F[3], META['sigma_model']], flat, D1)
m = re.search(r"\\pi' \\;=\\; -([\d.]+) \\;\+\\; ([\d.]+)", flat)
checked += 1
if not m:
    failures.append(f'{doc}: platt (eq 5): pattern not found — the equation was reworded; update the check')
elif abs(-num(m.group(1)) - cal['a']) > D3 or abs(num(m.group(2)) - cal['b']) > D3:
    failures.append(f'{doc}: platt (eq 5): doc says [{-num(m.group(1))}, {num(m.group(2))}], model.json says [{cal["a"]}, {cal["b"]}]')
# 8.1: the round bridge, now with a standard error of the mean
check(doc, 'round bridge A', r'\| Akershus, 1\. → 2\. inntak \| [^|]+ \| (\d+) \| (-[\d.]+) \(se ([\d.]+), sd ([\d.]+)\) \| (\d+)% of (\d+) \|',
      [rb_a['n_pairs'], rb_a['mean'], rb_a['sd'] / rb_a['n_pairs'] ** 0.5, rb_a['sd'], rb_a['share_vanished'] * 100, rb_a['n_had_queue']],
      flat, [N, D1, D1, D1, PCT, N])
check(doc, 'round bridge V', r'\| Vestland, 1\. → 3\. inntak \| [^|]+ \| (\d+) \| (-[\d.]+) \(se ([\d.]+), sd ([\d.]+)\) \| (\d+)% of ([\d,]+) \|',
      [rb_v['n_pairs'], rb_v['mean'], rb_v['sd'] / rb_v['n_pairs'] ** 0.5, rb_v['sd'], rb_v['share_vanished'] * 100, rb_v['n_had_queue']],
      flat, [N, D1, D1, D1, PCT, N])
# 8.2: the decomposition of raw school means
sm = META['school_means']
check(doc, 'school means decomposition',
      r"Over the (\d+) schools whose \$\\alpha_s\$ rests on five or more fitted cells \(between-school sd of the raw mean ([\d.]+) points\), the school's own effect accounts for (\d+)% of the variance, the programme mix \([^)]*\) for (\d+)%, the county-year level — [^—]* — for (\d+)%, the series interactions for (\d+)%",
      [sm['n_schools'], sm['sd_raw'], sm['share']['alpha'] * 100, sm['share']['mix'] * 100, sm['share']['county_year'] * 100, sm['share']['series'] * 100],
      flat, [N, D1, PCT, PCT, PCT, PCT])
wc = sm['within_county']
check(doc, 'school means ranks', r'schools move ([\d.]+) places on average and at most (\d+); in Møre og Romsdal, where mix explains (\d+)% and the school effect (\d+)%, the average move is ([\d.]+) places, in Oslo ([\d.]+)',
      [wc['rank_move_mean'], wc['rank_move_max'], wc['by_fylke']['Møre og Romsdal']['share_mix'] * 100, wc['by_fylke']['Møre og Romsdal']['share_alpha'] * 100,
       wc['by_fylke']['Møre og Romsdal']['rank_move_mean'], wc['by_fylke']['Oslo']['rank_move_mean']], flat, [D1, N, PCT, PCT, D1, D1])
oz = META['outliers_z3']
check(doc, 'outliers', r'> 3\$: (\d+) of ([\d,]+), of which (\d+) are in Møre og Romsdal', [oz['n'], oz['n_level'], oz['n_fill_blind']], flat, N)
check(doc, 'forecast count', r'shipped model carries ([\d,]+) programme forecasts, of which (\d+) are for series with no observed year', [N_FORECASTS, N_FORECASTS_H0], flat, N)
check(doc, 'discontinued series', r'\(discontinued; (\d+) series\)', [N_SERIES_U], flat, N)
for y in sorted(year_row):
    check(doc, f'table B1 {y}', rf'\| {y} \| ([\d,]+) \| ([\d.]+) \| ([\d.]+) \|', year_row[y], flat, [N, D2, D2])
check(doc, 'table C1 caption', r'\(([\d,]+) cells that competed on points; the (\d+) Møre og Romsdal cells, whose deployed \$\\pi\$ is 1, are outside the table; base rate ([\d.]+)\)\. Held-out Brier ([\d.]+) against ([\d.]+) for the base-rate forecaster',
      [ev['fill']['n'], ev['fill']['n_excluded'], ev['fill']['base_rate'], ev['fill']['brier'], ev['fill']['brier_base_rate']], appendix_c, [N, N, D3, D3, D3])
for r in rel_fill:
    lo, hi = r['bin'].split('-')
    obs, n, tol = reliability_row(r)
    check(doc, f'table C1 {r["bin"]}', rf'\| {lo}–{hi}% \| ([\d.]+)% \| ([\d,]+) \|', [obs, n], appendix_c, [tol, N])
check(doc, 'validation counts', r'comprises (\d+) parser regression checks and ([\d,]+) model invariants', [N_PARSE, N_MODEL], flat, N)
checked += 1
if f"from the build of {META['built']}" not in flat:
    failures.append(f'{doc}: reproducibility statement: the build date is not {META["built"]}')

if WRITE:
    for doc, txt in RAW.items():
        (ROOT / doc).write_text(txt)
    print('docs re-pinned; run again without --write to verify')
if failures:
    print(f'{checked} checks, {len(failures)} FAILED:')
    for f in failures:
        print(' -', f)
    sys.exit(1)
print(f'{checked} checks passed — the docs describe the shipped model')
