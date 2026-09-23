"""The Norwegian checker the feedback routine runs on every reply draft.

It lives at .claude/skills/norsk/check.py so a bare clone carries it; these
cases pin what it must catch and, as much, what it must let through.
"""
import importlib.util
import subprocess
import sys
from pathlib import Path

CHECK = Path(__file__).resolve().parents[2] / '.claude' / 'skills' / 'norsk' / 'check.py'
_spec = importlib.util.spec_from_file_location('norsk_check', CHECK)
norsk = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(norsk)

# the reply drafted on POENG-30, 22.09.2026: clean bokmål in the house vocabulary
GOOD = """Hei Lasse,

Takk for et klart svar, og for at du tok deg tid til å se på det.

Godt å høre at dere legger ut en oversikt over poenggrensene på afk.no. Tallene
for Vg1 etter 2. inntak er lest fra tabellene dere sendte 27.08.2026, i august.

Med vennlig hilsen
Abshalom Dayan
"""


def errors(text, subject=None):
    return [f[3] for f in norsk.check(text, subject) if f[0] == 'ERROR']


def warns(text):
    return [f[3] for f in norsk.check(text) if f[0] == 'WARN']


def test_clean_draft_passes():
    assert norsk.check(GOOD, 'Re: Poengkart: gratis kart over poenggrensene i Akershus') == []


def test_english_left_in():
    assert errors('Hi Lasse,\nThank you.\nBest regards\nAbshalom Dayan') == ['Hi', 'Thank you', 'Best regards']


def test_house_vocabulary():
    found = errors('Uten venteliste etter 2. inntaksomgang i VG1, og poengkravet var høyt.')
    assert found == ['Uten venteliste', 'inntaksomgang', 'VG1', 'poengkravet']


def test_compounds_written_apart():
    assert errors('Poeng grensen for program området.') == ['Poeng grensen', 'program området']


def test_capitalised_month_after_a_date():
    assert errors('Svar kom 3. September.') == ['3. September']
    assert errors('Svar kom 3. september.') == []


def test_decimal_point_warns_but_dates_do_not():
    assert warns('Grensen var 45.6 poeng.\nAbshalom Dayan') == ['45.6']
    assert warns('Mottatt 27.08.2026.\nAbshalom Dayan') == []


def test_stacked_reply_prefix():
    assert errors(GOOD, 'Re: SV: Poengkart') == ['Re: SV: Poengkart']


def test_exit_status():
    run = lambda text: subprocess.run([sys.executable, str(CHECK), '-'], input=text,
                                      capture_output=True, text=True)
    ok, bad = run(GOOD), run('Hi,\nAbshalom Dayan')
    assert (ok.returncode, ok.stdout.strip()) == (0, 'OK')
    assert bad.returncode == 1 and bad.stdout.startswith('ERROR 1:1')
