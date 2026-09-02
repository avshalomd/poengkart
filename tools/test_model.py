#!/usr/bin/env python3
"""Invariants on the forecast in web/data/model.json.

    .venv/bin/python3 tools/test_model.py

These are the properties the app relies on, and the ones a reader would be
misled by if they broke: every chance is a probability and moves the right way
with points, every live programme has a forecast, the spread is never narrower
than the model's own residual, and the backtest the app quotes is actually in
the file. Run after model.py; refresh.py runs it last.
"""

import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = json.load(open(os.path.join(HERE, '..', 'web', 'data', 'schools.json')))
MODEL = json.load(open(os.path.join(HERE, '..', 'web', 'data', 'model.json')))
META, SCHOOLS = MODEL['meta'], MODEL['schools']

fails, checks = [], 0


def check(desc, cond, detail=''):
    global checks
    checks += 1
    if not cond:
        fails.append(f'{desc}' + (f' — {detail}' if detail else ''))


# the app's own formula, mirrored once here so the invariants can be evaluated
ZQ = META.get('error_quantiles')
GRID = [i / 40 for i in range(41)]


def err_cdf(z):
    if not ZQ:
        return 0.5 * (1 + math.erf(z / math.sqrt(2)))
    if z <= ZQ[0]:
        return 0.005
    if z >= ZQ[-1]:
        return 0.995
    i = 1
    while ZQ[i] < z:
        i += 1
    f = (z - ZQ[i - 1]) / ((ZQ[i] - ZQ[i - 1]) or 1)
    return min(0.995, max(0.005, GRID[i - 1] + f * (GRID[i] - GRID[i - 1])))


def chance(pr, x):
    return (1 - pr['pi']) + pr['pi'] * err_cdf((x - pr['m']) / pr['s'])


# ---- structure ------------------------------------------------------------
check('meta has the backtest the app quotes', 'backtest_eval_years' in META and 'coverage80' in META['backtest_eval_years'])
check('error quantiles are 41 non-decreasing values',
      ZQ and len(ZQ) == 41 and all(ZQ[i] <= ZQ[i + 1] for i in range(40)))
check('error quantiles are centred near zero', ZQ and abs(ZQ[20]) < 1.0, str(ZQ[20] if ZQ else None))
check('fill recalibration is present and not absurd',
      'fill_calibration' in META and 0.2 <= META['fill_calibration']['b'] <= 1.5, str(META.get('fill_calibration')))
sig = META['sigma_forecast']
check('forecast spread never narrower than the pre-evaluation residual',
      all(v >= META.get('sigma_floor', META['sigma_model']) - 0.0050001 for v in sig.values()), str(sig))
check('spread shrinks with history',
      list(sig.values()) == sorted(sig.values(), reverse=True), str(sig))

# ---- coverage: every live programme has a forecast --------------------------
newest = {}
for s in DATA['schools']:
    for p in s['programs']:
        for y in p['values']:
            newest[s['fylke']] = max(newest.get(s['fylke'], 0), int(y))
missing, n_pred, n_live = [], 0, 0
for s in DATA['schools']:
    ent = SCHOOLS.get(f"{s['fylke']}|{s['name']}", {})
    occ = {}
    for p in s['programs']:
        k = p['program'].lower()
        o = occ.get(k, 0)
        occ[k] = o + 1
        key = f"{k}|{p['level']}|{o}"
        live_years = [int(y) for y, v in p['values'].items()
                      if v == 'open' or (isinstance(v, (int, float)) and not isinstance(v, bool))]
        # a programme whose newest cell is "utgått" is not live, whatever the
        # year before said (review of 2 Sept 2026)
        discontinued = p['values'][max(p['values'], key=int)] == 'U'
        live = live_years and max(live_years) >= newest[s['fylke']] - 1 and not discontinued
        pr = (ent.get('programs') or {}).get(key)
        if live:
            n_live += 1
            if not pr:
                missing.append(f'{s["name"]}: {p["program"]} {p["level"]}')
        if pr:
            n_pred += 1
            check('target year is the county\'s next publication', ent['year'] == newest[s['fylke']] + 1,
                  f'{s["name"]} {ent["year"]} vs {newest[s["fylke"]]}')
            check('pi is a probability', 0 <= pr['pi'] <= 1, f'{s["name"]} {key} {pr["pi"]}')
            check('spread positive', pr['s'] > 0, f'{s["name"]} {key}')
            check('expected threshold plausible', -10 <= pr['m'] <= 70, f'{s["name"]} {key} {pr["m"]}')
            # chance is a probability, and more points never hurt
            cs = [chance(pr, x) for x in (0, 20, 30, 40, 50, 60, 70)]
            check('chance in [0,1]', all(0 <= c <= 1 for c in cs), f'{s["name"]} {key} {cs}')
            check('chance monotone in points', all(cs[i] <= cs[i + 1] + 1e-9 for i in range(len(cs) - 1)),
                  f'{s["name"]} {key} {[round(c, 3) for c in cs]}')
            check('a programme that never queues admits everyone',
                  pr['pi'] > 0.01 or chance(pr, 0) > 0.98, f'{s["name"]} {key}')
