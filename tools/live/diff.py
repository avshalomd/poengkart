#!/usr/bin/env python3
"""What a refresh changed in the published figures, cell by cell.

    python3 tools/live/diff.py before/schools.json web/public/data/schools.json [--json out.json]

A cell is (county, school, programme, level, year) → value. The report counts
the cells added, changed and removed per county and the schools that
appeared or disappeared, and lists every changed and removed cell (they are
what a reviewer reads first). tools/live/policy.py decides from it whether a
live update may merge without a person.
"""
import argparse
import json
import sys
from collections import Counter


def cells(path):
    d = json.load(open(path, encoding='utf-8'))
    out, schools = {}, set()
    for s in d['schools']:
        schools.add((s['fylke'], s['name']))
        for p in s.get('programs', []):
            for y, v in p.get('values', {}).items():
                out[(s['fylke'], s['name'], p['program'], p['level'], str(y))] = v
    return out, schools


def diff(before, after):
    a, sa = cells(before)
    b, sb = cells(after)
    added = sorted(k for k in b.keys() - a.keys())
    removed = sorted(k for k in a.keys() - b.keys())
    changed = sorted(k for k in a.keys() & b.keys() if a[k] != b[k])
    per = Counter()
    for k in added:
        per[(k[0], 'added')] += 1
    for k in changed:
        per[(k[0], 'changed')] += 1
    for k in removed:
        per[(k[0], 'removed')] += 1
    counties = sorted({c for c, _ in per})
    return {
        'added': len(added), 'changed': len(changed), 'removed': len(removed),
        'years_added': sorted({k[4] for k in added}),
        'schools_added': sorted(f'{f}: {n}' for f, n in sb - sa),
        'schools_removed': sorted(f'{f}: {n}' for f, n in sa - sb),
        'by_county': {c: {w: per[(c, w)] for w in ('added', 'changed', 'removed')} for c in counties},
        'changed_cells': [{'cell': ' / '.join(k), 'before': a[k], 'after': b[k]} for k in changed],
        'removed_cells': [{'cell': ' / '.join(k), 'before': a[k]} for k in removed],
    }


def markdown(d):
    if not (d['added'] or d['changed'] or d['removed'] or d['schools_added'] or d['schools_removed']):
        return 'No published figure changes.'
    lines = [f"**{d['added']}** cells added, **{d['changed']}** changed, **{d['removed']}** removed"
             + (f"; new years {', '.join(d['years_added'])}" if d['years_added'] else '') + '.', '',
             '| County | Added | Changed | Removed |', '|---|---:|---:|---:|']
    for c, n in d['by_county'].items():
        lines.append(f"| {c} | {n['added']} | {n['changed']} | {n['removed']} |")
    for title, key in (('Schools added', 'schools_added'), ('Schools removed', 'schools_removed')):
        if d[key]:
            lines += ['', f'{title}: ' + '; '.join(d[key])]
    for title, key in (('Changed cells', 'changed_cells'), ('Removed cells', 'removed_cells')):
        if d[key]:
            lines += ['', f'<details><summary>{title} ({len(d[key])})</summary>', '']
            for c in d[key][:200]:
                lines.append(f"- {c['cell']}: {c['before']!r}" + (f" → {c['after']!r}" if 'after' in c else ''))
            lines += ['', '</details>']
    return '\n'.join(lines)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('before')
    ap.add_argument('after')
    ap.add_argument('--json')
    a = ap.parse_args(argv)
    d = diff(a.before, a.after)
    if a.json:
        json.dump(d, open(a.json, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(markdown(d))
    return 0


if __name__ == '__main__':
    sys.exit(main())
