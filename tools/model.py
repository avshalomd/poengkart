#!/usr/bin/env python3
"""Fit the threshold model and write web/data/model.json.

    .venv/bin/python3 tools/model.py            # fit + walk-forward backtest
    .venv/bin/python3 tools/model.py --quick    # fit only (no backtest)

WHAT IS MODELLED
----------------
A threshold is the score of the marginal admitted applicant — it exists only if
the programme filled, and when it exists it is a point on the points scale. Two
questions, two models, sharing a structure:

  level   (Tobit-style, on the cells that have a number)
          y = mu + school + category + programme|level + series + county*year
              + round offset + noise                                  (1)

  fill    (logistic, on every cell that competed on points)
          logit P(filled) = nu + school + category + programme|level
              + series + county*year + round-3 shift                  (2)

Every effect is a random effect (ridge-penalised), so a school or programme
with one year of data borrows its level from the hundreds of similar ones
around it instead of being trusted on its own; county*year is a random walk,
so a county's market level moves smoothly and the newest year is the forecast.
Variance components are estimated by a few steps of the usual normal-normal
EM approximation, and observations are down-weighted with age (half-life
chosen by the backtest) so the forecast follows recent years.

Cells: a number > 0 enters (1) and counts as filled in (2). 'open' (no
waitlist) enters (2) only — it is a state, not a low number. 0,0 counts as
filled in (2) and stays out of (1): it is the bottom of the scale, not a
height on it, which is the same rule the app applies. F, D and U never
competed on points and enter neither.

ROUNDS
------
Counties publish different intake rounds. Within a county the round is fixed,
so it is absorbed by the county level and does not need to be known. The one
exception is Vestland 2023 (3. inntak inside a 1. inntak series); that year
gets a fixed offset per category, measured on Vestland's own 1./3. inntak
pairs (`values_r3`), so the random walk does not learn the dip as a market
event. The pairs are also reported as the measured "round bridge".

CHANCE
------
For an applicant with x points, next year, at one programme:

  P(place) = (1 - pi) + pi * Phi((x - m) / s)                         (3)

pi from (2), m from (1) projected one year ahead, and s NOT the model's own
residual sd but the spread of the walk-forward forecast errors, bucketed by
how many years the series had — the model's posterior is overconfident and
the backtest says by how much. The reliability of (3) is then checked on the
held-out years and written into the output, so the app can print it.

Output: web/data/model.json — per school the mix-adjusted level and per
programme the forecast (m, s, pi) for the county's next publication year;
plus the backtest, calibration and round-bridge tables under "meta".
"""

import json
import math
import os
import sys
import time
import collections

import numpy as np
import scipy.sparse as sp
from scipy.optimize import minimize
from scipy.special import ndtr, expit

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'web', 'data', 'schools.json')
OUT = os.path.join(HERE, '..', 'web', 'data', 'model.json')

# walk-forward: predict each of these years from everything published before it
BACKTEST_YEARS = list(range(2020, 2027))
CALIB_YEARS = {2020, 2021, 2022, 2023, 2024}    # tune the error spread here...
EVAL_YEARS = {2025, 2026}                        # ...and report honesty here
HALFLIVES = [1.5, 2.5, 4.0, None]                # years; None = no decay
HIST_BUCKETS = [(0, 0), (1, 1), (2, 3), (4, 99)]  # years of history a series had
CHANCE_GRID = [20, 25, 30, 35, 40, 45, 50, 55]   # applicant points for reliability


# ----------------------------------------------------------------- observations
def is_num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and v > 0


def load_obs(data):
    """Flatten schools.json into one row per (series, year) that competed on points."""
    cy = {c['fylke']: c for c in data['counties']}
    newest = collections.defaultdict(int)
    rows, pairs = [], []
    for si, s in enumerate(data['schools']):
        occ_seen = {}
        for p in s['programs']:
            k = p['program'].lower()
            occ = occ_seen.get(k, 0)
            occ_seen[k] = occ + 1
            key = f'{k}|{p["level"]}|{occ}'
            sid = f'{s["fylke"]}|{s["name"]}'
            for y, v in p['values'].items():
                y = int(y)
                newest[s['fylke']] = max(newest[s['fylke']], y)
                state = 'num' if is_num(v) else 'zero' if v == 0 else 'open' if v == 'open' else None
                if state is None:
                    continue
                rnd = (cy[s['fylke']].get('round_years') or {}).get(str(y)) or cy[s['fylke']].get('round')
                rows.append(dict(school=sid, fylke=s['fylke'], series=f'{sid}|{key}',
                                 prog=f'{k}|{p["level"]}', cat=p['category'], year=y,
                                 state=state, v=float(v) if state == 'num' else None,
                                 round=rnd, r3=int(rnd == '3' and cy[s['fylke']].get('round') != '3')))
            # the alternate-round pairs, for the round bridge
            for alt, r_alt in (('values_r1', '1'), ('values_r3', '3')):
                for y, va in (p.get(alt) or {}).items():
                    vm = p['values'].get(y)
                    st = lambda v: 'num' if is_num(v) else 'zero' if v == 0 else 'open' if v == 'open' else None
                    if st(vm) is None or st(va) is None:
                        continue
                    main_round = (cy[s['fylke']].get('round_years') or {}).get(str(y)) or cy[s['fylke']].get('round')
                    if main_round == r_alt:
                        continue            # the same round twice says nothing
                    pairs.append(dict(fylke=s['fylke'], cat=p['category'], year=int(y),
                                      main_round=main_round, alt_round=r_alt,
                                      vm=float(vm) if st(vm) == 'num' else None, main_state=st(vm),
                                      va=float(va) if st(va) == 'num' else None, alt_state=st(va)))
    return rows, pairs, dict(newest)


