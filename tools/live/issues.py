#!/usr/bin/env python3
"""One GitHub issue per live source that needs a person, opened, updated and
closed by the watch itself; and the run's summary table.

    python3 tools/live/issues.py report.json            # act, via gh
    python3 tools/live/issues.py report.json --dry-run  # print the plan
    python3 tools/live/issues.py report.json --summary  # the markdown table only

A source that FAILED or failed its check gets an open issue titled
"live: <source>" with the labels `live` and `heal`; a later bad run comments
on it instead of opening another, and the first good run closes it. A sentinel
find (ALERT: a document where no scraper expects one) gets "live: new
document in <county>", labelled `live` only: it is news for a person, not a
broken scraper. Nothing is forced past a gate: while an issue is open the last
good capture keeps being served.

The `heal` label is what starts the self-heal routine (routines/live-heal.md):
a Claude Code cloud routine that repairs the scraper and opens a pull request.
"""
import argparse
import json
import subprocess
import sys

LABELS = {'live': ('0e8a16', 'The live source watch (tools/live)'),
          'heal': ('d93f0b', 'A live scraper needs repair; starts the self-heal routine')}
BAD = {'FAILED', 'CHECK-FAIL'}
GOOD = {'UNCHANGED', 'NEW', 'ALERT'}


def title(sid):
    return f'live: {sid}'


def body(sid, r, when):
    lines = [f'**{r["status"]}** in the live run of {when}.', '', f'> {r["detail"]}', '']
    if r.get('trace'):
        lines += ['```', r['trace'].strip()[-1500:], '```', '']
    if r.get('requests'):
        lines += ['Requests:', ''] + [f'- `{x}`' for x in r['requests'][-15:]] + ['']
    lines += [f'Scraper: `tools/live/sources/{sid}.py`. Reproduce with '
              f'`.venv/bin/python3 tools/live/run.py --only {sid} --dry-run`.',
              'Nothing was captured; the files already in `sources/` stand. This issue '
              'closes itself on the source\'s next good run.']
    return '\n'.join(lines)


def plan(report, open_issues):
    when = report.get('finished') or report.get('started')
    acts = []
    for sid, r in sorted(report['sources'].items()):
        num = open_issues.get(title(sid))
        if r['status'] in BAD:
            text = body(sid, r, when)
            acts.append(('comment', title(sid), num, text, None) if num
                        else ('open', title(sid), None, text, 'live,heal'))
        elif r['status'] in GOOD and num:
            acts.append(('close', title(sid), num, f'Back to normal: **{r["status"]}** in the run of {when}.', None))
        for a in r.get('alerts', []):
            t = f'live: new document in {a["county"]}'
            if t not in open_issues:
                acts.append(('open', t, None,
                             f'The sentinel found a document where no scraper expects one:\n\n'
                             f'- {a["label"]}\n- {a["url"]}\n\nIf it is a poenggrense table, the '
                             f'county needs a scraper and an extractor; if not, add it to `KNOWN` '
                             f'in `tools/live/sources/sentinel.py`.', 'live'))
                open_issues[t] = -1
    return acts


def summary(report):
    lines = ['| Source | Status | Captured / detail |', '|---|---|---|']
    for sid, r in sorted(report['sources'].items()):
        what = ', '.join(f'`{c["file"]}`' for c in r['captured']) or r.get('detail', '') \
            or '; '.join(x['label'] for x in r.get('alerts', [])) or ''
        notes = ' '.join(f'({n})' for n in r.get('notes', []))
        lines.append(f'| {sid} | {r["status"]} | {what} {notes}'.rstrip() + ' |')
    if not report['sources']:
        lines.append('| — | nothing due | |')
    return '\n'.join(lines)


def gh(*args):
    r = subprocess.run(['gh', *args], text=True, capture_output=True)
    if r.returncode:
        sys.stderr.write(r.stderr)
        raise SystemExit(f'gh {" ".join(args[:2])} failed ({r.returncode})')
    return r.stdout


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('report')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--summary', action='store_true')
    a = ap.parse_args(argv)
    report = json.load(open(a.report, encoding='utf-8'))
    if a.summary:
        print(summary(report))
        return 0
    if a.dry_run:
        for act, t, num, _, labels in plan(report, {}):
            print(f'{act:<8} {t}' + (f'  [{labels}]' if labels else ''))
        return 0
    for name, (color, desc) in LABELS.items():
        gh('label', 'create', name, '--force', '--color', color, '--description', desc)
    existing = {i['title']: i['number'] for i in json.loads(gh(
        'issue', 'list', '--label', 'live', '--state', 'open', '--limit', '200',
        '--json', 'number,title') or '[]')}
    for act, t, num, text, labels in plan(report, existing):
        if act == 'open':
            gh('issue', 'create', '--title', t, '--label', labels, '--body', text)
        elif act == 'comment':
            gh('issue', 'comment', str(num), '--body', text)
        else:
            gh('issue', 'close', str(num), '--comment', text)
        print(f'{act:<8} {t}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
