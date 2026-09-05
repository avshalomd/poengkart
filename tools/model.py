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
how many years the series had and scaled by the band the forecast falls in
(a queue cannot outgrow its applicants' scores, so high forecasts miss by
less) — the model's posterior is overconfident and the backtest says by how
much. The reliability of (3) is then checked on the
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

# Counties whose sources cannot say "everyone admitted" label every cell
# "filled" by construction. Those labels carry no information about queue
# formation, and worse: 1,790 of them once flattened the Platt recalibration
# for every other county (slope 0.36 with them, 0.43 without). Such a county
# is excluded from the fill fit and its calibration and its published fill
# probability is fixed at 1 (the output loop below): it can only ever fill,
# so its chance rests on the threshold alone. It trains the level model like
# any other. Møre og Romsdal sat here from 2 to 5 September 2026, until the
# county's own dashboard rule supplied a fill state (tools/extractors/mro.py:
# a figure under 25 is published as "ingen venteliste"). Nobody is here now;
# the mechanism stays for the next county that arrives without a marker.
FILL_BLIND = set()
# Counties whose "ingen venteliste" is a published rule rather than an
# observed queue state — a proxy label. What the proxy is worth is measured
# on every refit (meta.halflife_search.proxy_label_experiment): the fit and
# the Platt slope with the county in and out of the fill fit, the held-out
# fill Brier of the counties whose labels are observed either way, and the
# proxy county's own held-out fill Brier against its base rate.
PROXY_LABELS = {'Møre og Romsdal'}
FORECAST_BANDS = [(0, 25), (25, 30), (30, 35), (35, 40), (40, 45), (45, 99)]  # points; conditional coverage
BOOT = 1000                                       # cluster-bootstrap replicates for the held-out intervals
# County-years that are not what they look like: Hordaland 2017-19 is 15
# Bergen studiespesialisering cells stored under Vestland, Vestland 2020 is
# Vg1 only with no "ingen venteliste" cells. They stay in every school's
# history and in the series/programme effects, but they do not set where the
# county's random walk starts (decision of 2 Sept 2026, Q34).
PARTIAL_YEARS = {('Vestland', 2017), ('Vestland', 2018), ('Vestland', 2019), ('Vestland', 2020)}
BACKTEST_YEARS = list(range(2020, 2027))
CALIB_YEARS = {2020, 2021, 2022, 2023, 2024}    # tune the error spread here...
EVAL_YEARS = {2025, 2026}                        # ...and report honesty here
HALFLIVES = [1.5, 2.5, 4.0, None]                # years; None = no decay
HIST_BUCKETS = [(0, 0), (1, 1), (2, 3), (4, 99)]  # years of history a series had
EWMA_ALPHA = 0.4                                  # the exponential-smoothing baseline (Muth, 1960)
SINGLE_WEIGHTS = [1.0, 0.5, 0.25, 0.0]            # level-fit weight of a threshold one applicant set; backtest picks
LEVEL_SPREAD = True                               # spread conditioned on the forecast level as well as on history
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
            means = p.get('means') or {}           # Gjennomkar: Møre og Romsdal publishes it, nobody else
            for y, v in p['values'].items():
                mean = means.get(y)
                y = int(y)
                newest[s['fylke']] = max(newest[s['fylke']], y)
                state = 'num' if is_num(v) else 'zero' if v == 0 else 'open' if v == 'open' else None
                if state is None:
                    continue
                rnd = (cy[s['fylke']].get('round_years') or {}).get(str(y)) or cy[s['fylke']].get('round')
                rows.append(dict(school=sid, fylke=s['fylke'], series=f'{sid}|{key}',
                                 prog=f'{k}|{p["level"]}', cat=p['category'], year=y,
                                 state=state, v=float(v) if state == 'num' else None,
                                 round=rnd, r3=int(rnd == '3' and cy[s['fylke']].get('round') != '3'),
                                 partial=int((s['fylke'], y) in PARTIAL_YEARS),
                                 # the threshold IS the admitted mean: one applicant set it
                                 single=int(state == 'num' and mean is not None and abs(mean - float(v)) < 0.05)))
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
    def __init__(self, rows, bridge, halflife, newest, couple=False, fill_blind=None, single_w=1.0):
        self.rows = rows
        self.fill_blind = FILL_BLIND if fill_blind is None else fill_blind
        self.halflife = halflife
        self.single_w = single_w        # level-fit weight of a cell one applicant set (SINGLE_WEIGHTS)
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

    def weights(self, rows, single=True):
        age = (np.ones(len(rows)) if self.halflife is None else
               np.array([0.5 ** ((self.newest[r['fylke']] - r['year']) / self.halflife) for r in rows]))
        if not single or self.single_w == 1.0:
            return age
        # a threshold that equals the admitted mean is one applicant's score,
        # not a market price: it enters the level fit at `single_w`
        return age * np.where(np.array([r.get('single', 0) for r in rows]) > 0, self.single_w, 1.0)

    def offsets(self, rows):
        return np.array([self.r3_off.get(r['cat'], self.r3_mean) if r['r3'] else 0.0 for r in rows])

    def design(self, rows, hurdle, alpha=None):
        d = Design(len(rows))
        d.add('mu', [0] * len(rows), 'fixed')
        d.add('school', [r['school'] for r in rows], 'ridge', 4.0)
        d.add('cat', [r['cat'] for r in rows], 'fixed')
        d.add('prog', [r['prog'] for r in rows], 'ridge', 3.0)
        d.add('series', [r['series'] for r in rows], 'ridge', 3.0)
        # a partial county-year is one pooled level outside every walk: its
        # rows still train the other effects without moving the county
        d.add('cy', [('_partial', 0) if r['partial'] else (r['fylke'], r['year']) for r in rows], 'rw', 1.0)
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
        hz = [r for r in self.rows if r['fylke'] not in self.fill_blind]   # num + zero + open, labels informative
        alpha = self.dl.coef(self.bl, 'school') if self.couple else None
        self.dh = self.design(hz, True, alpha)
        self.bh = fit_logit(self.dh, np.array([float(r['state'] != 'open') for r in hz]),
                            self.weights(hz, single=False), np.zeros(len(hz)))
        self.n_level, self.n_fill = len(lv), len(hz)
        return self

    def _effects(self, d, b):
        return {f['name']: d.coef(b, f['name']) for f in d.factors}

    def predict(self, school, fylke, prog, cat, series, year):
        """(m, pi) for one series in `year`; effects unseen in the fit are 0."""
        el, eh = self._effects_cached()
        def g(e, name, key):
            return e[name].get(key, 0.0)
        def cy(e, f, y, pooled=False):
            # random-walk forecast: the newest fitted year of that county.
            # When a county has only partial years so far (Vestland in the
            # 2020 and 2021 folds) the pooled partial level is all there is
            # for the LEVEL: those cells are real thresholds. Their fill
            # labels are not information (Vestland 2020 has no "ingen
            # venteliste" cell by construction), so the fill walk stays at 0
            # rather than predicting that everything fills.
            ys = [yy for (ff, yy) in e['cy'] if ff == f and yy <= y]
            if ys:
                return e['cy'][(f, max(ys))]
            return e['cy'].get(('_partial', 0), 0.0) if pooled else 0.0
        m = (g(el, 'mu', 0) + g(el, 'school', school) + g(el, 'cat', cat) + g(el, 'prog', prog)
             + g(el, 'series', series) + cy(el, fylke, year, pooled=True))
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