# ----------------------------------------------------------------- round bridge
def round_bridge(pairs):
    """Offsets between rounds, from cells published in two rounds the same year.

    Reported conditional on the queue surviving into the later round (the
    numeric pairs), together with how often it did not: a later round is both
    a lower cutoff and, often, no cutoff at all."""
    out = {}
    for (f, mr, ar), grp in groupby(pairs, lambda q: (q['fylke'], q['main_round'], q['alt_round'])).items():
        # orient every pair as (earlier round, later round)
        later_is_alt = int(ar) > int(mr)
        def early_late(q):
            return (q['vm'], q['main_state'], q['va'], q['alt_state']) if later_is_alt \
                else (q['va'], q['alt_state'], q['vm'], q['main_state'])
        el = [early_late(q) for q in grp]
        # d = later minus earlier, negative when places freed up; only where both
        # rounds still had a queue
        num = [(q, e) for q, e in zip(grp, el) if e[1] == 'num' and e[3] == 'num']
        d = [e[2] - e[0] for _, e in num]
        # the queue that was there in the earlier round and gone in the later one
        had_queue = [e for e in el if e[1] in ('num', 'zero')]
        vanished = [e for e in had_queue if e[3] == 'open']
        by_cat = {}
        for c, g in groupby(num, lambda qe: qe[0]['cat']).items():
            dd = [e[2] - e[0] for _, e in g]
            hq = [e for q, e in zip(grp, el) if q['cat'] == c and e[1] in ('num', 'zero')]
            by_cat[c] = dict(n=len(dd), mean=round(float(np.mean(dd)), 2), n_had_queue=len(hq),
                             share_vanished=round(sum(e[3] == 'open' for e in hq) / max(1, len(hq)), 3))
        out[f'{f}:{min(mr, ar)}->{max(mr, ar)}'] = dict(
            fylke=f, from_round=min(mr, ar), to_round=max(mr, ar),
            n_pairs=len(num), mean=round(float(np.mean(d)), 2), sd=round(float(np.std(d)), 2),
            n_had_queue=len(had_queue), n_vanished=len(vanished),
            share_vanished=round(len(vanished) / max(1, len(had_queue)), 3),
            by_category=by_cat)
    return out


def groupby(items, key):
    g = collections.OrderedDict()
    for it in items:
        g.setdefault(key(it), []).append(it)
    return g


# --------------------------------------------------------------------- fitting
class Design:
    """Sparse one-hot design over named factors, with a quadratic penalty each.

    kinds: 'fixed' (tiny ridge, for identifiability), 'ridge' (random effect,
    variance tau^2), 'rw' (random walk along t within group, innovation variance
    tau^2, plus a weak ridge on the level)."""

    def __init__(self, n):
        self.n = n
        self.factors = []          # name, kind, levels(list), index per obs
        self.cols = []

    def add(self, name, keys, kind, tau=1.0):
        levels = sorted(set(keys), key=lambda k: (str(type(k)), k))
        idx = {k: i for i, k in enumerate(levels)}
        self.factors.append(dict(name=name, kind=kind, levels=levels, tau=tau,
                                 ix=np.array([idx[k] for k in keys])))

    def add_cov(self, name, values):
        """One continuous column with a free coefficient (tiny ridge)."""
        self.factors.append(dict(name=name, kind='fixed', levels=[0], tau=1.0,
                                 ix=np.zeros(self.n, dtype=int), cov=np.asarray(values, dtype=float)))

    def build(self):
        blocks, start = [], 0
        self.slices = {}
        for f in self.factors:
            m = len(f['levels'])
            vals = f['cov'] if 'cov' in f else np.ones(self.n)
            X = sp.csr_matrix((vals, (np.arange(self.n), f['ix'])), shape=(self.n, m))
            blocks.append(X)
            self.slices[f['name']] = slice(start, start + m)
            start += m
        self.X = sp.hstack(blocks).tocsr()
        self.p = start
        return self

    def penalty(self):
        """Block-diagonal precision matrix P such that penalty = 0.5 b'Pb."""
        blocks = []
        for f in self.factors:
            m = len(f['levels'])
            if f['kind'] == 'fixed':
                blocks.append(sp.identity(m) * 1e-6)
            elif f['kind'] == 'ridge':
                blocks.append(sp.identity(m) / f['tau'] ** 2)
            elif f['kind'] == 'rw':
                # levels are (group, t) tuples sorted by group then t
                rows, cols, vals = [], [], []
                r = 0
                for i in range(1, m):
                    g0, t0 = f['levels'][i - 1]
                    g1, t1 = f['levels'][i]
                    if g0 == g1:
                        rows += [r, r]; cols += [i - 1, i]; vals += [-1.0, 1.0]; r += 1
                D = sp.csr_matrix((vals, (rows, cols)), shape=(max(r, 1), m))
                blocks.append((D.T @ D) / f['tau'] ** 2 + sp.identity(m) * 1e-4)
        return sp.block_diag(blocks).tocsr()

    def coef(self, b, name):
        f = next(f for f in self.factors if f['name'] == name)
        return dict(zip(f['levels'], b[self.slices[name]]))


