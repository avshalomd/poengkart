"""sources_r2.py push on a machine without the R2 keys skips, whatever is installed.

The live workflow runs tools/refresh.py, whose push step must finish without
keys; boto3 is only needed once there is something to push with.
"""
import os
import sys

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..'))
import sources_r2                                  # noqa: E402


def test_push_without_keys_skips_before_needing_boto3(monkeypatch, tmp_path, capsys):
    for k in ('R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'):
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setattr(sources_r2, 'HERE', str(tmp_path / 'tools'))   # no .env.local there
    monkeypatch.setitem(sys.modules, 'boto3', None)                    # as on a runner without it
    with pytest.raises(SystemExit) as e:
        sources_r2.client()
    assert e.value.code == 0
    assert 'R2 push skipped' in capsys.readouterr().out