def band_of(m):
    """The forecast band (FORECAST_BANDS label) a forecast level falls in."""
    for lo, hi in FORECAST_BANDS:
        if lo <= m < hi:
            return f'{lo}-{hi}' if hi < 99 else f'{lo}+'
    lo, hi = FORECAST_BANDS[0] if m < FORECAST_BANDS[0][0] else FORECAST_BANDS[-1]
    return f'{lo}-{hi}' if hi < 99 else f'{lo}+'


def spread(sig, h, m):
    """Forecast spread s for a series with h years of history forecast at m:
    the history bucket's walk-forward RMSE (floored, calibrate_sigma) times
    the level multiplier of the band m falls in (1 where not conditioned)."""
    return sig['hist'][hist_bucket(h)] * (sig['level'].get(band_of(m), 1.0) if sig.get('level') else 1.0)


def error_quantiles(preds, sig):
    z = [(p['v'] - p['m']) / spread(sig, p['hist'], p['m'])
         for p in preds if p['state'] == 'num' and p['T'] in CALIB_YEARS]
    return [round(float(q), 3) for q in np.quantile(z, ZQ_GRID)]


# -------------------------------------------------------------------- backtest
def walk_forward(rows, bridge, halflife, newest_all, couple=False, fill_blind=None, single_w=1.0):
    """Fit on years < T, predict year T, for every T in BACKTEST_YEARS."""
    preds, fit_sigmas = [], {}
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
        m = Model(train, bridge, halflife, newest, couple, fill_blind, single_w).fit()
        fit_sigmas[T] = m.sigma
        hist = collections.Counter(r['series'] for r in train if r['state'] == 'num')
        # two series-only baselines: last year's figure, and an exponentially
        # weighted mean of the series' own past figures (Muth, 1960) — the
        # smoothing that persistence and the programme mean are the ends of
        last, ew = {}, {}
        for r in sorted(train, key=lambda r: r['year']):
            if r['state'] == 'num':
                last[r['series']] = r['v']
                ew[r['series']] = (r['v'] if r['series'] not in ew
                                   else EWMA_ALPHA * r['v'] + (1 - EWMA_ALPHA) * ew[r['series']])
        pmean = collections.defaultdict(list)      # programme-county mean, baseline
        for r in train:
            if r['state'] == 'num':
                pmean[(r['fylke'], r['prog'])].append(r['v'])
        pm = {k: float(np.mean(v)) for k, v in pmean.items()}
        for r in test:
            mm, pi = m.predict(r['school'], r['fylke'], r['prog'], r['cat'], r['series'], T)
            preds.append(dict(T=T, series=r['series'], state=r['state'], v=r['v'], m=mm, pi=pi,
                              hist=hist.get(r['series'], 0), last=last.get(r['series']), ew=ew.get(r['series']),
                              pm=pm.get((r['fylke'], r['prog'])), cat=r['cat'], fylke=r['fylke'],
                              school=r['school']))
        print(f'  backtest {T}: train {len(train)} test {len(test)}  sigma {m.sigma:.2f}')
    return preds, fit_sigmas


def _wrmse(w, e):
    return math.sqrt(float(np.sum(w * e * e) / np.sum(w)))


def _wmean(w, x):
    return float(np.sum(w * x) / np.sum(w))


def cluster_bootstrap(cluster_keys, stats, B=BOOT, seed=20260905):
    """95% percentile intervals of each statistic under a cluster bootstrap.

    Cells in one school-year are not independent forecasts (a county-year
    innovation moves all of them), so clusters are resampled whole and each
    statistic is evaluated with the resulting per-cell weights. `stats` maps a
    name to f(weights)."""
    rng = np.random.default_rng(seed)
    keys = {k: i for i, k in enumerate(sorted(set(cluster_keys)))}
    c = np.array([keys[k] for k in cluster_keys])
    K = len(keys)
    vals = {k: [] for k in stats}
    for _ in range(B):
        w = np.bincount(rng.integers(0, K, K), minlength=K)[c].astype(float)
        for k, f in stats.items():
            vals[k].append(f(w))
    return {k: [round(float(v), 4) for v in np.percentile(vals[k], [2.5, 97.5])] for k in stats}