def fit_gaussian(design, y, w, offset, iters=3):
    """Penalised least squares with estimated sigma and EM-updated taus."""
    X, n = design.X, design.n
    b = np.zeros(design.p); log_sig = math.log(5.0)
    for it in range(iters):
        P = design.penalty()

        def f(theta):
            bb, ls = theta[:-1], theta[-1]
            sig2 = math.exp(2 * ls)
            r = y - (X @ bb + offset)
            nll = 0.5 * np.sum(w * r * r) / sig2 + ls * np.sum(w) + 0.5 * bb @ (P @ bb)
            g_b = -(X.T @ (w * r)) / sig2 + P @ bb
            g_ls = -np.sum(w * r * r) / sig2 + np.sum(w)
            return nll, np.append(g_b, g_ls)

        with np.errstate(all='ignore'):
            res = minimize(f, np.append(b, log_sig), jac=True, method='L-BFGS-B',
                           bounds=[(None, None)] * design.p + [(math.log(0.5), math.log(30))],
                           options=dict(maxiter=3000, maxfun=6000))
        b, log_sig = res.x[:-1], res.x[-1]
        update_taus(design, b, w / math.exp(2 * log_sig))
    return b, math.exp(log_sig)


def fit_logit(design, y, w, offset, iters=3):
    X = design.X
    b = np.zeros(design.p)
    for it in range(iters):
        P = design.penalty()

        def f(bb):
            eta = X @ bb + offset
            pi = expit(eta)
            # numerically safe log-likelihood
            ll = np.sum(w * (y * eta - np.logaddexp(0, eta)))
            nll = -ll + 0.5 * bb @ (P @ bb)
            g = -(X.T @ (w * (y - pi))) + P @ bb
            return nll, g

        with np.errstate(all='ignore'):
            res = minimize(f, b, jac=True, method='L-BFGS-B', options=dict(maxiter=3000, maxfun=6000))
        b = res.x
        pi = expit(X @ b + offset)
        update_taus(design, b, w * pi * (1 - pi))
    return b


def update_taus(design, b, h):
    """EM-style variance components: tau^2 = mean(effect^2 + approx posterior var)."""
    for f in design.factors:
        if f['kind'] == 'fixed':
            continue
        m = len(f['levels'])
        sl = design.slices[f['name']]
        eff = b[sl]
        info = np.bincount(f['ix'], weights=h, minlength=m)
        post_var = 1.0 / (info + 1.0 / f['tau'] ** 2)
        if f['kind'] == 'ridge':
            f['tau'] = max(0.3, math.sqrt(float(np.mean(eff ** 2 + post_var))))
        else:   # rw: innovations between consecutive years of the same group
            d = [(eff[i] - eff[i - 1]) ** 2 + post_var[i] + post_var[i - 1]
                 for i in range(1, m) if f['levels'][i][0] == f['levels'][i - 1][0]]
            f['tau'] = max(0.3, math.sqrt(float(np.mean(d)))) if d else f['tau']


