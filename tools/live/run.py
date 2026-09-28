#!/usr/bin/env python3
"""The live source watch: ask each county for what it publishes now, and keep
anything new under sources/ the moment it appears.

    .venv/bin/python3 tools/live/run.py --due                 # the sources due this hour
    .venv/bin/python3 tools/live/run.py --only rogaland oslo  # these, now
    .venv/bin/python3 tools/live/run.py --all --dry-run       # look, write nothing
    ... --json report.json                                    # the run's report, for the workflow

For every source (tools/live/sources/<id>.py) the run is:

  1. discover: the scraper reads the county's page and returns the documents
     it serves now. A page that moved is found again by the scraper's own
     search and remembered (self-healing, recorded in state.json); a page
     that answers without its tables is CHECK-FAIL, a crash is FAILED.
  2. compare: a document whose bytes match what this URL served last time is
     UNCHANGED at once; otherwise its content fingerprint (tools/live/
     fingerprint.py) is compared with every file already in
     sources/<county>/. Same figures, different bytes (a re-export, a page
     with a new timestamp) is still UNCHANGED.
  3. capture: new content is written to sources/<county>/<name> exactly as
     served, never over an existing file (a second print of the same name
     becomes <name>-rev2, -rev3, …, the Vestland pattern), with its manifest
     entry and a provenance line saying where, when and how it was fetched.
     The status is NEW.

A sentinel find (a document where no scraper expects one) is ALERT and is
never captured. The run writes nothing but sources/, sources/manifest.json
and tools/live/state.json; processing the capture is the workflow's next
step (tools/refresh.py on a branch, see .github/workflows/live.yml).

Exit status: 0 when every source ran (whatever it found), 1 when any source
FAILED or failed its check.
"""
import argparse
import datetime
import hashlib
import importlib
import json
import os
import re
import sys
import traceback

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
ROOT = os.path.dirname(TOOLS)
sys.path.insert(0, TOOLS)

from live import schedule                           # noqa: E402
from live.core import Ctx, Unhealthy                # noqa: E402
from live.fingerprint import environment, fingerprint, kind_of   # noqa: E402

SOURCES = os.path.join(ROOT, 'sources')
STATE = os.path.join(HERE, 'state.json')
BAD = {'FAILED', 'CHECK-FAIL'}
#: what a captured file must start with, per kind, so an error page saved
#: with a 200 is never mistaken for the county's document
MAGIC = {'pdf': (b'%PDF',), 'xlsx': (b'PK',), 'json': (b'{',)}


def load_state():
    state = json.load(open(STATE, encoding='utf-8')) if os.path.exists(STATE) else {}
    state.setdefault('sources', {})
    env = environment()
    if state.get('fingerprint_env') != env:
        # another pdfplumber (say) may read the same PDF into other text; a
        # cache from it would make every document look new
        state['fingerprints'], state['fingerprint_env'] = {}, env
        for s in state['sources'].values():
            s.pop('seen', None)
    state.setdefault('fingerprints', {})
    return state


def save_state(state):
    with open(STATE, 'w', encoding='utf-8') as fh:
        json.dump(state, fh, ensure_ascii=False, indent=1, sort_keys=True)
        fh.write('\n')


def sha256(b):
    return hashlib.sha256(b).hexdigest()


def committed(state, county, kind):
    """{fingerprint: file name} of the files of `kind` in sources/<county>/,
    cached in state by the file's SHA-256."""
    out, cache = {}, state.setdefault('fingerprints', {})
    folder = os.path.join(SOURCES, county)
    if not os.path.isdir(folder):
        return out
    for f in sorted(os.listdir(folder)):
        if kind_of(f) != kind:
            continue
        body = open(os.path.join(folder, f), 'rb').read()
        h = sha256(body)
        if h not in cache:
            try:
                cache[h] = fingerprint(body, kind)
            except Exception as e:           # a file the fingerprint cannot read is no match
                cache[h] = f'unreadable:{type(e).__name__}'
        out[cache[h]] = f
    return out


def free_name(county, name):
    """`name`, or the first `-revN` of it not yet taken in sources/<county>/."""
    folder = os.path.join(SOURCES, county)
    if not os.path.exists(os.path.join(folder, name)):
        return name
    stem, ext = name.rsplit('.', 1)
    stem = re.sub(r'-rev\d+$', '', stem)
    n = 2
    while os.path.exists(os.path.join(folder, f'{stem}-rev{n}.{ext}')):
        n += 1
    return f'{stem}-rev{n}.{ext}'


def provenance(src, doc, resp_headers, now, sid):
    bits = [f'{src["publisher"]}: «{doc.label or doc.name}»']
    if doc.landing and doc.landing != doc.url:
        bits.append(f'linked from {doc.landing}')
    bits.append(f'served at {doc.url}')
    for k in ('last-modified', 'etag'):
        if resp_headers.get(k):
            bits.append(f'{k} {resp_headers[k]}')
    for k, v in doc.meta.items():
        if k not in ('embed',):
            bits.append(f'{k.replace("_", " ")} {v}')
    bits.append(f'captured as served, byte for byte, {now:%d.%m.%Y %H:%M} UTC by the live source '
                f'watch (tools/live, source {sid})')
    return '; '.join(bits) + '.'


