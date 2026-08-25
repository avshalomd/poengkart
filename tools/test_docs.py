"""The documentation quotes the model; the model changes on every refresh.

These checks pin every meta-derived number quoted in docs/model.md,
docs/teknisk-rapport.md and docs/technical-report.md to the shipped
web/data/model.json, so a refit can no longer leave the prose describing a
model that is not the one deployed. Comparisons carry a tolerance of half a
unit in the last displayed digit, so a value that sits exactly on a rounding
boundary (3.45 shown as 3.4 or 3.5) never fails on the coin flip. Numbers the
docs state as one-off measurements of the sources (year-to-year sd, series
counts, the ranking experiment) are not re-derivable from meta and are not
checked here.
"""
import csv
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
META = json.loads((ROOT / 'web/data/model.json').read_text())['meta']

failures = []
checked = 0

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
check(doc, 'coverage', r'contained the published figure (\d+)% of the time', [ev['coverage80'] * 100], flat, PCT)
check(doc, 'platt', r'logit π′ = (-[\d.]+) \+ ([\d.]+) logit π', [cal['a'], cal['b']], flat, D3)
check(doc, 'fill brier', r'Held-out Brier ([\d.]+) against ([\d.]+) for the base rate',
      [ev['fill']['brier'], ev['fill']['brier_base_rate']], flat, D3)
check(doc, 'chance brier', r'Brier ([\d.]+), against ([\d.]+) for the rule',
      [ev['chance']['brier'], ev['chance']['brier_last_year_rule']], flat, D3)
for r in rel_chance:
    lo, hi = r['bin'].split('-')
    obs, n, tol = reliability_row(r)
    check(doc, f'chance reliability {r["bin"]}', rf'\| {lo}–{hi}% \| ([\d.]+)% \| ([\d ]+) \|', [obs, n], flat, [tol, N])
check(doc, 'outlier denominator', r'\|z\| ≥ 3: \d+ of ([\d ]+) cells', [META['n_level']], flat, N)
check(doc, 'round bridge A', r'\| Akershus, 1\. → 2\. inntak \| (\d+) \| (-[\d.]+) \(sd ([\d.]+)\) \| (\d+)% of ([\d ]+) \|',
      BRIDGE_A, flat, BRIDGE_TOL)
check(doc, 'round bridge V', r'\| Vestland, 1\. → 3\. inntak \| (\d+) \| (-[\d.]+) \(sd ([\d.]+)\) \| (\d+)% of ([\d ]+) \|',
      BRIDGE_V, flat, BRIDGE_TOL)

# -------------------------------------------------------- teknisk-rapport.md
doc = 'docs/teknisk-rapport.md'
# Norwegian text: a comma between digits is always a decimal, never thousands
flat = re.sub(r'(\d),(\d)', r'\1.\2', flatten((ROOT / doc).read_text()))
check(doc, 'n_fill', r'\((\d[\d ]+) celler som konkurrerte', [META['n_fill']], flat, N)
check(doc, 'n_level', r'\((\d[\d ]+) celler med tall\)', [META['n_level']], flat, N)
check(doc, 'sigma inline', r'\(0 år: ([\d.]+) · 1 år: ([\d.]+) · 2–3 år: ([\d.]+) · 4\+ år: ([\d.]+)\)', SIGMAS, flat, D1)
check(doc, 'taus inline', r'skole ([\d.]+) · program ([\d.]+) · skole×program ([\d.]+) · årsinnovasjon ([\d.]+) · residual ([\d.]+)',
      TAUS + [META['sigma_model']], flat, D1)
check(doc, 'coverage', r'dekket fasiten \*\*(\d+) %\*\*', [ev['coverage80'] * 100], flat, PCT)
check(doc, 'chance brier', r'Brier-skår \*\*([\d.]+)\*\* mot \*\*([\d.]+)\*\*',
      [ev['chance']['brier'], ev['chance']['brier_last_year_rule']], flat, D3)
check(doc, 'outlier denominator', r'\|z\| ≥ 3: \d+ av (\d[\d ]+)\)', [META['n_level']], flat, N)
for h, label in (('0', '0 år'), ('1', '1 år'), ('2-3', '2–3 år'), ('4+', r'4\+ år')):
    r, exp = level_row(h)
    pat = rf'\| {label} \| (\d+) \| \*\*([\d.]+)\*\* \|'
    pat += r' ([\d.]+) \| ([\d.]+) \| (\d+) %' if 'rmse_last_year' in r else r' — \| ([\d.]+) \| (\d+) %'
    check(doc, f'level eval {h}', pat, exp, flat, [N] + [D1] * (len(exp) - 2) + [PCT])
check(doc, 'round bridge A', r'\| Akershus, 1\.→2\. inntak \| (\d+) \| (-[\d.]+) \(sd ([\d.]+)\) \| (\d+) % av (\d+) \|',
      BRIDGE_A, flat, BRIDGE_TOL)
check(doc, 'round bridge V', r'\| Vestland, 1\.→3\. inntak \| (\d+) \| (-[\d.]+) \(sd ([\d.]+)\) \| (\d+) % av (\d[\d ]+) \|',
      BRIDGE_V, flat, BRIDGE_TOL)

# ------------------------------------------------------ technical-report.md
doc = 'docs/technical-report.md'
raw = norm((ROOT / doc).read_text())
flat = flatten(raw)
appendix_c = flatten(raw.split('## Appendix C')[1])
check(doc, 'n_level', r'([\d,]+) carry a numeric threshold', [META['n_level']], flat, N)
check(doc, 'n_fill', r'([\d,]+) competed on points \(and thus inform the fill', [META['n_fill']], flat, N)
m = re.search(r"\\pi' \\;=\\; -([\d.]+) \\;\+\\; ([\d.]+)", flat)
checked += 1
if not m:
    failures.append(f'{doc}: platt (eq 5): pattern not found — the equation was reworded; update the check')