# ------------------------------------------------------------------ the model
class Model:
    def __init__(self, rows, bridge, halflife, newest, couple=False):
        self.rows = rows
        self.halflife = halflife
        self.newest = newest            # per county, newest year in THIS fit
        # couple=True: the hurdle gets the level model's school effect as a
        # covariate, so "in demand" is one trait read two ways — a school with
        # high thresholds is also one whose programmes fill. A plug-in stand-in
        # for a correlated random-effects prior; chosen by the backtest.
        self.couple = couple
        # Vestland 2023 offset (3. inntak in a 1. inntak series), per category,
        # from the measured bridge; falls back to the county mean
        v = bridge.get('Vestland:1->3') or {}
        self.r3_off = {c: g['mean'] for c, g in (v.get('by_category') or {}).items()}
        self.r3_mean = v.get('mean', -3.0)

    def weights(self, rows):
        if self.halflife is None:
            return np.ones(len(rows))
        return np.array([0.5 ** ((self.newest[r['fylke']] - r['year']) / self.halflife) for r in rows])

    def offsets(self, rows):
        return np.array([self.r3_off.get(r['cat'], self.r3_mean) if r['r3'] else 0.0 for r in rows])

    def design(self, rows, hurdle, alpha=None):
        d = Design(len(rows))
        d.add('mu', [0] * len(rows), 'fixed')
        d.add('school', [r['school'] for r in rows], 'ridge', 4.0)
        d.add('cat', [r['cat'] for r in rows], 'fixed')
        d.add('prog', [r['prog'] for r in rows], 'ridge', 3.0)
        d.add('series', [r['series'] for r in rows], 'ridge', 3.0)
        d.add('cy', [(r['fylke'], r['year']) for r in rows], 'rw', 1.0)
        if hurdle:
            d.add('r3', [r['r3'] for r in rows], 'fixed')
            if alpha is not None:
                d.add_cov('alpha', [alpha.get(r['school'], 0.0) for r in rows])
        return d.build()

    def fit(self):
        lv = [r for r in self.rows if r['state'] == 'num']
        self.dl = self.design(lv, False)
        self.bl, self.sigma = fit_gaussian(self.dl, np.array([r['v'] for r in lv]),
                                           self.weights(lv), self.offsets(lv))
        hz = [r for r in self.rows]          # num + zero + open
        alpha = self.dl.coef(self.bl, 'school') if self.couple else None
        self.dh = self.design(hz, True, alpha)
        self.bh = fit_logit(self.dh, np.array([float(r['state'] != 'open') for r in hz]),
                            self.weights(hz), np.zeros(len(hz)))
        self.n_level, self.n_fill = len(lv), len(hz)
        return self

    def _effects(self, d, b):
        return {f['name']: d.coef(b, f['name']) for f in d.factors}

    def predict(self, school, fylke, prog, cat, series, year):
        """(m, pi) for one series in `year`; effects unseen in the fit are 0."""
        el, eh = self._effects_cached()
        def g(e, name, key):
            return e[name].get(key, 0.0)
        def cy(e, f, y):
            # random-walk forecast: the newest fitted year of that county
            ys = [yy for (ff, yy) in e['cy'] if ff == f and yy <= y]
            return e['cy'][(f, max(ys))] if ys else 0.0
        m = (g(el, 'mu', 0) + g(el, 'school', school) + g(el, 'cat', cat) + g(el, 'prog', prog)
             + g(el, 'series', series) + cy(el, fylke, year))
        eta = (g(eh, 'mu', 0) + g(eh, 'r3', 0) + g(eh, 'school', school) + g(eh, 'cat', cat)
               + g(eh, 'prog', prog) + g(eh, 'series', series) + cy(eh, fylke, year))
        if self.couple:
            eta += g(eh, 'alpha', 0) * g(el, 'school', school)
        return m, float(expit(eta))

    def _effects_cached(self):
        if not hasattr(self, '_ec'):
            self._ec = (self._effects(self.dl, self.bl), self._effects(self.dh, self.bh))
        return self._ec

    def school_effects(self):
        """Mix-adjusted school level with an approximate standard error."""
        el, _ = self._effects_cached()
        f = next(f for f in self.dl.factors if f['name'] == 'school')
        w = self.weights([r for r in self.rows if r['state'] == 'num'])
        info = np.bincount(f['ix'], weights=w / self.sigma ** 2, minlength=len(f['levels']))
        se = np.sqrt(1.0 / (info + 1.0 / f['tau'] ** 2))
        n = np.bincount(f['ix'], minlength=len(f['levels']))
        return {lv: dict(alpha=float(el['school'][lv]), se=float(se[i]), n=int(n[i]))
                for i, lv in enumerate(f['levels'])}


def hist_bucket(h):
    for i, (lo, hi) in enumerate(HIST_BUCKETS):
        if lo <= h <= hi:
            return i
    return len(HIST_BUCKETS) - 1


def chance(x, m, s, pi, zq=None):
    """P(place) for x points: no queue, or a queue whose cutoff lands below x.

    zq is the quantile table of standardised walk-forward errors (v - m) / s.
    With it, P(cutoff <= x) is the empirical share of forecast errors at or
    below (x - m) / s — the tails as they actually were, which a bell curve
    understates on the low side. Without it, Gaussian."""
    z = (x - m) / s
    if zq is None:
        return (1 - pi) + pi * float(ndtr(z))
    return (1 - pi) + pi * float(ecdf(z, zq))