def summarise(preds, sig, zq=None, boot=0):
    """Error spread by history bucket, baselines, hurdle scores, chance
    reliability; with `boot` > 0, cluster-bootstrap intervals over
    school-years for the headline comparisons."""
    out, ci = {}, {}
    num = [p for p in preds if p['state'] == 'num']
    S = lambda p: spread(sig, p['hist'], p['m'])
    cl = lambda g: [(p['school'], p['T']) for p in g]
    arr = lambda g, f: np.array([f(p) for p in g], dtype=float)
    # level forecast error, model vs baselines, by bucket
    buckets = []
    for i, (lo, hi) in enumerate(HIST_BUCKETS):
        g = [p for p in num if hist_bucket(p['hist']) == i]
        if not g:
            continue
        h = f'{lo}' if lo == hi else f'{lo}-{hi}' if hi < 99 else f'{lo}+'
        e = arr(g, lambda p: p['v'] - p['m'])
        row = dict(history=h, n=len(g), rmse=round(float(np.sqrt(np.mean(e ** 2))), 2),
                   mae=round(float(np.mean(np.abs(e))), 2),
                   bias=round(float(np.mean(e)), 2), sd=round(float(np.std(e)), 2),
                   within3=round(float(np.mean(np.abs(e) <= 3)), 3))
        gl = [p for p in g if p['last'] is not None]
        if gl:
            el, em = arr(gl, lambda p: p['v'] - p['last']), arr(gl, lambda p: p['v'] - p['m'])
            row['rmse_last_year'] = round(float(np.sqrt(np.mean(el ** 2))), 2)
            row['mae_last_year'] = round(float(np.mean(np.abs(el))), 2)
            row['within3_last_year'] = round(float(np.mean(np.abs(el) <= 3)), 3)
            if boot:
                st = {'rmse': lambda w: _wrmse(w, em) - _wrmse(w, el),
                      'mae': lambda w: _wmean(w, np.abs(em)) - _wmean(w, np.abs(el)),
                      'within3': lambda w: _wmean(w, (np.abs(em) <= 3) * 1.0) - _wmean(w, (np.abs(el) <= 3) * 1.0)}
                r = cluster_bootstrap(cl(gl), st, boot)
                ci[f'level {h}: model minus persistence, rmse'] = r['rmse']
                ci[f'level {h}: model minus persistence, mae'] = r['mae']
                ci[f'level {h}: model minus persistence, within3'] = r['within3']
        ge = [p for p in g if p.get('ew') is not None]
        if ge:
            ee, eme = arr(ge, lambda p: p['v'] - p['ew']), arr(ge, lambda p: p['v'] - p['m'])
            row['rmse_ewma'] = round(float(np.sqrt(np.mean(ee ** 2))), 2)
            row['mae_ewma'] = round(float(np.mean(np.abs(ee))), 2)
            row['within3_ewma'] = round(float(np.mean(np.abs(ee) <= 3)), 3)
            if boot:
                ci[f'level {h}: model minus ewma, rmse'] = cluster_bootstrap(
                    cl(ge), {'d': lambda w: _wrmse(w, eme) - _wrmse(w, ee)}, boot)['d']
        gp = [p for p in g if p['pm'] is not None]
        if gp:
            ep, emp = arr(gp, lambda p: p['v'] - p['pm']), arr(gp, lambda p: p['v'] - p['m'])
            row['rmse_prog_mean'] = round(float(np.sqrt(np.mean(ep ** 2))), 2)
            # the baseline exists only where the programme was seen before in
            # that county; the model on the same cells is the fair comparison
            row['n_prog_mean'] = len(gp)
            row['rmse_model_on_prog_mean_cells'] = round(float(np.sqrt(np.mean(emp ** 2))), 2)
            if boot:
                ci[f'level {h}: model minus programme-county mean, rmse'] = cluster_bootstrap(
                    cl(gp), {'d': lambda w: _wrmse(w, emp) - _wrmse(w, ep)}, boot)['d']
        buckets.append(row)
    out['level'] = buckets
    e = arr(num, lambda p: p['v'] - p['m'])
    out['level_all'] = dict(n=len(num), rmse=round(float(np.sqrt(np.mean(e ** 2))), 2),
                            mae=round(float(np.mean(np.abs(e))), 2),
                            bias=round(float(np.mean(e)), 2),
                            within3=round(float(np.mean(np.abs(e) <= 3)), 3))
    # interval coverage with the calibrated spread: the Gaussian band the
    # application draws, and the empirical-quantile band the chance implies
    z = arr(num, lambda p: (p['v'] - p['m']) / S(p))
    cov80 = (np.abs(z) <= 1.2816) * 1.0
    out['coverage80'] = round(float(np.mean(cov80)), 3)
    out['interval_width80'] = round(float(np.mean(arr(num, lambda p: 2 * 1.2816 * S(p)))), 1)
    from scipy.stats import norm as _norm
    gauss = {str(c): round(float(np.mean(np.abs(z) <= _norm.ppf(0.5 + c / 200))), 3) for c in (50, 80, 90, 95)}
    out['coverage'] = dict(gaussian=gauss)
    if zq:
        pit = np.interp(z, zq, ZQ_GRID)
        out['coverage']['empirical'] = {str(c): round(float(np.mean((pit >= 0.5 - c / 200) & (pit <= 0.5 + c / 200))), 3)
                                        for c in (50, 80, 90, 95)}
        out['pit_histogram'] = [int(v) for v in np.histogram(pit, bins=10, range=(0, 1))[0]]
    by_band = []
    for lo, hi in FORECAST_BANDS:
        g = [p for p in num if lo <= p['m'] < hi]
        if not g:
            continue
        eg = arr(g, lambda p: p['v'] - p['m'])
        by_band.append(dict(band=f'{lo}-{hi}' if hi < 99 else f'{lo}+', n=len(g),
                            coverage80=round(float(np.mean(np.abs(eg / arr(g, S)) <= 1.2816)), 3),
                            rmse=round(float(np.sqrt(np.mean(eg ** 2))), 2),
                            bias=round(float(np.mean(eg)), 2),
                            s_mean=round(float(np.mean(arr(g, S))), 2)))
    out['coverage80_by_forecast'] = by_band
    out['coverage80_by_fylke'] = [dict(fylke=f, n=len(g),
                                       coverage80=round(float(np.mean(np.abs(arr(g, lambda p: (p['v'] - p['m']) / S(p))) <= 1.2816)), 3))
                                  for f, g in sorted(groupby(num, lambda p: p['fylke']).items())]
    if boot:
        ci['coverage80'] = cluster_bootstrap(cl(num), {'c': lambda w: _wmean(w, cov80)}, boot)['c']
        ci['level all: rmse'] = cluster_bootstrap(cl(num), {'r': lambda w: _wrmse(w, e)}, boot)['r']
    # hurdle: scored only where the labels carry information. A county whose
    # source cannot say "ingen venteliste" is filled by construction, and its
    # deployed fill probability is 1 (see FILL_BLIND), so it is neither fitted
    # nor scored here
    fp = [p for p in preds if p['fylke'] not in FILL_BLIND]
    y = arr(fp, lambda p: float(p['state'] != 'open'))
    pi = arr(fp, lambda p: p['pi'])
    base = float(np.mean(y))
    out['fill'] = dict(n=len(fp), n_excluded=len(preds) - len(fp),
                       brier=round(float(np.mean((y - pi) ** 2)), 4),
                       brier_base_rate=round(float(np.mean((y - base) ** 2)), 4),
                       base_rate=round(base, 3))
    # hurdle reliability: does "will fill" happen as often as said
    out['fill']['reliability'] = reliability(pi, y)
    if boot:
        fb = (y - pi) ** 2
        ci['fill: model minus base rate, brier'] = cluster_bootstrap(
            cl(fp), {'d': lambda w: _wmean(w, fb) - _wmean(w, (y - _wmean(w, y)) ** 2)}, boot)['d']
    # chance reliability over a grid of applicant scores. Every cell yields
    # one pair per grid point, so a per-cell mean is the pooled mean and the
    # bootstrap can resample cells. Three forecasts are scored on the cells
    # where a prior figure exists: the model; the step rule "last year's figure
    # is the cutoff" (no spread, no fill probability); and a probabilistic
    # persistence that centres the model's own spread, error distribution and
    # fill probability on last year's figure - the fair test of the level model
    pg, pe, oo = [], [], []
    cell_m, cell_step, cell_prob, has_last = [], [], [], []
    for p in preds:
        s = S(p)
        bm, bs, bp = [], [], []
        for x in CHANCE_GRID:
            got = 1.0 if p['state'] in ('open', 'zero') else float(x >= p['v'])
            g_ = chance(x, p['m'], s, p['pi'])
            e_ = chance(x, p['m'], s, p['pi'], zq) if zq else g_
            pg.append(g_); pe.append(e_); oo.append(got)
            bm.append((e_ - got) ** 2)
            if p['last'] is not None:
                bs.append((float(x >= p['last']) - got) ** 2)
                bp.append((chance(x, p['last'], s, p['pi'], zq) - got) ** 2)
        cell_m.append(np.mean(bm))
        has_last.append(p['last'] is not None)
        cell_step.append(np.mean(bs) if bs else np.nan)
        cell_prob.append(np.mean(bp) if bp else np.nan)
    pg, pe, oo = np.array(pg), np.array(pe), np.array(oo)
    out['chance_gaussian'] = dict(brier=round(float(np.mean((pg - oo) ** 2)), 4),
                                  reliability=reliability(pg, oo))
    out['chance'] = dict(brier=round(float(np.mean((pe - oo) ** 2)), 4), reliability=reliability(pe, oo))
    out['chance']['n_pairs'] = int(len(oo))
    out['chance']['n_cells'] = len(preds)
    cell_m, cell_step, cell_prob, has_last = (np.array(cell_m), np.array(cell_step),
                                              np.array(cell_prob), np.array(has_last))
    if has_last.any():
        hl = has_last
        out['chance']['brier_last_year_rule'] = round(float(np.mean(cell_step[hl])), 4)
        out['chance']['brier_persistence_prob'] = round(float(np.mean(cell_prob[hl])), 4)
        out['chance']['brier_model_common'] = round(float(np.mean(cell_m[hl])), 4)
        out['chance']['n_last_year_rule'] = int(hl.sum() * len(CHANCE_GRID))
    if boot:
        ci['chance: brier'] = cluster_bootstrap(cl(preds), {'b': lambda w: _wmean(w, cell_m)}, boot)['b']
        if has_last.any():
            gl = [p for p, h in zip(preds, has_last) if h]
            cm, cs, cp = cell_m[has_last], cell_step[has_last], cell_prob[has_last]
            r = cluster_bootstrap(cl(gl), {'step': lambda w: _wmean(w, cm) - _wmean(w, cs),
                                           'prob': lambda w: _wmean(w, cm) - _wmean(w, cp)}, boot)
            ci['chance: model minus step persistence, brier'] = r['step']
            ci['chance: model minus probabilistic persistence, brier'] = r['prob']
        out['ci'] = dict(clusters='school-year', n_clusters=len(set(cl(preds))), replicates=boot,
                         intervals=ci)
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


