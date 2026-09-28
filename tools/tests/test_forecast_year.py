"""The forecast intake moves on each 1 July (tools/forecast_year.py)."""
import datetime
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from forecast_year import forecast_intake   # noqa: E402


def test_switches_on_1_july():
    d = datetime.date
    assert forecast_intake(d(2026, 9, 28)) == 2027     # the decision day: school year 2027/28
    assert forecast_intake(d(2026, 12, 28)) == 2027    # three months on
    assert forecast_intake(d(2027, 3, 28)) == 2027     # after the 1 March deadline, offers still pending
    assert forecast_intake(d(2027, 5, 28)) == 2027
    assert forecast_intake(d(2027, 6, 30)) == 2027
    assert forecast_intake(d(2027, 7, 1)) == 2028      # offers go out: next year's intake
    assert forecast_intake(d(2027, 1, 1)) == 2027


def test_date_override(monkeypatch):
    monkeypatch.setenv('POENGKART_TODAY', '2027-07-01')
    assert forecast_intake() == 2028