ZQ_GRID = np.linspace(0, 1, 41)          # 41 quantiles: 0, 2.5, 5, ... 100 %


def ecdf(z, zq):
    """Linear interpolation of the quantile table, clamped just inside (0, 1)."""
    return float(np.clip(np.interp(z, zq, ZQ_GRID), 0.005, 0.995))


def error_quantiles(preds, sig_by_bucket):
    z = [(p['v'] - p['m']) / sig_by_bucket[hist_bucket(p['hist'])]
         for p in preds if p['state'] == 'num' and p['T'] in CALIB_YEARS]
    return [round(float(q), 3) for q in np.quantile(z, ZQ_GRID)]


# -------------------------------------------------------------------- backtest
def walk_forward(rows, bridge, halflife, newest_all, couple=False):
    """Fit on years < T, predict year T, for every T in BACKTEST_YEARS."""
    preds = []
    for T in BACKTEST_YEARS:
        train = [r for r in rows if r['year'] < T]
        # Vestland 2023 was published from 3. inntak inside a 1. inntak series;
        # no earlier year can teach a forecast what that does to the figures,
        # and the final fit handles it with a fixed offset. Scoring those cells
        # would grade the model on an event it is told about, not one it missed.
        test = [r for r in rows if r['year'] == T and not r['r3']]
        if not test:
            continue
        newest = collections.defaultdict(int)
        for r in train:
            newest[r['fylke']] = max(newest[r['fylke']], r['year'])
        m = Model(train, bridge, halflife, newest, couple).fit()
        hist = collections.Counter(r['series'] for r in train if r['state'] == 'num')
        last = {}
        for r in sorted(train, key=lambda r: r['year']):
            if r['state'] == 'num':
                last[r['series']] = r['v']
        pmean = collections.defaultdict(list)      # programme-county mean, baseline
        for r in train:
            if r['state'] == 'num':
                pmean[(r['fylke'], r['prog'])].append(r['v'])
        pm = {k: float(np.mean(v)) for k, v in pmean.items()}
        for r in test:
            mm, pi = m.predict(r['school'], r['fylke'], r['prog'], r['cat'], r['series'], T)
            preds.append(dict(T=T, series=r['series'], state=r['state'], v=r['v'], m=mm, pi=pi,
                              hist=hist.get(r['series'], 0), last=last.get(r['series']),
                              pm=pm.get((r['fylke'], r['prog'])), cat=r['cat'], fylke=r['fylke']))
        print(f'  backtest {T}: train {len(train)} test {len(test)}  sigma {m.sigma:.2f}')
    return preds


def summarise(preds, sig_by_bucket, zq=None):
    """Error spread by history bucket, baselines, hurdle scores, chance reliability."""
    out = {}
    num = [p for p in preds if p['state'] == 'num']
    # level forecast error, model vs baselines, by bucket
    buckets = []
    for i, (lo, hi) in enumerate(HIST_BUCKETS):
        g = [p for p in num if hist_bucket(p['hist']) == i]
        if not g:
            continue
        e = np.array([p['v'] - p['m'] for p in g])
        row = dict(history=f'{lo}' if lo == hi else f'{lo}-{hi}' if hi < 99 else f'{lo}+',
                   n=len(g), rmse=round(float(np.sqrt(np.mean(e ** 2))), 2),
                   bias=round(float(np.mean(e)), 2), sd=round(float(np.std(e)), 2),
                   within3=round(float(np.mean(np.abs(e) <= 3)), 3))
        gl = [p for p in g if p['last'] is not None]
        if gl:
            el = np.array([p['v'] - p['last'] for p in gl])
            row['rmse_last_year'] = round(float(np.sqrt(np.mean(el ** 2))), 2)
            row['within3_last_year'] = round(float(np.mean(np.abs(el) <= 3)), 3)
        gp = [p for p in g if p['pm'] is not None]
        if gp:
            ep = np.array([p['v'] - p['pm'] for p in gp])
            row['rmse_prog_mean'] = round(float(np.sqrt(np.mean(ep ** 2))), 2)
        buckets.append(row)
    out['level'] = buckets
    e = np.array([p['v'] - p['m'] for p in num])
    out['level_all'] = dict(n=len(num), rmse=round(float(np.sqrt(np.mean(e ** 2))), 2),
                            within3=round(float(np.mean(np.abs(e) <= 3)), 3))
    # 80% interval coverage with the calibrated spread
    cov = [abs(p['v'] - p['m']) <= 1.2816 * sig_by_bucket[hist_bucket(p['hist'])] for p in num]
    out['coverage80'] = round(float(np.mean(cov)), 3)
    # hurdle
    y = np.array([float(p['state'] != 'open') for p in preds])
    pi = np.array([p['pi'] for p in preds])
    base = float(np.mean(y))
    out['fill'] = dict(n=len(preds), brier=round(float(np.mean((y - pi) ** 2)), 4),
                       brier_base_rate=round(float(np.mean((y - base) ** 2)), 4),
                       base_rate=round(base, 3))
    # hurdle reliability: does "will fill" happen as often as said
    out['fill']['reliability'] = reliability(pi, y)
    # chance reliability over a grid of applicant scores
    pg, pe, oo, pl = [], [], [], []
    for p in preds:
        s = sig_by_bucket[hist_bucket(p['hist'])]
        for x in CHANCE_GRID:
            got = 1.0 if p['state'] in ('open', 'zero') else float(x >= p['v'])
            pg.append(chance(x, p['m'], s, p['pi']))
            pe.append(chance(x, p['m'], s, p['pi'], zq) if zq else None)
            oo.append(got)
            # baseline: last year's figure is the cutoff
            if p['last'] is not None:
                pl.append((float(x >= p['last']), got))
    pg, oo = np.array(pg), np.array(oo)
    out['chance_gaussian'] = dict(brier=round(float(np.mean((pg - oo) ** 2)), 4),
                                  reliability=reliability(pg, oo))
    if zq:
        pe = np.array(pe, dtype=float)
        out['chance'] = dict(brier=round(float(np.mean((pe - oo) ** 2)), 4),
                             reliability=reliability(pe, oo))
    else:
        out['chance'] = out['chance_gaussian']
    if pl:
        pl = np.array(pl)
        out['chance']['brier_last_year_rule'] = round(float(np.mean((pl[:, 0] - pl[:, 1]) ** 2)), 4)
        out['chance']['n_last_year_rule'] = int(len(pl))
    return out