def calibrate_fill(preds, fill_blind=None):
    """Platt scaling for the fill probability: logit p' = a + b logit p.

    The hurdle's series effects make it sure of itself (a programme that filled
    four years running gets p = 0.97), but queues vanish more often than that —
    in the held-out years programmes given 0.97 filled 0.82 of the time. Two
    numbers fitted on the walk-forward forecasts for the calibration years
    pull the extremes in; reported, and checked on the held-out years."""
    blind = FILL_BLIND if fill_blind is None else fill_blind
    g = [p for p in preds if p['T'] in CALIB_YEARS and p['fylke'] not in blind]
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


def calibrate_sigma(preds, floor_sigma, level=LEVEL_SPREAD):
    """Spread of forecast errors from the calibration years: a history-bucket
    RMSE times a forecast-band multiplier, fitted by two rounds of
    backfitting (each factor is the RMSE of the errors standardised by the
    other). A queue cannot outgrow its applicants' scores, so errors shrink
    where the forecast is high; the multiplier, constrained to fall with the
    level, lets the interval follow."""
    g = [p for p in preds if p['state'] == 'num' and p['T'] in CALIB_YEARS]
    e = np.array([p['v'] - p['m'] for p in g])
    hb = np.array([hist_bucket(p['hist']) for p in g])
    bands = [f'{lo}-{hi}' if hi < 99 else f'{lo}+' for lo, hi in FORECAST_BANDS]
    fb = np.array([band_of(p['m']) for p in g])
    mult = {b: 1.0 for b in bands}
    for _ in range(2 if level else 1):
        sig = {}
        for i in range(len(HIST_BUCKETS)):
            z = e[hb == i] / np.array([mult[b] for b in fb[hb == i]])
            sig[i] = float(np.sqrt(np.mean(np.square(z)))) if len(z) >= 30 else None
        # fill gaps from neighbours, never below the floor — which is the
        # residual sd of the newest fit that saw no evaluation year, so the
        # held-out years cannot narrow or widen their own intervals
        vals = [v for v in sig.values() if v]
        for i in sig:
            if sig[i] is None:
                sig[i] = max(vals) if vals else floor_sigma
            sig[i] = max(sig[i], floor_sigma)
        if not level:
            break
        msz, n = [], []
        for b in bands:
            z = e[fb == b] / np.array([sig[i] for i in hb[fb == b]])
            msz.append(float(np.mean(np.square(z))) if len(z) >= 30 else 1.0)   # a sparse band stays at 1
            n.append(len(z))
        # the mechanism is a ceiling, so the multiplier may only fall with the
        # level: pool adjacent violators (weighted by cells) rather than let
        # six free numbers chase the calibration years' noise; then clip to
        # the range a spread can plausibly be rescaled by
        for b, v in zip(bands, _pava_decreasing(msz, n)):
            mult[b] = float(np.clip(np.sqrt(v), 0.5, 1.5))
    return dict(hist=sig, level=mult if level else {}, floor=floor_sigma)