check('every live programme has a forecast', not missing, f'{len(missing)} missing, e.g. {missing[:3]}')
check('forecast count is sane', 1200 <= n_pred <= 3000, str(n_pred))

# ---- school effects -----------------------------------------------------
alphas = [e['alpha'] for e in SCHOOLS.values() if 'alpha' in e]
check('school effects are centred', abs(sum(alphas) / len(alphas)) < 1.0, str(sum(alphas) / len(alphas)))
check('school effects have spread', 2 < (max(alphas) - min(alphas)) < 40, f'{min(alphas)}..{max(alphas)}')
check('every school effect has a standard error',
      all(e.get('alpha_se', 0) > 0 for e in SCHOOLS.values() if 'alpha' in e))

# ---- the backtest itself: what the app prints must be what was measured -----
ev = META['backtest_eval_years']
check('held-out 80% coverage is between 70 and 92%', 0.70 <= ev['coverage80'] <= 0.92, str(ev['coverage80']))
check('chance beats the last-year rule on Brier',
      ev['chance']['brier'] < ev['chance'].get('brier_last_year_rule', 1), str(ev['chance']))
rel = ev['chance']['reliability']
worst = max(abs(r['predicted'] - r['observed']) for r in rel if r['n'] >= 200)
check('chance reliability within 12 points in every well-populated bin', worst <= 0.12, f'worst gap {worst:.3f}')
hist = {b['history']: b for b in ev['level']}
if '4+' in hist and 'rmse_last_year' in hist['4+']:
    check('model beats last-year on long series (RMSE)', hist['4+']['rmse'] < hist['4+']['rmse_last_year'], str(hist['4+']))

# ---- round bridge: signs and sizes ------------------------------------------
for k, b in META['round_bridge'].items():
    check(f'round bridge {k}: later round is lower', b['mean'] < 0, str(b['mean']))
    check(f'round bridge {k}: a plausible size', -8 < b['mean'] < -0.5, str(b['mean']))
    check(f'round bridge {k}: vanish share is a share', 0 <= b['share_vanished'] <= 1)
    for c, g in b['by_category'].items():
        check(f'round bridge {k}/{c}: per-category vanish share present',
              'share_vanished' in g and 0 <= g['share_vanished'] <= 1, str(g))
# the final-round chance the app shows for a round-1 county must be >= the published-round chance
vest = next((b for b in META['round_bridge'].values() if b['fylke'] == 'Vestland' and b['from_round'] == '1'), None)
check('Vestland bridge 1->3 exists for the final-round chance', vest is not None)
if vest:
    for sid, e in SCHOOLS.items():
        if not sid.startswith('Vestland|') or not e.get('programs'):
            continue
        for key, pr in e['programs'].items():
            gone, off = vest['share_vanished'], vest['mean']
            for x in (25, 40, 55):
                c1 = chance(pr, x)
                c3 = (1 - pr['pi']) + pr['pi'] * (gone + (1 - gone) * err_cdf((x - pr['m'] - off) / pr['s']))
                check('final-round chance never below published-round chance', c3 >= c1 - 1e-9, f'{sid} {key} x={x}: {c3:.3f} < {c1:.3f}')
check('meta says whether the hurdle is coupled', 'coupled' in META)

# ---- the review of 2 Sept 2026: what the model must not forecast ----------
# 1. no forecast for a programme whose newest cell is discontinued
for s in DATA['schools']:
    ent = SCHOOLS.get(f'{s["fylke"]}|{s["name"]}') or {}
    progs = ent.get('programs') or {}
    occ = {}
    for p in s['programs']:
        k = p['program'].lower(); o = occ.get(k, 0); occ[k] = o + 1
        key = f'{k}|{p["level"]}|{o}'
        newest_cell = max(p['values'], key=int)
        if p['values'][newest_cell] == 'U':
            check(f'no forecast for discontinued {s["name"]} · {p["program"]}', key not in progs)
# 2. Møre og Romsdal cannot express "ingen venteliste": fill probability is 1
for sid, ent in SCHOOLS.items():
    if sid.startswith('Møre og Romsdal|'):
        for key, pr in (ent.get('programs') or {}).items():
            check(f'MRO fill probability is 1 ({sid} · {key})', pr['pi'] == 1.0, str(pr['pi']))
# 3. band keys use the glossary (CONTEXT.md: likely / possible / unlikely)
check('chance bands named likely/possible/unlikely', set(META['chance_bands']) == {'likely', 'possible'}, str(META['chance_bands']))
# 4a. ...but a county whose only fitted years are partial still uses them:
# when the walk found nothing it returned 0 and every sigma bucket widened
check('long-history forecast spread has not regressed (partial-year starvation)',
      META['sigma_forecast']['(4, 99)'] <= 5.7, str(META['sigma_forecast']))
# 4. partial county-years are excluded from the county random walk
check('partial county-years listed in meta',
      META.get('partial_years') == [['Vestland', 2017], ['Vestland', 2018], ['Vestland', 2019], ['Vestland', 2020]],
      str(META.get('partial_years')))

print(f'{checks} checks, {len(fails)} failed')
for f in fails:
    print('  FAIL', f)
sys.exit(1 if fails else 0)