elif abs(-num(m.group(1)) - cal['a']) > D3 or abs(num(m.group(2)) - cal['b']) > D3:
    failures.append(f'{doc}: platt (eq 5): doc says [{-num(m.group(1))}, {num(m.group(2))}], model.json says [{cal["a"]}, {cal["b"]}]')
check(doc, 'coverage+width', r'contained the published figure \*\*([\d.]+)%\*\* of the time on held-out cells, at a mean width of ([\d.]+) points',
      [ev['coverage80'] * 100, mean_width], flat, D1)
check(doc, 'chance brier', r'Brier score \*\*([\d.]+)\*\*, against \*\*([\d.]+)\*\* for the persistence rule',
      [ev['chance']['brier'], ev['chance']['brier_last_year_rule']], flat, D3)
check(doc, 'fill brier', r'Held-out Brier for the fill event: ([\d.]+) against ([\d.]+) for the base-rate forecaster \(base rate ([\d.]+)\)',
      [ev['fill']['brier'], ev['fill']['brier_base_rate'], ev['fill']['base_rate']], flat, D3)
check(doc, 'outlier denominator', r'\\ge 3\$: \d+ of ([\d,]+)\)', [META['n_level']], flat, N)
check(doc, 'halflife', r'RMSE ([\d.]+) at half-life 4 years against ([\d.]+) with no decay',
      [META['halflife_search']['4.0'], META['halflife_search']['None']], flat, D3)
check(doc, 'coupling', r'raised fill log-loss from ([\d.]+) to ([\d.]+)',
      [META['halflife_search']['coupled_fill_logloss']['independent'],
       META['halflife_search']['coupled_fill_logloss']['coupled']], flat, D3)
check(doc, 'sigma table', r'\| 0 years \| ([\d.]+) \| \| 1 year \| ([\d.]+) \| \| 2–3 years \| ([\d.]+) \| \| 4\+ years \| ([\d.]+) \|',
      SIGMAS, flat, D1)
check(doc, 'taus table', r'\| School \| ([\d.]+) \| ([\d.]+) \| \| Utdanningsprogram \| ([\d.]+) \| ([\d.]+) \| \| Series \(school×programme\) \| ([\d.]+) \| ([\d.]+) \| \| County–year innovation \| ([\d.]+) \| ([\d.]+) \| \| Residual \| ([\d.]+) \| — \|',
      [TAUS[0], TAUS_F[0], TAUS[1], TAUS_F[1], TAUS[2], TAUS_F[2], TAUS[3], TAUS_F[3], META['sigma_model']], flat, D1)
for h, label in (('0', '0 years'), ('1', '1 year'), ('2-3', '2–3 years'), ('4+', r'4\+ years')):
    r = lvl[h]
    if 'rmse_last_year' in r:
        pat = rf'\| {label} \| (\d+) \| \*\*([\d.]+)\*\* \| ([\d.]+) \| ([\d.]+) \| \*\*([\d.]+)\*\* \| ([\d.]+) \| (\d+)% \|'
        exp = [r['n'], r['rmse'], r['rmse_last_year'], r['rmse_prog_mean'], mae_model[h], mae_ly[h], r['within3'] * 100]
    else:
        pat = rf'\| {label} \| (\d+) \| \*\*([\d.]+)\*\* \| — \| ([\d.]+) \| \*\*([\d.]+)\*\* \| — \| (\d+)% \|'
        exp = [r['n'], r['rmse'], r['rmse_prog_mean'], mae_model[h], r['within3'] * 100]
    check(doc, f'table 4 {h}', pat, exp, flat, [N] + [D2] * (len(exp) - 2) + [PCT])
check(doc, 'overall', r'Overall: RMSE ([\d.]+), MAE ([\d.]+), (\d+)% of forecasts within ±3',
      [ev['level_all']['rmse'], mae_all, ev['level_all']['within3'] * 100], flat, [D2, D2, PCT])
for r in rel_chance:
    lo, hi = r['bin'].split('-')
    obs, n, tol = reliability_row(r)
    check(doc, f'table 5 {r["bin"]}', rf'\| {lo}–{hi}% \| ([\d.]+)% \| ([\d,]+) \|', [obs, n], flat, [tol, N])
for r in rel_fill:
    lo, hi = r['bin'].split('-')
    obs, n, tol = reliability_row(r)
    check(doc, f'table C1 {r["bin"]}', rf'\| {lo}–{hi}% \| ([\d.]+)% \| ([\d,]+) \|', [obs, n], appendix_c, [tol, N])
check(doc, 'round bridge A', r'\| Akershus, round 1 → 2 \| (\d+) \| (-[\d.]+) \(sd ([\d.]+)\) \| (\d+)% of (\d+) \|',
      BRIDGE_A, flat, BRIDGE_TOL)
check(doc, 'round bridge V', r'\| Vestland, round 1 → 3 \| (\d+) \| (-[\d.]+) \(sd ([\d.]+)\) \| (\d+)% of ([\d,]+) \|',
      BRIDGE_V, flat, BRIDGE_TOL)

if failures:
    print(f'{checked} checks, {len(failures)} FAILED:')
    for f in failures:
        print(' -', f)
    sys.exit(1)
print(f'{checked} checks passed — the docs describe the shipped model')