def reliability(pred, obs):
    pred, obs = np.asarray(pred, dtype=float), np.asarray(obs, dtype=float)
    bins = np.clip((pred * 10).astype(int), 0, 9)
    rel = []
    for b in range(10):
        mask = bins == b
        if mask.sum():
            rel.append(dict(bin=f'{b * 10}-{b * 10 + 10}', n=int(mask.sum()),
                            predicted=round(float(pred[mask].mean()), 3),
                            observed=round(float(obs[mask].mean()), 3)))
    return rel


def calibrate_fill(preds):
    """Platt scaling for the fill probability: logit p' = a + b logit p.

    The hurdle's series effects make it sure of itself (a programme that filled
    four years running gets p = 0.97), but queues vanish more often than that —
    in the held-out years programmes given 0.97 filled 0.82 of the time. Two
    numbers fitted on the walk-forward forecasts for the calibration years
    pull the extremes in; reported, and checked on the held-out years."""
    g = [p for p in preds if p['T'] in CALIB_YEARS]
    y = np.array([float(p['state'] != 'open') for p in g])
    lp = np.array([math.log(max(p['pi'], 1e-6) / max(1 - p['pi'], 1e-6)) for p in g])

    def nll(ab):
        eta = ab[0] + ab[1] * lp
        return float(np.sum(np.logaddexp(0, eta) - y * eta))
    res = minimize(nll, np.array([0.0, 1.0]), method='Nelder-Mead')
    return dict(a=round(float(res.x[0]), 4), b=round(float(res.x[1]), 4))


def recal(pi, fc):
    lp = math.log(max(pi, 1e-6) / max(1 - pi, 1e-6))
    return float(expit(fc['a'] + fc['b'] * lp))


def calibrate_sigma(preds, model_sigma):
    """Spread of forecast errors per history bucket, from the calibration years."""
    sig = {}
    for i in range(len(HIST_BUCKETS)):
        e = [p['v'] - p['m'] for p in preds if p['state'] == 'num' and p['T'] in CALIB_YEARS
             and hist_bucket(p['hist']) == i]
        sig[i] = float(np.sqrt(np.mean(np.square(e)))) if len(e) >= 30 else None
    # fill gaps from neighbours, never below the model's own residual sd
    vals = [v for v in sig.values() if v]
    for i in sig:
        if sig[i] is None:
            sig[i] = max(vals) if vals else model_sigma
        sig[i] = max(sig[i], model_sigma)
    return sig