def _pava_decreasing(vals, wts):
    """Weighted isotonic (non-increasing) fit by pooling adjacent violators."""
    out = []
    for v, w in zip(vals, wts):
        out.append([float(v), float(max(w, 1e-9)), 1])
        while len(out) > 1 and out[-2][0] < out[-1][0]:
            v2, w2, c2 = out.pop()
            v1, w1, c1 = out.pop()
            out.append([(v1 * w1 + v2 * w2) / (w1 + w2), w1 + w2, c1 + c2])
    return [v for v, _, c in out for _ in range(c)]


# ------------------------------------------------------- raw school means
def school_mean_decomposition(model, min_cells=5):
    """Where a raw school mean comes from. Every fitted cell is the sum of the
    level model's components, so a school's raw mean of its fitted cells is
    the sum of the components' school means, and var(raw mean) splits into
    cov(component mean, raw mean) shares: the school's own demand (alpha),
    its programme mix (utdanningsprogram + programme-area effects), the
    county-year level and round the county publishes, the series effects, and
    the rest (intercept, offsets, residual). Also the within-county rank
    displacement between the raw mean and alpha, the only ranking alpha
    licenses (it is a deviation from the county level)."""
    lv = [r for r in model.rows if r['state'] == 'num']
    d, b = model.dl, model.bl
    part = {f['name']: b[d.slices[f['name']]][f['ix']] for f in d.factors}
    y = np.array([r['v'] for r in lv])
    comp = dict(alpha=part['school'], mix=part['cat'] + part['prog'], county_year=part['cy'],
                series=part['series'])
    comp['other'] = y - sum(comp.values())
    by_school = collections.defaultdict(list)
    for i, r in enumerate(lv):
        by_school[r['school']].append(i)
    keys = [k for k, ix in by_school.items() if len(ix) >= min_cells]
    raw = np.array([y[by_school[k]].mean() for k in keys])
    means = {c: np.array([v[by_school[k]].mean() for k in keys]) for c, v in comp.items()}
    var = float(raw.var())
    share = lambda x, r: float(np.cov(x, r, bias=True)[0, 1] / r.var())
    out = dict(n_schools=len(keys), min_cells=min_cells, sd_raw=round(math.sqrt(var), 2),
               share={c: round(share(m, raw), 3) for c, m in means.items()})
    moves, by_fylke = [], {}
    for f, idx in groupby(list(range(len(keys))), lambda i: keys[i].split('|')[0]).items():
        idx = np.array(idx)
        if len(idx) < 5:
            continue
        r, a = raw[idx], means['alpha'][idx]
        rk = lambda v: np.argsort(np.argsort(-v))
        mv = np.abs(rk(r) - rk(a))
        moves.extend(mv.tolist())
        by_fylke[f] = dict(n=len(idx), share_alpha=round(share(a, r), 3),
                           share_mix=round(share(means['mix'][idx], r), 3),
                           rank_move_mean=round(float(mv.mean()), 1), rank_move_max=int(mv.max()))
    out['within_county'] = dict(n_schools=len(moves), rank_move_mean=round(float(np.mean(moves)), 1),
                                rank_move_max=int(max(moves)), by_fylke=by_fylke)
    return out