def add_to_manifest(rel, prov):
    sys.path.insert(0, TOOLS)
    import sources_manifest
    man = sources_manifest.load()
    man.setdefault('files', {})[rel] = {'provenance': prov}
    with open(sources_manifest.MANIFEST, 'w') as fh:
        json.dump(man, fh, ensure_ascii=False, indent=1)
    import contextlib
    import io
    with contextlib.redirect_stdout(io.StringIO()):
        sources_manifest.build()


def run_source(sid, state, now, dry_run=False):
    mod = importlib.import_module(f'live.sources.{sid}')
    src = mod.SOURCE
    st = state['sources'].setdefault(sid, {})
    ctx = Ctx(sid, st)
    res = {'status': 'UNCHANGED', 'detail': '', 'docs': [], 'captured': [], 'alerts': []}
    try:
        docs = mod.discover(ctx)
        if not docs and src.get('min_docs', 1):
            raise Unhealthy('the scraper found no document')
        seen = st.setdefault('seen', {})
        for doc in docs:
            if doc.alert:
                res['alerts'].append({'url': doc.url, 'label': doc.label, 'county': doc.county})
                continue
            kind = doc.kind or kind_of(doc.name)
            if doc.body is None:
                r = ctx.need(ctx.get(doc.url), doc.label or doc.name)
                body, headers = r.body, r.headers
            else:
                body = doc.body
                headers = next((c.headers for k, c in ctx._cache.items() if k[0] == doc.url), {})
            if not body.startswith(MAGIC.get(kind, (b'',))) and kind in MAGIC:
                raise Unhealthy(f'{doc.url} did not serve a {kind} ({body[:40]!r})')
            if kind == 'html' and b'<table' not in body:
                raise Unhealthy(f'{doc.url} serves no table')
            h = sha256(body)
            entry = {'name': doc.name, 'sha256': h, 'label': doc.label}
            res['docs'].append(dict(entry, url=doc.url))
            if seen.get(doc.url, {}).get('sha256') == h:
                continue                                   # the same bytes as last time
            fp = fingerprint(body, kind)
            have = committed(state, doc.county, kind)
            if fp in have:
                seen[doc.url] = dict(entry, file=f'{doc.county}/{have[fp]}')
                continue                                   # the same figures, new bytes
            name = free_name(doc.county, doc.name)
            rel = f'{doc.county}/{name}'
            res['captured'].append({'file': rel, 'url': doc.url, 'label': doc.label,
                                    'sha256': h, 'size': len(body), 'meta': doc.meta})
            if not dry_run:
                os.makedirs(os.path.join(SOURCES, doc.county), exist_ok=True)
                with open(os.path.join(SOURCES, rel), 'wb') as fh:
                    fh.write(body)
                add_to_manifest(rel, provenance(src, doc, headers, now, sid))
                state['fingerprints'][h] = fp
            seen[doc.url] = dict(entry, file=rel, captured=f'{now:%Y-%m-%d}')
        if res['captured']:
            res['status'] = 'NEW'
        elif res['alerts']:
            res['status'] = 'ALERT'
    except Unhealthy as e:
        res['status'], res['detail'] = 'CHECK-FAIL', str(e)
    except Exception as e:                                  # noqa: BLE001 — a scraper bug is a result too
        res['status'], res['detail'] = 'FAILED', f'{type(e).__name__}: {e}'
        res['trace'] = traceback.format_exc()[-2000:]
    res['notes'] = ctx.notes
    res['requests'] = [f'{m} {u} → {s}' for m, u, s in ctx.log]
    return res


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument('--due', action='store_true', help='the sources due now (schedule.py)')
    g.add_argument('--only', nargs='+', metavar='ID')
    g.add_argument('--all', action='store_true')
    ap.add_argument('--at', help='with --due: Oslo local time, ISO')
    ap.add_argument('--dry-run', action='store_true', help='report, write nothing')
    ap.add_argument('--json', help='write the run report here')
    a = ap.parse_args(argv)

    ids = schedule.source_ids()
    if a.due:
        import zoneinfo
        oslo = zoneinfo.ZoneInfo('Europe/Oslo')
        at = (datetime.datetime.fromisoformat(a.at).replace(tzinfo=oslo) if a.at
              else datetime.datetime.now(oslo))
        ids = schedule.due(at)
    elif a.only:
        unknown = sorted(set(a.only) - set(ids))
        if unknown:
            ap.error(f'unknown source(s): {unknown}; known: {ids}')
        ids = a.only
    state = load_state()
    now = datetime.datetime.now(datetime.timezone.utc)
    report = {'started': now.isoformat(timespec='seconds'), 'dry_run': a.dry_run, 'sources': {}}
    for sid in ids:
        r = run_source(sid, state, now, a.dry_run)
        report['sources'][sid] = r
        line = f'{sid:<10} {r["status"]:<10}'
        if r['captured']:
            line += ' ' + ', '.join(c['file'] for c in r['captured'])
        if r['alerts']:
            line += ' ' + ', '.join(x['label'] for x in r['alerts'])
        if r['detail']:
            line += ' ' + r['detail']
        print(line)
        for n in r['notes']:
            print(f'{"":<10} note: {n}')
    report['finished'] = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')
    report['captured'] = [c['file'] for r in report['sources'].values() for c in r['captured']]
    if not a.dry_run:
        save_state(state)
    if a.json:
        with open(a.json, 'w', encoding='utf-8') as fh:
            json.dump(report, fh, ensure_ascii=False, indent=1)
    if not ids:
        print('nothing due')
    return 1 if any(r['status'] in BAD for r in report['sources'].values()) else 0


if __name__ == '__main__':
    sys.exit(main())
