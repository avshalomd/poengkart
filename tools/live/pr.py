#!/usr/bin/env python3
"""The title and description of a live update's pull request.

    python3 tools/live/pr.py title report.json
    python3 tools/live/pr.py body report.json diff.json gates.txt policy.txt

The description is what a reviewer needs to accept the update without
opening the files: every captured document with where and how it was
fetched, what it changed in the published figures, which gates passed, and
whether the policy let it merge on its own (and if not, why).
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

from live import diff as diffmod   # noqa: E402

COUNTY = {'akershus': 'Akershus', 'buskerud': 'Buskerud', 'innlandet': 'Innlandet',
          'mro': 'Møre og Romsdal', 'oslo': 'Oslo', 'rogaland': 'Rogaland',
          'trondelag': 'Trøndelag', 'vestland': 'Vestland'}


def captures(report):
    return [c for r in report['sources'].values() for c in r['captured']]


def title(report):
    caps = captures(report)
    counties = sorted({COUNTY.get(c['file'].split('/')[0], c['file'].split('/')[0]) for c in caps})
    names = ' and '.join([', '.join(counties[:-1]), counties[-1]] if len(counties) > 1 else counties)
    n = len(caps)
    return (f"{names} published {'a new document' if n == 1 else f'{n} new documents'}; "
            f"the live watch captured and processed {'it' if n == 1 else 'them'}")


def body(report, d, gates, policy):
    man = json.load(open(os.path.join(HERE, '..', '..', 'sources', 'manifest.json'), encoding='utf-8'))['files']
    out = ['## Captured', '']
    for c in captures(report):
        e = man.get(c['file'], {})
        out += [f"### `sources/{c['file']}`", '',
                f"- {e.get('size', c['size'])} bytes, SHA-256 `{e.get('sha256', c['sha256'])}`",
                f"- Provenance: {e.get('provenance', '(missing)')}", '']
    out += ['## What it changes on poengkart.no', '', diffmod.markdown(d), '',
            '## Gates', '', gates.strip(), '',
            '## Merge', '', policy.strip(), '',
            'Opened by the live source watch (`.github/workflows/live.yml`, `tools/live/`). '
            'The rule for merging without review is `tools/live/policy.py`.', '',
            '🤖 Generated with [Claude Code](https://claude.com/claude-code)']
    return '\n'.join(out)


def main(argv):
    what, report = argv[0], json.load(open(argv[1], encoding='utf-8'))
    if what == 'title':
        print(title(report))
    else:
        d = json.load(open(argv[2], encoding='utf-8'))
        print(body(report, d, open(argv[3]).read(), open(argv[4]).read()))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
