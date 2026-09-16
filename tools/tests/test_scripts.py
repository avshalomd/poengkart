"""The three dataset checks as pytest cases, so CI collects them and `-k` picks one.

Each script is what the pipeline runs (tools/refresh.py); this file only calls
them, so a check lives in exactly one place.
"""
import os
import subprocess
import sys

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.join(HERE, '..')


@pytest.mark.parametrize('script', ['test_parse.py', 'test_model.py', 'test_docs.py'])
def test_script(script):
    r = subprocess.run([sys.executable, os.path.join(TOOLS, script)], capture_output=True, text=True)
    assert r.returncode == 0, r.stdout[-3000:] + r.stderr[-3000:]


def test_sources_manifest_is_current():
    r = subprocess.run([sys.executable, os.path.join(TOOLS, 'sources_manifest.py'), '--check'], capture_output=True, text=True)
    assert r.returncode == 0, r.stdout[-3000:] + r.stderr[-3000:]
