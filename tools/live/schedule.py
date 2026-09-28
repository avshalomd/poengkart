#!/usr/bin/env python3
"""Which live sources to check, and when.

    python3 tools/live/schedule.py due                       # the sources due this hour
    python3 tools/live/schedule.py due --at 2026-07-06T07:20
    python3 tools/live/schedule.py show                      # every source's timetable today
    python3 tools/live/schedule.py ids                       # every source

Counties publish on weekdays, in office hours, a few times a year: the
document dates of the captures so far are Trøndelag 2 Dec 2025 13:49–13:53,
Rogaland 7, 21 and 23 Sept 2026 (14:31), Innlandet 25 Sept 2026 12:42,
Vestland 28 Aug 2026; Oslo and Vestland's first inntak lands in mid-July.
Each source names the months its publications (and the corrections that
follow them) have come in, its `season`. In season it is checked every hour
from 06 to 20 Oslo time on weekdays and at 09 and 15 at weekends, so a new
document is captured within the hour it appears; out of season once a day at
07, which still catches a late correction the next morning. The sentinel
(the counties that publish nothing) runs on Mondays at 07.

Sources on hosts that refuse GitHub's runners (vilbli.no) carry
`'runner': 'cloud'` and are run by the relay routine instead
(routines/live-vilbli.md), on its own timetable; `due` leaves them out.

`due` is stateless: the workflow fires hourly and whether a source runs is a
function of Oslo's clock alone. A late or doubled run is harmless, because an
unchanged document is recognised by its content and nothing is written.
"""
import argparse
import datetime
import importlib
import os
import sys
from zoneinfo import ZoneInfo

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
OSLO = ZoneInfo('Europe/Oslo')

WEEKDAY_HOURS = range(6, 21)
WEEKEND_HOURS = (9, 15)
DAILY_HOUR = 7


def source_ids():
    return sorted(f[:-3] for f in os.listdir(os.path.join(HERE, 'sources'))
                  if f.endswith('.py') and not f.startswith('_'))


def source(sid):
    return importlib.import_module(f'live.sources.{sid}').SOURCE


def in_season(src, day):
    for m1, d1, m2, d2 in src.get('season', []):
        if (m1, d1) <= (day.month, day.day) <= (m2, d2):
            return True
    return False


def is_due(src, now):
    """True when `src` should run in the hourly slot of `now` (Oslo time)."""
    if src['id'] == 'sentinel':
        return now.weekday() == 0 and now.hour == DAILY_HOUR
    if in_season(src, now):
        return now.hour in (WEEKDAY_HOURS if now.weekday() < 5 else WEEKEND_HOURS)
    return now.hour == DAILY_HOUR


def runner(sid):
    """Where a source runs: 'actions' (the hourly workflow) or 'cloud' (the
    relay routine, for hosts that refuse GitHub's runners)."""
    return source(sid).get('runner', 'actions')


def due(now, where='actions'):
    return [sid for sid in source_ids() if runner(sid) == where and is_due(source(sid), now)]


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('cmd', choices=['due', 'show', 'ids'])
    ap.add_argument('--at', help='Oslo local time, ISO (default: now)')
    ap.add_argument('--runner', default='actions', choices=['actions', 'cloud', 'any'],
                    help='only the sources that run there (default: actions)')
    a = ap.parse_args(argv)
    now = (datetime.datetime.fromisoformat(a.at).replace(tzinfo=OSLO) if a.at
           else datetime.datetime.now(OSLO))
    if a.cmd == 'ids':
        print('\n'.join(s for s in source_ids() if a.runner in ('any', runner(s))))
        return 0
    if a.cmd == 'due':
        print('\n'.join(due(now, a.runner)))
        return 0
    for sid in source_ids():
        s = source(sid)
        when = ('Mondays 07' if sid == 'sentinel' else
                'hourly 06–20 weekdays, 09 and 15 weekends' if in_season(s, now) else 'daily 07')
        if s.get('runner') == 'cloud':
            when = 'by the cloud relay routine (routines/live-vilbli.md)'
        print(f'{sid:<10} {"in season " if in_season(s, now) else "off season"}  {when}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
