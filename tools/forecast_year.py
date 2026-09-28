#!/usr/bin/env python3
"""Which intake Poengkart forecasts: the next one that has not happened yet.

    python3 tools/forecast_year.py          # the intake the date calls for, e.g. 2027
    python3 tools/forecast_year.py check    # exit 1 when model.json forecasts another

Every county is forecast for the same intake (decided 28 Sept 2026). The
intake of year Y fills school year Y/Y+1: pupils apply by 1 March, and the
offers come in July. Until 30 June the forecast is for this year's intake,
which the applicants are still waiting on; from 1 July, when the offers go out
and before any county publishes that year's thresholds, it moves to next
year's. A county that has not yet published the intake just held (Trøndelag
until December) is then forecast two years ahead, with the wider spread the
backtest measures for that (tools/model.py, calibrate_ahead).

POENGKART_TODAY=YYYY-MM-DD sets the date, for tests and for a rebuild that
must reproduce an older one.
"""
import datetime
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL = os.path.join(HERE, '..', 'web', 'public', 'data', 'model.json')
#: (month, day) the forecast moves on to the next intake
SWITCH = (7, 1)


def today():
    t = os.environ.get('POENGKART_TODAY')
    return datetime.date.fromisoformat(t) if t else datetime.date.today()


def forecast_intake(day=None):
    """The intake year to forecast on `day`: 2027 from 1 July 2026 to 30 June 2027."""
    day = day or today()
    return day.year + 1 if (day.month, day.day) >= SWITCH else day.year


def main():
    want = forecast_intake()
    if sys.argv[1:] == ['check']:
        have = json.load(open(MODEL)).get('meta', {}).get('forecast_intake')
        print(f'model.json forecasts {have}; the date calls for {want}')
        sys.exit(0 if have == want else 1)
    print(want)


if __name__ == '__main__':
    main()