# ------------------------------------------------------------------------ main
def main():
    quick = '--quick' in sys.argv
    t0 = time.time()
    data = json.load(open(SRC))
    rows, pairs, newest = load_obs(data)
    print(f'{len(rows)} cells competed on points ({sum(r["state"] == "num" for r in rows)} numeric, '
          f'{sum(r["state"] == "open" for r in rows)} open, {sum(r["state"] == "zero" for r in rows)} zero); '
          f'{len(pairs)} alternate-round pairs')
    # the report's scale-setting fact: how much the same series moves between
    # consecutive published years — pinned here so the docs can quote it
    by_series = collections.defaultdict(dict)
    for r in rows:
        if r['state'] == 'num':
            by_series[r['series']][r['year']] = r['v']
    diffs = [ys[y + 1] - ys[y] for ys in by_series.values() for y in ys if y + 1 in ys]
    year_pairs = dict(n=len(diffs), sd=round(float(np.std(diffs)), 2),
                      within3=round(float(np.mean(np.abs(diffs) <= 3)), 3))
    print(f'year-to-year: {year_pairs["n"]} adjacent pairs, sd {year_pairs["sd"]}, '
          f'{year_pairs["within3"]:.0%} within ±3')
    bridge = round_bridge(pairs)
    for k, b in bridge.items():
        print(f'  bridge {k}: {b["mean"]:+.2f} ± {b["sd"]:.2f} on {b["n_pairs"]} pairs; '
              f'queue vanished in {b["share_vanished"]:.0%} of {b["n_had_queue"]} that had one')

    # ---- choose the half-life and calibrate the spread by walk-forward
    best, preds_best, sig_best = None, None, None
    if not quick:
        hl_search, preds_by_hl = {}, {}
        for hl in HALFLIVES:
            print(f'half-life {hl}:')
            preds, fit_sigmas = walk_forward(rows, bridge, hl, newest)
            preds_by_hl[str(hl)] = preds
            # select on level RMSE over the calibration years only
            e = [p['v'] - p['m'] for p in preds if p['state'] == 'num' and p['T'] in CALIB_YEARS]
            rmse = float(np.sqrt(np.mean(np.square(e))))
            hl_search[str(hl)] = round(rmse, 3)
            print(f'  -> calibration-years RMSE {rmse:.3f}')
            if best is None or rmse < best[1]:
                best, preds_best, sigmas_best = (hl, rmse), preds, fit_sigmas
        halflife = best[0]
        # how sure is the half-life verdict? paired cluster bootstrap of the
        # calibration-year RMSE difference, no decay against the winner
        def paired(pa, pb, years):
            ka = {(p['series'], p['T']): p for p in pa if p['state'] == 'num' and p['T'] in years}
            g = [(ka[k], p) for p in pb if (k := (p['series'], p['T'])) in ka]
            return g
        g = paired(preds_by_hl['None'], preds_best, CALIB_YEARS)
        ea = np.array([a['v'] - a['m'] for a, _ in g]); eb = np.array([b['v'] - b['m'] for _, b in g])
        hl_search['ci_none_minus_best'] = cluster_bootstrap(
            [(b['school'], b['T']) for _, b in g], {'d': lambda w: _wrmse(w, ea) - _wrmse(w, eb)})['d']
        print(f'  no decay minus half-life {halflife}: {float(np.sqrt(np.mean(ea**2)) - np.sqrt(np.mean(eb**2))):+.4f} '
              f'RMSE, 95% CI {hl_search["ci_none_minus_best"]}')
        # ---- how much should a threshold one applicant set count? A cell
        # whose Nedrekar equals its Gjennomkar (Møre og Romsdal supplies both)
        # is one applicant's score; SINGLE_WEIGHTS are tried at the chosen
        # half-life and judged like it, on the calibration-year RMSE
        n_single = sum(r['single'] for r in rows)
        sw_search, preds_by_sw = {}, {'1.0': (preds_best, sigmas_best)}
        for sw in SINGLE_WEIGHTS:
            if sw != 1.0:
                print(f'single-applicant weight {sw}:')
                preds_by_sw[str(sw)] = walk_forward(rows, bridge, halflife, newest, single_w=sw)
            e = [p['v'] - p['m'] for p in preds_by_sw[str(sw)][0] if p['state'] == 'num' and p['T'] in CALIB_YEARS]
            sw_search[str(sw)] = round(float(np.sqrt(np.mean(np.square(e)))), 4)
        single_w = min(SINGLE_WEIGHTS, key=lambda sw: sw_search[str(sw)])
        g = paired(preds_by_sw['1.0'][0], preds_by_sw[str(single_w)][0], CALIB_YEARS)
        ea = np.array([a['v'] - a['m'] for a, _ in g]); eb = np.array([b['v'] - b['m'] for _, b in g])
        ci_sw = cluster_bootstrap([(b['school'], b['T']) for _, b in g],
                                  {'d': lambda w: _wrmse(w, ea) - _wrmse(w, eb)})['d']
        hl_search['single_weight_search'] = dict(n_cells=n_single, rmse=sw_search, chosen=single_w,
                                                 ci_full_minus_chosen=ci_sw)
        preds_best, sigmas_best = preds_by_sw[str(single_w)]
        print(f'  single-applicant cells {n_single}; calibration RMSE by weight {sw_search}; '
              f'chosen {single_w}, full weight minus chosen {ci_sw}')
        # ---- couple the hurdle to the level's school effect? decided by the
        # fill log-loss on the calibration years, after the same recalibration,
        # on the counties whose labels carry information
        def fill_ll_cells(preds):
            fc = calibrate_fill(preds)
            g = [p for p in preds if p['T'] in CALIB_YEARS and p['fylke'] not in FILL_BLIND]
            y = np.array([float(p['state'] != 'open') for p in g])
            q = np.clip([recal(p['pi'], fc) for p in g], 1e-6, 1 - 1e-6)
            return g, -(y * np.log(q) + (1 - y) * np.log(1 - q))
        print('coupled hurdle:')
        preds_c, sigmas_c = walk_forward(rows, bridge, halflife, newest, couple=True, single_w=single_w)
        g0, l0 = fill_ll_cells(preds_best)
        g1, l1 = fill_ll_cells(preds_c)
        ll0, ll1 = float(np.mean(l0)), float(np.mean(l1))
        print(f'  fill log-loss, calibration years: independent {ll0:.4f}  coupled {ll1:.4f}')
        couple = ll1 < ll0
        hl_search['coupled_fill_logloss'] = dict(independent=round(ll0, 4), coupled=round(ll1, 4))
        k1 = {(p['series'], p['T']): l for p, l in zip(g1, l1)}
        pairs_ll = [(l, k1[(p['series'], p['T'])], p) for p, l in zip(g0, l0) if (p['series'], p['T']) in k1]
        la = np.array([a for a, _, _ in pairs_ll]); lb = np.array([b for _, b, _ in pairs_ll])
        hl_search['coupled_fill_logloss']['ci_coupled_minus_independent'] = cluster_bootstrap(
            [(p['school'], p['T']) for _, _, p in pairs_ll], {'d': lambda w: _wmean(w, lb) - _wmean(w, la)})['d']
        print(f'  coupled minus independent: {ll1 - ll0:+.4f}, 95% CI {hl_search["coupled_fill_logloss"]["ci_coupled_minus_independent"]}')
        # the held-out check nobody adjudicates on: the same comparison on 2025-26
        def fill_brier(preds, fc, keep=lambda f: f not in FILL_BLIND):
            """Held-out fill Brier of the recalibrated π on the cells whose
            county `keep` admits; with the base-rate Brier and the count."""
            g = [p for p in preds if p['T'] in EVAL_YEARS and keep(p['fylke'])]
            y = np.array([float(p['state'] != 'open') for p in g])
            q = np.array([recal(p['pi'], fc) for p in g])
            return (round(float(np.mean((y - q) ** 2)), 4), len(g),
                    round(float(np.mean((y - y.mean()) ** 2)), 4))
        hl_search['coupled_fill_logloss']['heldout_brier'] = dict(
            independent=fill_brier(preds_best, calibrate_fill(preds_best))[0],
            coupled=fill_brier(preds_c, calibrate_fill(preds_c))[0])
        if couple:
            preds_best, sigmas_best = preds_c, sigmas_c
        # ---- what a county's proxy fill labels are worth (PROXY_LABELS):
        # refit with the county outside the fill fit — π forced to 1, as it
        # was deployed before the rule — and compare the Platt slope, the
        # held-out fill Brier of the counties whose labels are observed, and
        # the proxy county's own held-out fill Brier against its base rate.
        # Measured here so the report cannot quote a stale build of it
        print('proxy-labelled county held out of the fill fit:')
        preds_x, _ = walk_forward(rows, bridge, halflife, newest, couple=couple, fill_blind=PROXY_LABELS,
                                  single_w=single_w)
        fc_x, fc_0 = calibrate_fill(preds_x, fill_blind=PROXY_LABELS), calibrate_fill(preds_best)
        observed = lambda f: f not in PROXY_LABELS
        b_with, n7, _ = fill_brier(preds_best, fc_0, observed)
        b_without, _, _ = fill_brier(preds_x, fc_x, observed)
        b_proxy, n_proxy, b_proxy_base = fill_brier(preds_best, fc_0, lambda f: f in PROXY_LABELS)
        hl_search['proxy_label_experiment'] = dict(
            counties=sorted(PROXY_LABELS), platt_b_with=fc_0['b'], platt_b_without=fc_x['b'],
            heldout_brier_observed_with=b_with, heldout_brier_observed_without=b_without, n_observed=n7,
            heldout_brier_proxy=b_proxy, heldout_brier_proxy_base_rate=b_proxy_base, n_proxy=n_proxy)
        print(f'  Platt slope with {fc_0["b"]:.3f}, without {fc_x["b"]:.3f}; held-out fill Brier on the '
              f'{n7} observed-label cells {b_with} with, {b_without} without; on the {n_proxy} '
              f'proxy-labelled cells {b_proxy} vs base rate {b_proxy_base}')
    else:
        halflife, couple, hl_search = 4.0, False, {}
        single_w, n_single = 1.0, sum(r['single'] for r in rows)

    # ---- final fit on everything
    model = Model(rows, bridge, halflife, newest, couple, single_w=single_w).fit()
    print(f'final fit: sigma {model.sigma:.2f}, half-life {halflife}, '
          f'taus ' + ', '.join(f'{f["name"]}={f["tau"]:.2f}' for f in model.dl.factors if f['kind'] != 'fixed'))
    floor_sigma = sigmas_best[min(EVAL_YEARS)] if preds_best else model.sigma
    sig = (calibrate_sigma(preds_best, floor_sigma) if preds_best
           else dict(hist={i: model.sigma * 1.25 for i in range(len(HIST_BUCKETS))}, level={}, floor=model.sigma))
    print('forecast spread by history bucket:', {HIST_BUCKETS[i]: round(v, 2) for i, v in sig['hist'].items()},
          'level multiplier:', {b: round(v, 2) for b, v in sig['level'].items()})

    meta = dict(built=time.strftime('%Y-%m-%d'), halflife=halflife, coupled=couple,
                sigma_model=round(model.sigma, 3), sigma_floor=round(floor_sigma, 3),
                sigma_forecast={str(HIST_BUCKETS[i]): round(v, 2) for i, v in sig['hist'].items()},
                sigma_level_multiplier={b: round(v, 3) for b, v in sig['level'].items()},
                forecast_bands=FORECAST_BANDS, single_weight=single_w, n_single=n_single, ewma_alpha=EWMA_ALPHA,
                hist_buckets=HIST_BUCKETS, n_level=model.n_level, n_fill=model.n_fill,
                taus={f['name']: round(f['tau'], 3) for f in model.dl.factors if f['kind'] != 'fixed'},
                taus_fill={f['name']: round(f['tau'], 3) for f in model.dh.factors if f['kind'] != 'fixed'},
                round_bridge=bridge, year_pairs=year_pairs,
                target_year={f: y + 1 for f, y in newest.items()},
                chance_bands=dict(likely=0.70, possible=0.35),
                partial_years=sorted([list(x) for x in PARTIAL_YEARS]))
    zq = error_quantiles(preds_best, sig) if preds_best else None
    meta['error_quantiles'] = zq
    fc = calibrate_fill(preds_best) if preds_best else dict(a=0.0, b=1.0)
    meta['fill_calibration'] = fc
    print(f'fill recalibration: logit p\' = {fc["a"]:+.3f} + {fc["b"]:.3f} logit p')
    if preds_best:
        # the scored fill probability is the deployed one: recalibrated, and 1
        # for a county whose source cannot say "ingen venteliste"
        for p in preds_best:
            p['pi_raw'], p['pi'] = p['pi'], (1.0 if p['fylke'] in FILL_BLIND else recal(p['pi'], fc))
    if preds_best:
        meta['backtest_calibration_years'] = summarise([p for p in preds_best if p['T'] in CALIB_YEARS], sig, zq)
        meta['backtest_eval_years'] = summarise([p for p in preds_best if p['T'] in EVAL_YEARS], sig, zq, boot=BOOT)
        # ---- what conditioning the spread on the level buys, on the held-out
        # years: the same forecasts under the history-only spread
        sig_h = calibrate_sigma(preds_best, floor_sigma, level=False)
        ev_h = summarise([p for p in preds_best if p['T'] in EVAL_YEARS], sig_h, error_quantiles(preds_best, sig_h))
        pick = lambda e: dict(coverage80=e['coverage80'], interval_width80=e['interval_width80'],
                              chance_brier=e['chance']['brier'],
                              coverage80_by_forecast={b['band']: b['coverage80'] for b in e['coverage80_by_forecast']})
        hl_search['level_spread_experiment'] = dict(history_only=pick(ev_h), with_level=pick(meta['backtest_eval_years']))
        print('level-conditioned spread, held-out:', hl_search['level_spread_experiment'])
        meta['halflife_search'] = hl_search
        # every walk-forward forecast, for anyone who wants to check the claims
        import csv
        bt = os.path.join(HERE, '..', 'data', 'model-backtest.csv')
        with open(bt, 'w', newline='') as fh:
            w = csv.writer(fh)
            w.writerow(['year', 'fylke', 'school', 'program', 'level', 'category', 'state', 'actual',
                        'forecast', 'p_fill', 'p_fill_raw', 'history_years', 'last_year_value', 'ewma'])
            for p in preds_best:
                _, sch, prog, lvl, _occ = p['series'].split('|')
                w.writerow([p['T'], p['fylke'], sch, prog, lvl, p['cat'], p['state'],
                            p['v'] if p['v'] is not None else '', round(p['m'], 2), round(p['pi'], 3),
                            round(p.get('pi_raw', p['pi']), 3), p['hist'],
                            p['last'] if p['last'] is not None else '',
                            round(p['ew'], 2) if p.get('ew') is not None else ''])
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
            # ...and not discontinued: a series whose newest cell is "utgått"
            # has nothing to forecast, whatever the year before said
            if p['values'][max(p['values'], key=int)] == 'U':
                continue
            m, pi = model.predict(sid, s['fylke'], f'{k}|{p["level"]}', p['category'], series, T)
            h = hist.get(series, 0)
            # a county with no "ingen venteliste" state can only ever fill:
            # its chance rests on the threshold alone
            pi_out = 1.0 if s['fylke'] in FILL_BLIND else round(recal(pi, fc), 3)
            progs[key] = dict(m=round(m, 1), s=round(spread(sig, h, m), 1), pi=pi_out, h=h)
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
    n3 = [i for i in range(len(z)) if abs(z[i]) > 3]
    meta['outliers_z3'] = dict(n=len(n3), n_level=len(z),
                               by_fylke=dict(sorted(collections.Counter(lv[i]['fylke'] for i in n3).items())))
    print('least plausible cells (|z| > 3):', len(n3), 'of', len(z))
    meta['school_means'] = school_mean_decomposition(model)
    sm = meta['school_means']
    print(f'raw school means ({sm["n_schools"]} schools): shares', sm['share'],
          f'; within-county rank move {sm["within_county"]["rank_move_mean"]} (max {sm["within_county"]["rank_move_max"]})')
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
              f'fill Brier {ev["fill"]["brier"]} vs base {ev["fill"]["brier_base_rate"]} '
              f'(n {ev["fill"]["n"]}, {ev["fill"]["n_excluded"]} fill-blind cells excluded)')
        print('    probabilistic persistence Brier', ev['chance'].get('brier_persistence_prob'))
        print('    coverage by forecast band:', [(b['band'], b['coverage80']) for b in ev['coverage80_by_forecast']])
        for k, v in ev.get('ci', {}).get('intervals', {}).items():
            print(f'    CI {k}: {v}')
        for r in ev['fill']['reliability']:
            print('    fill reliability', r)
        for b in ev['level']:
            print('   ', b)
        for r in ev['chance']['reliability']:
            print('    reliability', r)


if __name__ == '__main__':
    main()