# ------------------------------------------------------------------------ main
def main():
    quick = '--quick' in sys.argv
    t0 = time.time()
    data = json.load(open(SRC))
    rows, pairs, newest = load_obs(data)
    print(f'{len(rows)} cells competed on points ({sum(r["state"] == "num" for r in rows)} numeric, '
          f'{sum(r["state"] == "open" for r in rows)} open, {sum(r["state"] == "zero" for r in rows)} zero); '
          f'{len(pairs)} alternate-round pairs')
    bridge = round_bridge(pairs)
    for k, b in bridge.items():
        print(f'  bridge {k}: {b["mean"]:+.2f} ± {b["sd"]:.2f} on {b["n_pairs"]} pairs; '
              f'queue vanished in {b["share_vanished"]:.0%} of {b["n_had_queue"]} that had one')

    # ---- choose the half-life and calibrate the spread by walk-forward
    best, preds_best, sig_best = None, None, None
    if not quick:
        hl_search = {}
        for hl in HALFLIVES:
            print(f'half-life {hl}:')
            preds = walk_forward(rows, bridge, hl, newest)
            # select on level RMSE over the calibration years only
            e = [p['v'] - p['m'] for p in preds if p['state'] == 'num' and p['T'] in CALIB_YEARS]
            rmse = float(np.sqrt(np.mean(np.square(e))))
            hl_search[str(hl)] = round(rmse, 3)
            print(f'  -> calibration-years RMSE {rmse:.3f}')
            if best is None or rmse < best[1]:
                best, preds_best = (hl, rmse), preds
        halflife = best[0]
        # ---- couple the hurdle to the level's school effect? decided by the
        # fill log-loss on the calibration years, after the same recalibration
        def fill_logloss(preds):
            fc = calibrate_fill(preds)
            g = [p for p in preds if p['T'] in CALIB_YEARS]
            y = np.array([float(p['state'] != 'open') for p in g])
            q = np.clip([recal(p['pi'], fc) for p in g], 1e-6, 1 - 1e-6)
            return float(-np.mean(y * np.log(q) + (1 - y) * np.log(1 - q)))
        print('coupled hurdle:')
        preds_c = walk_forward(rows, bridge, halflife, newest, couple=True)
        ll0, ll1 = fill_logloss(preds_best), fill_logloss(preds_c)
        print(f'  fill log-loss, calibration years: independent {ll0:.4f}  coupled {ll1:.4f}')
        couple = ll1 < ll0
        if couple:
            preds_best = preds_c
        hl_search['coupled_fill_logloss'] = dict(independent=round(ll0, 4), coupled=round(ll1, 4))
    else:
        halflife, couple, hl_search = 2.5, True, {}

    # ---- final fit on everything
    model = Model(rows, bridge, halflife, newest, couple).fit()
    print(f'final fit: sigma {model.sigma:.2f}, half-life {halflife}, '
          f'taus ' + ', '.join(f'{f["name"]}={f["tau"]:.2f}' for f in model.dl.factors if f['kind'] != 'fixed'))
    sig = calibrate_sigma(preds_best, model.sigma) if preds_best else {i: model.sigma * 1.25 for i in range(len(HIST_BUCKETS))}
    print('forecast spread by history bucket:', {HIST_BUCKETS[i]: round(v, 2) for i, v in sig.items()})

    meta = dict(built=time.strftime('%Y-%m-%d'), halflife=halflife, coupled=couple,
                sigma_model=round(model.sigma, 3),
                sigma_forecast={str(HIST_BUCKETS[i]): round(v, 2) for i, v in sig.items()},
                hist_buckets=HIST_BUCKETS, n_level=model.n_level, n_fill=model.n_fill,
                taus={f['name']: round(f['tau'], 3) for f in model.dl.factors if f['kind'] != 'fixed'},
                taus_fill={f['name']: round(f['tau'], 3) for f in model.dh.factors if f['kind'] != 'fixed'},
                round_bridge=bridge, target_year={f: y + 1 for f, y in newest.items()},
                chance_bands=dict(likely=0.70, realistic=0.35))
    zq = error_quantiles(preds_best, sig) if preds_best else None
    meta['error_quantiles'] = zq
    fc = calibrate_fill(preds_best) if preds_best else dict(a=0.0, b=1.0)
    meta['fill_calibration'] = fc
    print(f'fill recalibration: logit p\' = {fc["a"]:+.3f} + {fc["b"]:.3f} logit p')
    if preds_best:
        for p in preds_best:
            p['pi_raw'], p['pi'] = p['pi'], recal(p['pi'], fc)
    if preds_best:
        meta['backtest_calibration_years'] = summarise([p for p in preds_best if p['T'] in CALIB_YEARS], sig, zq)
        meta['backtest_eval_years'] = summarise([p for p in preds_best if p['T'] in EVAL_YEARS], sig, zq)
        meta['halflife_search'] = hl_search
        # every walk-forward forecast, for anyone who wants to check the claims
        import csv
        bt = os.path.join(HERE, '..', 'data', 'model-backtest.csv')
        with open(bt, 'w', newline='') as fh:
            w = csv.writer(fh)
            w.writerow(['year', 'fylke', 'school', 'program', 'level', 'category', 'state', 'actual',
                        'forecast', 'p_fill', 'p_fill_raw', 'history_years', 'last_year_value'])
            for p in preds_best:
                _, sch, prog, lvl, _occ = p['series'].split('|')
                w.writerow([p['T'], p['fylke'], sch, prog, lvl, p['cat'], p['state'],
                            p['v'] if p['v'] is not None else '', round(p['m'], 2), round(p['pi'], 3),
                            round(p.get('pi_raw', p['pi']), 3), p['hist'],
                            p['last'] if p['last'] is not None else ''])
        print(f'walk-forward forecasts -> {bt}')

    # ---- per-school, per-series forecasts
    se = model.school_effects()
    hist = collections.Counter(r['series'] for r in rows if r['state'] == 'num')
    last_year = {}
    for r in rows:
        last_year[r['series']] = max(last_year.get(r['series'], 0), r['year'])
    out_schools = {}
    ranks = sorted(se.items(), key=lambda kv: -kv[1]['alpha'])
    rank_of = {k: i + 1 for i, (k, _) in enumerate(ranks)}
    cy = {c['fylke']: c for c in data['counties']}
    for s in data['schools']:
        sid = f'{s["fylke"]}|{s["name"]}'
        T = newest[s['fylke']] + 1
        ent = dict(year=T, round=cy[s['fylke']].get('round'))
        if sid in se:
            ent.update(alpha=round(se[sid]['alpha'], 2), alpha_se=round(se[sid]['se'], 2),
                       alpha_n=se[sid]['n'], alpha_rank=rank_of[sid])
        progs = {}
        occ_seen = {}
        for p in s['programs']:
            k = p['program'].lower()
            occ = occ_seen.get(k, 0)
            occ_seen[k] = occ + 1
            key = f'{k}|{p["level"]}|{occ}'
            series = f'{sid}|{key}'
            # forecast only series still alive: seen in the county's newest
            # year or the one before (the app's own staleness rule)
            if series not in last_year or last_year[series] < newest[s['fylke']] - 1:
                continue
            m, pi = model.predict(sid, s['fylke'], f'{k}|{p["level"]}', p['category'], series, T)
            h = hist.get(series, 0)
            progs[key] = dict(m=round(m, 1), s=round(sig[hist_bucket(h)], 1), pi=round(recal(pi, fc), 3), h=h)
        if progs:
            ent['programs'] = progs
        out_schools[sid] = ent

    # cells the fitted model finds least plausible: the parser-QA hand-off.
    # The 2026-08 audit found its worst damage by brute-force re-extraction;
    # a large standardised residual finds the same class of damage for free.
    lv = [r for r in rows if r['state'] == 'num']
    fitted = model.dl.X @ model.bl + model.offsets(lv)
    z = (np.array([r['v'] for r in lv]) - fitted) / model.sigma
    order = np.argsort(-np.abs(z))[:25]
    meta['outliers'] = [dict(school=lv[i]['school'].split('|')[1], fylke=lv[i]['fylke'],
                             program=lv[i]['series'].split('|')[2], level=lv[i]['series'].split('|')[3],
                             year=lv[i]['year'], value=lv[i]['v'], fitted=round(float(fitted[i]), 1),
                             z=round(float(z[i]), 1)) for i in order]
    print('least plausible cells (|z| > 3):',
          sum(1 for i in range(len(z)) if abs(z[i]) > 3), 'of', len(z))
    for o in meta['outliers'][:8]:
        print(f'   z={o["z"]:+.1f}  {o["fylke"]} {o["school"]} · {o["program"]} {o["year"]}: {o["value"]} (fitted {o["fitted"]})')

    out = dict(meta=meta, schools=out_schools)
    json.dump(out, open(OUT, 'w'), ensure_ascii=False, separators=(',', ':'))
    n_pred = sum(len(e.get('programs', {})) for e in out_schools.values())
    print(f'\n{n_pred} programme forecasts for {sum(1 for e in out_schools.values() if e.get("programs"))} schools '
          f'-> {OUT} ({os.path.getsize(OUT) // 1024} KB, {time.time() - t0:.0f}s)')
    if preds_best:
        ev = meta['backtest_eval_years']
        print(f'held-out {sorted(EVAL_YEARS)}: level RMSE {ev["level_all"]["rmse"]} '
              f'(within 3: {ev["level_all"]["within3"]:.0%}), 80% coverage {ev["coverage80"]:.0%}, '
              f'chance Brier {ev["chance"]["brier"]} (gaussian {ev["chance_gaussian"]["brier"]}) '
              f'vs last-year rule {ev["chance"].get("brier_last_year_rule")}; '
              f'fill Brier {ev["fill"]["brier"]} vs base {ev["fill"]["brier_base_rate"]}')
        for r in ev['fill']['reliability']:
            print('    fill reliability', r)
        for b in ev['level']:
            print('   ', b)
        for r in ev['chance']['reliability']:
            print('    reliability', r)


if __name__ == '__main__':
    main()
