#!/usr/bin/env python3
"""When may a live update reach poengkart.no without a person? The rule the
workflow asks; nothing here merges anything.

    python3 tools/live/policy.py data diff.json --gates-passed --changed-files files.txt
        exit 0 and "yes" when it may merge, exit 3 and "no — <reason>" when it waits

A live update is a pull request the workflow opens after it captured a
county's new document and ran the whole pipeline on it. It merges (and is
deployed) on its own only when all of these hold:

  1. the repository variable LIVE_AUTOMERGE is "true" (the owner's switch);
  2. every gate passed: tools/refresh.py to the end, which includes
     test_parse, test_model and test_docs, and the web suite (typecheck,
     unit tests, build, browser tests);
  3. no published cell and no school disappeared: a county dropping a figure
     is either an error or a decision, and both need a person;
  4. at most MAX_CHANGED existing cells changed value: a corrected reprint
     touches a handful (Rogaland's third 2024–2026 print, one cell), a
     county re-issuing its history is a review;
  5. the pull request changes only sources/, the generated outputs the
     pipeline writes, and tools/live/state.json, never code.

  6. it brings no new school year: a county's first figures for a year
     wait for the owner (decided 28 Sept 2026), who merges the pull request;
     the merge deploys (the workflow's deploy-merged job).

So what goes live by itself is a correction: a reprint of a year the site
already shows, a few cells at most. A refit that moves a number the
technical report quotes fails test_docs, and that pull request waits for the
report to be updated as well.

A machine-written fix to a scraper or an extractor (the self-heal routine,
routines/live-heal.md) is a separate rule, may_auto_merge_fix(): for the
first REVIEW_PERIOD_DAYS from the first such pull request every fix waits for
review, as in Badeklart (its qa-decisions 104, 27 Sept 2026); after that one
merges only when the replay oracle passed in full and it touches exactly one
scraper file. The routine itself never merges.
"""
import argparse
import fnmatch
import json
import os
import sys
from datetime import date, timedelta

MAX_CHANGED = 25
REVIEW_PERIOD_DAYS = 30

#: what a data pull request may touch and still merge on its own: the raw
#: capture, the watch's state, and what tools/refresh.py generates
DATA_PATHS = [
    'sources/*/*', 'sources/manifest.json', 'tools/live/state.json',
    'web/public/data/*', 'web/public/report.html', 'web/public/og.png', 'web/og.png',
    'data/*', 'docs/figures/*', 'docs/img/*', 'web/public/figures/*',
    'tools/nsr-vgs.json', 'tools/kommuner.json', 'tools/og-panel.png',
]


def is_data(path):
    return any(fnmatch.fnmatch(path, p) for p in DATA_PATHS)


def may_auto_merge(diff, gates_passed, changed_files, enabled):
    """(True, 'merge') or (False, why)."""
    if not enabled:
        return False, 'LIVE_AUTOMERGE is not "true": every live update waits for review'
    if not gates_passed:
        return False, 'a gate failed (see the checks in the description)'
    if diff['removed'] or diff['schools_removed']:
        return False, (f"{diff['removed']} cells and {len(diff['schools_removed'])} schools "
                       f"disappeared")
    if diff['changed'] > MAX_CHANGED:
        return False, f"{diff['changed']} existing cells changed value (more than {MAX_CHANGED})"
    if diff.get('county_years_added'):
        return False, (f"a new school year ({', '.join(diff['county_years_added'])}) "
                       f"waits for the owner")
    code = [f for f in changed_files if not is_data(f)]
    if code:
        return False, f'it changes files outside the data: {", ".join(code[:5])}'
    return True, 'every gate passed and the change is data only'


def _is_scraper(path):
    d, _, f = path.rpartition('/')
    return d in ('tools/live/sources', 'tools/extractors') and f.endswith('.py') \
        and not f.startswith('_')


def may_auto_merge_fix(first_fix_date, today, oracle_passed_in_full, changed_files):
    """True only if a machine-written scraper fix may merge without review."""
    if first_fix_date is None:
        return False
    first = date.fromisoformat(first_fix_date) if isinstance(first_fix_date, str) else first_fix_date
    today = date.fromisoformat(today) if isinstance(today, str) else today
    if today < first + timedelta(days=REVIEW_PERIOD_DAYS):
        return False
    if oracle_passed_in_full is not True:
        return False
    files = sorted(set(changed_files))
    return len(files) == 1 and _is_scraper(files[0])


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('what', choices=['data'])
    ap.add_argument('diff', help="tools/live/diff.py's --json")
    ap.add_argument('--gates-passed', action='store_true')
    ap.add_argument('--changed-files', required=True, help='one repo-relative path per line')
    a = ap.parse_args(argv)
    d = json.load(open(a.diff, encoding='utf-8'))
    files = [l.strip() for l in open(a.changed_files, encoding='utf-8') if l.strip()]
    ok, why = may_auto_merge(d, a.gates_passed, files,
                             os.environ.get('LIVE_AUTOMERGE', '').lower() == 'true')
    print(f'yes — {why}' if ok else f'no — {why}')
    return 0 if ok else 3


if __name__ == '__main__':
    sys.exit(main())
